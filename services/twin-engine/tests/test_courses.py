"""La bibliothèque et l'éditeur de course : les routes du §5.3.

Le banc d'essai reste Nice : c'est la seule course dont on connaisse la vérité.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from twin_engine.config import load_config
from twin_engine.tableau_de_bord import objets as O

EXEMPLES = Path(__file__).parents[1] / "examples"
JETON = "jeton-de-test-0123456789"
ADMIN = {"Authorization": f"Bearer {JETON}"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("TWIN_ADMIN_TOKEN", JETON)
    monkeypatch.setenv("TWIN_KEYS_SECRET", "secret-de-cles")
    from twin_engine.api import create_app

    return TestClient(create_app(load_config()))


@pytest.fixture(scope="module")
def spec_de_nice() -> dict:
    return json.loads((EXEMPLES / "nice-100m.json").read_text("utf-8"))


def _gpx_triangle(n=400, montee=1200.0, demi_km=6.0, wpts=()):
    """Une trace synthétique : une montée, une descente, et des waypoints posés dessus."""
    lat0, lon0 = 43.70, 7.26
    points = []
    for i in range(n + 1):
        x = 2 * demi_km * 1000 * i / n
        alt = montee * (x / (demi_km * 1000)) if x <= demi_km * 1000 else montee * (2 - x / (demi_km * 1000))
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        points.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{alt:.1f}</ele></trkpt>')
    balises = "".join(
        f'<wpt lat="{lat0:.6f}" lon="{lon0 + km * 1000 / (111_320.0 * math.cos(math.radians(lat0))):.6f}">'
        f"<name>{nom}</name><ele>{alt}</ele></wpt>"
        for nom, km, alt in wpts
    )
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'{balises}<trk><trkseg>{"".join(points)}</trkseg></trk></gpx>').encode()


# --------------------------------------------------------------------------- #
# Créer, lire, enregistrer
# --------------------------------------------------------------------------- #
def test_une_course_nait_en_brouillon_de_son_identite_seule(client):
    r = client.post("/tableau-de-bord/courses", headers=ADMIN, json={
        "nom": "Nice Côte d'Azur by UTMB · 100M", "edition": 2026,
        "depart_le": "2026-09-25T13:00:00+02:00",
    })
    assert r.status_code == 200
    assert r.json()["statut"] == O.COURSE_BROUILLON
    assert r.json()["slug"] == "nice-cote-d-azur-by-utmb-100m-2026"

    course = client.get(f"/tableau-de-bord/courses/{r.json()['id']}", headers=ADMIN).json()
    assert course["nom"] == "Nice Côte d'Azur by UTMB · 100M"
    assert course["ravitaillements"] == [] and course["athletes"] == 0


def test_une_course_sans_nom_est_refusee(client):
    r = client.post("/tableau-de-bord/courses", headers=ADMIN, json={"edition": 2026})
    assert r.status_code == 422


def test_une_spec_du_cli_entre_telle_quelle(client, spec_de_nice):
    """Dix-sept ravitaillements qu'un fichier porte déjà n'ont pas à être resaisis."""
    r = client.post("/tableau-de-bord/courses", headers=ADMIN,
                    json={"race_spec": spec_de_nice})
    assert r.status_code == 200

    course = client.get(f"/tableau-de-bord/courses/{r.json()['id']}", headers=ADMIN).json()
    assert course["nom"] == "Nice Côte d'Azur by UTMB · 100M"
    assert course["edition"] == 2026
    assert len(course["ravitaillements"]) == 17
    assert course["ravitaillements"][0]["nom"] == "Auron (départ)"
    assert course["officiel"]["dplus_m"] == 8900
    assert [r_["index"] for r_ in course["ravitaillements"] if r_["base_majeure"]] == [3, 7, 10]
    assert sum(1 for r_ in course["ravitaillements"] if r_["assistance"]) == 7


def test_une_spec_illisible_est_un_422(client):
    r = client.post("/tableau-de-bord/courses", headers=ADMIN,
                    json={"race_spec": {"aid_km": [5.0, 1.0], "aid_names": ["b", "a"]}})
    assert r.status_code == 422


def test_enregistrer_remplace_lobjet_entier(client, spec_de_nice):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"race_spec": spec_de_nice}).json()["id"]
    course = client.get(f"/tableau-de-bord/courses/{ident}", headers=ADMIN).json()
    course["technicite_pct"] = 15.0
    course["chaleur_c"] = 26.0
    course["ravitaillements"][4]["arret_min"] = 12.0

    r = client.put(f"/tableau-de-bord/courses/{ident}", headers=ADMIN, json=course)
    assert r.status_code == 200
    relu = client.get(f"/tableau-de-bord/courses/{ident}", headers=ADMIN).json()
    assert relu["technicite_pct"] == 15.0 and relu["chaleur_c"] == 26.0
    assert relu["ravitaillements"][4]["arret_min"] == 12.0


def test_lecran_ne_peut_pas_affirmer_une_geometrie(client, spec_de_nice):
    """La géométrie se mesure sur la trace ; le statut se change par /publish. Ni l'un
    ni l'autre ne se pose en enregistrant."""
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"race_spec": spec_de_nice}).json()["id"]
    course = client.get(f"/tableau-de-bord/courses/{ident}", headers=ADMIN).json()
    course["geometrie"]["dplus_m"] = 99999
    course["statut"] = O.COURSE_PUBLIEE
    client.put(f"/tableau-de-bord/courses/{ident}", headers=ADMIN, json=course)

    relu = client.get(f"/tableau-de-bord/courses/{ident}", headers=ADMIN).json()
    assert relu["geometrie"]["dplus_m"] is None
    assert relu["statut"] == O.COURSE_BROUILLON


