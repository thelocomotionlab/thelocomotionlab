"""API FastAPI du moteur Twin (le contrat = l'OpenAPI généré).

Endpoints :
  * ``GET  /health``           — sonde de vie.
  * ``POST /preview``          — synchrone : ingestion + suffisance + fourchette (pas de PDF).
  * ``POST /jobs``             — crée un job `full` (arrière-plan in-process) → renvoie l'id.
  * ``GET  /jobs/{id}``        — état + résultat du job.
  * ``GET  /jobs/{id}/report`` — télécharge le PDF (quand prêt).
  * ``POST /fiche``            — rendu sans état : JSON en entrée, PDF en sortie.
  * ``POST /rendu``            — rendu sans état : un rapport amendé, refait en entier.

Stockage local : des fichiers JSON sur le volume de données, pour l'état comme pour les
documents (récapitulatif §3.5 — pas de base de données). Le fichier est la vérité ;
l'index en mémoire se reconstruit au démarrage.

``/rendu`` est le seul endpoint destiné à un NAVIGATEUR : l'athlète amende ses arrêts sur
la page de son rapport et récupère les documents refaits. Il ne lit pas d'archive, n'écrit
rien et ne garde rien. Le reste de l'API est interne (cf.
``infra/caddy/conf.d/twin-engine.caddy.disabled``).
"""

from __future__ import annotations

import io
import json
import re
import shutil
import tempfile
import threading
import time
import zipfile
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import (
    BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile,
)
from fastapi.responses import FileResponse, Response

from .. import dossier as dossier_mod
from .._dt import parse_duration_h
from ..config import Config, load_config
from ..course import RaceSpec
from ..fiche import build_pdf as build_fiche_pdf
from ..fiche import empreinte as fiche_empreinte
from ..jobs import JobStore, run_job
from ..pipeline import run_preview
from ..tableau_de_bord.depot import Depot
from ..tableau_de_bord.magasin import Magasin
from ..tableau_de_bord.objets import JOB_GENERATION
from ..tableau_de_bord.reference import reference_de_rapport
from ..tableau_de_bord.courrier import Courrier
from ..tableau_de_bord.routes import routeur_admin, routeur_interne
from ..tableau_de_bord.routes_athlete import routeur_athlete
from ..tableau_de_bord.serrures import Serrures, Tentatives


def _safe_name(filename: str | None, default: str) -> str:
    """Ne garde que le nom de base (jamais de chemin) — l'extension pilote l'ingestion."""
    return Path(filename or default).name or default


def _parse_race(raw: bytes, target_hours: str | None = None) -> RaceSpec:
    """Spec de course + surcharge éventuelle de l'objectif (mode cible, ADR 0002).

    ``target_hours`` posté en formulaire prime sur le champ du JSON : le client (app twin)
    envoie une spec de course figée et l'objectif saisi par l'athlète à part."""
    try:
        spec = RaceSpec.from_dict(json.loads(raw))
        if target_hours is not None and target_hours.strip() != "":
            spec = replace(spec, target_hours=parse_duration_h(target_hours))
        return spec
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"spec de course invalide: {exc}") from exc


# Ce qu'un athlète emporte : les trois documents, le calendrier de son assistance et la
# trace. L'annexe et le dossier sont de la machinerie d'atelier, ils ne descendent pas.
RENDU_LIVRABLES = ("rapport.pdf", "feuille.pdf", "fiches.pdf", "plan.ics", "plan.gpx")

_REF_OK = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")

# Les familles de routes qu'un navigateur appelle (infra/caddy/conf.d/api.caddy), vues
# d'ici — c'est-à-dire APRÈS le retrait du préfixe /twin. Tout appel les concernant vient
# d'un autre domaine que celui de l'API : il est croisé.
PREFIXE_ADMIN = "/tableau-de-bord"
PREFIXE_PLANS = "/plans"
_CROISEES = (PREFIXE_ADMIN, PREFIXE_PLANS, "/rendu")


class _Debit:
    """Garde-fou de débit d'un rendu : un à la fois, et pas plus de N sur la minute écoulée.

    Un rendu, c'est XeLaTeX plus biber — quelques secondes de processeur. L'endpoint étant
    le seul joignable depuis un navigateur, il se protège lui-même plutôt que de compter
    sur ce qu'il y a devant.
    """

    def __init__(self, simultanes: int, par_minute: int):
        self._places = threading.Semaphore(max(1, simultanes))
        self._par_minute = max(1, par_minute)
        self._recents: list[float] = []
        self._verrou = threading.Lock()

    def prendre(self) -> bool:
        maintenant = time.monotonic()
        with self._verrou:
            self._recents = [t for t in self._recents if maintenant - t < 60.0]
            if len(self._recents) >= self._par_minute:
                return False
            self._recents.append(maintenant)
        return self._places.acquire(timeout=30.0)

    def rendre(self) -> None:
        self._places.release()


