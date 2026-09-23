"""Une version de plus : la génération depuis le jumeau gardé, l'amendement, le PDF unique.

Deux étages. Le premier, rapide, garde les règles : qui a le dernier mot sur un arrêt,
ce que devient un amendement retiré, comment le taux mesuré se répartit. Le second rend
de vrais PDF et porte le **golden du chantier** : le même plan, fabriqué par le CLI
depuis l'archive et par le tableau de bord depuis le jumeau gardé, donne un dossier
identique et des pages de rapport identiques.
"""

from __future__ import annotations

import json
import shutil
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from twin_engine import dossier as dossier_mod
from twin_engine.config import load_config
from twin_engine.course import RaceSpec
from twin_engine.course.spec import Reglage
from twin_engine.tableau_de_bord import generation as G
from twin_engine.tableau_de_bord import objets as O
from twin_engine.tableau_de_bord.magasin import Magasin
from twin_engine.tableau_de_bord.traduction import racespec_en_json, racespec_vers_course

CFG = load_config()
ICI = Path(__file__).parent
FIX = ICI / "fixtures"
NICE = ICI.parents[0] / "examples" / "nice-100m.json"
TRACE_NICE = ICI.parents[2] / "apps" / "site" / "public" / "tracks" / "nice-100m-2026.gpx"
HAS_TEX = shutil.which("xelatex") is not None and shutil.which("biber") is not None
pdf_requis = pytest.mark.skipif(not HAS_TEX, reason="XeLaTeX et biber requis pour rendre")


def _course_nice(**over) -> O.Course:
    course = racespec_vers_course(RaceSpec.from_json(NICE), id="nice")
    for cle, valeur in over.items():
        setattr(course, cle, valeur)
    return course


def _plan(**reglages) -> O.Plan:
    return O.Plan(ref="LL-TEST", athlete_id="a", course_id="nice",
                  reglages=O.Reglages(**reglages))


def _arrets(race: RaceSpec) -> dict[int, float | None]:
    return {r.aid_index: r.stop_min for r in race.reglages}


# --------------------------------------------------------------------------- #
# Le carnet de route d'un plan
# --------------------------------------------------------------------------- #
def test_un_plan_sans_reglage_redonne_la_course_telle_quelle():
    course = _course_nice()
    race = G.racespec_du_plan(course, _plan())
    assert race == RaceSpec.from_json(NICE)


def test_la_cible_ne_vaut_quen_mode_objectif():
    course = _course_nice()
    assert G.racespec_du_plan(course, _plan(cible_h=30.0)).target_hours is None
    assert G.racespec_du_plan(course, _plan(mode="objectif", cible_h=30.0)).target_hours == 30.0


def test_les_notes_vont_aux_points_dassistance_de_la_course_et_nulle_part_ailleurs():
    course = _course_nice()
    isola = course.ravitaillements[4]
    assert isola.nom == "Isola" and isola.assistance
    plan = _plan(assistance=[O.AssistanceReglage(index=4, note="bidons + frontale"),
                             O.AssistanceReglage(index=2, note="personne ici")])
    race = G.racespec_du_plan(course, plan)
    notes = {c.aid_index: c.note for c in race.crew}
    assert notes[4] == "bidons + frontale"
    assert 2 not in notes, "une note ne crée pas un point d'assistance"


def test_un_arret_impose_par_la_course_passe_devant_la_politique():
    course = _course_nice()
    course.ravitaillements[4].arret_min = 20.0
    race = G.racespec_du_plan(course, _plan(), arrets_politique={4: 8.0, 5: 3.0})
    assert _arrets(race) == {4: 20.0, 5: 3.0}


def test_lathlete_a_le_dernier_mot_sur_ses_arrets_ses_notes_et_ses_debits():
    course = _course_nice()
    course.ravitaillements[4].arret_min = 20.0
    plan = _plan(nutrition=O.NutritionReglage(eau_l_h=0.5, glucides_g_h=60))
    plan.amendements = O.Amendements(arrets={"4": 12, "6": 7}, notes={"6": "soupe"},
                                     nutrition=O.NutritionReglage(eau_l_h=0.7))
    race = G.racespec_du_plan(course, plan)
    assert _arrets(race) == {4: 12.0, 6: 7.0}
    assert {c.aid_index: c.note for c in race.crew}[6] == "soupe"
    assert race.nutrition.water_l_per_h == 0.7
    # des débits déclarés remplacent ceux du plan d'un bloc : pas de mélange des deux
    assert race.nutrition.carbs_g_per_h is None


