"""Prédiction : point fixe T=Deq/v(T), Monte-Carlo, validation croisée LOO."""

from __future__ import annotations

import math
from dataclasses import replace
from datetime import date, timedelta

import numpy as np

from twin_engine.calibration import (
    _fit_regression,
    build_calibration,
    recency_weights,
    select_genuine_ultras,
)
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


# --------------------------------------------------------------------------- #
# Monte-Carlo prédictif (revue C3) : β-covariance + point fixe par tirage.
# --------------------------------------------------------------------------- #
def _noisy_ultras():
    return [_ultra(h, _plane(h, dpk) + p, dpk) for h, dpk, p in
            [(12, 50, 0.05), (20, 55, -0.08), (16, 45, 0.03), (24, 53, -0.02), (18, 52, 0.06)]]


def test_beta_covariance_is_valid():
    cal = build_calibration(_twin(_noisy_ultras()), CFG)
    assert cal.beta_cov is not None
    C = np.array(cal.beta_cov)
    assert C.shape == (3, 3) and np.allclose(C, C.T)
    assert np.all(np.linalg.eigvalsh(C) >= -1e-9)      # semi-définie positive


def test_predictive_mc_widens_more_in_extrapolation():
    """C3 : predictive élargit l'intervalle, et DAVANTAGE quand la cible sort de l'enveloppe
    (ln T, D+/km) des ultras d'entraînement (levier). Modes explicites des deux côtés."""
    from dataclasses import replace

    twin = _twin(_noisy_ultras())
    cal = build_calibration(twin, CFG)
    # les deux modes sont demandés EXPLICITEMENT (le défaut livré est « predictive » depuis
    # le 2026-07-02 — verrouillé dans test_config) ; on teste la machine MONTE-CARLO, donc
    # l'intervalle affiché est épinglé sur ses percentiles (le défaut servi est conforme)
    cfg_s = replace(CFG, prediction=replace(CFG.prediction, mc_mode="sigma_only", interval_source="mc"))
    cfg_p = replace(CFG, prediction=replace(CFG.prediction, mc_mode="predictive", interval_source="mc"))

    def relw(pred):
        return (pred.interval_high_h - pred.interval_low_h) / pred.finish_hours

    dpk = 50.0
    deq_in, deq_ex = 110.0, 250.0        # ~16 h (interpolé) vs ~38 h (extrapolé, max = 24 h)
    w_sig_in = relw(predict_finish(deq_in, dpk, twin, cal, cfg_s))
    w_prd_in = relw(predict_finish(deq_in, dpk, twin, cal, cfg_p))
    w_sig_ex = relw(predict_finish(deq_ex, dpk, twin, cal, cfg_s))
    w_prd_ex = relw(predict_finish(deq_ex, dpk, twin, cal, cfg_p))

    assert w_prd_in >= w_sig_in * 0.98               # jamais plus étroit (tolérance MC)
    assert w_prd_ex > w_sig_ex * 1.1                  # extrapolation → nettement plus large
    assert (w_prd_ex / w_sig_ex) > (w_prd_in / w_sig_in)   # le levier croît hors enveloppe

    # la valeur CENTRALE (point fixe) ne bouge pas : seul l'intervalle devient honnête
    assert abs(predict_finish(deq_ex, dpk, twin, cal, cfg_p).finish_hours
               - predict_finish(deq_ex, dpk, twin, cal, cfg_s).finish_hours) < 1e-9


def test_predictive_mc_falls_back_on_blend_regime():
    """C3 : hors régression (pas de β-covariance), predictive retombe sur sigma_only."""
    from dataclasses import replace

    twin = _twin([_ultra(20, 6.8, 52)])
    cal = build_calibration(twin, CFG)
    cfg_p = replace(CFG, prediction=replace(CFG.prediction, mc_mode="predictive"))
    p = predict_finish(200.0, 52.0, twin, cal, cfg_p)
    assert p is not None and p.interval_low_h < p.finish_hours < p.interval_high_h


# --------------------------------------------------------------------------- #
# Pondération par récence (Problème B) : non-stationnarité multi-saisons.
# --------------------------------------------------------------------------- #
def _dated_ultra(iso, hours, vga_kmh, dpk):
    dist_km = vga_kmh * hours / 1.2
    return ActivitySummary(
        date=iso, sport="running", duration_s=hours * 3600, dist_km=dist_km,
        ga_km=vga_kmh * hours, avg_hr=140, dplus_m=dpk * dist_km, dminus_m=dpk * dist_km,
        decouple_pct=12.0, has_hr=True,
    )


def _nonstationary_ultras():
    """9 vrais ultras étalés de 2023 à 2026, à forme CROISSANTE (récents plus rapides)."""
    base = date(2023, 1, 1)
    specs = [(14, 45), (18, 55), (13, 40), (22, 50), (16, 48), (20, 52), (15, 44), (24, 53), (17, 47)]
    out = []
    for k, (h, dpk) in enumerate(specs):
        iso = (base + timedelta(days=135 * k)).isoformat()
        out.append(_dated_ultra(iso, h, _plane(h, dpk) + 0.15 * k, dpk))  # dérive de forme
    return out


