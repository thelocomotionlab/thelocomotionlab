"""Une version de plus : du jumeau stocké aux documents, par le code du CLI.

L'archive a été lue une fois, à l'ingestion, puis supprimée. Une génération repart donc du
jumeau gardé et passe par :func:`twin_engine.pipeline.run_full_from_twin` — le même tronc
que ``run_full`` une fois le jumeau construit. Pas une copie : le même code. C'est ce qui
permet au golden de vérifier qu'un plan du tableau de bord et le même plan du CLI donnent
un dossier identique et des pages identiques.

Une version, sur le volume : ``plans/{ref}/v{n}/`` avec ``dossier.json``, ``plan.pdf``
(le rapport, puis la feuille, puis les fiches — un seul fichier, pages intactes),
``feuille.pdf`` à part, ``plan.ics``, ``plan.gpx``, l'``annexe.json`` que la page de
l'athlète lit, et ``version.json`` qui résume ce que la version porte.

Elle se construit dans un répertoire à part, puis prend sa place d'un seul geste : une
génération qui échoue en route ne laisse pas une version à moitié écrite.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from dataclasses import asdict, replace
from datetime import date, datetime
from pathlib import Path

import numpy as np

from ..config import Config
from ..course import build_course
from ..course.spec import CrewAccess, Nutrition, RaceSpec, Reglage
from ..pipeline import analyze_preview_from_twin, run_full_from_twin
from .jumeau import lire_la_calibration, lire_le_jumeau
from .magasin import Magasin, ecrire_json, lire_json
from .cycle import statut_apres_changement
from .objets import Course, Documents, Plan, maintenant
from .plan import resumer_la_prediction
from .traduction import course_vers_racespec

# Les deux politiques d'arrêts qu'un plan peut choisir.
POLITIQUE_STANDARD = "standard"   # celle du moteur : 5 min par ravito, +10 aux bases majeures
POLITIQUE_MESUREE = "mesuree"     # le taux d'arrêt mesuré de l'athlète, réparti sur la course
POLITIQUES = (POLITIQUE_STANDARD, POLITIQUE_MESUREE)

# Ce que la page, le tableau de bord et l'email servent d'une version — rien d'autre ne
# quitte le répertoire de rendu. Le rapport et les fiches seuls restent dedans : ils sont
# DANS plan.pdf, et un seul PDF par version est une décision du chantier.
FICHIERS_DUNE_VERSION = ("dossier.json", "plan.pdf", "feuille.pdf", "plan.ics", "plan.gpx",
                         "annexe.json")


class GenerationImpossible(RuntimeError):
    """Il manque de quoi générer : une trace, un jumeau, une course, un athlète."""


# --------------------------------------------------------------------------- #
# La course et les réglages du plan, en carnet de route pour le moteur
# --------------------------------------------------------------------------- #
def _nutrition_declaree(n) -> bool:
    return n.eau_l_h is not None or n.glucides_g_h is not None


def base_du_plan(course: Course, plan: Plan, *,
                 arrets_politique: dict[int, float] | None = None) -> RaceSpec:
    """La course et les réglages de Valentin — SANS les amendements de l'athlète.

    Deux sources, la plus personnelle en dernier :

    * la COURSE : ravitaillements, bases, points d'assistance, arrêts qu'elle impose ;
    * le PLAN : mode et cible, politique d'arrêts, notes d'assistance, nutrition.

    Gardée à part dans chaque version (``version.json``, clé ``base``) : c'est ce qui
    permet à l'athlète de RETIRER un amendement. Si la version ne gardait que le carnet
    amendé, un arrêt qu'il a allongé puis remis à zéro y resterait allongé."""
    base = course_vers_racespec(course)
    reglages = plan.reglages
    cible = reglages.cible_h if (reglages.mode == "objectif" and reglages.cible_h) else None
    nutrition = Nutrition(water_l_per_h=reglages.nutrition.eau_l_h,
                          carbs_g_per_h=reglages.nutrition.glucides_g_h)

    # Les POINTS d'assistance sont ceux de la course (le règlement) ; les NOTES, celles
    # que Valentin a posées sur le plan.
    notes = {int(a.index): a.note for a in reglages.assistance}
    crew = tuple(CrewAccess(aid_index=c.aid_index, note=notes.get(c.aid_index, c.note))
                 for c in base.crew)

    # La politique pose sa répartition ; les arrêts que la course impose passent devant.
    # Ce qui n'est déclaré nulle part reste à la politique du moteur (5 min, +10 aux bases).
    arrets: dict[int, float] = dict(arrets_politique or {})
    arrets.update({r.aid_index: r.stop_min for r in base.reglages if r.stop_min is not None})
    consignes = {r.aid_index: r.consigne for r in base.reglages if r.consigne}
    reglages_moteur = tuple(
        Reglage(aid_index=i, stop_min=arrets.get(i), consigne=consignes.get(i, ""))
        for i in sorted(set(arrets) | set(consignes))
    )
    return replace(base, target_hours=cible, nutrition=nutrition, crew=crew,
                   reglages=reglages_moteur)


