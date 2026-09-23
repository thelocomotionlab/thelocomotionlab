"""Une entrée du registre de couverture : ce que le moteur a promis, et où le réel est tombé.

Deux producteurs écrivent ces entrées : le banc (``tools/backtest.py``), qui rejoue les
courses passées d'une archive, et le tableau de bord, qui consigne les courses COURUES
avec le plan qu'il a servi. Ils passent tous deux par ce module : deux fabriques
finiraient par ne plus compter la même chose, et c'est le registre qui tranche les
débats de calibration (``docs/twin-registre-couverture.md``).

Agrégats seulement : aucune trace, aucune archive, aucun nom.
"""

from __future__ import annotations

import numpy as np

from .calibration import stops_statistics
from .pacing.plan import fade_delta_from_splits


def bloc_course(course) -> dict:
    return {
        "length_km": round(course.length_km, 1),
        "deq_km": round(course.deq_km, 1),
        "dplus_per_km": round(course.dplus_per_km, 1),
        "slope_kappa": (None if course.slope_kappa is None
                        else [round(k, 4) for k in course.slope_kappa]),
    }


def bloc_modele(*, twin, calibration, sufficiency, cfg, n_activities_used: int,
                n_excluded_until: int = 0, n_skipped_ingest: int = 0) -> dict:
    cal = calibration
    # statistiques personnelles consignées QUEL QUE SOIT le modèle servi : tools/score_plan
    # rejoue la forme du plan (arrêts personnels, fade des moitiés) depuis le registre seul
    w = np.asarray(cal.weights, dtype=float) if cal.weights is not None else np.ones(cal.n_genuine)
    st = stops_statistics(cal.genuine, w, cfg) if cal.n_genuine else None
    return {
        "verdict": sufficiency.verdict,
        # POURQUOI le moteur refuse : sans ce champ, un 🔴 est un mur — on voit que la
        # vente est bloquée, jamais par quel critère. C'est la différence entre « le
        # garde-fou marche » et « le garde-fou refuse mes meilleurs cas ».
        "blocking": [c.name for c in sufficiency.criteria if c.level == "🔴"],
        "regime": cal.regime,
        "link": cal.link,
        "n_genuine": cal.n_genuine,
        "n_eff": round(cal.n_eff, 2),
        "sigma_kmh": round(cal.sigma_kmh, 3),
        "n_activities_used": n_activities_used,
        "n_excluded_until": n_excluded_until,
        "n_skipped_ingest": n_skipped_ingest,
        # Phase 2 : ce que l'athlète apporte au plan et aux arrêts (agrégats)
        "durability_pct": (None if twin.durability_pct is None
                           else round(twin.durability_pct, 1)),
        "fade_delta_splits": (None if (fs := fade_delta_from_splits(cal)) is None
                              else round(fs, 4)),
        "stops_rate_personal": (None if st is None or st["origin"] != "ultras"
                                else round(st["rate"], 4)),
        "stops_rate_sd_log": (None if st is None or st["origin"] != "ultras"
                              else round(st["sd_log"], 4)),
        "stops_ref_hours": (None if st is None or st["ref_hours"] is None
                            else round(st["ref_hours"], 2)),
        "stops_model": cal.stops_model,
        "night_share_mean": (None if cal.night_share_mean is None
                             else round(cal.night_share_mean, 4)),
        "night_coef": None if cal.night_coef is None else round(cal.night_coef, 4),
        # Phase 3 : les trois exposants mesurés (servis ou non) et ce qui a servi
        "alpha": None if twin.alpha is None else round(twin.alpha, 4),
        "alpha_eff": None if twin.alpha_eff is None else round(twin.alpha_eff, 4),
        "alpha_eff_n": (twin.alpha_eff_detail or {}).get("n"),
        "alpha_tail": None if twin.alpha_tail is None else round(twin.alpha_tail, 4),
        "alpha_tail_n": twin.alpha_tail_n,
        "duration_prior_origin": cal.duration_prior_origin,
        "envelope_tail_alpha": None if cal.tail_alpha is None else round(cal.tail_alpha, 4),
        "genuine_floor": cfg.calibration.genuine_floor,
        "level_n_anchored": cal.level_n_anchored,
        "level_shift_mean_pct": (None if cal.level_shift is None
                                 else round(cal.level_shift_mean_pct, 2)),
        # Phase 5 : coût de pente personnel mesuré (servi ou non) et ce qui a servi
        "slope_cost": cal.slope_cost,
        "slope_kappa_up": (None if twin.slope_kappa_up is None
                           else round(twin.slope_kappa_up, 4)),
        "slope_kappa_down": (None if twin.slope_kappa_down is None
                             else round(twin.slope_kappa_down, 4)),
        "slope_hours_up": (twin.slope_detail or {}).get("hours_up"),
        "slope_hours_down": (twin.slope_detail or {}).get("hours_down"),
    }