def _zip_des(livrables: dict) -> bytes:
    """Les documents refaits, dans un seul fichier — l'athlète en télécharge un, pas cinq."""
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as z:
        for nom in RENDU_LIVRABLES:
            chemin = livrables.get(nom)
            if chemin is not None and Path(chemin).exists():
                z.write(chemin, arcname=nom)
    return tampon.getvalue()


def create_app(cfg: Config | None = None) -> FastAPI:
    cfg = cfg or load_config()
    # Les objets du tableau de bord et la file de travail : des fichiers JSON sur le
    # volume, relus ici une fois pour toutes (récapitulatif §3.5).
    magasin = Magasin(cfg.data_dir)
    store = JobStore(cfg.data_dir)
    jobs_root = store.racine

    # Balayage de démarrage : un crash (SIGKILL/OOM) court-circuite les purges `finally` —
    # les jobs restés en file ou en cours sont clos en échec et leurs uploads (PII)
    # supprimés, ainsi que les dossiers preview-* orphelins. La promesse « archives
    # supprimées immédiatement après analyse » doit tenir AUSSI après un crash.
    for job_id in store.balayer_interrompus("interrompu par un redémarrage du service"):
        shutil.rmtree(jobs_root / job_id / "upload", ignore_errors=True)
    for stray in cfg.data_dir.glob("preview-*"):
        shutil.rmtree(stray, ignore_errors=True)
    # Les versions se construisent à part, puis prennent leur place d'un geste : ce qui
    # traîne encore à côté d'un plan est un rendu qu'un crash a coupé en route.
    for stray in (magasin.plans.racine).glob("*/.[ria]*-*"):
        if stray.is_dir() and stray.name.split("-", 1)[0] in (".rendu", ".amende", ".import"):
            shutil.rmtree(stray, ignore_errors=True)

    app = FastAPI(
        title="Locomotion Twin Engine",
        version="0.1.0",
        description="Du fichier d'entraînement multi-marques à une prédiction validée et un plan de pacing.",
    )
    app.state.store = store
    app.state.magasin = magasin
    app.state.cfg = cfg
    # Les secrets viennent de l'environnement, jamais du dépôt (docs/secrets.md).
    serrures = Serrures.depuis_environnement()
    tentatives = Tentatives(par_ip=cfg.api.plans_tentatives_par_ip,
                            fenetre_s=cfg.api.plans_fenetre_s)
    app.state.serrures = serrures
    app.state.tentatives = tentatives
    # Le client du service de dépôt, posé sur l'app pour qu'un test puisse le remplacer
    # par un faux — sinon il faudrait un twin-depot vivant pour tester une ingestion.
    app.state.depot = Depot()
    # Le relais SMTP, lui aussi remplaçable par un faux : un test n'envoie pas d'email.
    app.state.courrier = Courrier.depuis_environnement()
    app.include_router(routeur_admin())
    app.include_router(routeur_athlete())
    app.include_router(routeur_interne())
    # les dossiers rejouables déposés sous leur référence (cf. scripts/course.sh publier)
    dossiers_root = cfg.data_dir / "dossiers"
    debit = _Debit(cfg.api.rendu_simultanes, cfg.api.rendu_par_minute)

    def _entetes_croisees(origin: str | None) -> dict:
        """Les entêtes CORS, et seulement pour une origine de l'allowlist.

        ``Authorization`` y figure parce que le tableau de bord porte son jeton dans cet
        en-tête — et c'est lui qui rend le préflight obligatoire, même sur un GET."""
        if not origin or origin not in cfg.api.origins:
            return {}
        return {"Access-Control-Allow-Origin": origin,
                "Vary": "Origin",
                "Access-Control-Allow-Headers": "content-type, authorization",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Max-Age": "86400"}

    @app.middleware("http")
    async def ouvre_aux_origines_connues(request: Request, suivant):
        """Le site et l'API sont sur deux domaines : tout appel de page est croisé.

        Les entêtes se posent ICI plutôt que route par route, pour qu'une réponse
        d'erreur les porte aussi — sans quoi le navigateur cache le message et le client
        n'affiche qu'un échec réseau, ce qui est le pire moment pour perdre le détail.

        Le préflight se sert ici aussi, et surtout PAS par une route en ``{chemin:path}``
        : une telle route ferait répondre 405 « méthode non autorisée » à un GET sur un
        chemin inexistant, ce qui avoue que le préfixe existe. Une référence inconnue
        doit rendre 404, et rien d'autre (récapitulatif §4.2).
        """
        croisee = request.url.path.startswith(_CROISEES)
        if croisee and request.method == "OPTIONS":
            reponse = Response(status_code=204)
        else:
            reponse = await suivant(request)
        if croisee:
            for nom, valeur in _entetes_croisees(request.headers.get("origin")).items():
                reponse.headers[nom] = valeur
        return reponse

    @app.middleware("http")
    async def borne_la_taille_du_rendu(request: Request, suivant):
        """Un corps trop gros est refusé sur son entête, avant d'être chargé en mémoire.

        FastAPI convertit le corps en dict pour le passer au gestionnaire : une borne posée
        dans le gestionnaire arriverait trop tard. Un dossier de rapport pèse ~200 Kio ;
        bien au-delà, ce n'est plus un dossier.
        """
        if request.url.path == "/rendu":
            taille = request.headers.get("content-length")
            if taille and taille.isdigit() and int(taille) > cfg.api.rendu_max_kio * 1024:
                return Response(status_code=413, media_type="application/json",
                                content=json.dumps({"detail": "payload trop gros pour un dossier"}))
        return await suivant(request)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/preview")
    async def preview(
        training: UploadFile = File(...),
        course_gpx: UploadFile = File(...),
        race: UploadFile = File(...),
        athlete: str = Form("athlète"),
        target_hours: str | None = Form(None),
    ) -> dict:
        race_spec = _parse_race(await race.read(), target_hours)
        gpx = await course_gpx.read()
        tmp = Path(tempfile.mkdtemp(dir=cfg.data_dir, prefix="preview-"))
        try:
            tpath = tmp / _safe_name(training.filename, "training.bin")
            tpath.write_bytes(await training.read())
            result = run_preview(
                training_path=tpath, course_gpx=gpx, race=race_spec, cfg=cfg, purge_source=True
            )
            return result.to_dict()
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    @app.post("/jobs")
    async def create_job(
        background: BackgroundTasks,
        training: UploadFile = File(...),
        course_gpx: UploadFile = File(...),
        race: UploadFile = File(...),
        athlete: str = Form("athlète"),
        target_hours: str | None = Form(None),
    ) -> dict:
        race_spec = _parse_race(await race.read(), target_hours)
        gpx = await course_gpx.read()
        job_id = uuid4().hex
        job_dir = jobs_root / job_id
        (job_dir / "upload").mkdir(parents=True, exist_ok=True)
        tpath = job_dir / "upload" / _safe_name(training.filename, "training.bin")
        tpath.write_bytes(await training.read())

        # La référence se construit comme au CLI — même fonction, même forme. Elle ne
        # dérive JAMAIS de l'id du job : un job est un passage, une référence désigne un
        # rapport (récapitulatif §3.3).
        store.creer(job_id, type=JOB_GENERATION)
        background.add_task(
            run_job, job_id=job_id, store=store, cfg=cfg, job_dir=job_dir,
            training_path=tpath, course_gpx=gpx, race=race_spec, athlete=athlete,
            report_ref=reference_de_rapport(race_spec, athlete),
            report_date=datetime.now(),
        )
        return store.public(job_id)

    @app.get("/jobs/{job_id}")
    def get_job(job_id: str) -> dict:
        """L'état d'un passage (récapitulatif §5.7).

        Le tableau de bord sonde cette route pendant qu'un job tourne et montre
        ``avancement`` tel quel. Il n'annonce aucune durée : personne ne sait combien de
        temps prend une archive avant de l'avoir lue."""
        job = store.lire(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job inconnu")
        vu = store.rendre_public(job)
        vu["rapport_url"] = f"/jobs/{job_id}/report" if job.get("pdf") else None
        return vu

    @app.get("/jobs/{job_id}/report")
    def get_report(job_id: str) -> FileResponse:
        job = store.lire(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job inconnu")
        pdf = job.get("pdf")
        if not pdf or not Path(pdf).exists():
            raise HTTPException(status_code=404, detail="rapport non disponible (job non terminé ou 🔴)")
        return FileResponse(pdf, media_type="application/pdf", filename="rapport-locomotion-twin.pdf")

    @app.post("/fiche")
    def fiche(payload: dict) -> Response:
        """Fiche participant·e des ateliers (appelé en interne par atelier-api).

        Payload : cf. ``twin_engine.fiche`` — le contenu volatil (consignes,
        questions de santé) arrive dedans, la page du site étant la source
        unique. Rien n'est stocké ici : la fiche est rendue puis renvoyée ;
        atelier-api garde l'enregistrement et envoie l'email.
        """
        for champ in ("participant", "atelier", "dossier", "consignes", "sante"):
            if not isinstance(payload.get(champ), dict):
                raise HTTPException(status_code=422, detail=f"payload.{champ} manquant")
        with tempfile.TemporaryDirectory(dir=cfg.data_dir, prefix="fiche-") as out:
            try:
                pdf_path = build_fiche_pdf(payload, out)
            except Exception as exc:  # rendu/compilation — détail utile côté appelant
                raise HTTPException(status_code=500, detail=f"rendu fiche: {exc}") from exc
            data = pdf_path.read_bytes()
        return Response(
            content=data,
            media_type="application/pdf",
            headers={
                "X-Fiche-Reference": str(payload.get("dossier", {}).get("reference", "")),
                "X-Fiche-Empreinte": fiche_empreinte(payload),
            },
        )

    # ----------------------------------------------------------------------------------- #
    # /rendu — la boucle d'amendement : la page renvoie ce que l'athlète a changé, le
    # moteur lui rend SES documents refaits. Sans archive (le dossier porte déjà tout ce
    # que le calcul demande), sans rien garder, et par le même chemin de code que la
    # production d'origine — deux chemins finiraient par ne plus dire la même chose.
    # ----------------------------------------------------------------------------------- #
    def _dossier_du(payload: dict):
        """Le dossier à rejouer : celui que le payload porte, ou celui déposé sous sa
        référence. La référence est filtrée — elle sert à composer un chemin."""
        brut = payload.get("dossier")
        if isinstance(brut, dict):
            return brut
        ref = payload.get("ref")
        if not isinstance(ref, str) or not _REF_OK.fullmatch(ref):
            raise HTTPException(status_code=422,
                                detail="payload : « dossier » ou « ref » attendu")
        chemin = dossiers_root / f"{ref}.json"
        if not chemin.exists():
            raise HTTPException(status_code=404, detail=f"aucun dossier déposé pour {ref}")
        try:
            return json.loads(chemin.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=500, detail=f"dossier illisible: {exc}") from exc

    @app.post("/rendu")
    def rendu(payload: dict) -> Response:
        """Refait les documents d'un rapport, amendés des réglages que la page renvoie.

        Payload : ``{"ref" | "dossier", "amendement": {reglages?, crew?, nutrition?},
        "feuille_seule": bool}``. Rend un ZIP des documents. Rien n'est écrit ni gardé :
        ce qui entre est un dossier, ce qui sort est un PDF, et le répertoire de travail
        disparaît avec la requête.
        """
        brut = _dossier_du(payload)
        fragment = payload.get("amendement") or None
        if fragment is not None and not isinstance(fragment, dict):
            raise HTTPException(status_code=422, detail="payload.amendement : objet attendu")
        try:
            d = dossier_mod.from_payload(brut)
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=f"dossier illisible: {exc}") from exc

        if not debit.prendre():
            raise HTTPException(status_code=429, detail="trop de rendus en cours, réessaie",
                                headers={"Retry-After": "30"})
        try:
            with tempfile.TemporaryDirectory(dir=cfg.data_dir, prefix="rendu-") as out:
                try:
                    livrables = dossier_mod.regenerer(
                        d, fragment, cfg=cfg, out_dir=Path(out),
                        feuille_only=bool(payload.get("feuille_seule")),
                    )
                except ValueError as exc:      # amendement refusé (champ non amendable)
                    raise HTTPException(status_code=422, detail=str(exc)) from exc
                except Exception as exc:       # rendu/compilation — détail utile au client
                    raise HTTPException(status_code=500, detail=f"rendu: {exc}") from exc
                data = _zip_des(livrables)
        finally:
            debit.rendre()

        nom = f"locomotion-twin-{d.report_ref}.zip"
        return Response(content=data, media_type="application/zip",
                        headers={"X-Rendu-Reference": d.report_ref,
                                 "Content-Disposition": f'attachment; filename="{nom}"'})

    return app


def get_app() -> FastAPI:
    """Fabrique pour uvicorn : ``uvicorn twin_engine.api:get_app --factory``."""
    return create_app()


__all__ = ["create_app", "get_app"]
