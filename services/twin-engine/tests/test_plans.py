"""Le plan par ses routes : créer, générer, publier, envoyer, restaurer, saisir — et la
page de l'athlète derrière ses deux clés (récapitulatif §5.4, §5.5, §5.8).

Le cœur tourne sur un vrai plan de Nice, rendu une fois pour le module : l'archive de
test, la trace finale, le carnet de route de la course. Ce qui ne demande pas de PDF —
les serrures, les refus, la lecture des saisies — tourne sans.
"""

from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from twin_engine.config import load_config
from twin_engine.course import RaceSpec
from twin_engine.tableau_de_bord import objets as O
from twin_engine.tableau_de_bord.courrier import CourrierIndisponible
from twin_engine.tableau_de_bord.cycle import statut_lu
from twin_engine.tableau_de_bord.routes_athlete import lire_les_amendements
from twin_engine.tableau_de_bord.routes_plans import lire_le_resultat, lire_les_reglages
from twin_engine.tableau_de_bord.traduction import racespec_vers_course

sys.path.insert(0, str(Path(__file__).parent))
from test_ingestion import DEPOT, FauxDepot  # noqa: E402

ICI = Path(__file__).parent
NICE = ICI.parents[0] / "examples" / "nice-100m.json"
TRACE_NICE = ICI.parents[2] / "apps" / "site" / "public" / "tracks" / "nice-100m-2026.gpx"
HAS_TEX = shutil.which("xelatex") is not None and shutil.which("biber") is not None
pdf_requis = pytest.mark.skipif(not HAS_TEX, reason="XeLaTeX et biber requis pour rendre")

JETON = "jeton-des-plans-0123456789"
SECRET = "secret-des-cles-des-plans"
ADMIN = {"Authorization": f"Bearer {JETON}"}


class FauxCourrier:
    """Le relais SMTP, sans le relais : on garde ce qui serait parti."""

    def __init__(self, panne: bool = False):
        self.panne = panne
        self.envoyes: list[dict] = []

    @property
    def configure(self) -> bool:
        return True

    def envoyer(self, *, a, objet, corps, pieces=()):
        if self.panne:
            raise CourrierIndisponible("le relais SMTP a refusé : pour de faux")
        self.envoyes.append({"a": a, "objet": objet, "corps": corps,
                             "pieces": [(p.nom, len(p.contenu)) for p in pieces]})
        return "<id@test>"


def _application(racine: Path, patch: pytest.MonkeyPatch) -> TestClient:
    patch.setenv("DATA_DIR", str(racine / "data"))
    patch.setenv("TWIN_ADMIN_TOKEN", JETON)
    patch.setenv("TWIN_KEYS_SECRET", SECRET)
    patch.setenv("TWIN_INTERNAL_SECRET", "interne")
    from twin_engine.api import create_app

    app = create_app(load_config())
    # l'extension du nom déposé pilote la lecture : l'archive de test est un export Garmin
    app.state.depot = FauxDepot(depots=[{**DEPOT, "nomFichier": "export-garmin.zip"}],
                                archive=ICI / "fixtures" / "garmin_export_fixture.zip")
    app.state.courrier = FauxCourrier()
    return TestClient(app)


def _cle(ref: str, usage: str) -> str:
    from twin_engine.cles import cle_du_plan

    return cle_du_plan(SECRET, ref, usage)


@pytest.fixture
def client(tmp_path):
    patch = pytest.MonkeyPatch()
    try:
        yield _application(tmp_path, patch)
    finally:
        patch.undo()


def _athlete_ingere(client) -> str:
    r = client.post("/twin/internal/deposits", json={"secret": "interne", "depot_id": DEPOT["id"]})
    assert r.status_code == 200, r.text
    return r.json()["athlete_id"]


def _course_nice(client, *, trace: bool = True) -> str:
    spec = json.loads(NICE.read_text(encoding="utf-8"))
    r = client.post("/tableau-de-bord/courses", headers=ADMIN, json={"race_spec": spec})
    course_id = r.json()["id"]
    if trace:
        r = client.post(f"/tableau-de-bord/courses/{course_id}/gpx", headers=ADMIN,
                        files={"gpx": ("nice.gpx", TRACE_NICE.read_bytes(), "application/gpx+xml")})
        assert r.status_code == 200, r.text
    return course_id