def test_un_amendement_retire_rend_la_valeur_du_plan():
    """C'est pour ça que la base se garde à part : un arrêt allongé puis remis à zéro
    doit revenir à la valeur du plan, pas rester allongé."""
    course = _course_nice()
    base = G.base_du_plan(course, _plan(), arrets_politique={4: 8.0})
    amende = G.appliquer_les_amendements(base, O.Amendements(arrets={"4": 25}))
    assert _arrets(amende)[4] == 25.0
    relu = dossier_mod.appliquer(amende, json.loads(json.dumps(G.fragment_de(base))))
    assert _arrets(G.appliquer_les_amendements(relu, O.Amendements()))[4] == 8.0


def test_une_consigne_survit_a_lamendement_de_son_arret():
    course = _course_nice()
    base = G.base_du_plan(course, _plan())
    base = replace(base, reglages=(Reglage(aid_index=4, stop_min=None,
                                           consigne="marcher la montée"),))
    amende = G.appliquer_les_amendements(base, O.Amendements(arrets={"4": 9}))
    assert amende.reglages == (Reglage(aid_index=4, stop_min=9.0, consigne="marcher la montée"),)


def test_le_fragment_se_relit_par_le_dossier_a_lidentique():
    course = _course_nice()
    plan = _plan(nutrition=O.NutritionReglage(eau_l_h=0.6, glucides_g_h=70),
                 assistance=[O.AssistanceReglage(index=6, note="chaussettes")])
    plan.amendements = O.Amendements(arrets={"7": 4})
    race = G.racespec_du_plan(course, plan, arrets_politique={4: 12.0})
    relu = dossier_mod.appliquer(RaceSpec.from_json(NICE), G.fragment_de(race))
    assert (relu.reglages, relu.crew, relu.nutrition) == (race.reglages, race.crew,
                                                          race.nutrition)


# --------------------------------------------------------------------------- #
# La politique « mesurée »
# --------------------------------------------------------------------------- #
def test_le_taux_mesure_se_repartit_trois_parts_aux_bases_une_ailleurs():
    race = RaceSpec.from_json(NICE)
    arrets = G.arrets_de_la_politique(race, 30.0, 0.05)
    total = 30.0 * 0.05 / 1.05 * 60.0
    assert sum(arrets.values()) == pytest.approx(total, abs=len(arrets) / 2)
    assert 0 not in arrets and len(race.aid_km) - 1 not in arrets, "ni départ ni arrivée"
    noms = race.aid_names
    bases = {noms[i]: m for i, m in arrets.items() if noms[i] in ("Isola", "Venanson", "Levens")}
    ailleurs = [m for i, m in arrets.items() if noms[i] not in bases]
    assert len(bases) == 3
    assert min(bases.values()) >= 2.5 * max(ailleurs)


@pytest.mark.parametrize("temps,taux", [(None, 0.05), (30.0, None), (30.0, 0.0)])
def test_sans_temps_ou_sans_taux_la_politique_du_moteur_reste(temps, taux):
    assert G.arrets_de_la_politique(RaceSpec.from_json(NICE), temps, taux) == {}


# --------------------------------------------------------------------------- #
# Le PDF unique et les numéros de version
# --------------------------------------------------------------------------- #
def _pdf(chemin: Path, pages: int, largeur: float) -> Path:
    from pypdf import PdfWriter

    ecrivain = PdfWriter()
    for _ in range(pages):
        ecrivain.add_blank_page(width=largeur, height=842)
    with open(chemin, "wb") as f:
        ecrivain.write(f)
    return chemin


def test_le_pdf_unique_met_les_pages_bout_a_bout_sans_les_toucher(tmp_path):
    from pypdf import PdfReader

    rapport = _pdf(tmp_path / "rapport.pdf", 5, 595)
    feuille = _pdf(tmp_path / "feuille.pdf", 1, 500)
    fiches = _pdf(tmp_path / "fiches.pdf", 2, 400)
    G.assembler_le_pdf([rapport, feuille, fiches], tmp_path / "plan.pdf")
    largeurs = [float(p.mediabox.width) for p in PdfReader(tmp_path / "plan.pdf").pages]
    assert largeurs == [595] * 5 + [500] + [400] * 2