def test_recency_weighting_reduces_loo_and_tracks_recent_form():
    twin = _twin(_nonstationary_ultras())
    # on teste le MÉCANISME de récence isolément → terrain libre (le ridge prior_shrunk,
    # défaut, déplace β2 et masquerait la direction « pondéré ⇒ suit la forme récente »)
    cfg_w = replace(CFG, calibration=replace(CFG.calibration, terrain_term="free"))  # demi-vie 365 j
    cfg_u = replace(cfg_w, calibration=replace(cfg_w.calibration, recency_halflife_days=0.0))  # désactivée

    cal_w = build_calibration(twin, cfg_w)
    cal_u = build_calibration(twin, cfg_u)
    assert cal_w.regime == "regression" and cal_u.regime == "regression"
    assert cal_w.n_eff < cal_u.n_eff                      # récence → moins d'ultras « effectifs »

    cv_w = leave_one_out(cal_w, cfg_w)
    cv_u = leave_one_out(cal_u, cfg_u)
    assert cv_w is not None and cv_u is not None
    assert cv_w.mae_pct < cv_u.mae_pct                    # (b) l'erreur LOO baisse grâce à la récence

    pred_w = predict_finish(200.0, 50.0, twin, cal_w, cfg_w)
    pred_u = predict_finish(200.0, 50.0, twin, cal_u, cfg_u)
    # (b) la prédiction se rapproche de la forme RÉCENTE : plus rapide → temps plus court
    assert pred_w.v_kmh > pred_u.v_kmh
    assert pred_w.finish_hours < pred_u.finish_hours


def test_equal_dates_weighting_is_neutral():
    """Dates identiques → poids tous égaux → régression == non pondérée (blinde le golden)."""
    twin = _twin([_ultra(h, _plane(h, dpk), dpk) for h, dpk in [(12, 50), (20, 55), (15, 45), (24, 53)]])
    genuine = select_genuine_ultras(twin.summaries, CFG)
    w = recency_weights(genuine, CFG)
    assert np.allclose(w, 1.0)
    cal = build_calibration(twin, CFG)
    assert cal.weights is not None and np.allclose(cal.weights, 1.0)
    assert abs(cal.n_eff - len(genuine)) < 1e-9
    # sans poids, MÊME mode de terrain que le fit servi (on teste la neutralité des POIDS)
    beta_unweighted, _ = _fit_regression(genuine, cfg=CFG)
    assert np.allclose(cal.beta, beta_unweighted, atol=1e-9)


def test_conformal_interval_calibrated_on_loo_with_guard_and_fallback():
    """S5 : ``interval_source=conformal_normalized`` (défaut) — les DEUX bandes servies
    (bornes de sécurité 80 % ET fourchette de course 50 %) sont étalonnées sur les erreurs
    LOO réelles (scores studentisés × sd prédictif de la cible), emboîtées ; repli MC des
    deux bandes à < 4 plis."""
    pts = [(12, 50, 0.05), (20, 55, -0.08), (16, 45, 0.03), (24, 53, -0.02), (18, 52, 0.06)]
    twin = _twin([_ultra(h, _plane(h, dpk) + p, dpk) for h, dpk, p in pts])
    cfg_m = replace(CFG, prediction=replace(CFG.prediction, interval_source="mc"))
    cal = build_calibration(twin, CFG)
    pred_c = predict_finish(200.0, 53.0, twin, cal, CFG)
    pred_m = predict_finish(200.0, 53.0, twin, cal, cfg_m)
    assert pred_m.interval_source == "mc"
    assert pred_c.interval_source == "conformal_normalized"
    # seule la LARGEUR affichée change : centre et MC identiques
    assert pred_c.finish_hours == pred_m.finish_hours
    assert np.allclose(pred_c.mc_samples, pred_m.mc_samples)
    assert (pred_c.interval_low_h, pred_c.interval_high_h) != (
        pred_m.interval_low_h, pred_m.interval_high_h)
    # en mode mc, la fourchette de course = percentiles du plan (25/75)
    p_lo, p_hi = np.percentile(pred_m.mc_samples,
                               [CFG.pacing.plan_window_low_pct, CFG.pacing.plan_window_high_pct])
    assert abs(pred_m.plan_low_h - p_lo) < 1e-9 and abs(pred_m.plan_high_h - p_hi) < 1e-9
    # en mode conforme, les deux bandes sont EMBOÎTÉES (mêmes scores, q80 ≥ q50) et
    # centrées sur la prédiction (symétrie en erreur relative)
    assert pred_c.interval_low_h <= pred_c.plan_low_h <= pred_c.finish_hours
    assert pred_c.finish_hours <= pred_c.plan_high_h <= pred_c.interval_high_h
    assert (pred_c.plan_high_h - pred_c.plan_low_h) > 0
    # repli honnête : 3 ultras → 3 plis LOO < 4 → source servie = mc, DEUX bandes = MC
    twin3 = _twin([_ultra(h, _plane(h, dpk) + p, dpk) for h, dpk, p in pts[:3]])
    cal3 = build_calibration(twin3, CFG)
    pred3_c = predict_finish(200.0, 53.0, twin3, cal3, CFG)
    pred3_m = predict_finish(200.0, 53.0, twin3, cal3, cfg_m)
    assert pred3_c is not None and pred3_c.interval_source == "mc"
    assert pred3_c.interval_low_h == pred3_m.interval_low_h
    assert pred3_c.interval_high_h == pred3_m.interval_high_h
    assert pred3_c.plan_low_h == pred3_m.plan_low_h
    assert pred3_c.plan_high_h == pred3_m.plan_high_h