# --------------------------------------------------------------------------- #
# Sans PDF : les serrures et les refus
# --------------------------------------------------------------------------- #
def test_les_routes_du_plan_sont_derriere_le_jeton(client):
    assert client.get("/tableau-de-bord/plans/LL-X").status_code == 401
    assert client.get("/tableau-de-bord/plans/LL-X", headers=ADMIN).status_code == 404
    assert client.get("/tableau-de-bord/requests").status_code == 401
    assert client.get("/tableau-de-bord/jobs/abc").status_code == 401


def test_un_plan_demande_une_archive_ingeree(client):
    client.app.state.magasin.athletes.ecrire(O.Athlete(
        id="val", pseudo="Val", ingestion=O.Ingestion(statut=O.INGESTION_RECU)).to_dict())
    course_id = _course_nice(client)
    r = client.post("/tableau-de-bord/plans", headers=ADMIN,
                    json={"athlete_id": "val", "course_id": course_id})
    assert r.status_code == 409 and "ingérée" in r.json()["detail"]


def test_un_plan_demande_une_trace(client):
    client.app.state.magasin.athletes.ecrire(O.Athlete(
        id="val", pseudo="Val", ingestion=O.Ingestion(statut=O.INGESTION_INGERE)).to_dict())
    course_id = _course_nice(client, trace=False)
    r = client.post("/tableau-de-bord/plans", headers=ADMIN,
                    json={"athlete_id": "val", "course_id": course_id})
    assert r.status_code == 409 and "trace" in r.json()["detail"]


@pytest.mark.parametrize("reglages,motif", [
    ({"mode": "course"}, "mode"),
    ({"mode": "objectif"}, "durée"),
    ({"mode": "objectif", "cible_h": "trente"}, "durée"),
    ({"politique_arrets": "au feeling"}, "politique"),
    ({"nutrition": {"eau_l_h": 9}}, "eau"),
    ({"assistance": [{"index": 1, "note": "ici"}]}, "assistance"),
    ({"mode": "objectif", "cible_h": "30h", "tolerance_pct": 50}, "fenêtre"),
    ({"mode": "objectif", "cible_h": "30h", "tolerance_pct": "large"}, "fenêtre illisible"),
])
def test_des_reglages_illisibles_sont_refuses_en_entier(reglages, motif):
    course = racespec_vers_course(RaceSpec.from_json(NICE), id="nice")
    with pytest.raises(ValueError, match=motif):
        lire_les_reglages(reglages, course)


def test_les_reglages_se_lisent_comme_un_humain_les_ecrit():
    course = racespec_vers_course(RaceSpec.from_json(NICE), id="nice")
    r = lire_les_reglages({"mode": "objectif", "cible_h": "31h30",
                           "nutrition": {"eau_l_h": "0,6", "glucides_g_h": 70},
                           "assistance": [{"index": 4, "note": " frontale "},
                                          {"index": 6, "note": ""}]}, course)
    assert r.cible_h == 31.5 and r.nutrition.eau_l_h == 0.6
    assert [(a.index, a.note) for a in r.assistance] == [(4, "frontale")]
    assert lire_les_reglages({"cible_h": 30}, course).cible_h is None, \
        "une cible sans le mode objectif ne se glisse pas dans une prédiction"
    # 29 h – 31 h : une cible de 30 h, une fenêtre de ±3,33 %
    fenetre = lire_les_reglages({"mode": "objectif", "cible_h": 30, "tolerance_pct": "3,3333"},
                                course)
    assert fenetre.tolerance_pct == pytest.approx(3.3333)
    assert lire_les_reglages({"mode": "prediction", "tolerance_pct": 3}, course).tolerance_pct \
        is None, "une fenêtre ne vaut qu'avec sa cible"
    assert lire_les_reglages({"mode": "objectif", "cible_h": 30}, course).tolerance_pct is None


