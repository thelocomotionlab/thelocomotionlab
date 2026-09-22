"""Les routes du tableau de bord, derrière le jeton d'administration.

Chemins vus d'ici : ``/tableau-de-bord/…``. Caddy les expose sous ``/twin/tableau-de-bord/…``
et retire le préfixe au passage (``infra/caddy/conf.d/api.caddy``) — c'est ce qui
réconcilie les chemins du récapitulatif §5 avec ceux servis sur l'internet.

Sans ``TWIN_ADMIN_TOKEN`` dans l'environnement, ce routeur répond 404 partout : le
service se comporte alors comme s'il ne servait pas ces routes du tout. Avec un jeton
configuré mais faux ou absent de la requête : 401, sans détail.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile,
)

from .. import dossier as dossier_mod
from ..jobs import run_ingestion
from . import file as _file
from .depot import DepotIndisponible
from .magasin import Magasin
from .objets import (
    INGESTION_RECU,
    PLAN_GENERE,
    Archive,
    Athlete,
    Ingestion,
    JOB_INGESTION,
    Plan,
    maintenant,
)
from .plan import resumer_la_prediction
from .serrures import Serrures, Tentatives, adresse_du_visiteur


# Une référence sert à composer un chemin sur le volume : même filtre que celui de
# `/rendu` (api/app.py), et pour la même raison.
_REF_SURE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")


def identifiant_dathlete(email: str) -> str:
    """L'id interne d'un athlète, dérivé de son email.

    Stable et idempotent : c'est l'email qui le reconnaît à sa deuxième course (§3.1), et
    un dépôt rejoué ne crée donc jamais de doublon. Haché plutôt que gardé en clair — un
    id voyage dans des URL et des journaux, une adresse email n'a rien à y faire."""
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:16]


def _athlete_depuis_un_depot(depot: dict) -> Athlete:
    """L'Athlète tel qu'un dépôt le décrit : identité, consentement, et rien de plus.

    Le jumeau et le niveau restent vides — ils n'existeront qu'après l'ingestion."""
    email = str(depot.get("email") or "")
    prenom = str(depot.get("prenom") or "")
    return Athlete(
        id=identifiant_dathlete(email),
        pseudo=prenom,
        email=email,
        prenom=prenom,
        montre=str(depot.get("montre") or ""),
        # La case cochée et l'horodatage du dépôt : la date du consentement est celle du
        # geste. Sans la case, pas de date — on ne suppose pas un accord.
        consent_at=str(depot.get("createdAt") or "") if depot.get("consent") else "",
        depot_id=str(depot.get("id") or ""),
        archive=Archive(
            nom=str(depot.get("nomFichier") or ""),
            taille=int(depot.get("taille") or 0),
            sha256=str(depot.get("sha256") or ""),
            recue_le=str(depot.get("createdAt") or ""),
        ),
        ingestion=Ingestion(statut=INGESTION_RECU, le=maintenant()),
    )


def accueillir_un_depot(depot: dict, magasin: Magasin) -> Athlete:
    """Crée l'Athlète, ou met à jour celui qui revient avec une nouvelle archive.

    Ce qu'un athlète a déjà — ses plans, le pseudo qu'on lui a donné — ne se perd pas
    parce qu'il redépose : seuls l'archive, le dépôt et l'état d'ingestion changent."""
    venu = _athlete_depuis_un_depot(depot)
    existant = magasin.athletes.lire(venu.id)
    if existant is not None:
        ancien = Athlete.from_dict(existant)
        venu.pseudo = ancien.pseudo or venu.pseudo
        venu.plans = ancien.plans
    magasin.athletes.ecrire(venu.to_dict())
    return venu


def exige_admin(request: Request) -> None:
    """La serrure de Valentin, posée sur chaque route de ce routeur.

    Jeton absent de l'environnement → 404 : on ne dit pas qu'une porte existe si on n'a
    pas de quoi l'ouvrir. Jeton présent mais requête sans le bon → 401, sans détail :
    « non autorisé » et rien d'autre, pas de longueur attendue, pas de format."""
    serrures: Serrures = request.app.state.serrures
    if not serrures.admin_servie:
        raise HTTPException(status_code=404, detail="not_found")
    if not serrures.admin_ouvre(request.headers.get("authorization")):
        raise HTTPException(status_code=401, detail="non_autorise")


