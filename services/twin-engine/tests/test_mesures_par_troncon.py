"""Mouvement, arrêts et marche par tronçon, et la forme du plan jugée contre eux.

Une course synthétique de 10 km (5 km de montée, 5 km de descente), courue à 2 m/s, avec un
arrêt de dix minutes au sommet et dix minutes de marche dans la montée : chaque tronçon doit
porter exactement ce qui s'y est passé, et la forme du plan se lire contre ces mesures.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_backtest_tools import _along_course, _course_gpx  # noqa: E402

from twin_engine.config import load_config  # noqa: E402
from twin_engine.course import RaceSpec, build_course  # noqa: E402
from twin_engine.registre import bloc_forme  # noqa: E402
from twin_engine.twin.mouvement import (bilan_par_troncon, course_a_pied,  # noqa: E402
                                        episodes_arret, masque_mouvement)

CFG = load_config()


def test_movement_follows_the_reference_definitions():
    d = np.concatenate([np.arange(0.0, 200.0, 2.0), np.full(90, 198.0), 198.0 + np.arange(1.0, 41.0) * 0.2])
    gap = np.ones(d.size)
    m = masque_mouvement(d, gap, CFG)
    assert not m[0] and m[1:100].all()
    assert not m[100:190].any()                 # 90 s sur place
    assert not m[190:].any()                    # 0,2 m/s : sous 0,3 m/s, pas du mouvement
    arret = episodes_arret(m, CFG)
    assert arret[100:].all() and not arret[:100].any()
    trou = gap.copy()
    trou[50] = 31.0                             # une seconde dans un trou de 31 s
    assert not masque_mouvement(d, trou, CFG)[50]


def test_short_pause_is_not_a_stop():
    m = np.ones(300, dtype=bool)
    m[100:159] = False                          # 59 s
    m[200:260] = False                          # 60 s
    arret = episodes_arret(m, CFG)
    assert not arret[100:159].any() and arret[200:260].all()


def test_walking_is_read_on_smoothed_cadence():
    cad = np.full(600, 170.0)
    cad[200:400] = 110.0
    court = course_a_pied(cad, CFG)
    assert court[:190].all() and not court[210:390].any() and court[410:].all()
    assert course_a_pied(np.full(10, np.nan), CFG) is None
    assert course_a_pied(None, CFG) is None


def _course_et_activite():
    race = RaceSpec("T", (0.0, 5.0, 10.0), ("départ", "sommet", "arrivée"))
    course = build_course(_course_gpx(), race, CFG)
    t, x, lat, lon = _along_course(course, 2.0, pause=(2500, 600))
    cad = np.full(t.size, 170.0)
    cad[1000:1600] = 110.0                      # dix minutes de marche dans la montée
    return race, course, t, x, lat, lon, cad


def test_each_section_carries_what_happened_in_it():
    from tools.passages import passages_for_activity

    race, course, t, x, lat, lon, cad = _course_et_activite()
    pas = passages_for_activity(t, x, lat, lon, course, radius_m=50, official_h=t[-1] / 3600,
                                cadence=cad, gap=np.ones(t.size), cfg=CFG)
    montee, descente = pas["segments"]
    assert (montee["de"], montee["a"]) == ("départ", "sommet")
    assert montee["arrets_h"] == 0.0
    assert montee["mouvement_h"] * 3600 == pytest.approx(2500, abs=30)
    assert montee["marche_h"] * 3600 == pytest.approx(600, abs=15)
    # l'arrêt au sommet appartient au tronçon qui en repart (arrivée à arrivée, comme le plan)
    assert descente["arrets_h"] * 3600 == pytest.approx(600, abs=2)
    assert descente["mouvement_h"] * 3600 == pytest.approx(2500, abs=30)
    assert descente["marche_h"] * 3600 == pytest.approx(0, abs=5)
    assert pas["arrets_h"] == pytest.approx(600 / 3600, abs=0.001)
    assert pas["definitions"]["cadence_course_spm"] == 148.0
    sans_cadence = passages_for_activity(t, x, lat, lon, course, radius_m=50, cfg=CFG)
    assert sans_cadence["segments"][0]["marche_h"] is None and sans_cadence["marche_h"] is None


def test_bilan_without_a_checkpoint_is_none():
    d = np.arange(0.0, 1000.0)
    assert bilan_par_troncon(d, None, None, [0, None, 900], CFG) == [None, None]


def test_plan_shape_is_judged_against_the_real_sections():
    from tools.passages import passages_for_activity
    from tools.score_plan import _stand_in

    race, course, t, x, lat, lon, cad = _course_et_activite()
    pas = passages_for_activity(t, x, lat, lon, course, radius_m=50, official_h=t[-1] / 3600,
                                cadence=cad, gap=np.ones(t.size), cfg=CFG)
    reel_h = float(t[-1]) / 3600
    pred = _stand_in(reel_h, course.deq_km, course.dplus_per_km, stops_model="carved",
                     stops_rate=None)
    forme = bloc_forme(course, race, pred, CFG, pas)
    impose = forme["mouvement_impose"]
    assert impose["n"] == 2 and len(impose["troncons"]) == 2
    # le plan répartit le mouvement réel : sa somme est le mouvement réel
    assert sum(r["plan_min"] for r in impose["troncons"]) == pytest.approx(
        sum(r["reel_min"] for r in impose["troncons"]), abs=0.2)
    assert impose["troncons"][0]["marche_reelle_min"] == pytest.approx(10.0, abs=0.3)
    assert impose["pire_cumul_min"] >= impose["erreur_moyenne_min"] - 1e-9
    total = forme["total_predit"]
    assert total["n"] == 2 and total["arrivee_min"] is not None
    assert forme["arrets"]["reel_h"] == pytest.approx(600 / 3600, abs=0.001)
    assert forme["mouvement"]["plan_h"] > 0
    assert bloc_forme(course, race, pred, CFG, None) is None


def test_a_served_plan_enters_the_served_book_from_its_dossier(tmp_path):
    """Nice 2026 : le plan servi entre au livre servi depuis le dossier de sa version, avec
    le statut de l'athlète au jour de la course et la forme du plan si ses passages sont là."""
    import json

    from test_ingestion import dossier_du_cli as fabrique

    from tools.registre import entree_servie
    from twin_engine.registre import Depot

    chemin = tmp_path / "dossier.json"
    chemin.write_bytes(fabrique.__wrapped__() if hasattr(fabrique, "__wrapped__") else fabrique())
    depot = Depot(tmp_path / "registre")
    depot.marquer("Val", "dev", le="2026-07-03", par="Valentin", motif="cas de référence")
    e = entree_servie(chemin, depot, CFG, athlete="Val", course="Nice 100M 2026",
                      jour="2026-09-25", officiel_h=35.0 + 5 / 60)
    assert e["statut"] == "dev" and e["official_time_h"] == pytest.approx(35.083, abs=0.001)
    assert e["prediction"]["err_pct"] is not None and e["source"] == "dossier"
    assert "forme" not in e                       # pas de passages au registre
    rapport = depot.importer_servi([e])
    assert rapport["ajoutees"] == ["Val · Nice 100M 2026 · 2026-09-25"]
    assert json.loads(json.dumps(depot.servi()))[0]["reference"]