def test_le_resultat_se_lit_en_heures_ou_en_abandon():
    assert lire_le_resultat({"officiel_h": "31:20:05"}, saisi_par="labo").officiel_h == \
        pytest.approx(31.3347, abs=1e-4)
    abandon = lire_le_resultat({"abandon": True, "officiel_h": 12}, saisi_par="athlete")
    assert abandon.abandon and abandon.officiel_h is None and abandon.saisi_par == "athlete"
    assert lire_le_resultat({}, saisi_par="labo") == O.Resultat()
    with pytest.raises(ValueError):
        lire_le_resultat({"officiel_h": 900}, saisi_par="labo")


def test_les_amendements_se_lisent_contre_la_version_publiee():
    annexe = {"course": {"n_segments": 16}, "plan": {"crew": [{"aid_index": 4}, {"aid_index": 6}]}}
    a = lire_les_amendements({"arrets": {"4": "12", "7": None}, "notes": {"6": " soupe "},
                              "nutrition": {"glucides_g_h": 80}}, annexe)
    assert a.arrets == {"4": 12.0} and a.notes == {"6": "soupe"}
    assert a.nutrition.glucides_g_h == 80
    for mauvais in ({"arrets": {"0": 5}}, {"arrets": {"16": 5}}, {"arrets": {"4": 999}},
                    {"notes": {"5": "pas d'assistance ici"}}):
        with pytest.raises(ValueError):
            lire_les_amendements(mauvais, annexe)


def test_fige_se_lit_a_lheure_du_depart():
    plan = {"statut": O.PLAN_ENVOYE}
    course = {"depart_le": "2026-09-25T13:00:00+02:00"}
    avant = datetime(2026, 9, 25, 10, 59, tzinfo=timezone.utc)
    apres = datetime(2026, 9, 25, 11, 0, tzinfo=timezone.utc)
    assert statut_lu(plan, course, avant) == O.PLAN_ENVOYE
    assert statut_lu(plan, course, apres) == O.PLAN_FIGE
    assert statut_lu({**plan, "resultat": {"abandon": True}}, course, apres) == O.PLAN_RESULTAT
    assert statut_lu({"statut": O.PLAN_GENERE}, course, apres) == O.PLAN_GENERE, \
        "un plan jamais publié n'a rien à figer"


def test_on_nenvoie_pas_un_plan_qui_nest_pas_publie(client):
    magasin = client.app.state.magasin
    magasin.athletes.ecrire(O.Athlete(id="val", email="val@exemple.test").to_dict())
    magasin.plans.ecrire(O.Plan(ref="LL-X", athlete_id="val", version=1).to_dict())
    r = client.post("/tableau-de-bord/plans/LL-X/send", headers=ADMIN,
                    json={"objet": "Ton plan", "corps": "{lien}"})
    assert r.status_code == 409
    assert client.app.state.courrier.envoyes == []


def test_une_page_jamais_publiee_rend_la_meme_404_quune_mauvaise_cle(client):
    client.app.state.magasin.plans.ecrire(O.Plan(ref="LL-X", version=1).to_dict())
    bonne = client.get("/plans/LL-X", params={"k": _cle("LL-X", "prive")})
    mauvaise = client.get("/plans/LL-X", params={"k": "0" * 32})
    inconnue = client.get("/plans/LL-Y", params={"k": _cle("LL-Y", "prive")})
    assert bonne.status_code == mauvaise.status_code == inconnue.status_code == 404
    assert bonne.json() == mauvaise.json() == inconnue.json()


def test_une_reference_farfelue_ne_sort_pas_du_volume(client):
    magasin = client.app.state.magasin
    temoin = magasin.plans.racine.parent / "temoin.json"
    temoin.write_text("{}")
    for ref in ("..", "LL-X%2F..", ".rendu-x"):
        assert client.get(f"/tableau-de-bord/plans/{ref}", headers=ADMIN).status_code == 404
        # « LL-X%2F.. » arrive décodé en deux segments : aucune route DELETE ne le prend
        assert client.delete(f"/tableau-de-bord/plans/{ref}", headers=ADMIN).status_code in (404, 405)
    assert temoin.exists() and magasin.plans.racine.exists()
    with pytest.raises(ValueError):
        magasin.plans.supprimer("..")


