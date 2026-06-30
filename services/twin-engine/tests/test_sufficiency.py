"""Test de suffisance : verdict 🟢/🟠/🔴 et son « pourquoi » (twin-theory §10)."""

from __future__ import annotations

import math
from datetime import date, timedelta

import numpy as np

from twin_engine.calibration import build_calibration
from twin_engine.config import load_config
from twin_engine.predict import predict_finish
from twin_engine.sufficiency import GREEN, ORANGE, RED, assess_sufficiency
from twin_engine.twin.model import Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve

CFG = load_config()
D0 = date(2025, 1, 1)


def _plane(h, dpk):
    return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk


def _run(day_offset, dur_s, *, hr=True):
    return ActivitySummary(
        date=(D0 + timedelta(days=day_offset)).isoformat(), sport="running",
        duration_s=dur_s, dist_km=dur_s / 360, ga_km=dur_s / 360, avg_hr=140 if hr else None,
        dplus_m=200, dminus_m=200, decouple_pct=15 if hr else None, has_hr=hr,
    )


def _ultra(day_offset, hours, dpk):
    dur = hours * 3600
    dist_km = _plane(hours, dpk) * hours / 1.2
    return ActivitySummary(
        date=(D0 + timedelta(days=day_offset)).isoformat(), sport="running", duration_s=dur,
        dist_km=dist_km, ga_km=_plane(hours, dpk) * hours, avg_hr=140,
        dplus_m=dpk * dist_km, dminus_m=dpk * dist_km, decouple_pct=18, has_hr=True,
    )


def _twin(summaries):
    rec = RecordCurve(np.array([]), np.array([]), np.array([]), [])
    return Twin(critical_speed=None, alpha=0.18, endurance_E=1.22, endurance_coef=10.0,
                durability_pct=20.0, record=rec, summaries=summaries)


def _assess(summaries):
    twin = _twin(summaries)
    cal = build_calibration(twin, CFG)
    pred = predict_finish(200.0, 53.0, twin, cal, CFG)
    return assess_sufficiency(twin, cal, pred, CFG), pred


def test_green_when_everything_strong():
    # 130 sorties sur ~7 mois, toutes avec FC, + 4 vrais ultras (régression, LOO ≈ 0)
    summaries = [_run(int(i * 210 / 130), 3600) for i in range(130)]
    summaries += [_ultra(d, h, dpk) for d, (h, dpk) in
                  zip((20, 80, 140, 200), [(12, 50), (20, 55), (16, 45), (24, 53)])]
    suf, pred = _assess(summaries)
    assert pred is not None and pred.cross_validation is not None
    assert suf.verdict == GREEN and suf.sellable


def test_orange_when_few_ultras_and_medium_history():
    # ~70 sorties sur ~4 mois, 1 seul ultra → régime mélange, CV non calculable
    summaries = [_run(int(i * 120 / 70), 3600) for i in range(70)]
    summaries.append(_ultra(60, 20, 52))
    suf, _ = _assess(summaries)
    assert suf.verdict == ORANGE and suf.sellable
    # la CV non calculable ne doit PAS forcer le rouge
    cv = next(c for c in suf.criteria if "validation" in c.name)
    assert cv.level is None


def test_red_when_too_few_usable():
    summaries = [_run(i, 3600) for i in range(30)]  # < 50 exploitables, < 3 mois
    suf, _ = _assess(summaries)
    assert suf.verdict == RED and not suf.sellable


def test_red_when_prediction_impossible():
    # aucune donnée → calibration insuffisante → pas de prédiction → 🔴
    twin = Twin(critical_speed=None, alpha=None, endurance_E=None, endurance_coef=None,
                durability_pct=None, record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=[])
    cal = build_calibration(twin, CFG)
    suf = assess_sufficiency(twin, cal, None, CFG)
    assert suf.verdict == RED and not suf.sellable


def test_reasons_explain_verdict():
    suf, _ = _assess([_run(i, 3600) for i in range(30)])
    assert suf.reasons  # le « pourquoi » est renseigné
    assert any("ne vend pas" in r for r in suf.reasons)
