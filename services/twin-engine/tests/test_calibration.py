"""Calibration ultra + dégradation §3 : régression / mélange / VC+E seul.

Athlètes synthétiques. Le cas réel (8 ultras → régression du golden) s'active avec
l'archive (test_golden.py).
"""

from __future__ import annotations

import math

import numpy as np

from twin_engine.calibration import (
    REGIME_BLEND,
    REGIME_INSUFFICIENT,
    REGIME_REGRESSION,
    REGIME_VC_E,
    build_calibration,
    select_genuine_ultras,
)
from twin_engine.config import load_config
from twin_engine.twin.model import Twin
from twin_engine.twin.record import RecordCurve

CFG = load_config()


def _ultra(hours, vga_kmh, dpk, *, decouple=10.0):
    dur = hours * 3600
    dist_km = vga_kmh * hours / 1.2     # distance brute < ajustée (Deq > dist)
    return _summary(dur, ga_km=vga_kmh * hours, dist_km=dist_km, dplus=dpk * dist_km, decouple=decouple)


def _summary(dur, *, ga_km, dist_km, dplus, decouple):
    from twin_engine.twin.record import ActivitySummary

    return ActivitySummary(
        date="2025-06-01", sport="running", duration_s=dur, dist_km=dist_km, ga_km=ga_km,
        avg_hr=140, dplus_m=dplus, dminus_m=dplus, decouple_pct=decouple, has_hr=True,
    )


def _twin(summaries, *, alpha=0.18, coef=10.0):
    rec = RecordCurve(np.array([]), np.array([]), np.array([]), [])
    return Twin(
        critical_speed=None, alpha=alpha,
        endurance_E=(1 / (1 - alpha) if alpha else None), endurance_coef=coef,
        durability_pct=None, record=rec, summaries=summaries,
    )


def _plane(h, dpk):
    return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk


# --------------------------------------------------------------------------- #
def test_select_genuine_filters_hikes_and_high_decouple():
    summaries = [
        _ultra(12, 8.0, 50),                 # vrai ultra
        _ultra(11, 4.0, 60),                 # trop lent (rando) → exclu
        _ultra(14, 7.5, 55, decouple=40),    # découplage > 30 → exclu
        _summary(5 * 3600, ga_km=40, dist_km=35, dplus=1500, decouple=5),  # < 10 h → exclu
    ]
    genuine = select_genuine_ultras(summaries, CFG)
    assert len(genuine) == 1
    assert abs(genuine[0].vga_kmh - 8.0) < 1e-6


def test_regression_regime_recovers_plane_and_floors_sigma():
    pts = [(12, 50), (20, 55), (15, 45), (24, 53)]
    twin = _twin([_ultra(h, _plane(h, dpk), dpk) for h, dpk in pts])
    cal = build_calibration(twin, CFG)
    assert cal.regime == REGIME_REGRESSION
    assert cal.supports_cross_validation
    b0, b1, b2 = cal.beta
    assert abs(b0 - 8.5) < 1e-3 and abs(b1 + 0.35) < 1e-3 and abs(b2 + 0.0148) < 1e-4
    # plan parfait → résidu nul → σ ramené au plancher (anti-surconfiance)
    assert cal.sigma_kmh == CFG.calibration.regression_min_sigma_kmh
    assert abs(cal.predict_vga_kmh(30, 53) - _plane(30, 53)) < 1e-3


def test_blend_regime_recalibrates_on_personal_ultra():
    twin = _twin([_ultra(20, 6.8, 52)])      # 1 seul ultra
    cal = build_calibration(twin, CFG)
    assert cal.regime == REGIME_BLEND
    assert not cal.supports_cross_validation
    assert cal.sigma_kmh == CFG.calibration.blend_sigma_kmh
    # le recalage fait passer la prédiction par l'ultra personnel
    assert abs(cal.predict_vga_kmh(20, 52) - 6.8) < 1e-6


def test_vc_e_regime_uses_envelope_only():
    twin = _twin([], alpha=0.18, coef=10.0)   # 0 ultra
    cal = build_calibration(twin, CFG)
    assert cal.regime == REGIME_VC_E
    assert cal.sigma_kmh == CFG.calibration.vc_e_sigma_kmh
    assert not cal.supports_cross_validation
    v = cal.predict_vga_kmh(20, 50)
    expected = 10.0 * (20 * 3600) ** (-0.18) * 3.6 + (-0.0148) * 50
    assert v is not None and abs(v - expected) < 1e-6


def test_insufficient_when_no_ultras_and_no_envelope():
    twin = _twin([], alpha=None, coef=None)
    cal = build_calibration(twin, CFG)
    assert cal.regime == REGIME_INSUFFICIENT
    assert not cal.can_predict
    assert cal.predict_vga_kmh(20, 50) is None


def test_neff_floor_demotes_when_few_recent_ultras():
    """Plancher N_eff : assez d'ultras mais trop peu de RÉCENTS → repli blend (pas de régression)."""
    from datetime import date, timedelta

    from twin_engine.twin.record import ActivitySummary

    ref = date(2026, 1, 1)

    def _du(days_ago, h, dpk):
        dist = _plane(h, dpk) * h / 1.2
        return ActivitySummary(
            (ref - timedelta(days=days_ago)).isoformat(), "running", h * 3600, dist,
            _plane(h, dpk) * h, 140, dpk * dist, dpk * dist, 12, True,
        )

    # 4 vrais ultras (≥ min_ultras_regression) mais 3 datent de ~6 ans → N_eff ≈ 1
    twin = _twin([_du(2, 20, 52), _du(2100, 14, 45), _du(2200, 18, 50), _du(2300, 16, 48)])
    cal = build_calibration(twin, CFG)
    assert cal.regime == REGIME_BLEND
    assert 0 < cal.n_eff < CFG.calibration.min_ultras_regression
    assert not cal.supports_cross_validation
    # cohérence d'affichage : le champ exposé reflète la valeur calculée (pas le défaut 0.0)
    assert cal.to_dict()["n_eff_ultras"] == round(cal.n_eff, 2)
