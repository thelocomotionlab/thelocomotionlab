"""Départ et arrivée : les premiers et les derniers km plus vite, le total intact."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_phase5_pente import _sawtooth_gpx  # noqa: E402

from tools.score_plan import _stand_in  # noqa: E402
from twin_engine.config import load_config, override_config  # noqa: E402
from twin_engine.course import RaceSpec, build_course  # noqa: E402
from twin_engine.pacing import build_pacing  # noqa: E402
from twin_engine.pacing.plan import _depart_arrivee  # noqa: E402

CFG = load_config()
RACE = RaceSpec("Dent", (0.0, 4.0, 8.0, 12.0, 16.0), ("d", "m", "s", "m2", "a"))
COURSE = build_course(_sawtooth_gpx(), RACE, CFG)


def _plan(cfg, course=COURSE):
    pred = _stand_in(3.0, course.deq_km, course.dplus_per_km, stops_model="carved", stops_rate=None)
    return build_pacing(course, pred, RACE, cfg)


def _temps(plan) -> np.ndarray:
    return np.array([s.t_move_min for s in plan.segments])


def test_without_gain_the_plan_is_unchanged():
    assert CFG.pacing.start_gain == 0 and CFG.pacing.finish_gain == 0
    nul = override_config(CFG, "pacing.start_share=0.2,pacing.finish_km=7")
    assert np.array_equal(_temps(_plan(nul)), _temps(_plan(CFG)))
    assert np.array_equal(_depart_arrivee(COURSE, nul), np.ones(4))


def test_the_first_and_last_km_go_faster_and_the_total_stays():
    plans = [_plan(CFG), _plan(override_config(CFG, "pacing.start_share=0.25,pacing.start_gain=0.25")),
             _plan(override_config(CFG, "pacing.finish_km=4,pacing.finish_gain=0.25"))]
    assert [p.t_move_h for p in plans] == pytest.approx([plans[0].t_move_h] * 3, abs=1e-9)
    base, dep, arr = (_temps(p) for p in plans)
    assert [x.sum() for x in (base, dep, arr)] == pytest.approx([60 * plans[0].t_move_h] * 3, abs=0.25)
    # le premier quart (4 km, le premier tronçon) rend du temps aux trois autres, au prorata
    assert dep[0] < base[0] and np.all(dep[1:] > base[1:])
    assert dep[1:] / base[1:] == pytest.approx(np.full(3, dep[1] / base[1]), rel=5e-3)  # minutes au dixième
    assert (dep[0] / base[0]) / (dep[1] / base[1]) == pytest.approx(1 / 1.25, rel=5e-3)
    assert arr[-1] < base[-1] and np.all(arr[:-1] > base[:-1])


def test_where_the_zones_overlap_the_larger_gain_holds():
    cfg = override_config(CFG, "pacing.start_share=0.75,pacing.start_gain=0.2,"
                               "pacing.finish_km=12,pacing.finish_gain=0.5")
    # départ sur 0–12 km, arrivée sur 4–16 km : le premier tronçon n'a que le départ
    assert _depart_arrivee(COURSE, cfg) == pytest.approx([1 / 1.2, 1 / 1.5, 1 / 1.5, 1 / 1.5], rel=5e-3)


def test_a_zone_inside_a_segment_weighs_by_the_cost_of_the_served_law():
    cfg = override_config(CFG, "pacing.start_share=0.125,pacing.start_gain=1.0")
    # sous une loi qui fait coûter trois fois plus les 2 premiers km : 3·2 ÷ 2 + 2 sur 3·2 + 2
    loi = COURSE.with_repartition(np.where(COURSE.off_km_grid <= 2.0, 3.0, 1.0), {"curve": "essai"})
    assert _depart_arrivee(loi, cfg)[0] == pytest.approx(5 / 8, rel=1e-2)
    assert _depart_arrivee(loi, cfg)[1:] == pytest.approx([1.0, 1.0, 1.0])