def test_un_document_absent_ne_bloque_pas_lassemblage(tmp_path):
    from pypdf import PdfReader

    rapport = _pdf(tmp_path / "rapport.pdf", 5, 595)
    G.assembler_le_pdf([rapport, tmp_path / "feuille.pdf", tmp_path / "fiches.pdf"],
                       tmp_path / "plan.pdf")
    assert len(PdfReader(tmp_path / "plan.pdf").pages) == 5


def test_sans_rapport_pas_de_version(tmp_path):
    _pdf(tmp_path / "feuille.pdf", 1, 500)
    with pytest.raises(G.GenerationImpossible):
        G.ranger_une_version(tmp_path, tmp_path / "v1")


def test_apres_une_restauration_la_version_suivante_necrase_rien(tmp_path):
    magasin = Magasin(tmp_path)
    magasin.plans.ecrire(O.Plan(ref="LL-X", version=1).to_dict())
    for n in (1, 2, 3):
        (magasin.plans.repertoire("LL-X") / f"v{n}").mkdir(parents=True)
    (magasin.plans.repertoire("LL-X") / ".rendu-abc").mkdir()
    assert G.prochain_numero(magasin, "LL-X") == 4


# --------------------------------------------------------------------------- #
# Le golden : le même plan au CLI et au tableau de bord
# --------------------------------------------------------------------------- #
REF = "LL-NICE26-VAL-GOLD"
EDITE_LE = datetime(2026, 9, 20, 10, 0)
ANALYSE_LE = date(2026, 9, 20)
SECRET = "secret-de-cles-du-golden"


def _contenus(chemin: Path) -> list[bytes]:
    from pypdf import PdfReader

    return [page.get_contents().get_data() for page in PdfReader(chemin).pages]


def _textes(chemin: Path) -> list[str]:
    from pypdf import PdfReader

    return [page.extract_text() for page in PdfReader(chemin).pages]


@pytest.fixture(scope="module")
def deux_chemins(tmp_path_factory):
    """Le même athlète, la même course : une fois au CLI, une fois au tableau de bord."""
    from twin_engine.pipeline import run_full
    from twin_engine.tableau_de_bord.ingestion import ingerer_un_athlete

    racine = tmp_path_factory.mktemp("golden")
    patch = pytest.MonkeyPatch()
    patch.setenv("TWIN_KEYS_SECRET", SECRET)
    try:
        # --- le tableau de bord : ingestion, puis génération depuis le jumeau gardé
        magasin = Magasin(racine / "data")
        magasin.athletes.ecrire(O.Athlete(id="val", pseudo="Val").to_dict())
        archive = racine / "depot" / "garmin.zip"
        archive.parent.mkdir()
        shutil.copy(FIX / "garmin_export_fixture.zip", archive)
        ingerer_un_athlete(athlete_id="val", magasin=magasin, cfg=CFG, archive_locale=archive)

        course = _course_nice()
        magasin.courses.ecrire(course.to_dict())
        magasin.courses.repertoire("nice").mkdir(parents=True, exist_ok=True)
        (magasin.courses.repertoire("nice") / "trace.gpx").write_bytes(TRACE_NICE.read_bytes())
        plan = O.Plan(ref=REF, athlete_id="val", course_id="nice")
        magasin.plans.ecrire(plan.to_dict())

        etapes: list[str] = []
        G.generer_une_version(ref=REF, magasin=magasin, cfg=CFG, report_date=EDITE_LE,
                              analysis_date=ANALYSE_LE, etape=etapes.append)

        # --- le CLI : l'archive, la trace, et le carnet de route que le tableau de bord
        # a envoyé au moteur, écrit en JSON puis relu comme le CLI relit un fichier
        spec = RaceSpec.from_dict(json.loads(json.dumps(
            racespec_en_json(G.racespec_du_plan(course, plan)))))
        cli = racine / "cli"
        copie = racine / "cli-archive" / "garmin.zip"
        copie.parent.mkdir()
        shutil.copy(FIX / "garmin_export_fixture.zip", copie)
        run_full(training_path=copie, course_gpx=TRACE_NICE.read_bytes(), race=spec, cfg=CFG,
                 out_dir=cli, athlete="Val", purge_source=True, render_pdf=True,
                 report_ref=REF, report_date=EDITE_LE, analysis_date=ANALYSE_LE)
        yield {"magasin": magasin, "v1": magasin.plans.repertoire(REF) / "v1", "cli": cli,
               "etapes": etapes}
    finally:
        patch.undo()


