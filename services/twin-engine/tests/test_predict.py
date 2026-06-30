"""Prédiction : point fixe T=Deq/v(T), Monte-Carlo, validation croisée LOO."""

from __future__ import annotations

import math

import numpy as np

from twin_engine.calibration import build_calibration
from twin_engine.config import load_config
from twin_engine.predict import _solve_fixed_point, leave_one_out, predict_finish
from twin_engine.twin.model import CriticalSpeed, Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve

CFG = load_config()


def _ultra(hours, vga_kmh, dpk):
    dur = hours * 3600
    dist_km = vga_kmh * hours / 1.2
    return ActivitySummary(
        date="2025-06-01", sport="running", duration_s=dur, dist_km=dist_km,
        ga_km=vga_kmh * hours, avg_hr=140, dplus_m=dpk * dist_km, dminus_m=dpk * dist_km,
        decouple_pct=10.0, has_hr=True,
    )


def _twin(summaries, *, vc_ms=None):
    cs = None
    if vc_ms is not None:
        cs = CriticalSpeed(vc_ms, 0.1, 1500, 300, True, 5)
    rec = RecordCurve(np.array([]), np.array([]), np.array([]), [])
    return Twin(critical_speed=cs, alpha=0.18, endurance_E=1.22, endurance_coef=10.0,
                durability_pct=20.0, record=rec, summaries=summaries)


def _plane(h, dpk):
    return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk


def test_fixed_point_constant_speed():
    t = _solve_fixed_point(200.0, 50.0, lambda T, d: 6.0, CFG)
    assert abs(t - 200.0 / 6.0) < 1e-4


def test_prediction_is_self_consistent():
    twin = _twin([_ultra(h, _plane(h, dpk), dpk) for h, dpk in [(12, 50), (20, 55), (15, 45), (24, 53)]])
    cal = build_calibration(twin, CFG)
    deq, dpk = 200.0, 53.0
    pred = predict_finish(deq, dpk, twin, cal, CFG)
    assert pred is not None
    # point fixe : T * v(T) ≈ Deq
    assert abs(pred.finish_hours * pred.v_kmh - deq) < 0.05
    assert abs(pred.v_kmh - cal.predict_vga_kmh(pred.finish_hours, dpk)) < 1e-9
    # intervalle 80 % ordonné et encadrant la médiane
    assert pred.interval_low_h < pred.finish_hours < pred.interval_high_h


def test_monte_carlo_deterministic():
    twin = _twin([_ultra(h, _plane(h, dpk), dpk) for h, dpk in [(12, 50), (20, 55), (15, 45)]])
    cal = build_calibration(twin, CFG)
    p1 = predict_finish(200.0, 53.0, twin, cal, CFG)
    p2 = predict_finish(200.0, 53.0, twin, cal, CFG)
    assert np.array_equal(p1.mc_samples, p2.mc_samples)  # seed fixe → reproductible


def test_leave_one_out_perfect_plane_is_near_zero():
    twin = _twin([_ultra(h, _plane(h, dpk), dpk) for h, dpk in [(12, 50), (20, 55), (15, 45), (24, 53)]])
    cal = build_calibration(twin, CFG)
    cv = leave_one_out(cal, CFG)
    assert cv is not None and cv.n == 4
    # données parfaitement sur le plan → erreur hors-échantillon quasi nulle
    assert cv.mae_pct < 0.5


def test_vc_fraction_present_when_vc_known():
    twin = _twin([_ultra(h, _plane(h, dpk), dpk) for h, dpk in [(12, 50), (20, 55), (15, 45)]], vc_ms=2.9)
    cal = build_calibration(twin, CFG)
    pred = predict_finish(200.0, 53.0, twin, cal, CFG)
    assert pred.vc_fraction is not None
    assert abs(pred.vc_fraction - pred.v_kmh / (2.9 * 3.6)) < 1e-9


def test_no_prediction_when_calibration_insufficient():
    twin = Twin(critical_speed=None, alpha=None, endurance_E=None, endurance_coef=None,
                durability_pct=None, record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=[])
    cal = build_calibration(twin, CFG)
    assert predict_finish(200.0, 53.0, twin, cal, CFG) is None
