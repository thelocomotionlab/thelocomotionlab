"""Phase 1 du chantier v2 : lien log (A2), prior sur la pente en durée (A1), facteur d'échelle
studentisé (A3) — chacun derrière un flag, défauts inchangés (golden intact, cf. test_golden)."""

from __future__ import annotations

import math
from dataclasses import replace

import numpy as np
import pytest

from twin_engine._stats import student_t_cdf, student_t_quantile, weighted_median
from twin_engine.calibration import build_calibration
from twin_engine.config import load_config, override_config
from twin_engine.predict import (_fixed_point_log, _solve_fixed_point, leave_one_out,
                                 leverage_target, predict_finish, sd_rel_target)
from twin_engine.twin.model import Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve

CFG = load_config()
LOG = override_config(CFG, "calibration.link=log")


def _ultra(hours, vga_kmh, dpk, date="2025-06-01"):
    dist_km = vga_kmh * hours / 1.2
    return ActivitySummary(date=date, sport="running", duration_s=hours * 3600, dist_km=dist_km,
                           ga_km=vga_kmh * hours, avg_hr=140, dplus_m=dpk * dist_km,
                           dminus_m=dpk * dist_km, decouple_pct=10.0, has_hr=True)


def _twin(summaries, alpha=0.18):
    return Twin(critical_speed=None, alpha=alpha, endurance_E=1.0 / (1 - alpha),
                endurance_coef=10.0, durability_pct=20.0,
                record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=summaries)


def _riegel(h, dpk, *, k=9.5, b=-0.07, c=-0.0027):
    """Athlète de Riegel exact : v = k · T^b · exp(c · D+/km)."""
    return k * h**b * math.exp(c * dpk)


_GRID = [(12, 50), (20, 55), (16, 45), (24, 53), (18, 52), (11, 60), (14, 40)]


def _riegel_twin(pert=0.0, seed=0):
    rng = np.random.default_rng(seed)
    return _twin([_ultra(h, _riegel(h, d) * (1 + pert * rng.normal()), d) for h, d in _GRID])


# ----------------------------------------------------------------------------- _stats
def test_student_t_quantiles_match_tables():
    assert student_t_quantile(0.9, 1) == pytest.approx(3.0777, abs=1e-3)
    assert student_t_quantile(0.9, 5) == pytest.approx(1.4759, abs=1e-3)
    assert student_t_quantile(0.75, 5) == pytest.approx(0.7267, abs=1e-3)
    assert student_t_quantile(0.9, 30) == pytest.approx(1.3104, abs=1e-3)
    assert student_t_quantile(0.9, float("inf")) == pytest.approx(1.28155, abs=1e-4)
    assert student_t_quantile(0.1, 5) == pytest.approx(-1.4759, abs=1e-3)
    assert student_t_cdf(2.0, 10) == pytest.approx(0.96331, abs=1e-4)
    assert weighted_median([1, 2, 3, 10], [1, 1, 1, 1]) == 2.0
    assert weighted_median([1, 2, 3, 10], [1, 1, 1, 10]) == 10.0
    with pytest.raises(ValueError):
        student_t_quantile(1.5, 5)


# ----------------------------------------------------------------------------- config
def test_override_config_types_and_rejects_unknown_keys():
    cfg = override_config(CFG, "calibration.link=log, prediction.mc_n=100,pacing.scale_stops=false")
    assert cfg.calibration.link == "log" and cfg.prediction.mc_n == 100
    assert cfg.pacing.scale_stops is False and CFG.calibration.link == "linear"
    assert override_config(CFG, "calibration.duration_shrink_lambda=5").calibration.duration_shrink_lambda == 5.0
    assert override_config(CFG, "prediction.pooled_q50=1.2").prediction.pooled_q50 == 1.2
    for bad in ("calibration.link", "nope.link=log", "calibration.nope=1", "link=log"):
        with pytest.raises(ValueError):
            override_config(CFG, bad)


# ----------------------------------------------------------------------------- A2 : lien log
def test_log_link_recovers_a_riegel_athlete_exactly():
    cal = build_calibration(_riegel_twin(), LOG)
    assert cal.regime == "regression" and cal.link == "log"
    a, b, c = cal.beta
    assert math.exp(a) == pytest.approx(9.5, rel=1e-6)
    assert b == pytest.approx(-0.07, abs=1e-6) and c == pytest.approx(-0.0027, abs=1e-7)
    assert cal.sigma_log == pytest.approx(LOG.calibration.regression_min_sigma_log)   # résidu nul → plancher
    assert cal.sigma_kmh > 0 and cal.to_dict()["link"] == "log"
    # le lien linéaire, lui, ne peut pas être exact sur une loi de puissance
    lin = build_calibration(_riegel_twin(), CFG)
    assert lin.link == "linear" and lin.sigma_log is None