# --------------------------------------------------------------------------- #
# Avec PDF : un vrai plan de Nice, de sa création à son résultat
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def nice(tmp_path_factory):
    if not HAS_TEX:
        pytest.skip("XeLaTeX et biber requis pour rendre")
    patch = pytest.MonkeyPatch()
    try:
        client = _application(tmp_path_factory.mktemp("plans"), patch)
        athlete_id = _athlete_ingere(client)
        course_id = _course_nice(client)
        r = client.post("/tableau-de-bord/plans", headers=ADMIN, json={
            "athlete_id": athlete_id, "course_id": course_id,
            "reglages": {"mode": "prediction", "politique_arrets": "standard",
                         "assistance": [{"index": 4, "note": "bidons + frontale"}]}})
        assert r.status_code == 200, r.text
        yield {"client": client, "ref": r.json()["ref"], "job_id": r.json()["job_id"],
               "athlete_id": athlete_id, "course_id": course_id}
    finally:
        patch.undo()


def _plan(nice) -> dict:
    return nice["client"].get(f"/tableau-de-bord/plans/{nice['ref']}", headers=ADMIN).json()


def _page(nice, usage: str, **params):
    return nice["client"].get(f"/plans/{nice['ref']}",
                              params={"k": _cle(nice["ref"], usage), **params})


@pdf_requis
def test_1_creer_un_plan_genere_sa_version_1(nice):
    client, ref = nice["client"], nice["ref"]
    assert ref.startswith("LL-NICE26-VAL-")
    job = client.get(f"/tableau-de-bord/jobs/{nice['job_id']}", headers=ADMIN).json()
    assert job["statut"] == O.JOB_FINI, job
    assert job["type"] == O.JOB_GENERATION and job["plan_ref"] == ref

    vu = _plan(nice)
    assert vu["plan"]["version"] == 1 and vu["plan"]["statut"] == O.PLAN_GENERE
    assert vu["plan"]["depart_le"].startswith("2026-09-25T13:00")
    p = vu["plan"]["prediction"]
    assert p["central_h"] and len(p["fourchette"]) == 2 and len(p["bornes"]) == 2
    assert [v["n"] for v in vu["versions"]] == [1]
    assert vu["documents"] == ["pdf", "feuille.pdf", "ics", "gpx"]
    assert vu["liens"] == {}, "pas de lien avant « Publier »"
    assert vu["arrets_mesures"] is not None and "taux" in vu["arrets_mesures"]
    # la politique du moteur, dite en chiffres : lue dans sa config, pas recopiée à l'écran
    pol = vu["politique_standard"]
    assert pol["points"] == 15 and pol["bases"] >= 1
    assert pol["total_min"] == (pol["points"] * pol["par_point_min"]
                                + pol["bases"] * pol["bases_en_plus_min"])
    assert client.get("/tableau-de-bord/athletes/" + nice["athlete_id"],
                      headers=ADMIN).json()["plans"][0]["ref"] == ref


@pdf_requis
def test_2_le_meme_plan_ne_se_cree_pas_deux_fois(nice):
    r = nice["client"].post("/tableau-de-bord/plans", headers=ADMIN, json={
        "athlete_id": nice["athlete_id"], "course_id": nice["course_id"]})
    assert r.status_code == 409 and r.json()["detail"]["ref"] == nice["ref"]


@pdf_requis
def test_3_les_fichiers_de_la_version_courante(nice):
    client, ref = nice["client"], nice["ref"]
    pdf = client.get(f"/tableau-de-bord/plans/{ref}/pdf", headers=ADMIN)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert f"{ref}-v1-plan.pdf" in pdf.headers["content-disposition"]
    assert client.get(f"/tableau-de-bord/plans/{ref}/ics", headers=ADMIN).text.startswith(
        "BEGIN:VCALENDAR")
    assert client.get(f"/tableau-de-bord/plans/{ref}/dossier.json",
                      headers=ADMIN).status_code == 404, "le dossier ne se télécharge pas"


