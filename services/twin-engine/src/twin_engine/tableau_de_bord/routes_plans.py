"""Les routes du Plan et des Demandes, derrière le jeton d'administration (§5.4, §5.5, §5.7).

Un plan se crée, se génère (une version par génération), se publie (la page répond à ses
deux liens), s'envoie (un email, le PDF joint), se restaure à une version antérieure, et
reçoit son résultat. Chaque geste est une route ; aucun ne part tout seul — l'email,
surtout : il ne part que sur « Envoyer ».
"""

from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse

from .._dt import parse_duration_h
from ..cles import USAGE_PARTAGE, USAGE_PRIVE, lien_du_plan
from ..jobs import run_amendement, run_generation
from .courrier import CourrierIndisponible, destinataire, piece_pdf
from .cycle import (
    a_un_resultat,
    est_parti,
    statut_apres_changement,
    statut_lu,
    statut_publie,
)
from .generation import (
    POLITIQUE_STANDARD,
    POLITIQUES,
    arrets_de_la_politique,
    base_du_plan,
    lire_une_version,
    lister_les_versions,
    taux_darret,
)
from .jumeau import JumeauIllisible, lire_la_calibration
from .magasin import Magasin, lire_json
from .objets import (
    DEMANDE_OUVERTE,
    DEMANDE_REPONDUE,
    INGESTION_INGERE,
    JOB_AMENDEMENT,
    JOB_EN_FILE,
    JOB_GENERATION,
    PLAN_A_COMPOSER,
    PLAN_RESULTAT,
    AssistanceReglage,
    Cles,
    Course,
    Documents,
    NutritionReglage,
    Plan,
    Prediction,
    Reglages,
    Resultat,
    maintenant,
)
from .reference import reference_de_plan

# Une référence sert à composer un chemin sur le volume.
REF_SURE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")

# Les fichiers d'une version, par le nom sous lequel les routes les servent.
FICHIERS = {
    "pdf": ("plan.pdf", "application/pdf"),
    "feuille.pdf": ("feuille.pdf", "application/pdf"),
    "ics": ("plan.ics", "text/calendar"),
    "gpx": ("plan.gpx", "application/gpx+xml"),
}

# Bornes de ce qu'un humain peut raisonnablement déclarer. Au-delà, c'est une faute de
# frappe, et la refuser coûte moins qu'un plan qui boit dix litres à l'heure.
EAU_MAX_L_H = 3.0
GLUCIDES_MAX_G_H = 200.0
ARRET_MAX_MIN = 180.0
NOTE_MAX = 500


# --------------------------------------------------------------------------- #
# Lire ce qui arrive
# --------------------------------------------------------------------------- #
def nombre_borne(valeur, *, nom: str, maxi: float) -> float | None:
    if valeur is None or valeur == "":
        return None
    try:
        nombre = float(str(valeur).replace(",", "."))
    except ValueError:
        raise ValueError(f"{nom} : « {valeur} » n'est pas un nombre") from None
    if not 0.0 <= nombre <= maxi:
        raise ValueError(f"{nom} : {nombre:g} hors de [0, {maxi:g}]")
    return nombre


def lire_la_nutrition(brut) -> NutritionReglage:
    brut = brut or {}
    if not isinstance(brut, dict):
        raise ValueError("nutrition illisible")
    return NutritionReglage(
        eau_l_h=nombre_borne(brut.get("eau_l_h"), nom="eau (L/h)", maxi=EAU_MAX_L_H),
        glucides_g_h=nombre_borne(brut.get("glucides_g_h"), nom="glucides (g/h)",
                                  maxi=GLUCIDES_MAX_G_H),
    )