def bloc_prediction(pred, actual_h: float | None) -> dict:
    cv = pred.cross_validation
    return {
        "central_h": round(pred.finish_hours, 3),
        "plan_low_h": None if pred.plan_low_h is None else round(pred.plan_low_h, 3),
        "plan_high_h": None if pred.plan_high_h is None else round(pred.plan_high_h, 3),
        "safety_low_h": round(pred.interval_low_h, 3),
        "safety_high_h": round(pred.interval_high_h, 3),
        "interval_source": pred.interval_source,
        "cv_mae_pct": None if cv is None else round(cv.mae_pct, 2),
        # sd prédictif relatif et levier de la cible : ceux du moteur (predict.sd_rel_target,
        # predict.leverage_target), une seule définition — en lien log, sd de ln T
        "sd_rel": None if pred.sd_rel is None else round(pred.sd_rel, 4),
        "leverage": None if pred.leverage is None else round(pred.leverage, 3),
        "moving_h": None if pred.moving_hours is None else round(pred.moving_hours, 3),
        "stops_h": None if pred.stops_hours is None else round(pred.stops_hours, 3),
        "night_share_target": (None if pred.night_share_target is None
                               else round(pred.night_share_target, 4)),
        "night_dev": None if pred.night_dev is None else round(pred.night_dev, 4),
        "env_factor": None if pred.env_factor is None else round(pred.env_factor, 4),
        **ecarts(central_h=pred.finish_hours, plan=(pred.plan_low_h, pred.plan_high_h),
                 bornes=(pred.interval_low_h, pred.interval_high_h), actual_h=actual_h),
    }


def ecarts(*, central_h: float, plan, bornes, actual_h: float | None) -> dict:
    """Où le réel est tombé. ``err_pct`` > 0 : le moteur a prédit TROP LENT."""
    lo, hi = plan
    return {
        "err_pct": (None if actual_h is None
                    else round(100.0 * (central_h - actual_h) / actual_h, 2)),
        "in_plan": (None if actual_h is None or lo is None
                    else bool(lo <= actual_h <= hi)),
        "in_safety": (None if actual_h is None
                      else bool(bornes[0] <= actual_h <= bornes[1])),
    }


def sous_le_domaine(actual_h: float | None, pred, cfg) -> bool | None:
    """Cible SOUS le domaine de calibration (efforts ≥ ``genuine_min_hours``) : la
    prédiction est une extrapolation vers le bas — consignée et analysée À PART."""
    ref_h = actual_h if actual_h is not None else (pred.finish_hours if pred else None)
    return None if ref_h is None else bool(ref_h < cfg.calibration.genuine_min_hours)


def bloc_domaine(sufficiency) -> dict | None:
    """Ce que la garde du domaine a LU (demande du parcours)."""
    dom = getattr(sufficiency, "domain", None)
    return None if dom is None else dom.to_dict()


__all__ = ["bloc_course", "bloc_domaine", "bloc_modele", "bloc_prediction", "ecarts",
           "sous_le_domaine"]
