"""Protocole A/B reproductible du cas « Crasse Montagnhard » (§5.3 du prompt de robustesse).

Rejoue le fixture ``tests/fixtures/genuine_ultras_montagnhard.fixture.json`` avec chaque flag
isolé puis combinés, et imprime le tableau avant/après :

    sigma_kmh | largeur intervalle 80 % | MAE | MAE_interp | MAE_extrap | verdict CV

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
from twin_engine.predict import predict_finish
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
    )


def cfg_with(**cal):
    b = baseline()
    return replace(b, calibration=replace(b.calibration, **cal))


def row(name: str, cfg) -> str:
    t = twin()
    cal = build_calibration(t, cfg)
    pred = predict_finish(DEQ, DPK, t, cal, cfg)
    cv = pred.cross_validation
    rel_w = (pred.interval_high_h - pred.interval_low_h) / pred.finish_hours
    s = CFG.sufficiency
    verdict = _lower_is_better(cv.mae_pct, s.cv_error_green_pct, s.cv_error_orange_pct)
    interp = "n/a" if cv.mae_interpolation_pct is None else f"{cv.mae_interpolation_pct:5.1f}"
    extrap = "n/a" if cv.mae_extrapolation_pct is None else f"{cv.mae_extrapolation_pct:5.1f}"
    return (f"| {name:<40} | {cal.sigma_kmh:6.3f} | {rel_w:5.2f} | {cv.mae_pct:5.1f} "
            f"| {interp} | {extrap} | {verdict} |")


CONFIGS = [
    ("[BASELINE] récence + terrain libre (3p)", baseline()),
    ("récence, terrain=none (2p) — support 3.2", cfg_with(terrain_term="none")),
    ("récence, terrain=prior_shrunk (3p)", cfg_with(terrain_term="prior_shrunk", terrain_shrink_lambda=50.0)),
    ("maximalité soft — cœur 3.1", cfg_with(maximality_mode="soft_weight")),
    ("maximalité hard — cœur 3.1", cfg_with(maximality_mode="hard_filter")),
    ("maximalité soft + terrain=none (combiné)", cfg_with(maximality_mode="soft_weight", terrain_term="none")),
    ("maximalité soft + prior_shrunk (combiné)",
     cfg_with(maximality_mode="soft_weight", terrain_term="prior_shrunk", terrain_shrink_lambda=50.0)),
]


def main() -> None:
    print(f"Course cible : Deq={DEQ} km, D+/km={DPK} — enveloppe E={ENV['endurance_E']} "
          f"(alpha={ENV['alpha']}, coef={ENV['endurance_coef']})\n")
    print("| Configuration                            | sigma  | i80  |  MAE  | interp | extrap | CV |")
    print("|------------------------------------------|--------|------|-------|--------|--------|----|")
    for name, cfg in CONFIGS:
        print(row(name, cfg))


if __name__ == "__main__":
    main()
