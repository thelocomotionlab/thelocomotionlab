"""Non-régression : cas « Crasse Montagnhard » (athlète « sale ») — filtre de maximalité (§4.1).

Le fixture ``genuine_ultras_montagnhard.fixture.json`` reproduit EXACTEMENT l'échec observé sur
l'archive (LOO 24,8 %, σ 1,528, prédiction 20,68 h — agrégats ré-épinglés post-C1 le 2026-07-02,
enveloppe fittée ; valeurs pré-C1 25,3/1,539/19,63 dans l'historique git) à partir des seuls agrégats des 8 vrais
ultras + 4 artefacts « montre laissée en enregistrement ». Aucune trace GPS, aucune PII : que des
agrégats dérivés (conformes à la politique de purge). Ce test fige la reproduction, puis prouve
que le correctif de maximalité ramène l'erreur < 10 % — SANS jamais retirer d'ultra du golden Nice.

Tous les correctifs sont derrière des flags dont le défaut = comportement actuel : ce fichier les
active explicitement. Le golden (``test_golden.py``) reste, lui, sur les défauts → inchangé.
"""

from __future__ import annotations

import json
import math
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest

from twin_engine.calibration import build_calibration, maximality_weights, select_genuine_ultras
from twin_engine.config import load_config
from twin_engine.predict import leave_one_out, predict_finish
from twin_engine.sufficiency import assess_sufficiency
from twin_engine.twin.model import Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve

CFG = load_config()
FIX = Path(__file__).parent / "fixtures" / "genuine_ultras_montagnhard.fixture.json"
_DATA = json.loads(FIX.read_text(encoding="utf-8"))
_ENV = _DATA["_meta"]["athlete_envelope"]
_COURSE = _DATA["_meta"]["course"]
DEQ, DPK = _COURSE["deq_km"], _COURSE["dplus_per_km"]


def _summaries() -> list[ActivitySummary]:
    return [
        ActivitySummary(**{k: v for k, v in a.items() if not k.startswith("_")})
        for a in _DATA["activities"]
    ]


def _twin(summaries=None) -> Twin:
    """Jumeau reconstruit depuis les agrégats + l'enveloppe d'endurance stockée dans le fixture."""
    return Twin(
        critical_speed=None,
        alpha=_ENV["alpha"],
        endurance_E=_ENV["endurance_E"],
        endurance_coef=_ENV["endurance_coef"],
        durability_pct=None,
        record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
        summaries=_summaries() if summaries is None else summaries,
    )


def _baseline_cfg():
    """Config « ancien comportement » (tous les flags off), INDÉPENDANTE du défaut du repo.

    Le repo livre désormais ``maximality_mode=soft_weight`` + ``gate_policy=honest`` par défaut
    (twin.config.json) ; ces tests reproduisent l'échec de référence et isolent chaque correctif
    en repartant explicitement du baseline — ils restent valides quel que soit le défaut livré."""
    return replace(
        CFG,
        calibration=replace(CFG.calibration, maximality_mode="off", terrain_term="free"),
        sufficiency=replace(CFG.sufficiency, gate_policy="strict"),
        prediction=replace(CFG.prediction, mc_mode="sigma_only",
                           interval_source="mc"),  # baseline historique (pré-conforme)
    )


def _cal_cfg(**cal):
    """Baseline (tous flags off) + surcharges de calibration explicites."""
    base = _baseline_cfg()
    return replace(base, calibration=replace(base.calibration, **cal)) if cal else base


# --------------------------------------------------------------------------- #
# 1. Reproduction EXACTE de l'échec (base de comparaison, garde-fous par défaut)
# --------------------------------------------------------------------------- #
def test_fixture_reproduces_failure():
    cfg = _baseline_cfg()                            # échec de référence = comportement AVANT correctif
    t = _twin()
    cal = build_calibration(t, cfg)
    assert cal.regime == "regression"
    assert cal.n_genuine == 8                        # 8 vrais ultras (4 artefacts écartés, cf. ci-dessous)
    assert cal.n_eff == pytest.approx(4.82, abs=0.05)
    assert cal.sigma_kmh == pytest.approx(1.528, abs=0.02)

    pred = predict_finish(DEQ, DPK, t, cal, cfg)
    assert pred.finish_hours == pytest.approx(20.68, abs=0.2)

    cv = pred.cross_validation
    assert cv.mae_pct == pytest.approx(24.8, abs=0.2)
    assert cv.mae_interpolation_pct == pytest.approx(18.1, abs=0.3)   # les outliers sont en extrapolation