def test_log_fixed_point_is_analytic_and_matches_the_iteration():
    cal = build_calibration(_riegel_twin(), LOG)
    t_an = _fixed_point_log(200.0, 53.0, cal.beta)
    t_it = _solve_fixed_point(200.0, 53.0, cal.predict_vga_kmh, LOG)
    assert t_an == pytest.approx(t_it, rel=1e-6)
    assert t_an * cal.predict_vga_kmh(t_an, 53.0) == pytest.approx(200.0, rel=1e-9)
    assert _fixed_point_log(200.0, 53.0, (2.0, -1.2, 0.0)) is None      # 1 + b ≤ 0 : pas de solution


def test_log_link_bands_are_multiplicatively_symmetric_and_never_negative():
    twin = _riegel_twin(pert=0.04)
    cal = build_calibration(twin, LOG)
    pred = predict_finish(200.0, 53.0, twin, cal, LOG)
    assert pred.interval_source == "conformal_normalized"
    t = pred.finish_hours
    # T·exp(±h) : le rapport haut/central égale le rapport central/bas
    assert pred.interval_high_h / t == pytest.approx(t / pred.interval_low_h, rel=1e-9)
    assert pred.plan_high_h / t == pytest.approx(t / pred.plan_low_h, rel=1e-9)
    assert pred.interval_low_h > 0 and pred.plan_low_h >= pred.interval_low_h
    assert pred.interval_high_h >= pred.plan_high_h
    assert np.all(pred.mc_samples > 0) and pred.sd_rel > 0 and pred.leverage > 0
    # la LOO en log rend les mêmes erreurs relatives qu'en linéaire sur un athlète exact
    cv = leave_one_out(cal, LOG)
    assert cv.n == len(_GRID) and len(cv.fold_log_errors) == cv.n
    assert max(abs(e) for e in cv.errors_pct) < 15


def test_log_link_uses_the_same_weights_in_fit_loo_and_bands():
    """Cohérence fit / LOO / bandes : changer la récence change les trois ensemble."""
    dated = [_ultra(h, _riegel(h, d) * (1 + 0.03 * ((i % 3) - 1)), d,
                    date=f"2025-0{1 + i % 6}-15") for i, (h, d) in enumerate(_GRID)]
    short = override_config(LOG, "calibration.recency_halflife_days=60")
    twin = _twin(dated)
    p_long = predict_finish(200.0, 53.0, twin, build_calibration(twin, LOG), LOG)
    p_short = predict_finish(200.0, 53.0, twin, build_calibration(twin, short), short)
    assert p_long.finish_hours != pytest.approx(p_short.finish_hours, rel=1e-4)
    assert p_long.cross_validation.mae_pct != pytest.approx(p_short.cross_validation.mae_pct, rel=1e-3)


# ----------------------------------------------------------------------------- A1 : prior sur b
def test_duration_prior_pulls_the_slope_and_reduces_the_target_leverage():
    twin = _riegel_twin(pert=0.03)
    free = build_calibration(twin, LOG)
    weak = build_calibration(twin, override_config(LOG, "calibration.duration_term=prior_shrunk,calibration.duration_shrink_lambda=2"))
    strong = build_calibration(twin, override_config(LOG, "calibration.duration_term=prior_shrunk,calibration.duration_shrink_lambda=1e6"))
    assert free.duration_prior is None and weak.duration_prior == (-0.18, 2.0)
    assert weak.duration_prior_origin == "twin_alpha"
    # λ énorme : b → −α ; λ modéré : entre les deux
    assert strong.beta[1] == pytest.approx(-0.18, abs=1e-3)
    assert min(free.beta[1], -0.18) < weak.beta[1] < max(free.beta[1], -0.18)
    # le levier de la cible (32 h, hors de l'enveloppe 11–24 h) baisse avec le prior
    t = 32.0
    assert leverage_target(t, 53.0, weak) < leverage_target(t, 53.0, free)
    assert leverage_target(t, 53.0, strong) < leverage_target(t, 53.0, weak)
    # λ = 0 ⇒ identique à libre
    zero = build_calibration(twin, override_config(LOG, "calibration.duration_term=prior_shrunk,calibration.duration_shrink_lambda=0"))
    assert zero.duration_prior is None and zero.beta == free.beta