def lire_les_reglages(brut, course: Course | None) -> Reglages:
    """Les réglages de Valentin, vérifiés. Un réglage illisible est refusé en entier :
    générer une version à moitié réglée serait pire que de ne rien générer."""
    if brut is None:
        return Reglages(politique_arrets=POLITIQUE_STANDARD)
    if not isinstance(brut, dict):
        raise ValueError("réglages illisibles")
    mode = str(brut.get("mode") or "prediction")
    if mode not in ("prediction", "objectif"):
        raise ValueError(f"mode inconnu : {mode}")
    cible = parse_duration_h(brut.get("cible_h"))
    if mode == "objectif" and cible is None:
        raise ValueError("le mode objectif demande une durée visée")
    politique = str(brut.get("politique_arrets") or POLITIQUE_STANDARD)
    if politique not in POLITIQUES:
        raise ValueError(f"politique d'arrêts inconnue : {politique}")

    points = None
    if course is not None:
        points = {i for i, r in enumerate(sorted(course.ravitaillements, key=lambda r: r.km))
                  if r.assistance}
    assistance = []
    for a in brut.get("assistance") or ():
        index = int(a.get("index"))
        note = str(a.get("note") or "").strip()[:NOTE_MAX]
        if points is not None and index not in points:
            raise ValueError(f"le ravitaillement {index} n'est pas un point d'assistance")
        if note:
            assistance.append(AssistanceReglage(index=index, note=note))

    return Reglages(mode=mode, cible_h=cible if mode == "objectif" else None,
                    politique_arrets=politique, assistance=assistance,
                    nutrition=lire_la_nutrition(brut.get("nutrition")))


def lire_le_resultat(brut, *, saisi_par: str) -> Resultat:
    """``{officiel_h}`` ou ``{abandon: true}`` ; les deux vides effacent la saisie."""
    if not isinstance(brut, dict):
        raise ValueError("résultat illisible")
    if brut.get("abandon"):
        return Resultat(officiel_h=None, abandon=True, saisi_par=saisi_par)
    heures = parse_duration_h(brut.get("officiel_h"))
    if heures is None:
        return Resultat()
    if heures > 400:
        raise ValueError(f"{heures:.0f} h : ce n'est pas un temps de course")
    return Resultat(officiel_h=round(heures, 4), abandon=False, saisi_par=saisi_par)


# --------------------------------------------------------------------------- #
# Lire ce qui est rangé
# --------------------------------------------------------------------------- #
def plan_ou_404(request: Request, ref: str) -> Plan:
    magasin: Magasin = request.app.state.magasin
    if not REF_SURE.fullmatch(ref):
        raise HTTPException(status_code=404, detail="plan inconnu")
    brut = magasin.plans.lire(ref)
    if brut is None:
        raise HTTPException(status_code=404, detail="plan inconnu")
    return Plan.from_dict(brut)


def course_du_plan(magasin: Magasin, plan: Plan | dict) -> dict | None:
    course_id = plan.course_id if isinstance(plan, Plan) else plan.get("course_id")
    return magasin.courses.lire(course_id) if course_id else None


def repertoire_de_version(magasin: Magasin, ref: str, numero: int) -> Path:
    return magasin.plans.repertoire(ref) / f"v{int(numero)}"


def documents_presents(repertoire: Path) -> list[str]:
    return [nom for nom, (fichier, _) in FICHIERS.items() if (repertoire / fichier).exists()]


def servir_un_fichier(repertoire: Path, nom: str, ref: str, numero: int) -> FileResponse:
    if nom not in FICHIERS:
        raise HTTPException(status_code=404, detail="document inconnu")
    fichier, type_mime = FICHIERS[nom]
    chemin = repertoire / fichier
    if not chemin.exists():
        raise HTTPException(status_code=404, detail="document absent de cette version")
    # Le nom de téléchargement dit ce que c'est et de quelle version — un athlète qui en
    # garde deux sur son téléphone doit pouvoir les distinguer.
    telecharge = f"{ref}-v{numero}-{fichier}"
    return FileResponse(chemin, media_type=type_mime, filename=telecharge,
                        headers={"Cache-Control": "private, no-store"})


def liens_du_plan(request: Request, ref: str) -> dict[str, str]:
    base = request.app.state.cfg.report.annex_base_url
    secret = request.app.state.serrures.keys_secret
    if not secret:
        return {}
    return {usage: lien_du_plan(base, ref, usage=usage, secret=secret)
            for usage in (USAGE_PARTAGE, USAGE_PRIVE)}


