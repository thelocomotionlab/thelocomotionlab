"""Construit le contexte d'injection du template LaTeX depuis les objets calculés.

Tout ce que le rapport affiche (valeurs, tables, encadrés d'honnêteté conditionnels) est
calculé ici puis injecté dans report.tex.j2 — le template ne fait que de la mise en page.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from ..calibration import REGIME_BLEND, REGIME_REGRESSION, REGIME_VC_E
from ._format import fr, french_datetime, fr_thousands, hm, tex_escape
from .narrative import build_narrative, vc_frac_band

_REGIME_LABELS = {
    REGIME_REGRESSION: "régression personnelle sur tes vrais ultras",
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


def _main_night_span(plan) -> tuple[float, float] | None:
    """Plage de nuit PRINCIPALE = plus long passage contigu de segments de nuit.

    (Reporter min→max des segments de nuit confondrait l'unique nuit longue avec une
    brève tombée de nuit à l'arrivée et laisserait croire à une nuit de bout en bout.)
    """
    runs: list[list] = []
    cur: list = []
    for s in plan.segments:
        if s.night:
            cur.append(s)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    if not runs:
        return None
    longest = max(runs, key=len)
    return longest[0].off1, longest[-1].off1


def _recent_weeks(summaries, n_weeks: int = 4) -> list[dict]:
    """Volume des dernières semaines disponibles (distance + D+), la plus récente en bas."""
    dated = []
    for s in summaries:
        if s.date:
            try:
                dated.append((date.fromisoformat(s.date), s.dist_km, s.dplus_m))
            except ValueError:
                pass
    if not dated:
        return []
    most_recent = max(d for d, _, _ in dated)
    earliest = min(d for d, _, _ in dated)
    weeks = []
    for w in range(n_weeks):
        hi = most_recent - timedelta(days=7 * w)
        lo = hi - timedelta(days=6)
        if hi < earliest:
            break
        wk = [(dist, dp) for d, dist, dp in dated if lo <= d <= hi]
        weeks.append({
            "label": f"{lo.strftime('%d/%m')}–{hi.strftime('%d/%m')}",
            "km": sum(x[0] for x in wk),
            "dplus": sum(x[1] for x in wk),
            "n": len(wk),
        })
    return list(reversed(weeks))


def build_report_context(
    *,
    course,
    twin,
    calibration,
    prediction,
    plan,
    race,
    sufficiency,
    cfg,
    athlete: str,
    report_ref: str = "LL-TWIN",
    report_version: str = "v1.0",
    report_date: datetime | None = None,
) -> dict:
    # contrat : le rapport complet n'est construit que pour une prédiction existante
    # (analyze_full s'arrête au preview si prediction is None) — on le rend explicite.
    if prediction is None:
        raise ValueError("build_report_context requiert une prédiction (depth full uniquement)")
    cs = twin.critical_speed
    cv = prediction.cross_validation

    # VC : n'afficher la valeur que si le moteur la juge PLAUSIBLE (sinon le rapport mettrait
    # en vedette un seuil que le calcul refuse lui-même d'utiliser — incohérence d'honnêteté).
    vc_ok = cs is not None and cs.plausible

    # Gate honnête : la MAE affichée en tête doit être CELLE qui a décidé le verdict
    # (interpolation si gate_policy=honest), la brute restant montrée à côté (transparence).
    cv_interp = cv.mae_interpolation_pct if cv else None
    cv_gate_is_interp = bool(
        cv is not None and cfg.sufficiency.gate_policy == "honest" and cv_interp is not None
    )

    cum_dist = cum_dplus = cum_dminus = 0.0
    demande_rows = []
    for s in course.segments:
        cum_dist += s.off_len
        cum_dplus += s.dplus_m
        cum_dminus += s.dminus_m
        demande_rows.append({
            "idx": s.index,
            "name": tex_escape(s.to),
            "dist": fr(s.off_len, 1),
            "dplus": fr(s.dplus_m, 0),
            "dminus": fr(s.dminus_m, 0),
            "deq": fr(s.deq_km, 1),
            "alt": fr(s.alt_end_m, 0),
            "cum_dist": fr(cum_dist, 1),
            "cum_dplus": fr(cum_dplus, 0),
            "cum_dminus": fr(cum_dminus, 0),
        })

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

    night = _main_night_span(plan)
    weeks = _recent_weeks(twin.summaries, n_weeks=cfg.narrative.recent_weeks)

    ctx = {
        # méta / couverture
        "athlete": tex_escape(athlete),
        "race_name": tex_escape(course.name),
        "report_ref": tex_escape(report_ref),
        "report_version": tex_escape(report_version),
        # date réelle de génération par défaut (l'appelant peut l'injecter pour un test/replay)
        "report_date": (report_date or datetime.now()).strftime("%d/%m/%Y"),
        # verdict
        "verdict": sufficiency.verdict,
        "sellable": sufficiency.sellable,
        "sufficiency_reasons": [tex_escape(r) for r in sufficiency.reasons],
        # synthèse / prédiction
        "pred_central": hm(prediction.finish_hours),
        "interval_low": hm(prediction.interval_low_h),
        "interval_high": hm(prediction.interval_high_h),
        "vc_fraction_pct": fr(prediction.vc_fraction * 100, 0) if prediction.vc_fraction else None,
        # intensité réellement BASSE ? — comparée sur le POURCENTAGE AFFICHÉ (bande unifiée),
        # pour que le conseil et le chiffre lu par l'athlète ne se contredisent jamais
        "vc_low": vc_frac_band(prediction.vc_fraction, cfg) == "low",
        # dérive début→fin du fade, DÉRIVÉE du Δ réellement servi par le plan (T3 : peut être
        # personnalisé par la durabilité mesurée) — jamais un « −15 % » en dur
        "fade_pct": fr(round(
            2 * getattr(plan, "fade_delta_used", cfg.pacing.fade_delta)
            / (1 + getattr(plan, "fade_delta_used", cfg.pacing.fade_delta)) * 100
        ), 0),
        # libellés d'intervalle DÉRIVÉS des percentiles config (plus de « 80 % » en dur)
        "interval_pct": fr(cfg.prediction.interval_high_pct - cfg.prediction.interval_low_pct, 0),
        "interval_tail_low": fr(cfg.prediction.interval_low_pct, 0),
        "interval_tail_high": fr(100 - cfg.prediction.interval_high_pct, 0),
        "regime": prediction.regime,
        "regime_label": _REGIME_LABELS.get(prediction.regime, prediction.regime),
        "has_cv": cv is not None,
        "cv_mae": fr(cv.mae_pct, 1) if cv else None,
        # MAE qui a réellement décidé le verdict (interpolation en gate honnête) + extrapolation
        "cv_gate_mae": fr(cv_interp if cv_gate_is_interp else cv.mae_pct, 1) if cv else None,
        "cv_gate_is_interp": cv_gate_is_interp,
        "cv_extrap_mae": (
            fr(cv.mae_extrapolation_pct, 1)
            if cv is not None and cv.mae_extrapolation_pct is not None
            else None
        ),
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
        # jumeau — la VC n'est affichée que plausible (sinon note d'honnêteté via vc_implausible)
        "vc_kmh": fr(cs.vc_kmh, 2) if vc_ok else None,
        "vc_ms": fr(cs.vc_ms, 3) if vc_ok else None,
        "vc_pace": _vc_pace(cs.vc_ms) if vc_ok else None,
        "vc_sd": fr(cs.vc_sd, 2) if vc_ok else None,
        "vc_from_flat": cs.from_flat_efforts if cs else False,
        "vc_implausible": bool(cs is not None and not cs.plausible),
        # plancher de durée du fit VC réellement servi (dérivé de la config, jamais en dur)
        "vc_floor_min": int(round(max(cfg.twin.vc_window_s[0], cfg.twin.vc_short_effort_floor_s) / 60)),
        "dprime": fr(cs.dprime_m, 0) if vc_ok else None,
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
        "start_time": french_datetime(plan.start_time) if plan.start_time else None,
        "sun": plan.sun,
        "night_from_km": fr(night[0], 0) if night else None,
        "night_to_km": fr(night[1], 0) if night else None,
        # volume d'entraînement récent
        "recent_weeks": [
            {"label": w["label"], "km": fr(w["km"], 0), "dplus": fr(w["dplus"], 0), "n": w["n"]}
            for w in weeks
        ],
        "recent_n_weeks": len(weeks),
        "recent_total_km": fr_thousands(round(sum(w["km"] for w in weeks)), 0) if weeks else None,
        "recent_total_dplus": fr_thousands(round(sum(w["dplus"] for w in weeks)), 0) if weeks else None,
        # honnêteté — « majoritaire » = le même seuil que le critère qualité de suffisance
        "hr_majority": (
            (sum(1 for a in twin.summaries if a.has_hr) / max(len(twin.summaries), 1))
            >= cfg.sufficiency.quality_green_frac
        ),
        "durability_known": twin.durability_pct is not None,
        # figures (rempli par le moteur de rendu)
        "figures": {},
    }
    # couche pédagogique (textes générés à partir des valeurs calculées, jamais en dur)
    ctx.update(build_narrative(course, twin, calibration, prediction, plan, race, cfg))
    return ctx


__all__ = ["build_report_context"]
