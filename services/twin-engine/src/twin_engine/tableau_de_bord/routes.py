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
import os
import re
import shutil
import tempfile
import unicodedata
from dataclasses import asdict
from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile,
)

from .. import dossier as dossier_mod
from ..course import RaceSpec
from ..jobs import run_ingestion
from . import file as _file
from .depot import DepotIndisponible
from .magasin import Magasin, ecrire_json
from .objets import (
    COURSE_BROUILLON,
    COURSE_PUBLIEE,
    INGESTION_RECU,
    PLAN_RESULTAT,
    Archive,
    Athlete,
    Course,
    Geometrie,
    Gpx,
    Ingestion,
    JOB_INGESTION,
    Plan,
    Soleil,
    maintenant,
)
from .cycle import statut_apres_changement
from .generation import (
    FICHIERS_DUNE_VERSION,
    GenerationImpossible,
    documents_dune_version,
    prochain_numero,
    ranger_une_version,
)
from .plan import resumer_la_prediction
from .routes_plans import REF_SURE, ajouter_les_routes_de_plan, course_du_plan
from .serrures import Serrures, Tentatives, adresse_du_visiteur
from .trace import lire_la_trace
from .traduction import course_vers_racespec, racespec_vers_course


def _slug_de(nom: str, edition: int | None) -> str:
    """« Nice Côte d'Azur by UTMB · 100M », 2026 → « nice-cote-d-azur-by-utmb-100m-2026 ».

    Lisible dans une URL et dans un nom de fichier, sans accent ni ponctuation."""
    sans_accent = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode()
    mots = re.sub(r"[^a-z0-9]+", "-", sans_accent.lower()).strip("-")
    return f"{mots}-{edition}" if edition else mots


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
        athlete["plans"] = _file.plans_de_lathlete(athlete_id, magasin.plans.lister())
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

    # --- Bibliothèque et éditeur de course (§5.3) ---------------------------- #
    def _course_ou_404(request: Request, course_id: str) -> Course:
        brut = request.app.state.magasin.courses.lire(course_id)
        if brut is None:
            raise HTTPException(status_code=404, detail="course inconnue")
        return Course.from_dict(brut)

    def _plans_de(magasin: Magasin, course_id: str) -> list[dict]:
        return [p for p in magasin.plans.lister() if p.get("course_id") == course_id]

    @routeur.get("/courses")
    def lister_les_courses(request: Request) -> dict:
        """La bibliothèque. Chaque course dit combien d'athlètes la courent — c'est ce
        qui fait la différence entre une course qu'on peut jeter et une qu'on ne peut
        plus toucher."""
        magasin: Magasin = request.app.state.magasin
        courses = sorted(magasin.courses.lister(), key=lambda c: c.get("depart_le") or "9999")
        for course in courses:
            course["athletes"] = len(_plans_de(magasin, course["id"]))
        return {"courses": courses}

    @routeur.post("/courses")
    def creer_une_course(charge: dict, request: Request) -> dict:
        """Une course naît en BROUILLON, de son identité seule : nom, édition, départ.

        La trace vient après — c'est l'ordre de l'éditeur, et c'est le bon : sans nom ni
        date, une trace n'est qu'une ligne sur une carte.

        ``race_spec`` (facultatif) ouvre l'autre porte : une spec écrite au CLI entre
        telle quelle, ravitaillements compris. Le §5.3 ne la liste pas ; elle ne change
        rien au contrat documenté et évite de resaisir à la main dix-sept
        ravitaillements qu'un fichier porte déjà."""
        magasin: Magasin = request.app.state.magasin
        course_id = uuid4().hex[:12]

        brut = charge.get("race_spec")
        if brut is not None:
            try:
                spec = RaceSpec.from_dict(brut)
            except (ValueError, KeyError, TypeError) as exc:
                raise HTTPException(status_code=422, detail=f"spec illisible : {exc}") from exc
            course = racespec_vers_course(spec, id=course_id, edition=charge.get("edition"))
            course.slug = _slug_de(course.nom, course.edition)
        else:
            nom = str(charge.get("nom") or "").strip()
            if not nom:
                raise HTTPException(status_code=422, detail="le nom est requis")
            course = Course(
                id=course_id,
                nom=nom,
                edition=charge.get("edition"),
                depart_le=str(charge.get("depart_le") or ""),
                slug=_slug_de(nom, charge.get("edition")),
            )
        magasin.courses.ecrire(course.to_dict())
        return {"id": course.id, "slug": course.slug, "statut": course.statut}

    @routeur.get("/courses/{course_id}")
    def lire_une_course(course_id: str, request: Request) -> dict:
        vue = _course_ou_404(request, course_id).to_dict()
        vue["athletes"] = len(_plans_de(request.app.state.magasin, course_id))
        return vue

    @routeur.put("/courses/{course_id}")
    def enregistrer_une_course(course_id: str, charge: dict, request: Request) -> dict:
        """L'objet entier, à chaque enregistrement (§5.3).

        L'éditeur sauve à chaque changement : envoyer la course complète plutôt qu'un
        fragment évite qu'un enregistrement perdu laisse un objet à moitié d'une version
        et à moitié de l'autre.

        Ce qui NE se remplace pas ici : l'id, le statut et la géométrie. Le statut se
        change par ``/publish``, et la géométrie se calcule depuis la trace — l'écran
        n'a pas à pouvoir affirmer un D+ que le moteur n'a pas mesuré."""
        magasin: Magasin = request.app.state.magasin
        ancienne = _course_ou_404(request, course_id)
        try:
            nouvelle = Course.from_dict({**charge, "id": course_id})
        except (TypeError, ValueError, KeyError) as exc:
            raise HTTPException(status_code=422, detail=f"course illisible : {exc}") from exc

        nouvelle.statut = ancienne.statut
        nouvelle.geometrie = ancienne.geometrie
        nouvelle.gpx = ancienne.gpx
        nouvelle.slug = ancienne.slug or _slug_de(nouvelle.nom, nouvelle.edition)

        # Une course qu'on ne peut pas traduire est une course qui ne fera jamais de
        # plan : on le dit à l'enregistrement, pas à la génération.
        try:
            race = course_vers_racespec(nouvelle)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        # La géométrie et le soleil suivent ce qui vient de changer : les ravitaillements
        # recalent la distance sur le carnet de route, le départ déplace le coucher et le
        # lever. Relire la trace coûte un dixième de seconde ; afficher des chiffres d'avant
        # coûterait un plan faux.
        trace = magasin.courses.repertoire(course_id) / "trace.gpx"
        if trace.exists():
            vu = lire_la_trace(trace.read_bytes(), cfg=request.app.state.cfg, race=race)
            nouvelle.geometrie = Geometrie(**vu["geometrie"])
            nouvelle.soleil = Soleil(**vu["soleil"])
            nouvelle.lat, nouvelle.lon = vu["lat"], vu["lon"]

        return magasin.courses.ecrire(nouvelle.to_dict())

    @routeur.get("/courses/{course_id}/trace")
    def relire_la_trace(course_id: str, request: Request) -> dict:
        """Le profil et les waypoints de la trace déjà posée, recalculés avec les
        ravitaillements d'aujourd'hui — ceux de la pose ont pu bouger depuis."""
        magasin: Magasin = request.app.state.magasin
        course = _course_ou_404(request, course_id)
        trace = magasin.courses.repertoire(course_id) / "trace.gpx"
        if not trace.exists():
            raise HTTPException(status_code=404, detail="pas encore de trace")
        try:
            vu = lire_la_trace(trace.read_bytes(), cfg=request.app.state.cfg,
                               race=course_vers_racespec(course))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"trace illisible : {exc}") from exc
        return {**vu, "nom": course.gpx.nom}

    @routeur.post("/courses/{course_id}/gpx")
    async def poser_la_trace(course_id: str, request: Request,
                             gpx: UploadFile = File(...)) -> dict:
        """La trace : profil lissé, géométrie, waypoints trouvés, position, soleil (§5.3).

        Le calcul passe par ``build_course``, celui-là même qui fait les rapports : deux
        lectures de GPX finiraient par ne plus dire la même chose."""
        magasin: Magasin = request.app.state.magasin
        course = _course_ou_404(request, course_id)
        donnees = await gpx.read()
        try:
            vu = lire_la_trace(donnees, cfg=request.app.state.cfg,
                               race=course_vers_racespec(course))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"trace illisible : {exc}") from exc

        repertoire = magasin.courses.repertoire(course_id)
        repertoire.mkdir(parents=True, exist_ok=True)
        (repertoire / "trace.gpx").write_bytes(donnees)
        ecrire_json(repertoire / "profil.json", vu["profil"])

        course.gpx = Gpx(nom=Path(gpx.filename or "trace.gpx").name,
                         points=vu["points"], avec_altitude=vu["avec_altitude"])
        course.geometrie = Geometrie(**vu["geometrie"])
        course.lat, course.lon = vu["lat"], vu["lon"]
        course.soleil = Soleil(**vu["soleil"])
        magasin.courses.ecrire(course.to_dict())
        return vu

    @routeur.post("/courses/{course_id}/publish")
    def publier_une_course(course_id: str, request: Request) -> dict:
        """La course sort du brouillon. Les plans existants gardent leur version."""
        course = _course_ou_404(request, course_id)
        if not course.ravitaillements:
            raise HTTPException(
                status_code=409,
                detail="une course sans ravitaillement ne fait pas de carnet de route",
            )
        course.statut = COURSE_PUBLIEE
        return request.app.state.magasin.courses.ecrire(course.to_dict())

    @routeur.post("/courses/{course_id}/duplicate")
    def dupliquer_en_edition_suivante(course_id: str, charge: dict, request: Request) -> dict:
        """La même trace et les mêmes ravitaillements, une édition plus loin (§5.3).

        Un parcours bouge peu d'une année sur l'autre ; la date, elle, bouge toujours.
        La copie naît en brouillon — c'est ce qui laisse corriger avant de servir."""
        magasin: Magasin = request.app.state.magasin
        source = _course_ou_404(request, course_id)
        neuve = Course.from_dict(source.to_dict())
        neuve.id = uuid4().hex[:12]
        neuve.statut = COURSE_BROUILLON
        neuve.edition = charge.get("edition") or (
            (source.edition + 1) if source.edition else None
        )
        neuve.depart_le = str(charge.get("depart_le") or "")
        neuve.soleil = Soleil()   # une autre date, d'autres heures de soleil
        neuve.slug = _slug_de(neuve.nom, neuve.edition)
        magasin.courses.ecrire(neuve.to_dict())

        # La trace suit : c'est tout l'intérêt de dupliquer.
        ancien = magasin.courses.repertoire(course_id)
        nouveau = magasin.courses.repertoire(neuve.id)
        nouveau.mkdir(parents=True, exist_ok=True)
        for fichier in ("trace.gpx", "profil.json"):
            if (ancien / fichier).exists():
                shutil.copy(ancien / fichier, nouveau / fichier)
        return {"id": neuve.id, "slug": neuve.slug, "edition": neuve.edition}

    @routeur.delete("/courses/{course_id}", status_code=204)
    def supprimer_une_course(course_id: str, request: Request) -> None:
        """Refusée si un plan y est rattaché (§5.3).

        Un plan garde son dossier et peut refaire ses documents sans sa course ; mais la
        bibliothèque mentirait, et le registre ne saurait plus de quelle épreuve il
        parle. On supprime les plans d'abord, sciemment."""
        magasin: Magasin = request.app.state.magasin
        _course_ou_404(request, course_id)
        rattaches = _plans_de(magasin, course_id)
        if rattaches:
            raise HTTPException(
                status_code=409,
                detail=f"{len(rattaches)} plan(s) rattaché(s) : "
                       f"{', '.join(p['ref'] for p in rattaches[:3])}",
            )
        magasin.courses.supprimer(course_id)

    # --- Plans ------------------------------------------------------------- #
    # Les documents qu'un import accepte : ceux que le CLI écrit à côté du dossier, et eux
    # seuls. Tout ce qui arrive sous un autre nom est ignoré — un import ne déballe pas une
    # archive quelconque dans un répertoire du volume.
    DOCUMENTS = ("rapport.pdf", "feuille.pdf", "fiches.pdf", "plan.ics", "plan.gpx",
                 "annexe.json")

    @routeur.post("/plans/import")
    async def importer_un_plan(
        request: Request,
        dossier: UploadFile = File(...),
        documents: list[UploadFile] = File(default=[]),
        athlete_id: str = Form(""),
        course_id: str = Form(""),
    ) -> dict:
        """Un dossier fait au CLI entre dans le tableau de bord (§5.4).

        C'est le chemin « lancer depuis mon ordinateur » : le CLI reste un chemin de
        premier rang, et ce qu'il produit doit pouvoir être publié et envoyé comme le
        reste. Le moteur ne recalcule rien — le dossier fait foi, c'est son métier. La
        version se range comme une version générée ici : le PDF unique, l'annexe que la
        page lit, et son résumé."""
        magasin: Magasin = request.app.state.magasin
        try:
            d = dossier_mod.from_payload(json.loads(await dossier.read()))
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=422, detail=f"dossier illisible : {exc}") from exc

        # La référence du dossier EST celle du plan : elle est déjà imprimée sur le
        # rapport et dans son QR code. En tirer une autre ici casserait le papier.
        ref = d.report_ref
        if not REF_SURE.fullmatch(ref):
            raise HTTPException(status_code=422, detail="référence de dossier inutilisable")
        if athlete_id and not magasin.athletes.existe(athlete_id):
            raise HTTPException(status_code=404, detail="athlète inconnu")
        if course_id and not magasin.courses.existe(course_id):
            raise HTTPException(status_code=404, detail="course inconnue")

        ancien = magasin.plans.lire(ref)
        numero = prochain_numero(magasin, ref)
        racine = magasin.plans.repertoire(ref)
        racine.mkdir(parents=True, exist_ok=True)
        rendu = Path(tempfile.mkdtemp(dir=racine, prefix=".import-"))
        try:
            (rendu / "dossier.json").write_bytes(
                json.dumps(dossier_mod.to_payload(
                    course_gpx=d.course_gpx, race=d.race, twin=d.twin,
                    calibration=d.calibration, prediction=d.prediction,
                    sufficiency=d.sufficiency, athlete=d.athlete,
                    report_ref=d.report_ref, report_date=d.report_date,
                ), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            )
            recus = []
            for envoye in documents:
                nom = Path(envoye.filename or "").name
                if nom in DOCUMENTS:
                    (rendu / nom).write_bytes(await envoye.read())
                    recus.append(nom)
            if "rapport.pdf" not in recus:
                raise HTTPException(status_code=422,
                                    detail="il manque rapport.pdf : pas de plan sans rapport")
            try:
                ranger_une_version(rendu, rendu)
            except GenerationImpossible as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            for reste in rendu.iterdir():
                if reste.name not in FICHIERS_DUNE_VERSION:
                    reste.unlink()

            prediction = resumer_la_prediction(d)
            documents_v = documents_dune_version(rendu, numero)
            depart = d.race.start_time.isoformat() if d.race.start_time else ""
            ecrire_json(rendu / "version.json", {
                "n": numero, "cree_le": maintenant(), "origine": "import",
                "reglages": None, "amendements": None,
                "prediction": asdict(prediction), "documents": asdict(documents_v),
            })
            os.replace(rendu, racine / f"v{numero}")
        except BaseException:
            shutil.rmtree(rendu, ignore_errors=True)
            raise

        plan = Plan.from_dict(ancien) if ancien else Plan(ref=ref)
        plan.athlete_id = athlete_id or plan.athlete_id
        plan.course_id = course_id or plan.course_id
        plan.version = numero
        plan.prediction = prediction
        plan.documents = documents_v
        plan.depart_le = depart
        if plan.statut != PLAN_RESULTAT:
            plan.statut = statut_apres_changement(plan.to_dict())
        magasin.plans.ecrire(plan.to_dict())

        if plan.athlete_id:
            athlete = magasin.athletes.lire(plan.athlete_id)
            if athlete is not None and ref not in (athlete.get("plans") or []):
                magasin.athletes.modifier(
                    plan.athlete_id, plans=[*(athlete.get("plans") or []), ref]
                )
        return {"ref": ref, "version": numero, "documents": sorted(recus)}

    @routeur.delete("/athletes/{athlete_id}", status_code=204)
    def supprimer_un_athlete(athlete_id: str, request: Request) -> None:
        """Archive, jumeau, plans, demandes, page : tout est supprimé (§5.2).

        Le registre garde ses entrées sous pseudonyme — c'est la couverture du moteur, pas
        le dossier d'une personne ; elle ne se reconstitue pas depuis une erreur en heures.
        """
        from . import registre

        magasin: Magasin = request.app.state.magasin
        athlete = magasin.athletes.lire(athlete_id)
        if athlete is None:
            raise HTTPException(status_code=404, detail="athlète inconnu")
        if request.app.state.store.en_attente(athlete_id=athlete_id):
            raise HTTPException(status_code=409,
                                detail="un travail tourne pour cet athlète : attends qu'il finisse")
        plans = _file.plans_de_lathlete(athlete_id, magasin.plans.lister())
        refs = {p["ref"] for p in plans}
        for plan in plans:
            registre.garder(magasin, request.app.state.cfg, plan,
                            course_du_plan(magasin, plan), athlete)
        for demande in magasin.demandes.lister():
            if demande.get("plan_ref") in refs:
                magasin.demandes.supprimer(demande["id"])
        for ref in refs:
            magasin.plans.supprimer(ref)
        magasin.athletes.supprimer(athlete_id)

    # Le Plan, les Demandes et les Jobs : la même serrure, posée par ce routeur.
    ajouter_les_routes_de_plan(routeur)
    return routeur


__all__ = ["accueillir_un_depot", "exige_admin", "exige_cle",
           "identifiant_dathlete", "routeur_admin", "routeur_interne"]
