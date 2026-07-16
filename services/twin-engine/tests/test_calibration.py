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
    from dataclasses import replace

    pts = [(12, 50), (20, 55), (15, 45), (24, 53)]
    twin = _twin([_ultra(h, _plane(h, dpk), dpk) for h, dpk in pts])
    # récupération EXACTE du plan → terrain libre (le défaut prior_shrunk tire β2 vers le
    # prior population : c'est un biais VOULU, vérifié juste en dessous)
    cfg_free = replace(CFG, calibration=replace(CFG.calibration, terrain_term="free"))
    cal = build_calibration(twin, cfg_free)
    assert cal.regime == REGIME_REGRESSION
    assert cal.supports_cross_validation
    b0, b1, b2 = cal.beta
    assert abs(b0 - 8.5) < 1e-3 and abs(b1 + 0.35) < 1e-3 and abs(b2 + 0.0148) < 1e-4
    # plan parfait → résidu nul → σ ramené au plancher (anti-surconfiance)
    assert cal.sigma_kmh == CFG.calibration.regression_min_sigma_kmh
    assert abs(cal.predict_vga_kmh(30, 53) - _plane(30, 53)) < 1e-3
    # défaut prior_shrunk : β2 atterrit ENTRE le plan (−0,0148) et le prior population
    cal_d = build_calibration(twin, CFG)
    prior = CFG.calibration.default_dplus_penalty_kmh_per_dpkm
    lo, hi = sorted((-0.0148, prior))
    assert lo - 1e-9 <= cal_d.beta[2] <= hi + 1e-9


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
    # pénalité D+ = le prior CONFIG (recapturé post-C1), jamais une valeur en dur dans le test
    expected = (10.0 * (20 * 3600) ** (-0.18) * 3.6
                + CFG.calibration.default_dplus_penalty_kmh_per_dpkm * 50)
    assert v is not None and abs(v - expected) < 1e-6


def test_insufficient_when_no_ultras_and_no_envelope():
    twin = _twin([], alpha=None, coef=None)
    cal = build_calibration(twin, CFG)
    assert cal.regime == REGIME_INSUFFICIENT
    assert not cal.can_predict
    assert cal.predict_vga_kmh(20, 50) is None


def test_blend_offset_is_recency_weighted():
    """C4 : le recalage du blend suit les MÊMES poids que la régression (récence × maximalité).

    Cas démoté (3 ultras mais N_eff < 3) : deux vieux ultras « lents » ne doivent pas tirer
    le recalage vers une forme périmée — avant le correctif, l'offset était une moyenne NON
    pondérée et l'athlète héritait d'un niveau moyen vieux de 6 ans."""
    from datetime import date, timedelta

    from twin_engine.twin.record import ActivitySummary

    ref = date(2026, 1, 1)

    def _base(h, dpk):     # enveloppe du _twin (alpha 0.18, coef 10) + pénalité D+ prior
        return 10.0 * (h * 3600) ** (-0.18) * 3.6 + CFG.calibration.default_dplus_penalty_kmh_per_dpkm * dpk

    def _du(days_ago, h, dpk, vga):
        dist = vga * h / 1.2
        return ActivitySummary(
            (ref - timedelta(days=days_ago)).isoformat(), "running", h * 3600, dist,
            vga * h, 140, dpk * dist, dpk * dist, 12, True,
        )

    recent = _du(2, 20, 52, _base(20, 52) + 2.0)        # forme actuelle : offset vrai +2,0
    old1 = _du(2200, 14, 45, _base(14, 45) + 0.3)       # vieux (≈6 ans) : offset +0,3
    old2 = _du(2300, 18, 50, _base(18, 50) + 0.3)
    twin = _twin([recent, old1, old2])
    cal = build_calibration(twin, CFG)
    assert cal.regime == REGIME_BLEND                    # démoté par le plancher N_eff
    # l'offset reflète la forme RÉCENTE (~+2,0), pas la moyenne non pondérée (~+0,87)
    assert abs(cal.offset_kmh - 2.0) < 0.1
    assert abs(cal.predict_vga_kmh(20, 52) - (_base(20, 52) + 2.0)) < 0.1


# --------------------------------------------------------------------------- #
# Terme de tendance temporelle (P1b, DIAGNOSTIC §9.13) : biais de progression.
# --------------------------------------------------------------------------- #
def _dated(iso, h, dpk, vga):
    dist = vga * h / 1.2
    return _summary_dated(iso, h * 3600, ga_km=vga * h, dist_km=dist, dplus=dpk * dist)


def _summary_dated(iso, dur, *, ga_km, dist_km, dplus):
    from twin_engine.twin.record import ActivitySummary

    return ActivitySummary(
        date=iso, sport="running", duration_s=dur, dist_km=dist_km, ga_km=ga_km,
        avg_hr=140, dplus_m=dplus, dminus_m=dplus, decouple_pct=12.0, has_hr=True,
    )