def test_une_phase_hors_ravitaillement_est_refusee_a_lenregistrement(client, spec_de_nice):
    """On le dit à l'enregistrement, pas à la génération : une course intraduisible ne
    fera jamais de plan, autant l'apprendre en la saisissant."""
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"race_spec": spec_de_nice}).json()["id"]
    course = client.get(f"/tableau-de-bord/courses/{ident}", headers=ADMIN).json()
    course["phases"] = [{"nom": "Retenue", "du_km": 47.3, "au_km": 95.1, "note": ""}]
    r = client.put(f"/tableau-de-bord/courses/{ident}", headers=ADMIN, json=course)
    assert r.status_code == 422 and "ravitaillement" in r.json()["detail"]


# --------------------------------------------------------------------------- #
# La trace
# --------------------------------------------------------------------------- #
def test_la_trace_rend_le_profil_la_geometrie_et_le_soleil(client):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN, json={
        "nom": "Triangle", "edition": 2026, "depart_le": "2026-09-25T13:00:00+02:00",
    }).json()["id"]

    r = client.post(f"/tableau-de-bord/courses/{ident}/gpx", headers=ADMIN,
                    files={"gpx": ("trace.gpx", _gpx_triangle(), "application/gpx+xml")})
    assert r.status_code == 200, r.text
    vu = r.json()

    # 12,22 km et non 12,00 : SANS carnet de route, la longueur est celle de la trace
    # en TROIS dimensions — la montée allonge le chemin. Voir le test suivant.
    assert vu["geometrie"]["distance_km"] == pytest.approx(12.22, abs=0.05)
    assert vu["geometrie"]["dplus_m"] == pytest.approx(1185, abs=5)
    assert vu["geometrie"]["alt_max"] == pytest.approx(1200, abs=20)
    assert vu["lat"] == pytest.approx(43.70, abs=0.01)
    assert 2 <= len(vu["profil"]) <= 600
    assert vu["soleil"]["coucher"] and vu["soleil"]["lever"]
    # coucher le soir, lever le matin : si les deux se croisent, le calcul est à l'envers
    assert vu["soleil"]["coucher"] > "17:00" and vu["soleil"]["lever"] < "09:00"


def test_la_trace_se_range_a_cote_de_sa_course(client):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"nom": "Triangle"}).json()["id"]
    client.post(f"/tableau-de-bord/courses/{ident}/gpx", headers=ADMIN,
                files={"gpx": ("nice.gpx", _gpx_triangle(), "application/gpx+xml")})

    repertoire = client.app.state.magasin.courses.repertoire(ident)
    assert (repertoire / "trace.gpx").exists() and (repertoire / "profil.json").exists()
    course = client.get(f"/tableau-de-bord/courses/{ident}", headers=ADMIN).json()
    assert course["gpx"]["nom"] == "nice.gpx" and course["gpx"]["avec_altitude"] is True
    assert course["geometrie"]["dplus_m"] is not None