@pdf_requis
def test_golden_le_dossier_est_le_meme(deux_chemins):
    cli = json.loads((deux_chemins["cli"] / "dossier.json").read_text(encoding="utf-8"))
    tdb = json.loads((deux_chemins["v1"] / "dossier.json").read_text(encoding="utf-8"))
    assert tdb == cli


@pdf_requis
def test_golden_les_pages_du_rapport_sont_les_memes(deux_chemins):
    rapport = _contenus(deux_chemins["cli"] / "rapport.pdf")
    plan = _contenus(deux_chemins["v1"] / "plan.pdf")
    assert len(rapport) >= 5
    assert plan[: len(rapport)] == rapport
    assert _textes(deux_chemins["v1"] / "plan.pdf")[: len(rapport)] == \
        _textes(deux_chemins["cli"] / "rapport.pdf")


@pdf_requis
def test_golden_le_pdf_unique_est_rapport_feuille_fiches(deux_chemins):
    cli = deux_chemins["cli"]
    attendu = (_contenus(cli / "rapport.pdf") + _contenus(cli / "feuille.pdf")
               + _contenus(cli / "fiches.pdf"))
    assert _contenus(deux_chemins["v1"] / "plan.pdf") == attendu
    assert _contenus(deux_chemins["v1"] / "feuille.pdf") == _contenus(cli / "feuille.pdf")


@pdf_requis
def test_golden_les_livrables_sont_les_memes(deux_chemins):
    for nom in ("annexe.json", "plan.ics", "plan.gpx"):
        assert (deux_chemins["v1"] / nom).read_bytes() == (deux_chemins["cli"] / nom).read_bytes(), nom


@pdf_requis
def test_une_version_ne_garde_que_ce_quelle_sert(deux_chemins):
    v1 = deux_chemins["v1"]
    assert sorted(p.name for p in v1.iterdir()) == sorted(
        [*G.FICHIERS_DUNE_VERSION, "version.json"])
    assert not list(v1.parent.glob(".rendu-*")), "le répertoire de rendu est parti"


@pdf_requis
def test_la_version_se_resume_et_devient_courante(deux_chemins):
    magasin = deux_chemins["magasin"]
    plan = O.Plan.from_dict(magasin.plans.lire(REF))
    assert plan.version == 1 and plan.version_publiee == 0
    assert plan.statut == O.PLAN_GENERE
    assert plan.documents.pdf == "v1/plan.pdf" and plan.documents.feuille_pdf == "v1/feuille.pdf"
    assert plan.prediction.central_h and len(plan.prediction.fourchette) == 2
    resume = G.lire_une_version(magasin, REF, 1)
    assert resume["n"] == 1 and resume["origine"] == "generation"
    assert resume["base"]["crew"] and resume["prediction"] == json.loads(
        json.dumps(plan.to_dict()["prediction"]))


@pdf_requis
def test_lavancement_suit_les_etapes_sans_duree(deux_chemins):
    etapes = deux_chemins["etapes"]
    assert etapes[0] == "écriture des documents" and etapes[-1] == "assemblage du PDF"
    assert not any(ch.isdigit() for e in etapes for ch in e)


@pdf_requis
def test_le_qr_du_rapport_porte_la_cle_privee(deux_chemins):
    from twin_engine.cles import cle_du_plan

    cle = cle_du_plan(SECRET, REF, "prive")
    texte = "".join(_textes(deux_chemins["v1"] / "plan.pdf")).replace("\n", "")
    assert f"{REF}?k={cle}" in texte


@pdf_requis
def test_un_amendement_refait_la_version_et_se_retire(deux_chemins):
    """Même version, même dossier ; les documents suivent l'athlète — et reviennent au
    plan quand il retire son amendement."""
    magasin, v1 = deux_chemins["magasin"], deux_chemins["v1"]
    dossier_avant = (v1 / "dossier.json").read_bytes()
    stop_de = lambda: {r["aid_index"]: r["stop_min"] for r in json.loads(  # noqa: E731
        (v1 / "annexe.json").read_text(encoding="utf-8"))["plan"]["reglages"]}
    assert 4 not in stop_de()

    magasin.plans.modifier(REF, amendements={"arrets": {"4": 25}, "notes": {"4": "soupe"},
                                             "nutrition": {}})
    G.amender_la_version(ref=REF, magasin=magasin, cfg=CFG, numero=1)
    assert stop_de()[4] == 25
    annexe = json.loads((v1 / "annexe.json").read_text(encoding="utf-8"))
    assert {a["aid_index"]: a["note"] for a in annexe["plan"]["crew"]}[4] == "soupe"
    assert (v1 / "dossier.json").read_bytes() == dossier_avant
    assert G.lire_une_version(magasin, REF, 1)["amendements"]["arrets"] == {"4": 25}
    assert not list(v1.parent.glob(".amende-*"))

    magasin.plans.modifier(REF, amendements={"arrets": {}, "notes": {}, "nutrition": {}})
    G.amender_la_version(ref=REF, magasin=magasin, cfg=CFG, numero=1)
    assert 4 not in stop_de()