def _plane_fast(h, dpk):
    """Plan relevé (les vieux ultras d'un athlète en progression doivent rester > 5,5 km/h)."""
    return 9.5 - 0.35 * math.log(h) - 0.0148 * dpk


def _progressing(slope=0.4):
    """7 vrais ultras EXACTEMENT sur plan + tendance linéaire (``slope`` km/h par an)."""
    from datetime import date, timedelta

    ref = date(2026, 6, 1)
    specs = [(0.0, 14, 50), (0.5, 12, 55), (1.0, 20, 48), (1.5, 16, 52),
             (2.0, 13, 45), (2.5, 18, 58), (3.0, 15, 50)]
    out = []
    for years_ago, h, dpk in specs:
        days = round(years_ago * 365.25)
        vga = _plane_fast(h, dpk) - slope * (days / 365.25)  # années EXACTES de l'axe (365,25 j)
        out.append(_dated((ref - timedelta(days=days)).isoformat(), h, dpk, vga))
    return out


def _cfg_trend(lam=1e-6, mode="ridge"):
    """Mécanisme de tendance isolé : récence désactivée, terrain libre (comme le test récence)."""
    from dataclasses import replace

    return replace(CFG, calibration=replace(
        CFG.calibration, trend_term=mode, trend_ridge_lambda=lam,
        recency_halflife_days=0.0, terrain_term="free"))


def test_trend_term_recovers_progression_and_projects_current_form():
    """P1b : sur une progression linéaire exacte, β3 récupère la pente et la prédiction sert
    la forme PROJETÉE à la date du dernier ultra ; sans le flag, le central reste ancré sur
    la forme moyenne passée (trop lent) — le biais mesuré au registre."""
    twin = _twin(_progressing())
    cal_on = build_calibration(twin, _cfg_trend())
    cal_off = build_calibration(twin, _cfg_trend(mode="off"))
    assert cal_on.regime == REGIME_REGRESSION
    assert cal_on.trend_kmh_per_year is not None
    assert abs(cal_on.trend_kmh_per_year - 0.4) < 0.02
    want = _plane_fast(17, 51)                     # forme « du jour » (tendance projetée à 0)
    assert abs(cal_on.predict_vga_kmh(17, 51) - want) < 0.02
    # sans tendance : ancrage ≈ 1,4 an dans le passé à 0,4 km/h/an ⇒ nettement sous le plan
    assert cal_off.predict_vga_kmh(17, 51) < want - 0.3
    assert cal_off.trend_kmh_per_year is None
    # données exactes → résidus quasi nuls → σ au plancher (les 4 paramètres n'explosent pas σ)
    assert cal_on.sigma_kmh == CFG.calibration.regression_min_sigma_kmh
    # transparence : note + export
    assert any("Tendance de forme" in n for n in cal_on.notes)
    assert cal_on.to_dict()["trend_kmh_per_year"] == round(cal_on.trend_kmh_per_year, 4)


def test_trend_ridge_to_infinity_is_noop():
    """Ridge → ∞ ⇒ β3 étranglé à 0 et β identiques au flag off (no-op par construction)."""
    twin = _twin(_progressing())
    cal_inf = build_calibration(twin, _cfg_trend(lam=1e9))
    cal_off = build_calibration(twin, _cfg_trend(mode="off"))
    assert cal_inf.trend_kmh_per_year is not None and abs(cal_inf.trend_kmh_per_year) < 1e-3
    assert np.allclose(cal_inf.beta, cal_off.beta, atol=1e-3)


def test_trend_term_falls_back_without_usable_dates():
    """Axe temporel non établissable (dates identiques, ou un ultra non daté) → régression
    STRICTEMENT identique au flag off + note explicite. On n'invente jamais une pente."""
    # dates toutes identiques (helper _ultra : 2025-06-01)
    twin = _twin([_ultra(h, _plane(h, dpk), dpk) for h, dpk in [(12, 50), (20, 55), (15, 45), (24, 53)]])
    cal_on = build_calibration(twin, _cfg_trend())
    cal_off = build_calibration(twin, _cfg_trend(mode="off"))
    assert cal_on.trend_kmh_per_year is None
    assert cal_on.beta == cal_off.beta and cal_on.sigma_kmh == cal_off.sigma_kmh
    assert any("axe temporel non établissable" in n for n in cal_on.notes)
    # un ultra NON daté parmi des datés
    ultras = _progressing()[:4] + [_dated(None, 15, 50, _plane_fast(15, 50))]
    twin2 = _twin(ultras)
    cal2_on = build_calibration(twin2, _cfg_trend())
    cal2_off = build_calibration(twin2, _cfg_trend(mode="off"))
    assert cal2_on.trend_kmh_per_year is None
    assert cal2_on.beta == cal2_off.beta
    assert any("axe temporel non établissable" in n for n in cal2_on.notes)


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