def _arrets_mesures(magasin: Magasin, cfg, plan: Plan, course: dict | None) -> dict | None:
    """Le taux d'arrêt mesuré de l'athlète, et ce qu'il donne sur cette course.

    L'écran le montre à côté du choix de la politique : choisir « mesurée » sans voir ce
    qu'elle pose reviendrait à signer sans lire."""
    try:
        calibration = lire_la_calibration(magasin.athletes.repertoire(plan.athlete_id))
    except (JumeauIllisible, ValueError):
        return None
    mesure = taux_darret(calibration, cfg)
    vue = {**mesure, "minutes_par_heure": round(mesure["taux"] * 60.0, 1),
           "total_min": None, "par_ravitaillement": []}
    temps = plan.reglages.cible_h if plan.reglages.mode == "objectif" else plan.prediction.central_h
    if course is None or not temps:
        return vue
    try:
        race = base_du_plan(Course.from_dict(course), plan)
    except ValueError:
        return vue
    arrets = arrets_de_la_politique(race, temps, mesure["taux"])
    vue["total_min"] = round(sum(arrets.values())) if arrets else None
    vue["par_ravitaillement"] = [{"index": i, "nom": race.aid_names[i], "arret_min": m}
                                 for i, m in sorted(arrets.items())]
    return vue


def vue_du_plan(request: Request, plan: Plan) -> dict:
    """Tout ce que l'écran Plan montre, en un appel (§5.4)."""
    magasin: Magasin = request.app.state.magasin
    cfg = request.app.state.cfg
    brut = plan.to_dict()
    course = course_du_plan(magasin, plan)
    athlete = magasin.athletes.lire(plan.athlete_id) if plan.athlete_id else None
    brut["statut"] = statut_lu(brut, course)
    publiee = plan.version_publiee
    return {
        "plan": brut,
        "athlete": None if athlete is None else {
            k: athlete.get(k) for k in ("id", "pseudo", "prenom", "email", "niveau", "jumeau",
                                        "ingestion")
        },
        "course": None if course is None else {
            k: course.get(k) for k in ("id", "nom", "edition", "depart_le", "statut",
                                       "ravitaillements", "geometrie")
        },
        "version": lire_une_version(magasin, plan.ref, plan.version) if plan.version else None,
        "versions": lister_les_versions(magasin, plan.ref),
        "documents": documents_presents(repertoire_de_version(magasin, plan.ref, plan.version))
        if plan.version else [],
        "liens": liens_du_plan(request, plan.ref) if publiee else {},
        "fige": est_parti(brut, course),
        "arrets_mesures": _arrets_mesures(magasin, cfg, plan, course),
        "jobs": [request.app.state.store.rendre_public(j)
                 for j in request.app.state.store.en_attente(plan_ref=plan.ref)],
        "demandes": [d for d in magasin.demandes.lister() if d.get("plan_ref") == plan.ref],
    }


# --------------------------------------------------------------------------- #
# Les jobs d'un plan
# --------------------------------------------------------------------------- #
def lancer_une_generation(request: Request, fond: BackgroundTasks, plan: Plan) -> str:
    store = request.app.state.store
    deja = store.en_attente(plan_ref=plan.ref, type=JOB_GENERATION)
    if deja:
        raise HTTPException(status_code=409, detail={
            "message": "une génération de ce plan est déjà en file", "job_id": deja[0]["id"]})
    job_id = uuid4().hex
    store.creer(job_id, type=JOB_GENERATION, plan_ref=plan.ref, athlete_id=plan.athlete_id)
    fond.add_task(run_generation, job_id=job_id, store=store,
                  magasin=request.app.state.magasin, cfg=request.app.state.cfg, ref=plan.ref)
    return job_id


