"""La technicité déclarée et la marche prévue en descente (``twin.terrain``).

Sur un parcours en dent de scie (montée de 8 km à +10 %, descente de 8 km à −10 %) : la
technicité déclarée se reporte sur les descentes là où l'athlète marche, sous son drapeau ; la
marche prévue en descente suit le modèle de marche du détecteur et se juge contre celle des
passages.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_phase5_pente import _sawtooth_gpx, _twin, _ultra  # noqa: E402

from twin_engine.config import load_config  # noqa: E402
from twin_engine.course import RaceSpec, build_course  # noqa: E402
from twin_engine.pacing import build_pacing  # noqa: E402
from twin_engine.pipeline import analyze_preview_from_twin  # noqa: E402
from twin_engine.registre.forme import bloc_forme  # noqa: E402
from twin_engine.twin.descentes import secondes_en_descente  # noqa: E402
from twin_engine.twin.mouvement import bilan_par_troncon  # noqa: E402
from twin_engine.twin.terrain import consignes_de_marche, facteur_declare, marche_prevue  # noqa: E402

CFG = load_config()
RACE = RaceSpec("Dent", (0.0, 4.0, 8.0, 12.0, 16.0), ("d", "m", "s", "m2", "a"))
TRAITS = {"marche": {"intercepts": [-0.5, -1.0, -1.5, -2.0], "dminus_par_km": 0.8, "nuit": 0.5}}


def _course(technicite: float = 0.0):
    race = RACE if not technicite else RaceSpec("Dent", RACE.aid_km, RACE.aid_names,
                                                technicity_pct=technicite)
    return build_course(_sawtooth_gpx(), race, CFG)


def _jumeau(ultras=None):
    twin = _twin(ultras or [_ultra(12, 70.0, 20.0, -6.0), _ultra(20, 110.0, 35.0, -10.0),
                            _ultra(16, 90.0, 26.0, -8.0), _ultra(24, 130.0, 42.0, -12.0),
                            _ultra(18, 100.0, 30.0, -9.0)])
    twin.terrain = TRAITS
    return twin


def _par_segment(course, valeurs) -> list[float]:
    off = np.asarray(course.off_km_grid)
    return [float(np.mean(np.asarray(valeurs)[(off >= s.off0) & (off < s.off1)])) for s in course.segments]


def test_the_declared_technicity_goes_to_the_descents_where_the_athlete_walks():
    course = _course(10.0)
    f = facteur_declare(course, TRAITS, CFG)
    par_seg = _par_segment(course, f)
    assert par_seg[:2] == pytest.approx([1.0, 1.0])
    assert par_seg[3] > par_seg[2] > 1.0           # la probabilité de marcher grandit avec le D−
    # la même surcharge que la majoration uniforme, déplacée
    poids = np.asarray(course.grade_factor)
    assert float(np.sum(poids * (f - 1.0))) == pytest.approx(0.10 * float(np.sum(poids)), rel=1e-9)
    # sans modèle de marche : uniforme sur les descentes ; sans technicité : rien
    g = facteur_declare(course, {}, CFG)
    assert _par_segment(course, g)[2] == pytest.approx(_par_segment(course, g)[3], rel=0.01)
    assert facteur_declare(_course(), TRAITS, CFG) is None


def test_the_walking_planned_in_descents_follows_the_walk_model():
    course, twin = _course(), _jumeau()
    res = analyze_preview_from_twin(twin, course, CFG, n_ingested=5)
    plan = build_pacing(res.course, res.prediction, RACE, CFG)
    m = marche_prevue(res.course, plan, TRAITS, CFG)
    assert m[0] == m[1] == 0.0
    # même pente, D− plus grand : on marche plus à la minute de descente
    assert m[3] / plan.segments[3].t_move_min > m[2] / plan.segments[2].t_move_min > 0
    assert marche_prevue(res.course, plan, {}, CFG) is None
    # la consigne « Sur ce segment » : rien sous une minute, les minutes de marche au-delà
    consignes = consignes_de_marche(m)
    assert consignes[0] is None and consignes[3].startswith("descentes : environ ")
    assert consignes_de_marche([0.4, 7.4, 12.6]) == [
        None, "descentes : environ 7 min prévues à la marche", "descentes : environ 15 min prévues à la marche"]


def test_the_plan_shape_sets_planned_against_measured_walking_in_descents():
    course, twin = _course(), _jumeau()
    res = analyze_preview_from_twin(twin, course, CFG, n_ingested=5)
    plan = build_pacing(res.course, res.prediction, RACE, CFG)
    cps = [{"km": s, "name": n, "t_h": None if i == 0 else float(plan.segments[i - 1].cum_clock_h)}
           for i, (s, n) in enumerate(zip(RACE.aid_km, RACE.aid_names))]
    cps[0]["t_h"] = 0.0
    segs = [{"mouvement_h": s.t_move_min / 60.0, "arrets_h": 0.0, "marche_h": 0.5,
             "marche_descente_h": 0.0 if i < 2 else 0.2} for i, s in enumerate(plan.segments)]
    forme = bloc_forme(res.course, RACE, res.prediction, CFG,
                       {"checkpoints": cps, "segments": segs}, terrain=TRAITS)
    tr = forme["mouvement_impose"]["troncons"]
    assert [t["marche_descente_reelle_min"] for t in tr] == [0.0, 0.0, 12.0, 12.0]
    assert tr[0]["marche_descente_prevue_min"] == 0.0 and tr[3]["marche_descente_prevue_min"] > 0
    md = forme["marche_descente"]
    assert md["n"] == 4 and md["reelle_min"] == 24.0
    assert bloc_forme(res.course, RACE, res.prediction, CFG,
                      {"checkpoints": cps, "segments": segs})["mouvement_impose"]["troncons"][3][
        "marche_descente_prevue_min"] is None


def test_the_seconds_in_descent_are_those_of_the_detector_windows():
    t = np.arange(4001.0)
    d = t * 2.0
    alt = np.where(d < 4000.0, 1000.0 + 0.1 * d, 1400.0 - 0.1 * (d - 4000.0))
    m = secondes_en_descente(d, alt, None, CFG)
    assert not m[:1500].any() and m[2300:3900].all()
    cad = np.where(d >= 6000.0, 110.0, 170.0)
    b = bilan_par_troncon(d, None, cad, [0, 2000, 4000], CFG, descente=m)
    assert b[0]["descente_h"] < 0.1 and b[1]["descente_h"] > 0.4
    assert b[1]["marche_descente_h"] == pytest.approx(
        np.count_nonzero(m[3000:4000]) / 3600.0, abs=0.01)
    assert "descente_h" not in bilan_par_troncon(d, None, cad, [0, 4000], CFG)[0]
    assert secondes_en_descente(d, np.full(t.size, np.nan), None, CFG) is None

