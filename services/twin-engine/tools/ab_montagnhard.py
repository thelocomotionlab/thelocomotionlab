"""Protocole A/B reproductible du cas « Crasse Montagnhard » (§5.3 du prompt de robustesse).

Rejoue le fixture ``tests/fixtures/genuine_ultras_montagnhard.fixture.json`` avec chaque flag
isolé puis combinés, et imprime le tableau avant/après :

    sigma_kmh | largeur intervalle 80 % | biais LOO signé | MAE | MAE_interp | MAE_extrap | CV

Le tableau historique (§4 du DIAGNOSTIC) part de la BASELINE « tous flags off » ; le second
tableau (P1, §9.13 — biais de progression) part du DÉFAUT LIVRÉ (twin.config.json tel quel)
et mesure séparément P1a (balayage de la demi-vie de récence) et P1b (terme de tendance
ridgé) — deux A/B distincts, jamais mélangés. ``biais`` = moyenne SIGNÉE pondérée des
erreurs LOO (positif = central trop lent) : c'est lui que P1 cherche à réduire.

Aucune archive requise (tout part des agrégats du fixture + l'enveloppe d'endurance stockée).
Lancement :  python -m tools.ab_montagnhard   (depuis services/twin-engine, paquet installé)
"""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import numpy as np

from twin_engine.config import load_config
from twin_engine.calibration import build_calibration
from twin_engine.predict import leave_one_out, predict_finish
from twin_engine.sufficiency import _lower_is_better
from twin_engine.twin.model import Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve

CFG = load_config()
FIX = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "genuine_ultras_montagnhard.fixture.json"
DATA = json.loads(FIX.read_text(encoding="utf-8"))
ENV = DATA["_meta"]["athlete_envelope"]
COURSE = DATA["_meta"]["course"]
DEQ, DPK = COURSE["deq_km"], COURSE["dplus_per_km"]


def summaries() -> list[ActivitySummary]:
    return [ActivitySummary(**{k: v for k, v in a.items() if not k.startswith("_")})
            for a in DATA["activities"]]


def twin() -> Twin:
    return Twin(critical_speed=None, alpha=ENV["alpha"], endurance_E=ENV["endurance_E"],
                endurance_coef=ENV["endurance_coef"], durability_pct=None,
                record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=summaries())


def baseline():
    """« Ancien comportement » (tous flags off) — indépendant du défaut livré (soft_weight+honest)."""
    return replace(
        CFG,
        calibration=replace(CFG.calibration, maximality_mode="off", terrain_term="free"),
        sufficiency=replace(CFG.sufficiency, gate_policy="strict"),
        prediction=replace(CFG.prediction, mc_mode="sigma_only",
                           interval_source="mc"),  # baseline historique (pré-conforme)
    )


def cfg_with(**cal):
    b = baseline()
    return replace(b, calibration=replace(b.calibration, **cal))


def _signed_bias(cv) -> float:
    """Moyenne SIGNÉE pondérée des erreurs LOO (mêmes poids que la MAE) — positif = trop lent."""
    err = np.asarray(cv.errors_pct, dtype=float)
    w = (np.asarray(cv.fold_weights, dtype=float)
         if len(cv.fold_weights) == len(err) else np.ones_like(err))
    return float(np.sum(w * err) / w.sum())


def row(name: str, cfg) -> str:
    t = twin()
    cal = build_calibration(t, cfg)
    pred = predict_finish(DEQ, DPK, t, cal, cfg)
    cv = pred.cross_validation
    rel_w = (pred.interval_high_h - pred.interval_low_h) / pred.finish_hours
    if cv is None:
        # calibration démotée hors régression (ex. demi-vie courte ⇒ n_eff < 3) : pas de LOO —
        # c'est un RÉSULTAT du balayage (le levier casse le régime), pas une erreur d'outil
        return (f"| {name:<40} | {cal.sigma_kmh:6.3f} | {rel_w:5.2f} |   —   |   —   |   —    "
                f"|   —    | ⚠ {cal.regime} (n_eff={cal.n_eff:.1f}) |")
    s = CFG.sufficiency
    verdict = _lower_is_better(cv.mae_pct, s.cv_error_green_pct, s.cv_error_orange_pct)
    interp = "n/a" if cv.mae_interpolation_pct is None else f"{cv.mae_interpolation_pct:5.1f}"
    extrap = "n/a" if cv.mae_extrapolation_pct is None else f"{cv.mae_extrapolation_pct:5.1f}"
    return (f"| {name:<40} | {cal.sigma_kmh:6.3f} | {rel_w:5.2f} | {_signed_bias(cv):+5.1f} "
            f"| {cv.mae_pct:5.1f} | {interp} | {extrap} | {verdict} |")


def with_predictive(cfg):
    """Active le Monte-Carlo prédictif (β-covariance + point fixe par tirage, revue C3)."""
    return replace(cfg, prediction=replace(cfg.prediction, mc_mode="predictive"))