def lancer_un_amendement(request: Request, fond: BackgroundTasks, plan: Plan,
                         numero: int | None = None) -> str:
    """Un amendement pas encore commencé relira les amendements au moment de tourner :
    en poser un second derrière lui referait deux fois les mêmes documents."""
    store = request.app.state.store
    for job in store.en_attente(plan_ref=plan.ref, type=JOB_AMENDEMENT):
        if job.get("statut") == JOB_EN_FILE and job.get("numero") == numero:
            return job["id"]
    job_id = uuid4().hex
    store.creer(job_id, type=JOB_AMENDEMENT, plan_ref=plan.ref, athlete_id=plan.athlete_id,
                numero=numero)
    fond.add_task(run_amendement, job_id=job_id, store=store,
                  magasin=request.app.state.magasin, cfg=request.app.state.cfg, ref=plan.ref,
                  numero=numero)
    return job_id


# --------------------------------------------------------------------------- #
# Les routes
# --------------------------------------------------------------------------- #
def ajouter_les_routes_de_plan(routeur: APIRouter) -> None:
    """Pose les routes Plan, Demandes et Jobs sur le routeur d'administration — qui porte
    déjà la serrure : aucune d'elles n'existe sans le jeton."""

    @routeur.post("/plans")
    def creer_un_plan(charge: dict, request: Request, fond: BackgroundTasks) -> dict:
        """Crée le plan et lance sa version 1 (§5.4)."""
        magasin: Magasin = request.app.state.magasin
        athlete = magasin.athletes.lire(str(charge.get("athlete_id") or ""))
        if athlete is None:
            raise HTTPException(status_code=404, detail="athlète inconnu")
        brut_course = magasin.courses.lire(str(charge.get("course_id") or ""))
        if brut_course is None:
            raise HTTPException(status_code=404, detail="course inconnue")
        course = Course.from_dict(brut_course)
        if (athlete.get("ingestion") or {}).get("statut") != INGESTION_INGERE:
            raise HTTPException(status_code=409,
                                detail="l'archive de cet athlète n'est pas encore ingérée")
        if not (magasin.courses.repertoire(course.id) / "trace.gpx").exists():
            raise HTTPException(status_code=409,
                                detail="la course n'a pas de trace : pose le GPX d'abord")
        try:
            reglages = lire_les_reglages(charge.get("reglages"), course)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        ref = reference_de_plan(athlete_id=athlete["id"],
                                pseudo=athlete.get("pseudo") or athlete.get("prenom") or "",
                                course_id=course.id, course_nom=course.nom,
                                edition=course.edition)
        if magasin.plans.existe(ref):
            # Même athlète, même course, même édition : c'est le même plan. On ne le double
            # pas — on dit où il est.
            raise HTTPException(status_code=409, detail={
                "message": "cet athlète a déjà un plan sur cette course", "ref": ref})

        plan = Plan(ref=ref, athlete_id=athlete["id"], course_id=course.id,
                    statut=PLAN_A_COMPOSER, reglages=reglages, depart_le=course.depart_le)
        magasin.plans.ecrire(plan.to_dict())
        magasin.athletes.modifier(athlete["id"],
                                  plans=[*(athlete.get("plans") or []), ref])
        return {"ref": ref, "job_id": lancer_une_generation(request, fond, plan)}

    @routeur.get("/plans")
    def lister_les_plans(request: Request) -> dict:
        magasin: Magasin = request.app.state.magasin
        courses = {c["id"]: c for c in magasin.courses.lister()}
        plans = []
        for brut in magasin.plans.lister():
            course = courses.get(brut.get("course_id"))
            plans.append({**brut, "statut": statut_lu(brut, course),
                          "course_nom": (course or {}).get("nom") or ""})
        return {"plans": sorted(plans, key=lambda p: p.get("depart_le") or "9999")}

    @routeur.get("/plans/{ref}")
    def lire_un_plan(ref: str, request: Request) -> dict:
        return vue_du_plan(request, plan_ou_404(request, ref))

    @routeur.post("/plans/{ref}/generate")
    def generer(ref: str, request: Request, fond: BackgroundTasks,
                charge: dict | None = None) -> dict:
        """Une version de plus, avec les réglages envoyés (§5.4)."""
        magasin: Magasin = request.app.state.magasin
        plan = plan_ou_404(request, ref)
        if not plan.course_id:
            raise HTTPException(
                status_code=409,
                detail="ce plan vient du CLI sans course en bibliothèque : refais-le au CLI "
                       "et réimporte-le",
            )
        brut_course = course_du_plan(magasin, plan)
        if brut_course is None:
            raise HTTPException(status_code=409, detail="la course de ce plan n'existe plus")
        if charge and "reglages" in charge:
            try:
                plan.reglages = lire_les_reglages(charge["reglages"],
                                                  Course.from_dict(brut_course))
            except (ValueError, TypeError) as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            magasin.plans.modifier(ref, reglages=plan.to_dict()["reglages"])
        return {"job_id": lancer_une_generation(request, fond, plan)}

    @routeur.post("/plans/{ref}/publish")
    def publier(ref: str, request: Request, fond: BackgroundTasks) -> dict:
        """Les deux clés sont posées, la page répond. Rien ne part (§5.4).

        Si l'athlète a amendé depuis que cette version a été faite, ses amendements y
        sont reposés : publier une version ne doit pas lui retirer ce qu'il a changé."""
        magasin: Magasin = request.app.state.magasin
        serrures = request.app.state.serrures
        plan = plan_ou_404(request, ref)
        if not plan.version:
            raise HTTPException(status_code=409, detail="aucune version à publier")
        if not serrures.cles_servies:
            raise HTTPException(
                status_code=503,
                detail="TWIN_KEYS_SECRET manquant : aucune clé ne peut être posée")
        if not (repertoire_de_version(magasin, ref, plan.version) / "annexe.json").exists():
            raise HTTPException(
                status_code=409,
                detail="cette version n'a pas d'annexe : la page n'aurait rien à montrer")

        plan.cles = Cles(**serrures.les_deux_cles(ref))
        plan.version_publiee = plan.version
        plan.publie_le = maintenant()
        if not a_un_resultat(plan.to_dict()):
            plan.statut = statut_publie(plan.to_dict())
        magasin.plans.ecrire(plan.to_dict())

        job_id = None
        faite_avec = (lire_une_version(magasin, ref, plan.version) or {}).get("amendements")
        if faite_avec is not None and faite_avec != plan.to_dict()["amendements"]:
            job_id = lancer_un_amendement(request, fond, plan, plan.version)
        return {"liens": liens_du_plan(request, ref), "version_publiee": plan.version,
                "job_id": job_id}

    @routeur.post("/plans/{ref}/send")
    def envoyer(ref: str, charge: dict, request: Request) -> dict:
        """Un email à l'athlète, le PDF joint, ``{lien}`` remplacé par le lien privé.
        Refusé si le plan n'est pas publié (§5.4)."""
        magasin: Magasin = request.app.state.magasin
        plan = plan_ou_404(request, ref)
        if not plan.version_publiee:
            raise HTTPException(status_code=409, detail="publie le plan avant de l'envoyer")
        athlete = magasin.athletes.lire(plan.athlete_id) if plan.athlete_id else None
        if athlete is None or not athlete.get("email"):
            raise HTTPException(status_code=409, detail="cet athlète n'a pas d'adresse email")
        objet = str(charge.get("objet") or "").strip()
        corps = str(charge.get("corps") or "")
        if not objet or not corps.strip():
            raise HTTPException(status_code=422, detail="l'objet et le corps sont requis")
        if "{lien}" not in corps:
            raise HTTPException(status_code=422,
                                detail="le corps doit contenir {lien} : sans lui, l'athlète "
                                       "n'a pas de quoi ouvrir sa page")
        liens = liens_du_plan(request, ref)
        pdf = repertoire_de_version(magasin, ref, plan.version_publiee) / "plan.pdf"
        if not pdf.exists():
            raise HTTPException(status_code=409, detail="la version publiée n'a pas de PDF")
        try:
            request.app.state.courrier.envoyer(
                a=destinataire(athlete), objet=objet,
                corps=corps.replace("{lien}", liens.get(USAGE_PRIVE, ""))
                           .replace("{lien_partage}", liens.get(USAGE_PARTAGE, "")),
                pieces=(piece_pdf(pdf, f"{ref}.pdf"),),
            )
        except CourrierIndisponible as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        plan.envoye_le = maintenant()
        if not a_un_resultat(plan.to_dict()):
            plan.statut = statut_publie(plan.to_dict())
        magasin.plans.ecrire(plan.to_dict())
        return {"envoye_le": plan.envoye_le, "a": athlete.get("email")}

    @routeur.post("/plans/{ref}/restore/{numero}")
    def restaurer(ref: str, numero: int, request: Request) -> dict:
        """La version choisie redevient courante, ses documents et ses réglages avec (§5.4).

        La page de l'athlète ne bouge pas : elle suit la version PUBLIÉE."""
        magasin: Magasin = request.app.state.magasin
        plan = plan_ou_404(request, ref)
        resume = lire_une_version(magasin, ref, numero)
        if resume is None:
            raise HTTPException(status_code=404, detail="version inconnue")
        plan.version = int(numero)
        plan.prediction = Prediction(**{k: v for k, v in (resume.get("prediction") or {}).items()
                                        if k in Prediction.__dataclass_fields__})
        plan.documents = Documents(**{k: v for k, v in (resume.get("documents") or {}).items()
                                      if k in Documents.__dataclass_fields__})
        if resume.get("reglages") is not None:
            plan.reglages = Plan.from_dict({"ref": ref, "reglages": resume["reglages"]}).reglages
        if not a_un_resultat(plan.to_dict()):
            plan.statut = statut_apres_changement(plan.to_dict())
        magasin.plans.ecrire(plan.to_dict())
        return vue_du_plan(request, plan)

    @routeur.put("/plans/{ref}/result")
    def saisir_le_resultat(ref: str, charge: dict, request: Request) -> dict:
        """Le temps officiel, ou l'abandon — l'entrée de registre se crée (§5.4, §6.3)."""
        magasin: Magasin = request.app.state.magasin
        plan = plan_ou_404(request, ref)
        try:
            plan.resultat = lire_le_resultat(charge, saisi_par="labo")
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if a_un_resultat(plan.to_dict()):
            plan.statut = PLAN_RESULTAT
        elif plan.statut == PLAN_RESULTAT:
            plan.statut = statut_apres_changement(plan.to_dict())
        magasin.plans.ecrire(plan.to_dict())
        return plan.to_dict()

    @routeur.get("/plans/{ref}/{nom}")
    def telecharger(ref: str, nom: str, request: Request, version: int | None = None):
        """Les fichiers de la version courante — ou d'une autre, ``?version=n`` (§5.4)."""
        magasin: Magasin = request.app.state.magasin
        plan = plan_ou_404(request, ref)
        numero = version or plan.version
        if not numero:
            raise HTTPException(status_code=404, detail="aucune version")
        return servir_un_fichier(repertoire_de_version(magasin, ref, numero), nom, ref, numero)

    @routeur.delete("/plans/{ref}", status_code=204)
    def supprimer_un_plan(ref: str, request: Request) -> None:
        """Le plan, ses versions et sa page. Ses demandes partent avec lui."""
        magasin: Magasin = request.app.state.magasin
        plan = plan_ou_404(request, ref)
        if request.app.state.store.en_attente(plan_ref=ref):
            raise HTTPException(status_code=409,
                                detail="un travail tourne sur ce plan : attends qu'il finisse")
        for demande in magasin.demandes.lister():
            if demande.get("plan_ref") == ref:
                magasin.demandes.supprimer(demande["id"])
        if plan.athlete_id:
            athlete = magasin.athletes.lire(plan.athlete_id)
            if athlete is not None:
                magasin.athletes.modifier(
                    plan.athlete_id, plans=[r for r in athlete.get("plans") or [] if r != ref])
        magasin.plans.supprimer(ref)

    # --- Demandes (§5.5) ------------------------------------------------------ #
    @routeur.get("/requests")
    def lister_les_demandes(request: Request) -> dict:
        magasin: Magasin = request.app.state.magasin
        demandes = []
        for d in magasin.demandes.lister():
            plan = magasin.plans.lire(d.get("plan_ref") or "") or {}
            athlete = magasin.athletes.lire(plan.get("athlete_id") or "") or {}
            course = course_du_plan(magasin, plan) or {}
            demandes.append({**d, "athlete": athlete.get("pseudo") or athlete.get("prenom") or "",
                             "course": course.get("nom") or ""})
        # Les ouvertes d'abord, puis la plus récente en tête.
        demandes.sort(key=lambda d: d.get("recue_le") or "", reverse=True)
        demandes.sort(key=lambda d: d.get("statut") != DEMANDE_OUVERTE)
        return {"demandes": demandes}

    @routeur.post("/requests/{demande_id}/answer")
    def repondre(demande_id: str, charge: dict, request: Request) -> dict:
        """La réponse part par email ; la demande est marquée répondue (§5.5)."""
        magasin: Magasin = request.app.state.magasin
        demande = magasin.demandes.lire(demande_id) if REF_SURE.fullmatch(demande_id) else None
        if demande is None:
            raise HTTPException(status_code=404, detail="demande inconnue")
        reponse = str(charge.get("reponse") or "").strip()
        if not reponse:
            raise HTTPException(status_code=422, detail="la réponse est vide")
        plan = magasin.plans.lire(demande.get("plan_ref") or "")
        athlete = magasin.athletes.lire((plan or {}).get("athlete_id") or "")
        if athlete is None or not athlete.get("email"):
            raise HTTPException(status_code=409, detail="cet athlète n'a pas d'adresse email")
        course = course_du_plan(magasin, plan) or {}
        lien = liens_du_plan(request, plan["ref"]).get(USAGE_PRIVE, "")
        corps = "\n".join([
            reponse, "", "—", f"Ta demande : {demande.get('quoi') or ''}",
            *([f"Ta page : {lien}"] if lien else []),
        ])
        try:
            request.app.state.courrier.envoyer(
                a=destinataire(athlete),
                objet=f"Ta demande sur ton plan {course.get('nom') or plan['ref']}",
                corps=corps,
            )
        except CourrierIndisponible as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return magasin.demandes.modifier(demande_id, statut=DEMANDE_REPONDUE, reponse=reponse,
                                         repondue_le=maintenant())

    # --- Registre (§5.6) --------------------------------------------------------- #
    @routeur.get("/registre")
    def lire_le_registre(request: Request) -> dict:
        """Calculé depuis les plans qui ont un résultat, par niveau servi."""
        from . import registre

        return registre.calculer(request.app.state.magasin, request.app.state.cfg)

    @routeur.get("/registre/export")
    def exporter_le_registre(request: Request) -> dict:
        """Les entrées au format de ``docs/twin-registre-couverture.json``, à y fusionner."""
        from . import registre

        return registre.exporter(request.app.state.magasin, request.app.state.cfg)

    # --- Jobs (§5.7) ------------------------------------------------------------ #
    @routeur.get("/jobs/{job_id}")
    def lire_un_job(job_id: str, request: Request) -> dict:
        """L'état d'un passage, derrière le jeton : les jobs ne sortent pas autrement."""
        vu = request.app.state.store.public(job_id) if REF_SURE.fullmatch(job_id) else None
        if vu is None:
            raise HTTPException(status_code=404, detail="job inconnu")
        return vu


def lire_lannexe(magasin: Magasin, ref: str, numero: int) -> dict | None:
    brut = lire_json(repertoire_de_version(magasin, ref, numero) / "annexe.json")
    return brut if isinstance(brut, dict) else None


__all__ = ["FICHIERS", "REF_SURE", "ajouter_les_routes_de_plan", "course_du_plan",
           "documents_presents", "lancer_un_amendement", "lancer_une_generation",
           "lire_la_nutrition", "lire_lannexe", "lire_le_resultat", "lire_les_reglages",
           "nombre_borne", "plan_ou_404", "repertoire_de_version", "servir_un_fichier",
           "vue_du_plan"]