@pdf_requis
def test_4_publier_pose_les_deux_liens_et_rien_ne_part(nice):
    client, ref = nice["client"], nice["ref"]
    assert _page(nice, "prive").status_code == 404, "pas de page avant « Publier »"
    r = client.post(f"/tableau-de-bord/plans/{ref}/publish", headers=ADMIN)
    assert r.status_code == 200, r.text
    liens = r.json()["liens"]
    assert liens["prive"].endswith(f"/services/twin/plan/{ref}?k={_cle(ref, 'prive')}")
    assert liens["partage"].endswith(f"?k={_cle(ref, 'partage')}")
    assert r.json()["job_id"] is None, "aucun amendement à reposer"
    assert client.app.state.courrier.envoyes == []
    vu = _plan(nice)["plan"]
    assert vu["statut"] == O.PLAN_PUBLIE and vu["version_publiee"] == 1
    assert vu["cles"] == {"partage": _cle(ref, "partage"), "prive": _cle(ref, "prive")}


@pdf_requis
def test_5_la_cle_de_partage_ne_lit_que_la_partie_partageable(nice):
    r = _page(nice, "partage")
    assert r.status_code == 200, r.text
    vu = r.json()
    assert vu["acces"] == "partage" and vu["version"] == 1 and not vu["fige"]
    assert vu["plan"]["segments"] and vu["assistance"]
    assert {a["index"]: a.get("note") for a in vu["assistance"]}[4] == "bidons + frontale"
    for prive in ("annexe", "amendements", "demandes", "resultat", "lien_de_partage",
                  "niveau"):
        assert prive not in vu, prive
    assert "calibration" not in json.dumps(vu)
    assert set(vu["figures"]) <= {"profil", "pacing"}
    # ce que la page dessine sans rien recalculer : le profil, la nuit, où passe le temps
    assert 2 <= len(vu["course"]["profil"]) <= 600 and vu["plan"]["sun"]
    assert vu["ventilation"]["parts"] and "\\" not in vu["ventilation"]["lecture"]
    pdf = nice["client"].get(f"/plans/{nice['ref']}/pdf", params={"k": _cle(nice["ref"], "partage")})
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


@pdf_requis
def test_6_la_cle_privee_lit_tout(nice):
    vu = _page(nice, "prive").json()
    assert vu["acces"] == "prive" and vu["peut_amender"] and not vu["peut_saisir_le_resultat"]
    assert vu["niveau"] in (O.NIVEAU_BASE, O.NIVEAU_CALIBRE)
    assert vu["annexe"]["calibration"] and vu["annexe"]["ref"] == nice["ref"]
    assert vu["lien_de_partage"].endswith(_cle(nice["ref"], "partage"))
    assert vu["amendements"] == {"arrets": {}, "notes": {}, "nutrition":
                                 {"eau_l_h": None, "glucides_g_h": None}}


@pdf_requis
def test_7_la_cle_de_partage_ne_peut_rien_changer(nice):
    client, ref = nice["client"], nice["ref"]
    k = {"k": _cle(ref, "partage")}
    assert client.post(f"/plans/{ref}/amend", params=k, json={"arrets": {"4": 20}}).status_code == 404
    assert client.post(f"/plans/{ref}/requests", params=k, json={"quoi": "x"}).status_code == 404
    assert client.put(f"/plans/{ref}/result", params=k, json={"abandon": True}).status_code == 404


@pdf_requis
def test_8_envoyer_remplace_le_lien_et_joint_le_pdf(nice):
    client, ref = nice["client"], nice["ref"]
    r = client.post(f"/tableau-de-bord/plans/{ref}/send", headers=ADMIN,
                    json={"objet": "Ton plan pour Nice", "corps": "Salut !"})
    assert r.status_code == 422 and "{lien}" in r.json()["detail"]
    r = client.post(f"/tableau-de-bord/plans/{ref}/send", headers=ADMIN,
                    json={"objet": "Ton plan pour Nice",
                          "corps": "Salut !\n\nTa page : {lien}\nPour ton assistance : {lien_partage}"})
    assert r.status_code == 200, r.text
    envoye = client.app.state.courrier.envoyes[-1]
    assert envoye["a"] == f"Val <{DEPOT['email']}>"
    assert f"?k={_cle(ref, 'prive')}" in envoye["corps"]
    assert f"?k={_cle(ref, 'partage')}" in envoye["corps"]
    assert "{lien" not in envoye["corps"]
    assert envoye["pieces"][0][0] == f"{ref}.pdf" and envoye["pieces"][0][1] > 10_000
    assert _plan(nice)["plan"]["statut"] == O.PLAN_ENVOYE