def test_four_recording_artifacts_are_excluded():
    # 4 activités ≥ 10 h à vga < 1,5 km/h (montre laissée en enregistrement) → écartées par ga ≥ 5,5
    assert len(_summaries()) == 12
    assert len(select_genuine_ultras(_summaries(), CFG)) == 8


def test_extrapolation_folds_are_the_boundary_ultras():
    cfg = _baseline_cfg()
    cal = build_calibration(_twin(), cfg)
    cv = leave_one_out(cal, cfg)
    extrap = {cal.genuine[i].date for i in range(len(cal.genuine)) if cv.is_extrapolation[i]}
    assert extrap == {"2022-07-10", "2024-10-04", "2026-05-09"}
    assert cv.n_extrapolation == 3 and cv.n_interpolation == 5


# --------------------------------------------------------------------------- #
# 2. [CŒUR] le filtre de maximalité restaure l'hypothèse d'effort maximal
# --------------------------------------------------------------------------- #
def test_soft_weight_brings_mae_under_10pct():
    cfg = _cal_cfg(maximality_mode="soft_weight")
    t = _twin()
    cal = build_calibration(t, cfg)
    assert cal.regime == "regression" and cal.n_genuine == 8
    assert cal.sigma_kmh < 0.7                        # σ ~divisée par 2–3 (1,528 → ~0,5)
    cv = predict_finish(DEQ, DPK, t, cal, cfg).cross_validation
    assert cv.mae_pct < 10.0                          # 24,8 % → ~9–10 %
    assert cv.mae_interpolation_pct < 8.0             # ~7 %


def test_soft_weight_downweights_easy_run_keeps_the_long_ultras():
    cfg = _cal_cfg(maximality_mode="soft_weight")
    g = select_genuine_ultras(_summaries(), cfg)
    w = maximality_weights(g, _twin(), cfg)
    wm = {g[i].date: float(w[i]) for i in range(len(g))}
    assert wm["2026-04-04"] == pytest.approx(0.0, abs=1e-9)   # footing facile (FC 119) → poids nul
    assert wm["2022-07-10"] == pytest.approx(1.0)             # course dure & raide (FC 152) → gardée
    assert wm["2024-10-04"] > 0.3                             # la 26,2 h RESTE
    assert wm["2023-07-01"] > 0.3                             # la 19,7 h RESTE


def test_hard_filter_drops_only_the_easy_run():
    cfg = _cal_cfg(maximality_mode="hard_filter")
    t = _twin()
    cal = build_calibration(t, cfg)
    assert cal.n_genuine == 7                                 # 8 → 7
    assert {u.date for u in cal.genuine} == {
        "2022-07-10", "2023-05-13", "2023-07-01", "2024-02-17",
        "2024-10-04", "2025-10-19", "2026-05-09",
    }
    cv = predict_finish(DEQ, DPK, t, cal, cfg).cross_validation
    assert cv.mae_pct < 9.5                                   # ~8,7–9 %


# --------------------------------------------------------------------------- #
# 3. [GARDE-FOU] le filtre ne retire AUCUN ultra du golden Nice (ultras near-maximaux)
# --------------------------------------------------------------------------- #
def _golden_twin() -> Twin:
    """Reproduit les 5 ultras synthétiques du golden (test_golden.py) : tous near-maximaux."""
    def _plane(h, dpk):
        return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk

    def _u(h, dpk, pert):
        dist = _plane(h, dpk) * h / 1.2
        return ActivitySummary("2025-06-01", "running", h * 3600, dist,
                               (_plane(h, dpk) + pert) * h, 142, dpk * dist, dpk * dist, 19, True)

    ultras = [(12, 50, 0.05), (20, 55, -0.08), (16, 45, 0.03), (24, 53, -0.02), (18, 52, 0.06)]
    return Twin(critical_speed=None, alpha=0.18, endurance_E=1.22, endurance_coef=4.2,
                durability_pct=20.0, record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=[_u(*u) for u in ultras])


def _twin_with_coef(mult: float) -> Twin:
    return Twin(
        critical_speed=None, alpha=_ENV["alpha"], endurance_E=_ENV["endurance_E"],
        endurance_coef=_ENV["endurance_coef"] * mult, durability_pct=None,
        record=RecordCurve(np.array([]), np.array([]), np.array([]), []), summaries=_summaries(),
    )