def test_a_race_missing_from_the_archive_is_read_from_its_file(tmp_path):
    """Une course absente de l'archive (exportée avant elle) se lit dans le fichier que le
    manifeste désigne, même sans sport déclaré : passages, mouvement, arrêts et marche."""
    import json

    from _gpx_coros import gpx_coros, point
    from test_backtest_tools import _activity_gpx

    from tools.passages import run_manifest

    race, course, t, x, lat, lon, cad = _course_et_activite()
    pts = [point(float(t[i]), float(x[i]), 100.0, hr=140, cad_per_foot=cad[i] / 2,
                 lat=float(lat[i]), lon=float(lon[i])) for i in range(t.size)]
    fichier = gpx_coros(pts).replace(b"<type>running</type>", b"")
    (tmp_path / "course-du-jour.gpx").write_bytes(fichier)
    (tmp_path / "parcours.gpx").write_bytes(_course_gpx())
    (tmp_path / "course.json").write_text(json.dumps(
        {"name": "T", "aid_km": [0.0, 5.0, 10.0], "aid_names": ["départ", "sommet", "arrivée"]}),
        encoding="utf-8")
    archive = tmp_path / "archives"
    archive.mkdir()
    (archive / "a.gpx").write_bytes(_activity_gpx("2026-09-01", minutes=40, v_ms=3.0))
    officiel = f"{int(t[-1]) // 3600:d}:{int(t[-1]) % 3600 // 60:02d}:{int(t[-1]) % 60:02d}"
    course_du_manifeste = {"name": "T", "date": "2026-09-25", "official_time": officiel,
                           "gpx": "parcours.gpx", "race_json": "course.json"}
    manifeste = tmp_path / "m.json"

    manifeste.write_text(json.dumps({"athlete": "A", "archive": "archives",
                                     "races": [course_du_manifeste]}), encoding="utf-8")
    assert run_manifest(manifeste, CFG) == [("T", None)]        # pas dans l'archive

    manifeste.write_text(json.dumps({"athlete": "A", "archive": "archives",
                                     "races": [{**course_du_manifeste,
                                                "activite": "course-du-jour.gpx"}]}),
                         encoding="utf-8")
    [(nom, pas)] = run_manifest(manifeste, CFG)
    assert nom == "T" and pas["n_found"] == 3
    montee, descente = pas["segments"]
    assert montee["marche_h"] * 3600 == pytest.approx(600, abs=15)
    assert descente["arrets_h"] * 3600 == pytest.approx(600, abs=2)