def test_les_waypoints_du_gpx_sont_trouves_et_placés(client):
    """« Importer les waypoints du GPX » : la moitié du travail de saisie d'un carnet."""
    gpx = _gpx_triangle(wpts=[("Sommet", 6.0, 1200), ("Arrivée", 12.0, 0)])
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"nom": "Triangle"}).json()["id"]
    vu = client.post(f"/tableau-de-bord/courses/{ident}/gpx", headers=ADMIN,
                     files={"gpx": ("t.gpx", gpx, "application/gpx+xml")}).json()

    assert [w["nom"] for w in vu["waypoints"]] == ["Sommet", "Arrivée"]
    # Le kilomètre rendu est celui DE LA COURSE, pas la distance à vol d'oiseau : le
    # sommet tombe à la moitié du parcours, l'arrivée à sa fin.
    total = vu["geometrie"]["distance_km"]
    assert vu["waypoints"][0]["km"] == pytest.approx(total / 2, abs=0.2)
    assert vu["waypoints"][1]["km"] == pytest.approx(total, abs=0.2)


def test_le_carnet_de_route_fait_foi_sur_la_distance(client):
    """Avec des ravitaillements, le moteur RECALE la trace sur le kilométrage officiel :
    le GPS dérive, le carnet de route non. Sans eux, il fait confiance à la trace.

    Conséquence à l'écran, et elle surprend si on ne l'attend pas : la distance CHANGE
    quand on saisit le carnet. C'est voulu — avant, c'est ce que le GPS a mesuré ;
    après, c'est ce que l'organisateur annonce."""
    sans = client.post("/tableau-de-bord/courses", headers=ADMIN,
                       json={"nom": "Sans carnet"}).json()["id"]
    vu_sans = client.post(f"/tableau-de-bord/courses/{sans}/gpx", headers=ADMIN,
                          files={"gpx": ("t.gpx", _gpx_triangle(), "application/gpx+xml")}).json()

    avec = client.post("/tableau-de-bord/courses", headers=ADMIN, json={"race_spec": {
        "name": "Avec carnet", "aid_km": [0.0, 6.0, 12.0],
        "aid_names": ["Départ", "Sommet", "Arrivée"],
    }}).json()["id"]
    vu_avec = client.post(f"/tableau-de-bord/courses/{avec}/gpx", headers=ADMIN,
                          files={"gpx": ("t.gpx", _gpx_triangle(), "application/gpx+xml")}).json()

    assert vu_sans["geometrie"]["distance_km"] == pytest.approx(12.22, abs=0.05)
    assert vu_avec["geometrie"]["distance_km"] == pytest.approx(12.0, abs=0.05)
    # Le D+, lui, ne se recale sur rien : il se mesure. C'est pour ça que l'écart avec
    # le carnet officiel ne se calcule que sur lui (§3 du chantier).
    assert vu_avec["geometrie"]["dplus_m"] == pytest.approx(
        vu_sans["geometrie"]["dplus_m"], abs=1.0)


def test_un_gpx_sans_waypoint_nen_invente_pas(client):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"nom": "Triangle"}).json()["id"]
    vu = client.post(f"/tableau-de-bord/courses/{ident}/gpx", headers=ADMIN,
                     files={"gpx": ("t.gpx", _gpx_triangle(), "application/gpx+xml")}).json()
    assert vu["waypoints"] == []


def test_une_trace_illisible_est_un_422(client):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"nom": "Triangle"}).json()["id"]
    r = client.post(f"/tableau-de-bord/courses/{ident}/gpx", headers=ADMIN,
                    files={"gpx": ("t.gpx", b"<gpx></gpx>", "application/gpx+xml")})
    assert r.status_code == 422


def test_sans_depart_aucune_heure_de_soleil_nest_inventee(client):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"nom": "Sans date"}).json()["id"]
    vu = client.post(f"/tableau-de-bord/courses/{ident}/gpx", headers=ADMIN,
                     files={"gpx": ("t.gpx", _gpx_triangle(), "application/gpx+xml")}).json()
    assert vu["soleil"] == {"coucher": "", "lever": ""}


# --------------------------------------------------------------------------- #
# Publier, dupliquer, supprimer
# --------------------------------------------------------------------------- #
def test_publier_sort_du_brouillon(client, spec_de_nice):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"race_spec": spec_de_nice}).json()["id"]
    r = client.post(f"/tableau-de-bord/courses/{ident}/publish", headers=ADMIN)
    assert r.status_code == 200 and r.json()["statut"] == O.COURSE_PUBLIEE


