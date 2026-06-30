"""Pacing : fade, conversion d'allure, horloge/nuit (NOAA), fenêtres Monte-Carlo."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import numpy as np

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.pacing import build_pacing, sun_times
from twin_engine.predict import Prediction

CFG = load_config()


def test_sun_times_nice_september():
    sr, ss = sun_times(2026, 9, 25, 43.703, 7.266, 2.0)
    # référence pacing.py : lever ~07:20, coucher ~19:24
    assert 420 < sr < 460          # 7:00–7:40
    assert 1150 < ss < 1180        # 19:10–19:40
    assert ss > sr


def _triangle_gpx(n=300):
    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(n + 1):
        x = 10000.0 * i / n
        ele = 1000.0 * (x / 5000.0) if x <= 5000 else 1000.0 * (2 - x / 5000.0)
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


def _race():
    return RaceSpec(
        "Test", (0.0, 5.0, 10.0), ("départ", "sommet", "arrivée"),
        start_time=datetime(2026, 9, 25, 13, 0, tzinfo=timezone(timedelta(hours=2))),
        lat=43.703, lon=7.266, tz_offset_h=2.0, major_base_indices=(0,),
    )


def _prediction(course, finish=10.0):
    rng = np.random.default_rng(1)
    mc = finish * (1 + rng.normal(0, 0.03, 5000))
    return Prediction(
        finish_hours=finish, v_kmh=course.deq_km / finish, deq_km=course.deq_km,
        dplus_per_km=course.dplus_per_km, interval_low_h=finish * 0.96, interval_high_h=finish * 1.04,
        mc_samples=mc, regime="regression", sigma_kmh=0.14, vc_fraction=0.62, cross_validation=None,
    )


def test_pacing_conserves_clock_and_fades():
    course = build_course(_triangle_gpx(), _race(), CFG)
    pred = _prediction(course, finish=10.0)
    plan = build_pacing(course, pred, _race(), CFG)

    # horloge = mouvement + arrêts ≈ temps prédit
    assert abs(plan.t_clock_h - 10.0) < 0.05
    assert abs((plan.t_move_h + plan.t_stops_h) - plan.t_clock_h) < 1e-6
    # fade : vitesse ajustée qui décroît du début à la fin (dérive contrôlée)
    assert plan.segments[0].v_ga_kmh > plan.segments[-1].v_ga_kmh
    # montée = allure réelle plus lente que la descente
    assert plan.segments[0].pace_min_km > plan.segments[1].pace_min_km


def test_arrival_windows_bracket_median():
    course = build_course(_triangle_gpx(), _race(), CFG)
    plan = build_pacing(course, _prediction(course), _race(), CFG)
    for s in plan.segments:
        assert s.lo_h <= s.cum_clock_h <= s.hi_h     # fenêtre encadre le scénario médian
        assert s.lo_h < s.hi_h


def test_night_detected_for_evening_finish():
    course = build_course(_triangle_gpx(), _race(), CFG)
    plan = build_pacing(course, _prediction(course, finish=10.0), _race(), CFG)
    # départ 13:00 + ~10 h → arrivée ~23:00 → la fin est de nuit
    assert plan.segments[-1].night
    assert plan.sun["sunset"].startswith("19")


def test_pacing_without_logistics_still_produces_paces():
    race = RaceSpec("NoLogi", (0.0, 5.0, 10.0), ("d", "s", "a"))  # pas de départ/lat/lon
    course = build_course(_triangle_gpx(), race, CFG)
    plan = build_pacing(course, _prediction(course), race, CFG)
    assert all(s.arr_clock is None and s.night is False for s in plan.segments)
    assert all(s.v_ga_kmh > 0 for s in plan.segments)