def test_duration_prior_falls_back_to_population_and_applies_in_loo():
    twin = replace(_riegel_twin(pert=0.03), alpha=None)
    cfg = override_config(LOG, "calibration.duration_term=prior_shrunk,calibration.duration_shrink_lambda=3")
    cal = build_calibration(twin, cfg)
    assert cal.duration_prior_origin == "population"
    assert cal.duration_prior == (-cfg.calibration.duration_prior_alpha_population, 3.0)
    # le prior entre dans chaque pli : la LOO diffère de celle du modèle libre
    free = build_calibration(twin, LOG)
    assert leave_one_out(cal, cfg).errors_pct != leave_one_out(free, LOG).errors_pct
    # en lien linéaire, le prior est −α·v̄ (km/h par unité de ln T)
    lin = build_calibration(twin, override_config(CFG, "calibration.duration_term=prior_shrunk"))
    v_bar = float(np.average([g.vga_kmh for g in lin.genuine], weights=lin.weights))
    assert lin.duration_prior[0] == pytest.approx(-CFG.calibration.duration_prior_alpha_population * v_bar)


# ----------------------------------------------------------------------------- A3 : échelle studentisée
@pytest.mark.parametrize("link_cfg", [CFG, LOG])
def test_studentized_scale_gives_finite_nested_bands(link_cfg):
    twin = _riegel_twin(pert=0.04)
    for variant in ("studentized_scale", "studentized_scale_mad", "studentized_scale_signed"):
        cfg = override_config(link_cfg, f"prediction.interval_source={variant}")
        pred = predict_finish(200.0, 53.0, twin, build_calibration(twin, cfg), cfg)
        assert pred.interval_source == variant
        assert pred.scale_kappa > 0 and pred.scale_dof >= 1
        assert 0 < pred.interval_low_h <= pred.plan_low_h < pred.finish_hours
        assert pred.finish_hours < pred.plan_high_h <= pred.interval_high_h
        assert np.isfinite([pred.interval_low_h, pred.interval_high_h]).all()


def test_studentized_scale_uses_student_quantiles_and_falls_back_below_four_folds():
    twin = _riegel_twin(pert=0.04)
    cfg = override_config(CFG, "prediction.interval_source=studentized_scale")
    cal = build_calibration(twin, cfg)
    pred = predict_finish(200.0, 53.0, twin, cal, cfg)
    half80 = (pred.interval_high_h - pred.finish_hours) / pred.finish_hours
    half50 = (pred.plan_high_h - pred.finish_hours) / pred.finish_hours
    # rapport des demi-largeurs = rapport des quantiles de Student à ν = n_eff − 3
    assert half80 / half50 == pytest.approx(
        student_t_quantile(0.9, pred.scale_dof) / student_t_quantile(0.75, pred.scale_dof), rel=1e-6)
    assert half80 == pytest.approx(student_t_quantile(0.9, pred.scale_dof) * pred.scale_kappa * pred.sd_rel, rel=1e-6)
    # 3 ultras → 3 plis < 4 : repli MC, κ absent
    few = _twin([_ultra(h, _riegel(h, d), d) for h, d in _GRID[:3]])
    p3 = predict_finish(200.0, 53.0, few, build_calibration(few, cfg), cfg)
    assert p3.interval_source == "mc" and p3.scale_kappa is None


def test_signed_scale_is_asymmetric_when_errors_are_one_sided():
    """Erreurs LOO toutes du même signe : le côté sans pli reprend le κ commun, l'autre le sien."""
    rng = np.random.default_rng(3)
    biased = _twin([_ultra(h, _riegel(h, d) * (1 + 0.05 + 0.01 * abs(rng.normal())), d)
                    for h, d in _GRID])
    cfg = override_config(LOG, "prediction.interval_source=studentized_scale_signed")
    pred = predict_finish(200.0, 53.0, biased, build_calibration(biased, cfg), cfg)
    t = pred.finish_hours
    assert pred.interval_high_h / t != pytest.approx(t / pred.interval_low_h, rel=1e-3)


# ----------------------------------------------------------------------------- défauts intacts
def test_defaults_are_untouched_by_phase_1():
    assert CFG.calibration.link == "linear" and CFG.calibration.duration_term == "free"
    assert CFG.prediction.interval_source == "conformal_normalized"
    twin = _riegel_twin(pert=0.04)
    cal = build_calibration(twin, CFG)
    assert cal.link == "linear" and cal.duration_prior is None and cal.sigma_log is None
    pred = predict_finish(200.0, 53.0, twin, cal, CFG)
    assert pred.scale_kappa is None
    # sd_rel linéaire = levier complet ÷ v, la définition historique du registre
    x0 = np.array([1.0, np.log(pred.finish_hours), 53.0])
    Sb = np.asarray(cal.beta_cov)
    assert pred.sd_rel == pytest.approx(np.sqrt(cal.sigma_kmh**2 + x0 @ Sb @ x0) / pred.v_kmh)
    assert sd_rel_target(pred.finish_hours, pred.v_kmh, 53.0, cal) == pred.sd_rel