def appliquer_les_amendements(race: RaceSpec, amendements) -> RaceSpec:
    """Le carnet de route, avec ce que l'athlète a changé depuis sa page.

    Ses arrêts remplacent ceux du plan au même ravitaillement (la consigne reste) ; ses
    notes remplacent celles des points d'assistance que la course déclare — une note sur
    un ravitaillement où l'assistance n'a pas accès n'a personne à qui parler ; ses
    débits, s'il en a déclaré, remplacent ceux du plan."""
    reglages = {r.aid_index: r for r in race.reglages}
    for cle, minutes in (amendements.arrets or {}).items():
        if minutes is None:
            continue
        i = int(cle)
        ancien = reglages.get(i)
        reglages[i] = Reglage(aid_index=i, stop_min=max(float(minutes), 0.0),
                              consigne=ancien.consigne if ancien else "")
    notes = {int(k): str(v) for k, v in (amendements.notes or {}).items()}
    crew = tuple(replace(c, note=notes.get(c.aid_index, c.note)) for c in race.crew)
    n = amendements.nutrition
    nutrition = (Nutrition(water_l_per_h=n.eau_l_h, carbs_g_per_h=n.glucides_g_h)
                 if _nutrition_declaree(n) else race.nutrition)
    return replace(race, reglages=tuple(reglages[i] for i in sorted(reglages)), crew=crew,
                   nutrition=nutrition)


def racespec_du_plan(course: Course, plan: Plan, *,
                     arrets_politique: dict[int, float] | None = None) -> RaceSpec:
    """Ce que le moteur reçoit pour ce plan : la base, puis les amendements de l'athlète."""
    return appliquer_les_amendements(
        base_du_plan(course, plan, arrets_politique=arrets_politique), plan.amendements
    )


def fragment_de(race: RaceSpec) -> dict:
    """Les trois champs amendables d'un carnet de route, dans la forme que
    ``dossier.appliquer`` relit — chacun ENTIER, comme il l'exige."""
    return {
        "reglages": [{"aid_index": r.aid_index,
                      **({"stop_min": r.stop_min} if r.stop_min is not None else {}),
                      **({"consigne": r.consigne} if r.consigne else {})}
                     for r in race.reglages],
        "crew": [{"aid_index": c.aid_index, "note": c.note} for c in race.crew],
        "nutrition": {"water_l_per_h": race.nutrition.water_l_per_h,
                      "carbs_g_per_h": race.nutrition.carbs_g_per_h},
    }


# --------------------------------------------------------------------------- #
# La politique d'arrêts « mesurée »
# --------------------------------------------------------------------------- #
def taux_darret(calibration, cfg: Config) -> dict:
    """Le taux d'arrêt MESURÉ de l'athlète : heures d'arrêt par heure de mouvement, sur
    ses vrais ultras, pondéré comme la calibration les pondère.

    Mesuré quel que soit le modèle d'arrêts que la prédiction sert : c'est une donnée de
    l'archive, que l'écran Plan montre à côté du choix de la politique."""
    from ..calibration import stops_statistics

    genuine = list(calibration.genuine)
    poids = calibration.weights
    if poids is None or len(poids) != len(genuine):
        poids = [1.0] * len(genuine)
    st = stops_statistics(genuine, np.asarray(poids, dtype=float), cfg)
    return {"taux": float(st["rate"]), "n": int(st["n"]), "origine": st["origin"]}


