"""Construit le contexte d'injection du template LaTeX depuis les objets calculés.

Tout ce que le rapport affiche (valeurs, tables, encadrés d'honnêteté conditionnels) est
calculé ici puis injecté dans report.tex.j2 — le template ne fait que de la mise en page.
"""

from __future__ import annotations

from datetime import datetime

from ..calibration import REGIME_BLEND, REGIME_REGRESSION, REGIME_VC_E
from ._format import fr, fr_thousands, hm, tex_escape

_REGIME_LABELS = {
    REGIME_REGRESSION: "régression personnelle sur vos vrais ultras",
    REGIME_BLEND: "mélange VC+E recalé (peu d'ultras, confiance réduite)",
    REGIME_VC_E: "extrapolation VC+E seule (aucun ultra proche, confiance faible)",
}


def _pace_str(min_per_km: float) -> str:
    m = int(min_per_km)
    s = round((min_per_km - m) * 60)
    if s == 60:
        m += 1
        s = 0
    return f"{m}:{s:02d}"


def _vc_pace(vc_ms: float) -> str:
    sec = 1000.0 / vc_ms
    return _pace_str(sec / 60.0)


def _night_range(plan) -> tuple[float, float] | None:
    nights = [s for s in plan.segments if s.night]
    if not nights:
        return None
    return nights[0].off1, nights[-1].off1


def build_report_context(
    *,
    course,
    twin,
    calibration,
    prediction,
    plan,
    race,
    sufficiency,
    athlete: str,
    report_ref: str = "LL-TWIN",
    report_version: str = "v1.0",
    report_date: datetime | None = None,
) -> dict:
    cs = twin.critical_speed
    cv = prediction.cross_validation

    demande_rows = [
        {
            "idx": s.index,
            "name": tex_escape(s.to),
            "dist": fr(s.off_len, 1),
            "dplus": fr(s.dplus_m, 0),
            "dminus": fr(s.dminus_m, 0),
            "deq": fr(s.deq_km, 1),
            "grade": fr(s.mean_grade_pct, 1),
            "alt": fr(s.alt_end_m, 0),
        }
        for s in course.segments
    ]

    plan_rows = [
        {
            "idx": s.index,
            "to": tex_escape(s.to),
            "off1": fr(s.off1, 1),
            "dist": fr(s.off_len_km, 1),
            "dplus": fr(s.dplus_m, 0),
            "deq": fr(s.deq_km, 1),
            "vga": fr(s.v_ga_kmh, 2),
            "pace": _pace_str(s.pace_min_km),
            "tmove": fr(s.t_move_min, 0),
            "stop": fr(s.stop_min, 0),
            "arr": tex_escape(s.arr_clock) if s.arr_clock else "—",
            "window": f"{fr(s.lo_h, 1)}–{fr(s.hi_h, 1)}",
            "night": s.night,
        }
        for s in plan.segments
    ]

    night = _night_range(plan)

    return {
        # méta / couverture
        "athlete": tex_escape(athlete),
        "race_name": tex_escape(course.name),
        "report_ref": tex_escape(report_ref),
        "report_version": tex_escape(report_version),
        "report_date": (report_date or datetime(2026, 1, 1)).strftime("%d/%m/%Y"),
        # verdict
        "verdict": sufficiency.verdict,
        "sellable": sufficiency.sellable,
        "sufficiency_reasons": [tex_escape(r) for r in sufficiency.reasons],
        # synthèse / prédiction
        "pred_central": hm(prediction.finish_hours),
        "interval_low": hm(prediction.interval_low_h),
        "interval_high": hm(prediction.interval_high_h),
        "vc_fraction_pct": fr(prediction.vc_fraction * 100, 0) if prediction.vc_fraction else None,
        "regime": prediction.regime,
        "regime_label": _REGIME_LABELS.get(prediction.regime, prediction.regime),
        "has_cv": cv is not None,
        "cv_mae": fr(cv.mae_pct, 1) if cv else None,
        "cv_rmse": fr(cv.rmse_pct, 1) if cv else None,
        "cv_n": cv.n if cv else 0,
        "sigma_kmh": fr(prediction.sigma_kmh, 2),
        # parcours
        "length_km": fr_thousands(course.length_km, 0),
        "dplus_m": fr_thousands(course.dplus_m, 0),
        "dminus_m": fr_thousands(course.dminus_m, 0),
        "deq_km": fr_thousands(course.deq_km, 1),
        "dplus_per_km": fr(course.dplus_per_km, 0),
        "n_segments": len(course.segments),
        "demande_rows": demande_rows,
        # jumeau
        "vc_kmh": fr(cs.vc_kmh, 2) if cs else None,
        "vc_ms": fr(cs.vc_ms, 3) if cs else None,
        "vc_pace": _vc_pace(cs.vc_ms) if cs else None,
        "vc_sd": fr(cs.vc_sd, 2) if cs else None,
        "vc_from_flat": cs.from_flat_efforts if cs else False,
        "dprime": fr(cs.dprime_m, 0) if cs else None,
        "endurance_E": fr(twin.endurance_E, 3) if twin.endurance_E else None,
        "alpha": fr(twin.alpha, 3) if twin.alpha else None,
        "durability_pct": fr(twin.durability_pct, 0) if twin.durability_pct is not None else None,
        "n_activities": twin.summaries.__len__(),
        "n_ultras": calibration.n_genuine,
        # plan
        "plan_rows": plan_rows,
        "t_move_h": hm(plan.t_move_h),
        "t_stops_h": hm(plan.t_stops_h),
        "t_clock_h": hm(plan.t_clock_h),
        "start_time": plan.start_time.strftime("%A %d/%m %H:%M") if plan.start_time else None,
        "sun": plan.sun,
        "night_from_km": fr(night[0], 0) if night else None,
        "night_to_km": fr(night[1], 0) if night else None,
        # honnêteté
        "hr_majority": (sum(1 for a in twin.summaries if a.has_hr) / max(len(twin.summaries), 1)) >= 0.5,
        "durability_known": twin.durability_pct is not None,
        # figures (rempli par le moteur de rendu)
        "figures": {},
    }


__all__ = ["build_report_context"]