@pdf_requis
def test_9_un_relais_en_panne_ne_marque_pas_le_plan_envoye(nice):
    client, ref = nice["client"], nice["ref"]
    avant = _plan(nice)["plan"]["envoye_le"]
    client.app.state.courrier = FauxCourrier(panne=True)
    try:
        r = client.post(f"/tableau-de-bord/plans/{ref}/send", headers=ADMIN,
                        json={"objet": "Ton plan", "corps": "{lien}"})
        assert r.status_code == 502
        assert _plan(nice)["plan"]["envoye_le"] == avant
    finally:
        client.app.state.courrier = FauxCourrier()


@pdf_requis
def test_10_lathlete_amende_et_les_documents_suivent(nice):
    client, ref = nice["client"], nice["ref"]
    k = {"k": _cle(ref, "prive")}
    r = client.post(f"/plans/{ref}/amend", params=k,
                    json={"arrets": {"4": 25}, "notes": {"4": "soupe chaude"},
                          "nutrition": {"eau_l_h": 0.6, "glucides_g_h": 75}})
    assert r.status_code == 200, r.text
    job = client.get(f"/plans/{ref}/jobs/{r.json()['job_id']}", params=k).json()
    assert job["statut"] == O.JOB_FINI, job
    vu = _page(nice, "prive").json()
    assert vu["amendements"]["arrets"] == {"4": 25.0}
    assert {c["aid_index"]: c["note"] for c in vu["plan"]["crew"]}[4] == "soupe chaude"
    assert {r["aid_index"]: r["stop_min"] for r in vu["annexe"]["plan"]["reglages"]}[4] == 25
    assert vu["plan"]["nutrition"] == {"water_l_per_h": 0.6, "carbs_g_per_h": 75.0}
    # le job d'un plan ne se lit pas depuis un autre plan, ni avec la clé de partage
    assert client.get(f"/plans/{ref}/jobs/{r.json()['job_id']}",
                      params={"k": _cle(ref, "partage")}).status_code == 404


@pdf_requis
def test_11_une_demande_entre_dans_la_file_et_sa_reponse_repart(nice):
    client, ref = nice["client"], nice["ref"]
    k = {"k": _cle(ref, "prive")}
    r = client.post(f"/plans/{ref}/requests", params=k,
                    json={"quoi": "Viser 30 h", "pourquoi": "je me sens bien"})
    assert r.status_code == 200, r.text
    demande_id = r.json()["id"]
    assert [d["id"] for d in client.get("/tableau-de-bord/file", headers=ADMIN).json()["demandes"]] \
        == [demande_id]
    liste = client.get("/tableau-de-bord/requests", headers=ADMIN).json()["demandes"]
    assert liste[0]["athlete"] == "Val" and liste[0]["course"].startswith("Nice")

    r = client.post(f"/tableau-de-bord/requests/{demande_id}/answer", headers=ADMIN,
                    json={"reponse": "Faisable, je te refais le plan."})
    assert r.status_code == 200 and r.json()["statut"] == O.DEMANDE_REPONDUE
    envoye = client.app.state.courrier.envoyes[-1]
    assert "Faisable" in envoye["corps"] and "Viser 30 h" in envoye["corps"]
    assert client.get("/tableau-de-bord/file", headers=ADMIN).json()["demandes"] == []
    mes_demandes = _page(nice, "prive").json()["demandes"]
    assert mes_demandes[0]["reponse"] == "Faisable, je te refais le plan."