@pdf_requis
def test_la_fenetre_dobjectif_du_plan_est_servie_et_survit_a_lamendement(deux_chemins):
    """29 h – 31 h, c'est une cible de 30 h à ±3,33 % : la config n'en sait rien, le plan
    si — et chaque rendu de la version la reçoit, amendement compris."""
    magasin = deux_chemins["magasin"]
    central = json.loads((deux_chemins["v1"] / "version.json").read_text())["prediction"]
    ref = "LL-NICE26-VAL-FENETRE"
    fenetre = 100 / 30
    magasin.plans.ecrire(O.Plan(ref=ref, athlete_id="val", course_id="nice", reglages=O.Reglages(
        mode="objectif", cible_h=round(central["central_h"]), tolerance_pct=fenetre,
        politique_arrets=G.POLITIQUE_STANDARD)).to_dict())
    G.generer_une_version(ref=ref, magasin=magasin, cfg=CFG, report_date=EDITE_LE,
                          analysis_date=ANALYSE_LE)
    v1 = magasin.plans.repertoire(ref) / "v1"

    def servie():
        return json.loads((v1 / "annexe.json").read_text())["plan"]

    assert CFG.target.tolerance_pct != pytest.approx(fenetre)
    assert servie()["anchor"] == "target"
    assert servie()["window_tolerance_pct"] == pytest.approx(fenetre, abs=0.01)
    # l'arrivée tombe sur les deux bornes demandées, arrêts compris
    cible = round(central["central_h"])
    arrivee = servie()["segments"][-1]
    assert arrivee["lo_h"] == pytest.approx(cible * (1 - fenetre / 100), abs=0.02)
    assert arrivee["hi_h"] == pytest.approx(cible * (1 + fenetre / 100), abs=0.02)

    magasin.plans.modifier(ref, version_publiee=1, amendements={
        "arrets": {"4": 12}, "notes": {}, "nutrition": {"eau_l_h": None, "glucides_g_h": None}})
    G.amender_la_version(ref=ref, magasin=magasin, cfg=CFG)
    assert servie()["window_tolerance_pct"] == pytest.approx(fenetre, abs=0.01)


def test_un_plan_sans_trace_ne_se_genere_pas(tmp_path):
    magasin = Magasin(tmp_path)
    magasin.athletes.ecrire(O.Athlete(id="val").to_dict())
    magasin.courses.ecrire(_course_nice().to_dict())
    magasin.plans.ecrire(O.Plan(ref="LL-X", athlete_id="val", course_id="nice").to_dict())
    with pytest.raises(G.GenerationImpossible, match="trace"):
        G.generer_une_version(ref="LL-X", magasin=magasin, cfg=CFG)


def test_un_athlete_sans_jumeau_ne_se_genere_pas(tmp_path):
    from twin_engine.tableau_de_bord.jumeau import JumeauIllisible

    magasin = Magasin(tmp_path)
    magasin.athletes.ecrire(O.Athlete(id="val").to_dict())
    magasin.courses.ecrire(_course_nice().to_dict())
    magasin.courses.repertoire("nice").mkdir(parents=True, exist_ok=True)
    (magasin.courses.repertoire("nice") / "trace.gpx").write_bytes(b"<gpx/>")
    magasin.plans.ecrire(O.Plan(ref="LL-X", athlete_id="val", course_id="nice").to_dict())
    with pytest.raises(JumeauIllisible):
        G.generer_une_version(ref="LL-X", magasin=magasin, cfg=CFG)


def test_le_depart_de_nice_est_celui_du_carnet():
    """Garde-fou du golden : la course du tableau de bord part à l'heure de la spec."""
    spec = RaceSpec.from_json(NICE)
    assert spec.start_time == datetime(2026, 9, 25, 13, 0, tzinfo=timezone(timedelta(hours=2)))
    assert G.racespec_du_plan(_course_nice(), _plan()).start_time == spec.start_time