def exige_cle(request: Request, ref: str) -> str:
    """La serrure de l'athlète : la clé du lien, sur le plan qu'elle désigne.

    Rend l'usage qu'elle ouvre — ``partage`` ou ``prive`` — et **404 pour tout le
    reste** : clé absente, clé fausse, référence inconnue, secret non configuré. Jamais
    403 : un 403 confirmerait que la référence existe, et c'est précisément ce qu'on ne
    veut pas confirmer à quelqu'un qui cherche.

    Les échecs se comptent par adresse. Passé la borne, l'adresse reçoit la même 404 —
    elle n'apprend pas qu'elle a été repérée, et l'athlète qui s'est trompé de lien
    retrouve la porte ouverte dès qu'il colle le bon.
    """
    serrures: Serrures = request.app.state.serrures
    tentatives: Tentatives = request.app.state.tentatives
    ip = adresse_du_visiteur(request)
    if tentatives.fermee(ip):
        raise HTTPException(status_code=404, detail="not_found")

    usage = serrures.usage_de(ref, request.query_params.get("k"))
    if usage is None or not request.app.state.magasin.plans.existe(ref):
        tentatives.rate(ip)
        raise HTTPException(status_code=404, detail="not_found")
    tentatives.reussi(ip)
    return usage


def routeur_interne() -> APIRouter:
    """L'appel du service de dépôt au moteur, sur le réseau Docker et nulle part ailleurs.

    Ce préfixe n'est routé par AUCUN Caddy (cf. infra/caddy/conf.d/api.caddy) : le secret
    partagé ne garde pas contre l'internet, il garde contre un conteneur compromis."""
    routeur = APIRouter(prefix="/twin/internal")

    @routeur.post("/deposits")
    def un_depot_est_arrive(charge: dict, fond: BackgroundTasks, request: Request) -> dict:
        """Le dépôt prévient : un athlète vient de déposer (§2.3, §5.1).

        La charge ne porte que l'id du dépôt. Tout le reste — identité, consentement,
        empreinte de l'archive — est relu sur le service de dépôt : une seule source de
        vérité, et rien à croire sur parole."""
        serrures: Serrures = request.app.state.serrures
        secret = serrures.internal_secret
        if not secret:
            raise HTTPException(status_code=404, detail="not_found")
        if not hmac.compare_digest(str(charge.get("secret") or ""), secret):
            raise HTTPException(status_code=401, detail="non_autorise")

        depot_id = str(charge.get("depot_id") or "")
        if not depot_id:
            raise HTTPException(status_code=422, detail="depot_id manquant")

        magasin: Magasin = request.app.state.magasin
        try:
            depot = request.app.state.depot.trouver(depot_id)
        except DepotIndisponible as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if depot is None:
            raise HTTPException(status_code=404, detail="dépôt inconnu")

        athlete = accueillir_un_depot(depot, magasin)
        job_id = _mettre_en_file(request, fond, athlete.id)
        return {"athlete_id": athlete.id, "job_id": job_id}

    return routeur


def _mettre_en_file(request: Request, fond: BackgroundTasks, athlete_id: str,
                    archive_locale: Path | None = None) -> str:
    """Pose une ingestion dans la file et rend son id. Une seule tourne à la fois."""
    store = request.app.state.store
    job_id = uuid4().hex
    store.creer(job_id, type=JOB_INGESTION, athlete_id=athlete_id)
    fond.add_task(
        run_ingestion, job_id=job_id, store=store, magasin=request.app.state.magasin,
        cfg=request.app.state.cfg, athlete_id=athlete_id, archive_locale=archive_locale,
        depot=request.app.state.depot,
    )
    return job_id