def arrets_de_la_politique(race: RaceSpec, temps_h: float | None,
                           taux: float | None) -> dict[int, float]:
    """Le taux mesuré, réparti sur les ravitaillements de CETTE course, en minutes.

    Le total est celui que l'athlète s'accorde d'habitude : sur un temps écoulé T, un taux
    r d'arrêt par heure de mouvement donne T·r/(1+r) d'arrêts. Il se répartit comme la
    politique du moteur le fait déjà : trois parts aux bases majeures, une ailleurs, rien
    au départ ni à l'arrivée."""
    if not temps_h or not taux or taux <= 0 or len(race.aid_km) < 3:
        return {}
    total_min = float(temps_h) * float(taux) / (1.0 + float(taux)) * 60.0
    bases = {k + 1 for k in race.major_base_indices}       # segment k → ravitaillement k+1
    poids = {i: (3.0 if i in bases else 1.0) for i in range(1, len(race.aid_km) - 1)}
    somme = sum(poids.values())
    return {i: float(round(total_min * p / somme)) for i, p in poids.items()}


# --------------------------------------------------------------------------- #
# Le PDF unique
# --------------------------------------------------------------------------- #
def assembler_le_pdf(sources: list[Path], cible: Path) -> Path:
    """Le rapport, puis la feuille, puis les fiches — dans un seul fichier.

    Les pages sont RECOPIÉES, pas refaites : chacune arrive dans ``plan.pdf`` telle que
    XeLaTeX l'a composée. C'est ce qui permet au golden de comparer les pages du rapport
    d'une version à celles du CLI."""
    from pypdf import PdfWriter
    from pypdf.errors import PyPdfError

    ecrivain = PdfWriter()
    for source in sources:
        if Path(source).exists():
            try:
                ecrivain.append(str(source))
            except (PyPdfError, ValueError, OSError) as exc:
                raise GenerationImpossible(f"{Path(source).name} illisible : {exc}") from exc
    if not ecrivain.pages:
        raise GenerationImpossible("aucun document à assembler")
    with open(cible, "wb") as sortie:
        ecrivain.write(sortie)
    return Path(cible)


def ranger_une_version(rendu: Path, destination: Path, rapport: Path | None = None) -> None:
    """Assemble le PDF unique dans le rendu, puis n'en garde que ce qu'une version sert.

    Le rapport est ``rapport.pdf`` du rendu (``pipeline.rendre_documents`` l'y copie) ;
    sans lui, pas de version : un PDF « unique » qui commencerait à la feuille mentirait
    sur ce qu'il contient."""
    rapport = Path(rapport) if rapport else rendu / "rapport.pdf"
    if not rapport.exists():
        raise GenerationImpossible("le rendu n'a pas produit de rapport")
    assembler_le_pdf([rapport, rendu / "feuille.pdf", rendu / "fiches.pdf"], rendu / "plan.pdf")
    destination.mkdir(parents=True, exist_ok=True)
    for nom in FICHIERS_DUNE_VERSION:
        if (rendu / nom).exists() and (rendu / nom) != (destination / nom):
            os.replace(rendu / nom, destination / nom)


# --------------------------------------------------------------------------- #
# Lire ce qu'il faut pour générer
# --------------------------------------------------------------------------- #
def _versions_sur_le_disque(magasin: Magasin, ref: str) -> list[int]:
    racine = magasin.plans.repertoire(ref)
    return sorted(int(p.name[1:]) for p in racine.glob("v*")
                  if p.is_dir() and p.name[1:].isdigit())


def prochain_numero(magasin: Magasin, ref: str) -> int:
    """Le numéro de la prochaine version : un de plus que la plus haute SUR LE DISQUE.

    Pas « la courante plus un » : après une restauration, la courante est une ancienne,
    et la suivante écraserait une version qui existe."""
    return max(_versions_sur_le_disque(magasin, ref), default=0) + 1


def _materiaux(magasin: Magasin, plan: Plan):
    athlete = magasin.athletes.lire(plan.athlete_id)
    if athlete is None:
        raise GenerationImpossible("l'athlète de ce plan n'existe plus")
    brut = magasin.courses.lire(plan.course_id)
    if brut is None:
        raise GenerationImpossible("la course de ce plan n'existe plus")
    course = Course.from_dict(brut)
    trace = magasin.courses.repertoire(plan.course_id) / "trace.gpx"
    if not trace.exists():
        raise GenerationImpossible("la course n'a pas de trace : pose le GPX dans l'éditeur")
    repertoire = magasin.athletes.repertoire(plan.athlete_id)
    return athlete, course, trace.read_bytes(), lire_le_jumeau(repertoire), \
        lire_la_calibration(repertoire)