@pdf_requis
def test_12_une_nouvelle_version_ne_se_montre_pas_avant_publier(nice):
    client, ref = nice["client"], nice["ref"]
    r = client.post(f"/tableau-de-bord/plans/{ref}/generate", headers=ADMIN, json={
        "reglages": {"mode": "objectif", "cible_h": "30h", "politique_arrets": "mesuree"}})
    assert r.status_code == 200, r.text
    job = client.get(f"/tableau-de-bord/jobs/{r.json()['job_id']}", headers=ADMIN).json()
    assert job["statut"] == O.JOB_FINI, job
    vu = _plan(nice)
    assert vu["plan"]["version"] == 2 and vu["plan"]["version_publiee"] == 1
    assert vu["plan"]["statut"] == O.PLAN_GENERE
    assert [v["n"] for v in vu["versions"]] == [1, 2]
    assert vu["version"]["reglages"]["politique_arrets"] == "mesuree"
    # la version 2 porte les amendements de l'athlète, faits avant elle
    assert vu["version"]["amendements"]["arrets"] == {"4": 25.0}
    assert _page(nice, "prive").json()["version"] == 1, "la page suit la version publiée"


@pdf_requis
def test_13_restaurer_ramene_la_version_et_ses_reglages(nice):
    client, ref = nice["client"], nice["ref"]
    r = client.post(f"/tableau-de-bord/plans/{ref}/restore/1", headers=ADMIN)
    assert r.status_code == 200, r.text
    vu = r.json()
    assert vu["plan"]["version"] == 1 and vu["plan"]["reglages"]["mode"] == "prediction"
    assert vu["plan"]["statut"] == O.PLAN_ENVOYE, "la version courante est celle que l'athlète a"
    assert client.post(f"/tableau-de-bord/plans/{ref}/restore/9",
                       headers=ADMIN).status_code == 404


@pdf_requis
def test_14_le_resultat_attend_le_depart_et_le_labo_fait_foi(nice):
    client, ref = nice["client"], nice["ref"]
    k = {"k": _cle(ref, "prive")}
    assert client.put(f"/plans/{ref}/result", params=k,
                      json={"officiel_h": "31:00"}).status_code == 409

    # la course part : le plan se fige
    course_id = nice["course_id"]
    course = client.get(f"/tableau-de-bord/courses/{course_id}", headers=ADMIN).json()
    course["depart_le"] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    assert client.put(f"/tableau-de-bord/courses/{course_id}", headers=ADMIN,
                      json=course).status_code == 200
    vu = _page(nice, "prive").json()
    assert vu["fige"] and not vu["peut_amender"] and vu["peut_saisir_le_resultat"]
    assert vu["statut"] == O.PLAN_FIGE
    assert client.post(f"/plans/{ref}/amend", params=k, json={"arrets": {}}).status_code == 409
    file = client.get("/tableau-de-bord/file", headers=ADMIN).json()
    assert file["dossiers"][0]["suivant"] == "saisir_resultat"

    r = client.put(f"/plans/{ref}/result", params=k, json={"officiel_h": "31:40"})
    assert r.status_code == 200 and r.json()["resultat"]["saisi_par"] == "athlete"
    r = client.put(f"/tableau-de-bord/plans/{ref}/result", headers=ADMIN,
                   json={"officiel_h": "31:38:12"})
    assert r.status_code == 200 and r.json()["statut"] == O.PLAN_RESULTAT
    assert r.json()["resultat"]["saisi_par"] == "labo"
    assert client.put(f"/plans/{ref}/result", params=k,
                      json={"abandon": True}).status_code == 409, "le labo fait foi"


@pdf_requis
def test_15_supprimer_un_plan_emporte_sa_page(nice):
    client, ref = nice["client"], nice["ref"]
    assert client.delete(f"/tableau-de-bord/courses/{nice['course_id']}",
                         headers=ADMIN).status_code == 409
    assert client.delete(f"/tableau-de-bord/plans/{ref}", headers=ADMIN).status_code == 204
    assert _page(nice, "prive").status_code == 404
    assert client.get(f"/tableau-de-bord/athletes/{nice['athlete_id']}",
                      headers=ADMIN).json()["plans"] == []
    assert client.get("/tableau-de-bord/requests", headers=ADMIN).json()["demandes"] == []
    assert client.delete(f"/tableau-de-bord/courses/{nice['course_id']}",
                         headers=ADMIN).status_code == 204