def routeur_admin() -> APIRouter:
    routeur = APIRouter(prefix="/tableau-de-bord", dependencies=[Depends(exige_admin)])

    @routeur.get("/file")
    def lire_la_file(request: Request) -> dict:
        """Ce qui attend, la course la plus proche en tête (récapitulatif §5.1).

        Les demandes ouvertes sont listées à part : elles ne sont pas des dossiers, elles
        sont des questions posées sur un dossier."""
        magasin: Magasin = request.app.state.magasin
        plans = {p["id"]: p for p in magasin.plans.lister()}
        courses = {c["id"]: c for c in magasin.courses.lister()}
        vue = _file.construire(
            athletes=magasin.athletes.lister(), plans=plans, courses=courses
        )
        vue["demandes"] = [
            d for d in magasin.demandes.lister() if d.get("statut") == "ouverte"
        ]
        return vue

    @routeur.post("/file/refresh")
    def rattraper_les_depots(request: Request, fond: BackgroundTasks) -> dict:
        """Le bouton « rafraîchir » : rattrape ce que l'appel du dépôt aurait manqué (§5.1).

        Ce n'est PAS un sondage — il ne tourne que quand on clique. Le chemin normal reste
        l'appel du dépôt à la fin de l'upload ; ceci est le filet, pour le jour où il est
        tombé."""
        magasin: Magasin = request.app.state.magasin
        try:
            depots = request.app.state.depot.lister()
        except DepotIndisponible as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        rattrapes = []
        for depot in depots:
            if magasin.athletes.existe(identifiant_dathlete(str(depot.get("email") or ""))):
                continue
            athlete = accueillir_un_depot(depot, magasin)
            rattrapes.append({"athlete_id": athlete.id,
                              "job_id": _mettre_en_file(request, fond, athlete.id)})
        return {"depots": len(depots), "rattrapes": rattrapes}

    @routeur.get("/athletes/{athlete_id}")
    def lire_un_athlete(athlete_id: str, request: Request) -> dict:
        """L'objet complet, avec ses plans (§5.2)."""
        magasin: Magasin = request.app.state.magasin
        athlete = magasin.athletes.lire(athlete_id)
        if athlete is None:
            raise HTTPException(status_code=404, detail="athlète inconnu")
        athlete["plans"] = [p for p in (magasin.plans.lire(ref) for ref in athlete["plans"])
                            if p is not None]
        return athlete

    @routeur.post("/athletes/{athlete_id}/ingest")
    def ingerer(athlete_id: str, request: Request, fond: BackgroundTasks) -> dict:
        """Met une ingestion en file ; l'archive est lue depuis le dépôt (§5.2)."""
        magasin: Magasin = request.app.state.magasin
        athlete = magasin.athletes.lire(athlete_id)
        if athlete is None:
            raise HTTPException(status_code=404, detail="athlète inconnu")
        if not athlete.get("depot_id"):
            raise HTTPException(
                status_code=409,
                detail="aucun dépôt rattaché : renvoie l'archive avec POST …/archive",
            )
        return {"job_id": _mettre_en_file(request, fond, athlete_id)}

    @routeur.post("/athletes/{athlete_id}/archive")
    async def reingerer_avec_mon_archive(
        athlete_id: str, request: Request, fond: BackgroundTasks,
        archive: UploadFile = File(...),
    ) -> dict:
        """Ré-ingérer avec l'archive rapatriée chez Valentin, quand le moteur a changé (§5.2).

        Le fichier est écrit par blocs dans un temporaire du VOLUME — jamais en mémoire :
        une archive pèse couramment plusieurs centaines de Mo, et le conteneur est borné."""
        magasin: Magasin = request.app.state.magasin
        if not magasin.athletes.existe(athlete_id):
            raise HTTPException(status_code=404, detail="athlète inconnu")
        cfg = request.app.state.cfg
        temporaire = Path(tempfile.mkdtemp(dir=cfg.data_dir, prefix="archive-"))
        chemin = temporaire / (Path(archive.filename or "archive.zip").name or "archive.zip")
        try:
            with chemin.open("wb") as sortie:
                shutil.copyfileobj(archive.file, sortie, length=1024 * 1024)
        except OSError as exc:
            shutil.rmtree(temporaire, ignore_errors=True)
            raise HTTPException(status_code=500, detail=f"écriture impossible : {exc}") from exc
        return {"job_id": _mettre_en_file(request, fond, athlete_id, archive_locale=chemin)}

    # --- Plans ------------------------------------------------------------- #
    # Les documents qu'un import accepte : ceux que l'athlète emporte, et eux seuls.
    # Tout ce qui arrive sous un autre nom est ignoré — un import ne déballe pas une
    # archive quelconque dans un répertoire du volume.
    DOCUMENTS = {"rapport.pdf": "pdf", "feuille.pdf": "feuille_pdf",
                 "plan.ics": "ics", "plan.gpx": "gpx"}

    @routeur.post("/plans/import")
    async def importer_un_plan(
        request: Request,
        dossier: UploadFile = File(...),
        documents: list[UploadFile] = File(default=[]),
        athlete_id: str = Form(""),
    ) -> dict:
        """Un dossier fait au CLI entre dans le tableau de bord (§5.4).

        C'est le chemin « lancer depuis mon ordinateur » : le CLI reste un chemin de
        premier rang, et ce qu'il produit doit pouvoir être publié et envoyé comme le
        reste. Le moteur ne recalcule rien — le dossier fait foi, c'est son métier."""
        magasin: Magasin = request.app.state.magasin
        try:
            d = dossier_mod.from_payload(json.loads(await dossier.read()))
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=422, detail=f"dossier illisible : {exc}") from exc

        # La référence du dossier EST celle du plan : elle est déjà imprimée sur le
        # rapport et dans son QR code. En tirer une autre ici casserait le papier.
        ref = d.report_ref
        if not _REF_SURE.fullmatch(ref):
            raise HTTPException(status_code=422, detail="référence de dossier inutilisable")
        if athlete_id and not magasin.athletes.existe(athlete_id):
            raise HTTPException(status_code=404, detail="athlète inconnu")

        ancien = magasin.plans.lire(ref)
        version = int((ancien or {}).get("version") or 0) + 1
        repertoire = magasin.plans.repertoire(ref) / f"v{version}"
        repertoire.mkdir(parents=True, exist_ok=True)
        (repertoire / "dossier.json").write_bytes(
            json.dumps(dossier_mod.to_payload(
                course_gpx=d.course_gpx, race=d.race, twin=d.twin,
                calibration=d.calibration, prediction=d.prediction,
                sufficiency=d.sufficiency, athlete=d.athlete,
                report_ref=d.report_ref, report_date=d.report_date,
            ), ensure_ascii=False).encode("utf-8")
        )

        porte = {}
        for envoye in documents:
            nom = Path(envoye.filename or "").name
            if nom not in DOCUMENTS:
                continue
            (repertoire / nom).write_bytes(await envoye.read())
            porte[DOCUMENTS[nom]] = f"v{version}/{nom}"

        plan = Plan.from_dict(ancien) if ancien else Plan(ref=ref)
        plan.athlete_id = athlete_id or plan.athlete_id
        plan.version = version
        plan.statut = PLAN_GENERE
        plan.prediction = resumer_la_prediction(d)
        for champ, chemin in porte.items():
            setattr(plan.documents, champ, chemin)
        magasin.plans.ecrire(plan.to_dict())

        if plan.athlete_id:
            athlete = magasin.athletes.lire(plan.athlete_id)
            if athlete is not None and ref not in (athlete.get("plans") or []):
                magasin.athletes.modifier(
                    plan.athlete_id, plans=[*(athlete.get("plans") or []), ref]
                )
        return {"ref": ref, "version": version, "documents": sorted(porte)}

    @routeur.delete("/athletes/{athlete_id}", status_code=204)
    def supprimer_un_athlete(athlete_id: str, request: Request) -> None:
        """Archive, jumeau, plans, page : tout est supprimé (§5.2).

        Le registre garde ses entrées sous pseudonyme — c'est la couverture du moteur, pas
        le dossier d'une personne ; elle ne se reconstitue pas depuis une erreur en heures.
        """
        magasin: Magasin = request.app.state.magasin
        athlete = magasin.athletes.lire(athlete_id)
        if athlete is None:
            raise HTTPException(status_code=404, detail="athlète inconnu")
        for ref in athlete.get("plans") or ():
            magasin.plans.supprimer(ref)
        magasin.athletes.supprimer(athlete_id)

    return routeur


__all__ = ["accueillir_un_depot", "exige_admin", "exige_cle",
           "identifiant_dathlete", "routeur_admin", "routeur_interne"]