def nom_affiche(athlete: dict) -> str:
    return athlete.get("pseudo") or athlete.get("prenom") or "athlète"


# --------------------------------------------------------------------------- #
# Générer une version
# --------------------------------------------------------------------------- #
def generer_une_version(*, ref: str, magasin: Magasin, cfg: Config,
                        report_date: datetime | None = None,
                        analysis_date: date | None = None, etape=None) -> dict:
    """Une version de plus pour ce plan, depuis ses réglages et amendements courants.

    Rend le plan mis à jour. La nouvelle version devient COURANTE ; la version publiée,
    elle, ne bouge pas — c'est « Publier » qui la fait voir à l'athlète."""
    from .. import dossier as _dossier

    brut = magasin.plans.lire(ref)
    if brut is None:
        raise GenerationImpossible(f"plan inconnu : {ref}")
    plan = Plan.from_dict(brut)
    athlete, course, gpx, twin, calibration = _materiaux(magasin, plan)

    arrets_politique = None
    if plan.reglages.politique_arrets == POLITIQUE_MESUREE:
        if etape:
            etape("calcul des arrêts")
        # La répartition dépend du temps prévu : une première prédiction le donne. Elle
        # est déterministe, la génération la retrouvera à l'identique.
        race0 = racespec_du_plan(course, plan)
        apercu = analyze_preview_from_twin(
            twin, build_course(gpx, race0, cfg), cfg,
            n_ingested=len(getattr(twin, "summaries", ()) or ()),
            analysis_date=analysis_date, target_hours=race0.target_hours, race=race0,
        )
        temps = race0.target_hours or (
            apercu.prediction.finish_hours if apercu.prediction else None)
        arrets_politique = arrets_de_la_politique(
            race0, temps, taux_darret(calibration, cfg)["taux"])
    base = base_du_plan(course, plan, arrets_politique=arrets_politique)
    race = appliquer_les_amendements(base, plan.amendements)

    racine = magasin.plans.repertoire(ref)
    racine.mkdir(parents=True, exist_ok=True)
    rendu = Path(tempfile.mkdtemp(dir=racine, prefix=".rendu-"))
    try:
        full = run_full_from_twin(
            twin=twin, course_gpx=gpx, race=race, cfg=cfg, out_dir=rendu,
            athlete=nom_affiche(athlete), report_ref=ref,
            report_date=report_date or datetime.now(), analysis_date=analysis_date,
            etape=etape,
        )
        if full.preview.prediction is None:
            raise GenerationImpossible(
                "le moteur ne rend pas de prédiction pour cet athlète sur cette course "
                "(archive insuffisante)"
            )
        if etape:
            etape("assemblage du PDF")
        ranger_une_version(rendu, rendu, full.pdf_path)
        # Le reste du rendu (figures, sources LaTeX, rapport et fiches seuls) : dehors,
        # AVANT que la version prenne sa place — une version visible est une version finie.
        for reste in rendu.iterdir():
            if reste.name not in FICHIERS_DUNE_VERSION:
                shutil.rmtree(reste) if reste.is_dir() else reste.unlink()

        numero = prochain_numero(magasin, ref)
        prediction = resumer_la_prediction(_dossier.lire(rendu / "dossier.json"))
        documents = documents_dune_version(rendu, numero)
        vu = plan.to_dict()
        ecrire_json(rendu / "version.json", {
            "n": numero,
            "cree_le": maintenant(),
            "origine": "generation",
            "reglages": vu["reglages"],
            "amendements": vu["amendements"],
            "base": fragment_de(base),
            "prediction": asdict(prediction),
            "documents": asdict(documents),
        })
        os.replace(rendu, racine / f"v{numero}")   # la version prend sa place d'un geste
    except BaseException:
        shutil.rmtree(rendu, ignore_errors=True)
        raise

    # Relire le plan : un amendement a pu arriver pendant le rendu, on ne l'écrase pas.
    courant = Plan.from_dict(magasin.plans.lire(ref) or plan.to_dict())
    courant.version = numero
    courant.prediction = prediction
    courant.documents = documents
    courant.depart_le = race.start_time.isoformat() if race.start_time else ""
    courant.statut = statut_apres_changement(courant.to_dict())
    return magasin.plans.ecrire(courant.to_dict())