def test_self_relative_is_robust_to_envelope_scale_bias():
    """§A : la décision de maximalité est invariante à un biais d'échelle de l'enveloppe.

    Une enveloppe qui SUR-estime le plafond (ici coef ×2) ferait passer des efforts MAXIMAUX sous
    le seuil absolu → écartés à tort. Le mode ``self_relative`` (défaut) les protège en comparant
    aussi ``r`` à un pôle robuste des propres ultras de l'athlète — sans aucun réglage par athlète."""
    def _wmap(mult, reference):
        cfg = _cal_cfg(maximality_mode="soft_weight", maximality_reference=reference)
        g = select_genuine_ultras(_summaries(), cfg)
        w = maximality_weights(g, _twin_with_coef(mult), cfg)
        return {g[i].date: float(w[i]) for i in range(len(g))}

    sr1 = _wmap(1.0, "self_relative")
    sr2 = _wmap(2.0, "self_relative")
    # décision stable entre enveloppe correcte (×1) et biaisée (×2)
    assert sr1["2026-04-04"] == pytest.approx(0.0, abs=1e-9)          # l'easy run reste écarté
    assert sr2["2026-04-04"] == pytest.approx(0.0, abs=1e-9)
    kept_sr2 = sum(1 for v in sr2.values() if v > 0.3)
    assert kept_sr2 >= 6                                              # les efforts maximaux restent

    # a contrario : le mode absolu écarte DAVANTAGE d'ultras quand l'enveloppe est biaisée (fragile)
    ab2 = _wmap(2.0, "envelope_absolute")
    kept_ab2 = sum(1 for v in ab2.values() if v > 0.3)
    assert kept_ab2 < kept_sr2                                        # self_relative garde strictement plus


def test_maximality_removes_no_golden_ultra():
    gt = _golden_twin()
    off = _baseline_cfg()
    soft = _cal_cfg(maximality_mode="soft_weight")
    g = select_genuine_ultras(gt.summaries, soft)
    assert np.allclose(maximality_weights(g, gt, soft), 1.0)   # aucun ultra down-pondéré

    # soft_weight ne change NI la régression NI le nombre d'ultras du golden (vs off explicite)
    assert np.allclose(build_calibration(gt, off).beta, build_calibration(gt, soft).beta)
    assert build_calibration(gt, _cal_cfg(maximality_mode="hard_filter")).n_genuine == 5


# --------------------------------------------------------------------------- #
# 4. [SUPPORT] nettoyage du terrain (§4.2) & gate honnête (§4.3)
# --------------------------------------------------------------------------- #
def test_terrain_none_reduces_double_counting():
    # β2 « libre » sur une vga DÉJÀ ajustée à la pente = double-comptage ; le retirer (2 paramètres)
    # atténue l'outlier D+/km = 104 → la MAE baisse (25,3 % → ~21,7 %).
    cfg = _cal_cfg(terrain_term="none")
    t = _twin()
    cal = build_calibration(t, cfg)
    assert cal.beta[2] == 0.0
    cv = predict_finish(DEQ, DPK, t, cal, cfg).cross_validation
    assert cv.mae_pct < 23.0


def test_prior_shrunk_pulls_beta2_toward_population_prior():
    prior = CFG.calibration.default_dplus_penalty_kmh_per_dpkm
    b_free = build_calibration(_twin(), _cal_cfg(terrain_term="free")).beta[2]
    b_shrunk = build_calibration(
        _twin(), _cal_cfg(terrain_term="prior_shrunk", terrain_shrink_lambda=50.0)
    ).beta[2]
    assert abs(b_shrunk - prior) < abs(b_free - prior)     # le ridge rapproche β2 du prior


def test_honest_gate_reports_interpolation_not_raw_mae():
    base = _baseline_cfg()                           # modèle non pondéré → MAE brute 24,8 % / interp 18,1 %
    t = _twin()
    cal = build_calibration(t, base)
    pred = predict_finish(DEQ, DPK, t, cal, base)

    def _cv_crit(policy):
        cfg = replace(base, sufficiency=replace(base.sufficiency, gate_policy=policy))
        suf = assess_sufficiency(t, cal, pred, cfg)
        return next(c for c in suf.criteria if "validation" in c.name)

    assert _cv_crit("strict").value == pytest.approx(24.8, abs=0.3)   # MAE brute
    honest = _cv_crit("honest")
    assert honest.value == pytest.approx(18.1, abs=0.3)               # MAE d'interpolation
    assert "extrapolation" in honest.detail


def test_combined_core_and_supports_are_consistent():
    # cœur + supports activés ensemble : la MAE reste basse et l'intervalle se resserre.
    cfg = _cal_cfg(maximality_mode="soft_weight", terrain_term="prior_shrunk")
    t = _twin()
    cal = build_calibration(t, cfg)
    pred = predict_finish(DEQ, DPK, t, cal, cfg)
    rel_width = (pred.interval_high_h - pred.interval_low_h) / pred.finish_hours
    assert pred.cross_validation.mae_pct < 10.0
    assert rel_width < 0.35                                # fourchette bien plus étroite qu'au départ (0,61)