def test_une_course_sans_ravitaillement_ne_se_publie_pas(client):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"nom": "Vide"}).json()["id"]
    r = client.post(f"/tableau-de-bord/courses/{ident}/publish", headers=ADMIN)
    assert r.status_code == 409


def test_dupliquer_emporte_la_trace_et_les_ravitaillements(client, spec_de_nice):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"race_spec": spec_de_nice}).json()["id"]
    client.post(f"/tableau-de-bord/courses/{ident}/gpx", headers=ADMIN,
                files={"gpx": ("t.gpx", _gpx_triangle(), "application/gpx+xml")})
    client.post(f"/tableau-de-bord/courses/{ident}/publish", headers=ADMIN)

    r = client.post(f"/tableau-de-bord/courses/{ident}/duplicate", headers=ADMIN,
                    json={"depart_le": "2027-09-24T13:00:00+02:00"})
    assert r.status_code == 200 and r.json()["edition"] == 2027

    neuve = client.get(f"/tableau-de-bord/courses/{r.json()['id']}", headers=ADMIN).json()
    assert len(neuve["ravitaillements"]) == 17
    assert neuve["statut"] == O.COURSE_BROUILLON, "une copie se relit avant de servir"
    assert neuve["depart_le"] == "2027-09-24T13:00:00+02:00"
    assert neuve["soleil"] == {"coucher": "", "lever": ""}, "autre date, autres heures"
    assert (client.app.state.magasin.courses.repertoire(r.json()["id"]) / "trace.gpx").exists()


def test_supprimer_est_refuse_si_un_plan_y_est_rattache(client, spec_de_nice):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"race_spec": spec_de_nice}).json()["id"]
    client.app.state.magasin.plans.ecrire(
        O.Plan(ref="LL-NICE26-VAL-0001", course_id=ident).to_dict())

    r = client.delete(f"/tableau-de-bord/courses/{ident}", headers=ADMIN)
    assert r.status_code == 409 and "LL-NICE26-VAL-0001" in r.json()["detail"]
    assert client.app.state.magasin.courses.lire(ident) is not None


def test_supprimer_une_course_libre_emporte_sa_trace(client):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"nom": "Triangle"}).json()["id"]
    client.post(f"/tableau-de-bord/courses/{ident}/gpx", headers=ADMIN,
                files={"gpx": ("t.gpx", _gpx_triangle(), "application/gpx+xml")})
    repertoire = client.app.state.magasin.courses.repertoire(ident)

    assert client.delete(f"/tableau-de-bord/courses/{ident}", headers=ADMIN).status_code == 204
    assert not repertoire.exists()


# --------------------------------------------------------------------------- #
# La bibliothèque
# --------------------------------------------------------------------------- #
def test_la_bibliotheque_met_la_course_la_plus_proche_en_tete(client):
    for nom, depart in (("Tard", "2026-12-01T08:00:00+01:00"),
                        ("Tôt", "2026-03-01T08:00:00+01:00"),
                        ("Sans date", "")):
        client.post("/tableau-de-bord/courses", headers=ADMIN,
                    json={"nom": nom, "depart_le": depart})
    noms = [c["nom"] for c in
            client.get("/tableau-de-bord/courses", headers=ADMIN).json()["courses"]]
    assert noms == ["Tôt", "Tard", "Sans date"]


def test_la_bibliotheque_dit_combien_dathletes_courent_chaque_course(client):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"nom": "Nice"}).json()["id"]
    for ref in ("LL-A", "LL-B"):
        client.app.state.magasin.plans.ecrire(O.Plan(ref=ref, course_id=ident).to_dict())
    courses = client.get("/tableau-de-bord/courses", headers=ADMIN).json()["courses"]
    assert courses[0]["athletes"] == 2


def test_toutes_les_routes_de_course_exigent_le_jeton(client):
    ident = client.post("/tableau-de-bord/courses", headers=ADMIN,
                        json={"nom": "Nice"}).json()["id"]
    assert client.get("/tableau-de-bord/courses").status_code == 401
    assert client.get(f"/tableau-de-bord/courses/{ident}").status_code == 401
    assert client.put(f"/tableau-de-bord/courses/{ident}", json={}).status_code == 401
    assert client.post(f"/tableau-de-bord/courses/{ident}/publish").status_code == 401
    assert client.delete(f"/tableau-de-bord/courses/{ident}").status_code == 401
