"""Le détecteur de descentes hachées et les traits du jumeau qu'il nourrit.

Une sortie synthétique en dents de scie (montées marchées, descentes à −20 %) dont les
descentes deviennent hachées passé un certain dénivelé négatif : le résumé de décodage doit
voir exactement les fenêtres de l'analyse de référence, et les traits retrouver ce qui a été
fabriqué (pénalité de marche, fatigue de descente, seuil de cadence, probabilité de marcher).
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.analyses import nice_2026_descentes as nice  # noqa: E402
from twin_engine.config import load_config, override_config  # noqa: E402
from twin_engine.ingest.canonical import CanonicalActivity  # noqa: E402
from twin_engine.twin.descentes import fenetres_de_descente, resume_descentes, traits_terrain  # noqa: E402
from twin_engine.twin.record import process_activity_full  # noqa: E402

CFG = load_config()
LAT0, LON0 = 44.0, 7.0


def _sortie(*, reps=10, v_course=3.0, hachee_apres=None, ralentit=0.0, depart_h=7,
            jour=datetime(2026, 5, 1, tzinfo=timezone.utc)) -> CanonicalActivity:
    """Montées de 750 m à +20 % marchées (1 m/s, 110 pas/min), descentes de 750 m à −20 %
    courues (``v_course``, 170 pas/min) ; à partir de la répétition ``hachee_apres``, les
    descentes alternent 40 s de marche (1,3 m/s) et 40 s de course. ``ralentit`` : perte de
    vitesse de course en descente par répétition (fatigue de descente fabriquée)."""
    t, d, z, cad = [0.0], [0.0], [1000.0], [110.0]

    def pas(v, pente, c):
        t.append(t[-1] + 1.0)
        d.append(d[-1] + v)
        z.append(z[-1] + v * pente)
        cad.append(c)

    for r in range(reps):
        depart = d[-1]
        while d[-1] - depart < 750.0:
            pas(1.0, 0.20, 110.0)
        depart, k = d[-1], 0
        hachee = hachee_apres is not None and r >= hachee_apres
        v_r = v_course * (1.0 - ralentit * r)
        while d[-1] - depart < 750.0:
            if hachee and (k // 40) % 2 == 0:
                pas(1.3, -0.20, 110.0)
            else:
                pas(v_r, -0.20, 170.0)
            k += 1
    d = np.asarray(d)
    lon = LON0 + d / (111_320.0 * math.cos(math.radians(LAT0)))
    debut = jour.replace(hour=depart_h)
    return CanonicalActivity.from_samples(
        timestamps=t, dist_m=d.tolist(), alt_m=z, hr=[150.0] * len(t), lat=[LAT0] * len(t),
        lon=lon.tolist(), sport="running", source_format="fit", source_name="dents",
        start_time=debut, cadence=cad, cadence_per_foot=False)


def _cellules(resume):
    return [dict(zip(("classe", "hache", "dminus", "nuit", "s", "m", "marche_s", "bascules",
                      "fc_somme", "fc_s", "fenetres"), c)) for c in resume["cellules"]]


@pytest.mark.filterwarnings("ignore::RuntimeWarning")
def test_the_summary_sees_exactly_the_reference_windows():
    act = _sortie(reps=8, hachee_apres=4)
    r = resume_descentes(act, CFG)
    a = {"t": act.t, "dist": act.dist_m, "ele": act.alt_m, "hr": act.hr, "cad": act.cadence_spm,
         "pas": np.ones(act.n), "trou": np.asarray(act.gap_s, dtype=float)}
    R = nice.fenetres_descente(nice.preparer(a))
    cells = _cellules(r)
    assert sum(c["fenetres"] for c in cells) == len(R)
    assert sum(c["s"] for c in cells) == pytest.approx(R[:, 2].sum())
    hache = (R[:, 5] >= nice.HACHE_BASCULES_MIN) | (R[:, 4] >= nice.HACHE_MARCHE)
    assert sum(c["fenetres"] for c in cells if c["hache"]) == int(hache.sum())
    assert sum(c["marche_s"] for c in cells) == pytest.approx(float(np.sum(R[:, 4] * R[:, 2])), abs=1)
    assert sum(c["bascules"] for c in cells) == pytest.approx(float(np.sum(R[:, 5] * R[:, 2] / 60)), abs=1)
    # −20 % : la classe (−25 ; −18] (les fenêtres à cheval sur un col tombent plus haut), et
    # seules les descentes des quatre dernières répétitions sont hachées
    total = sum(c["s"] for c in cells)
    assert sum(c["s"] for c in cells if c["classe"] == 1) > 0.6 * total
    assert {c["classe"] for c in cells} <= {1, 2, 3}
    assert sum(c["s"] for c in cells if c["hache"]) > 0.4 * total
    # dénivelé négatif déjà descendu : 150 m par descente, rangé par 1000 m
    assert max(c["dminus"] for c in cells) == 1
    # le reste (montées) et la cadence sont là ; la nuit est connue, de jour
    assert r["reste"] and r["cadence"] and r["nuit_connue"] and {c["nuit"] for c in cells} == {0}
    assert r["unite"] == "deux_pieds"


def test_no_cadence_no_altitude_no_summary():
    act = _sortie(reps=2)
    from dataclasses import replace

    assert resume_descentes(replace(act, cadence_spm=np.full(act.n, np.nan)), CFG) is None
    assert resume_descentes(replace(act, alt_m=np.full(act.n, np.nan)), CFG) is None
    s, *_ = process_activity_full(act, CFG)
    assert s.descente is not None and s.descente["cellules"]


def test_traits_find_the_walk_penalty_and_the_descent_fatigue():
    cfg = override_config(CFG, "twin.terrain_dminus_step_m=300,twin.terrain_fatigue_dminus_m=600,"
                               "twin.terrain_trait_min_hours=0.05,twin.terrain_trait_shrink_hours=0")
    sorties = [_sortie(reps=10, hachee_apres=6, ralentit=0.02, jour=datetime(2026, 5, j, tzinfo=timezone.utc))
               for j in (1, 3)]
    resumes = [process_activity_full(a, cfg)[0] for a in sorties]
    tr = traits_terrain(resumes, cfg)
    assert tr["n_activites"] == 2 and tr["unites"] == {"deux_pieds": 2}
    ligne = tr["vitesses"][0]                         # (−25 ; −18]
    assert ligne["frais_courable_kmh"] > ligne["fatigue_courable_kmh"] > ligne["fatigue_hache_kmh"]
    pm = tr["penalite_marche"]["fatigue"]
    assert pm["valeur"] == pm["brut"] and 0.2 < pm["brut"] < 0.6
    assert tr["penalite_marche"]["frais"]["valeur"] is None   # aucune descente hachée fraîche
    fat = tr["fatigue_descente"]
    # 2 % de vitesse en moins par descente de 150 m de D− : ≈ ln(0,98) ÷ 0,15 par km
    assert fat["absolue"]["brut"] == pytest.approx(math.log(0.98) / 0.15, rel=0.35)
    assert fat["relative"]["brut"] is not None and fat["relative"]["brut"] < 0
    m = tr["marche"]
    assert m["dminus_par_km"] > 0 and m["intercepts"][1] is not None and m["nuit"] is None
    # rétrécis vers 0 : la moitié du brut à λ = heures de mesure
    lam = fat["absolue"]["heures"]
    tr2 = traits_terrain(resumes, override_config(cfg, f"twin.terrain_trait_shrink_hours={lam}"))
    assert tr2["fatigue_descente"]["absolue"]["valeur"] == pytest.approx(fat["absolue"]["brut"] / 2, rel=1e-3)
    # sous le minimum d'heures : None, la mesure brute reste lisible
    tr3 = traits_terrain(resumes, override_config(cfg, "twin.terrain_trait_min_hours=100"))
    assert tr3["fatigue_descente"]["absolue"]["valeur"] is None
    assert tr3["fatigue_descente"]["absolue"]["brut"] == fat["absolue"]["brut"]
    assert tr3["marche"] is None
    assert traits_terrain([SimpleNamespace(descente=None)], cfg) is None


def test_the_personal_cadence_threshold_splits_two_gaits():
    rng = np.random.default_rng(3)
    marche = rng.normal(112.0, 7.0, 40_000)
    course = rng.normal(172.0, 5.0, 90_000)
    x = np.concatenate([marche, course])
    hist = np.bincount(((x - 40.0) // 2.0).astype(int), minlength=100)
    s = SimpleNamespace(descente={"cellules": [], "reste": [], "unite": "par_pied",
                                  "cadence": [[i, int(c)] for i, c in enumerate(hist) if c]})
    seuil = traits_terrain([s], CFG)["seuil_cadence"]
    assert seuil["marche_spm"] == pytest.approx(112.0, abs=1.0)
    assert seuil["course_spm"] == pytest.approx(172.0, abs=1.0)
    assert seuil["poids_marche"] == pytest.approx(40 / 130, abs=0.01)
    assert 135.0 < seuil["seuil_spm"] < 160.0 and seuil["part_entre_les_seuils"] < 0.01
    # une seule allure : pas de seuil personnel
    une = np.bincount(((course - 40.0) // 2.0).astype(int), minlength=100)
    s1 = SimpleNamespace(descente={"cellules": [], "reste": [], "unite": "par_pied",
                                   "cadence": [[i, int(c)] for i, c in enumerate(une) if c]})
    assert traits_terrain([s1], CFG)["seuil_cadence"] is None


def test_night_enters_the_walk_model():
    cfg = override_config(CFG, "twin.terrain_trait_min_hours=0.05,twin.terrain_trait_shrink_hours=0")
    jour = _sortie(reps=6, hachee_apres=5, depart_h=8)
    nuit = _sortie(reps=6, hachee_apres=1, depart_h=22, jour=datetime(2026, 5, 2, tzinfo=timezone.utc))
    resumes = [process_activity_full(a, cfg)[0] for a in (jour, nuit)]
    assert {c["nuit"] for c in _cellules(resumes[1].descente)} == {1}
    m = traits_terrain(resumes, cfg)["marche"]
    assert m["nuit"] is not None and m["nuit"] > 0


def test_descent_fatigue_lengthens_the_late_descents_and_keeps_the_total():
    from test_phase5_pente import _sawtooth_gpx, _twin, _ultra

    from twin_engine.course import RaceSpec, build_course
    from twin_engine.pacing import build_pacing
    from twin_engine.pipeline import analyze_preview_from_twin
    from twin_engine.twin.pente import repartir

    race = RaceSpec("Dent", (0.0, 4.0, 8.0, 12.0, 16.0), ("d", "m", "s", "m2", "a"))
    course = build_course(_sawtooth_gpx(), race, CFG)
    twin = _twin([_ultra(12, 70.0, 20.0, -6.0), _ultra(20, 110.0, 35.0, -10.0),
                  _ultra(16, 90.0, 26.0, -8.0), _ultra(24, 130.0, 42.0, -12.0),
                  _ultra(18, 100.0, 30.0, -9.0)])
    twin.terrain = {"fatigue_descente": {"relative": {"brut": -0.2, "valeur": -0.2, "heures": 3.0}}}
    fat = override_config(CFG, "pacing.descent_fatigue=dminus")
    base = analyze_preview_from_twin(twin, course, CFG, n_ingested=5)
    servi = analyze_preview_from_twin(twin, course, fat, n_ingested=5)
    assert base.course is course or base.course.repartition is None
    assert servi.prediction.finish_hours == base.prediction.finish_hours
    assert servi.course.repartition == {"curve": "total", "descent_fatigue": -0.2}
    p0 = build_pacing(base.course, base.prediction, race, CFG)
    p1 = build_pacing(servi.course, servi.prediction, race, fat)
    assert p1.t_move_h == pytest.approx(p0.t_move_h, abs=1e-9)
    gain = [b.t_move_min - a.t_move_min for a, b in zip(p0.segments, p1.segments)]
    # les montées cèdent du temps aux descentes, la dernière (la plus de D−) en prend le plus
    assert gain[0] < 0 and gain[1] < 0 and 0 < gain[2] < gain[3]
    # sans mesure, ou hors du drapeau : rien
    twin.terrain = None
    assert analyze_preview_from_twin(twin, course, fat, n_ingested=5).course.repartition is None
    assert repartir(course, None, CFG, phi=None) is course
    # le scoreur rejoue la fatigue depuis le registre
    from twin_engine.twin.pente import fatigue_servie

    assert fatigue_servie({"fatigue_descente": {"relative": {"valeur": -0.2}}}, fat) == -0.2
    assert fatigue_servie({"fatigue_descente": {"relative": {"valeur": -0.2}}}, CFG) is None
    assert fatigue_servie(None, fat) is None


def _gpx(act) -> bytes:
    from _gpx_coros import gpx_coros, point

    pts = [point(float(act.t[i]), float(act.dist_m[i]), float(act.alt_m[i]), hr=150.0,
                 cad_per_foot=float(act.cadence_spm[i]) / 2, lat=float(act.lat[i]),
                 lon=float(act.lon[i])) for i in range(0, act.n, 2)]
    return gpx_coros(pts, start=act.start_time)


def test_the_terrain_tool_sets_an_archive_against_a_race_file(tmp_path, capsys):
    from tools.terrain import main

    archive = tmp_path / "archive"
    archive.mkdir()
    for j in (1, 3):
        (archive / f"s{j}.gpx").write_bytes(_gpx(_sortie(reps=6, hachee_apres=4,
                                                          jour=datetime(2026, 5, j, tzinfo=timezone.utc))))
    course = tmp_path / "course.gpx"
    course.write_bytes(_gpx(_sortie(reps=8, hachee_apres=2, jour=datetime(2026, 6, 1, tzinfo=timezone.utc))))
    assert main(["--activite", str(course), "--archive", str(archive), "--until", "2026-05-31",
                 "--set", "twin.terrain_trait_min_hours=0.05"]) == 0
    sortie = capsys.readouterr().out
    assert "| | archive | course |" in sortie and "pénalité de marche, frais" in sortie
    assert "par_pied 2" in sortie                 # la cadence de ces GPX est écrite par pied
    assert main(["--activite", str(course), "--json"]) == 0
    traits = json.loads(capsys.readouterr().out)
    assert traits["archive"] is None and traits["course"]["n_activites"] == 1


def test_the_descent_windows_one_by_one_add_up_to_the_summary_cells():
    act = _sortie(reps=8, hachee_apres=4)
    cellules = _cellules(resume_descentes(act, CFG))
    fen = fenetres_de_descente(act, CFG)
    assert len(fen) == sum(c["fenetres"] for c in cellules)
    for classe, hache in {(c["classe"], c["hache"]) for c in cellules}:
        s = sum(f["s"] for f in fen if f["classe"] == classe and int(f["hache"]) == hache)
        assert s == sum(c["s"] for c in cellules if c["classe"] == classe and c["hache"] == hache)
    assert all(f["debut_m"] < f["fin_m"] and f["pente"] <= CFG.twin.terrain_descent_grade for f in fen)
    hachees = [f for f in fen if f["hache"]]
    assert hachees and min(f["debut_m"] for f in hachees) > 4 * 1500.0
    assert all(f["nuit"] is False for f in fen)
    assert fenetres_de_descente(_sortie(reps=1, v_course=3.0), override_config(CFG, "twin.terrain_window_m=1e9")) == []