CONFIGS = [
    ("[BASELINE] récence + terrain libre (3p)", baseline()),
    ("récence, terrain=none (2p) — support 3.2", cfg_with(terrain_term="none")),
    ("récence, terrain=prior_shrunk (3p)", cfg_with(terrain_term="prior_shrunk", terrain_shrink_lambda=50.0)),
    ("maximalité soft — cœur 3.1", cfg_with(maximality_mode="soft_weight")),
    ("maximalité hard — cœur 3.1", cfg_with(maximality_mode="hard_filter")),
    ("maximalité soft + terrain=none (combiné)", cfg_with(maximality_mode="soft_weight", terrain_term="none")),
    ("maximalité soft + prior_shrunk (combiné)",
     cfg_with(maximality_mode="soft_weight", terrain_term="prior_shrunk", terrain_shrink_lambda=50.0)),
    # C3 : mêmes calibrations, mais l'intervalle voit le levier d'extrapolation (i80 ↑ honnête)
    ("[BASELINE] + MC prédictif (C3)", with_predictive(baseline())),
    ("maximalité soft + MC prédictif (C3)", with_predictive(cfg_with(maximality_mode="soft_weight"))),
]


# ---------------------------------------------------------------------------- #
# P1 (§9.13, biais de progression) : base = DÉFAUT LIVRÉ (twin.config.json tel
# quel — maximalité soft, prior_shrunk, MC prédictif, bandes conformes). P1a et
# P1b sont mesurés SÉPARÉMENT (deux mécanismes candidats, jamais mélangés).
# ---------------------------------------------------------------------------- #
def default_cfg(**cal):
    """Défaut livré, surchargé des seuls champs de calibration donnés."""
    return replace(CFG, calibration=replace(CFG.calibration, **cal))


P1_CONFIGS = [
    ("[DÉFAUT livré] demi-vie 365 j, sans tendance", default_cfg()),
    ("P1a — demi-vie 240 j", default_cfg(recency_halflife_days=240.0)),
    ("P1a — demi-vie 180 j", default_cfg(recency_halflife_days=180.0)),
    ("P1a — demi-vie 120 j", default_cfg(recency_halflife_days=120.0)),
    ("P1b — tendance ridge λ=50", default_cfg(trend_term="ridge", trend_ridge_lambda=50.0)),
    ("P1b — tendance ridge λ=10", default_cfg(trend_term="ridge", trend_ridge_lambda=10.0)),
    ("P1b — tendance ridge λ=2", default_cfg(trend_term="ridge", trend_ridge_lambda=2.0)),
    ("P1b — tendance libre λ=0", default_cfg(trend_term="ridge", trend_ridge_lambda=0.0)),
]

# détail par pli imprimé pour ces configurations (le biais de progression se LIT sur les
# plis récents : c'est eux que le central sans tendance prédit trop lents)
P1_DETAILS = ["[DÉFAUT livré] demi-vie 365 j, sans tendance", "P1a — demi-vie 180 j",
              "P1b — tendance ridge λ=10"]


def detail(name: str, cfg) -> None:
    t = twin()
    cal = build_calibration(t, cfg)
    cv = leave_one_out(cal, cfg)
    head = (f"\n· {name} — n_eff={cal.n_eff:.1f}, sigma={cal.sigma_kmh:.3f}"
            + (f", tendance {cal.trend_kmh_per_year:+.3f} km/h/an"
               if cal.trend_kmh_per_year is not None else ""))
    print(head)
    if cv is None or len(cv.errors_pct) != len(cal.genuine):
        print("  (LOO indisponible ou plis incomplets)")
        return
    folds = sorted(zip(cal.genuine, cv.errors_pct, cv.fold_weights),
                   key=lambda x: x[0].date or "")
    for g, err, w in folds:
        print(f"  {g.date}  T={g.hours:5.1f} h  D+/km={g.dplus_per_km:5.1f}  "
              f"poids={w:4.2f}  err LOO={err:+6.1f} %")


def main() -> None:
    print(f"Course cible : Deq={DEQ} km, D+/km={DPK} — enveloppe E={ENV['endurance_E']} "
          f"(alpha={ENV['alpha']}, coef={ENV['endurance_coef']})\n")
    header = ("| Configuration                            | sigma  | i80  | biais |  MAE  | interp | extrap | CV |\n"
              "|------------------------------------------|--------|------|-------|-------|--------|--------|----|")
    print(header)
    for name, cfg in CONFIGS:
        print(row(name, cfg))

    print("\nA/B P1 — biais de progression (§9.13). Base = défaut livré ; P1a et P1b séparés.")
    print(header)
    for name, cfg in P1_CONFIGS:
        print(row(name, cfg))

    print("\nDétail par pli (erreur LOO signée ; le biais de progression vit sur les plis récents) :")
    lookup = dict(P1_CONFIGS)
    for name in P1_DETAILS:
        detail(name, lookup[name])


if __name__ == "__main__":
    main()