def documents_dune_version(repertoire: Path, numero: int) -> Documents:
    """Les chemins des documents d'une version, relatifs au répertoire du plan."""
    def chemin(nom: str) -> str:
        return f"v{numero}/{nom}" if (repertoire / nom).exists() else ""

    return Documents(pdf=chemin("plan.pdf"), feuille_pdf=chemin("feuille.pdf"),
                     ics=chemin("plan.ics"), gpx=chemin("plan.gpx"))


# --------------------------------------------------------------------------- #
# Amender la version publiée
# --------------------------------------------------------------------------- #
def amender_la_version(*, ref: str, magasin: Magasin, cfg: Config, numero: int | None = None,
                       etape=None) -> dict:
    """Les documents d'une version — la PUBLIÉE par défaut — refaits avec les
    amendements courants de l'athlète.

    Même code que l'ancien ``/rendu`` : ``dossier.regenerer`` rejoue la chaîne depuis le
    dossier de la version, sans l'archive. Le jumeau, la calibration et la suffisance ne
    bougent pas ; la prédiction ne bouge que si la politique d'arrêts la touche. La version
    garde son numéro et sa date d'édition : c'est la même version, à jour de ses réglages.

    Les amendements se posent sur la BASE de la version (ce que Valentin a composé), pas
    sur son carnet déjà amendé : c'est ce qui laisse l'athlète revenir sur un choix."""
    from .. import dossier as _dossier

    brut = magasin.plans.lire(ref)
    if brut is None:
        raise GenerationImpossible(f"plan inconnu : {ref}")
    plan = Plan.from_dict(brut)
    numero = numero or plan.version_publiee or plan.version
    version = magasin.plans.repertoire(ref) / f"v{numero}"
    if not (version / "dossier.json").exists():
        raise GenerationImpossible("cette version n'a pas de dossier à rejouer")

    d = _dossier.lire(version / "dossier.json")
    resume = lire_json(version / "version.json") or {}
    # Une version importée du CLI n'a pas de base gardée : son carnet de route EST sa
    # base, aucun amendement de l'athlète n'y a encore été posé.
    base = _dossier.appliquer(d.race, resume["base"]) if resume.get("base") else d.race
    race = appliquer_les_amendements(base, plan.amendements)

    rendu = Path(tempfile.mkdtemp(dir=magasin.plans.repertoire(ref), prefix=".amende-"))
    try:
        if etape:
            etape("écriture des documents")
        livrables = _dossier.regenerer(d, fragment_de(race), cfg=cfg, out_dir=rendu)
        if etape:
            etape("assemblage du PDF")
        ranger_une_version(rendu, version, livrables.get("rapport.pdf"))
    finally:
        shutil.rmtree(rendu, ignore_errors=True)

    resume.setdefault("n", numero)
    resume["amendements"] = plan.to_dict()["amendements"]
    resume["amende_le"] = maintenant()
    resume["documents"] = asdict(documents_dune_version(version, numero))
    ecrire_json(version / "version.json", resume)
    return magasin.plans.lire(ref)


def lire_une_version(magasin: Magasin, ref: str, numero: int) -> dict | None:
    return lire_json(magasin.plans.repertoire(ref) / f"v{numero}" / "version.json")


def lister_les_versions(magasin: Magasin, ref: str) -> list[dict]:
    return [v for v in (lire_une_version(magasin, ref, n)
                        for n in _versions_sur_le_disque(magasin, ref)) if v]


__all__ = ["FICHIERS_DUNE_VERSION", "GenerationImpossible", "POLITIQUES",
           "POLITIQUE_MESUREE", "POLITIQUE_STANDARD", "amender_la_version",
           "appliquer_les_amendements", "arrets_de_la_politique", "assembler_le_pdf",
           "base_du_plan", "documents_dune_version", "fragment_de", "generer_une_version",
           "lire_une_version", "lister_les_versions", "nom_affiche", "prochain_numero",
           "racespec_du_plan", "ranger_une_version", "taux_darret"]
