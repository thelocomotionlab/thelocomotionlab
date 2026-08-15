"""Construit le contexte d'injection du template LaTeX depuis les objets calculés.

Tout ce que le rapport affiche (valeurs, tables, encadrés d'honnêteté conditionnels) est
calculé ici puis injecté dans report.tex.j2 — le template ne fait que de la mise en page.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from ..calibration import REGIME_BLEND, REGIME_REGRESSION, REGIME_VC_E
from ..feasibility import AMBITIEUX, CONFORTABLE, HORS_DOMAINE, HORS_PORTEE, INDECIDABLE, NOMINAL
from ._format import fr, french_datetime, fr_thousands, hm, tex_escape
from .narrative import build_narrative, vc_frac_band

_REGIME_LABELS = {
    REGIME_REGRESSION: "régression personnelle sur tes vrais ultras",
    REGIME_BLEND: "mélange VC+E recalé (peu d'ultras, confiance réduite)",
    REGIME_VC_E: "extrapolation VC+E seule (aucun ultra proche, confiance faible)",
}

# Mode objectif (ADR 0002) : le mot montré à l'athlète pour chaque régime de faisabilité.
# La science est dans feasibility.py ; ici on ne choisit que le vocabulaire.
_TARGET_REGIME_LABELS = {
    CONFORTABLE: "objectif prudent — tu as de la marge",
    NOMINAL: "objectif réaliste — c'est un plan de pilotage",
    AMBITIEUX: "objectif ambitieux — tenable dans un bon jour, sans marge d'erreur",
    HORS_PORTEE: "objectif hors de portée au vu de tes données actuelles",
    HORS_DOMAINE: "objectif hors du domaine de calibration du moteur",
    INDECIDABLE: "objectif non jugeable — données insuffisantes",
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


def _window_str(s) -> str:
    """Fenêtre d'arrivée d'un segment : en HEURES DE PASSAGE quand l'horloge est connue,
    sinon en heures cumulées. Les jours ne sont omis que si les DEUX bornes tombent le même
    jour que l'arrivée centrale — dès qu'une borne change de jour, on répète le jour sur les
    deux (une fenêtre « 20:13–09:07 » sans jour serait illisible, et « sam. 20:13–09:07 »
    laisserait croire que 09:07 est samedi)."""
    if s.arr_lo_clock and s.arr_hi_clock and s.arr_clock:
        day = s.arr_clock.split()[0]
        if s.arr_lo_clock.split()[0] == day and s.arr_hi_clock.split()[0] == day:
            lo = s.arr_lo_clock.split(" ", 1)[1]
            hi = s.arr_hi_clock.split(" ", 1)[1]
        else:
            lo, hi = s.arr_lo_clock, s.arr_hi_clock
        return tex_escape(f"{lo}–{hi}")
    return f"{fr(s.lo_h, 1)}–{fr(s.hi_h, 1)}\\,h"


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
    target=None,
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
            "window": _window_str(s),
            "night": s.night,
        }
        for s in plan.segments
    ]

    # arrivée finale : heure centrale + DEUX fenêtres en heures de passage, chacune son usage :
    #  - fourchette de course (bande de planification, défaut interquartile) → pilotage,
    #    c'est elle que l'athlète communique à ses proches comme « fenêtre probable » ;
    #  - bornes de sécurité (intervalle de la prédiction, défaut 80 %) → logistique
    #    (barrières horaires, récupération, retour) — jamais un objectif de course.
    last = plan.segments[-1] if plan.segments else None
    arrival_clock = tex_escape(last.arr_clock) if last and last.arr_clock else None
    arrival_window = (
        tex_escape(f"{last.arr_lo_clock} – {last.arr_hi_clock}")
        if last and last.arr_lo_clock and last.arr_hi_clock
        else None
    )
    arrival_safety_window = (
        tex_escape(f"{plan.safety_lo_clock} – {plan.safety_hi_clock}")
        if plan.safety_lo_clock and plan.safety_hi_clock
        else None
    )
    # fourchette de course de l'ARRIVÉE en durées (mêmes bornes que la dernière ligne du plan)
    plan_low = hm(last.lo_h) if last else None
    plan_high = hm(last.hi_h) if last else None

    # mode SCÉNARIOS : quand l'intervalle de sécurité est LARGE relativement à la prédiction
    # (largeur relative > pacing.scenario_rel_width), une valeur centrale unique sur-promet ;
    # le tableau bascule alors en trois scénarios nommés (les bornes de la fourchette de
    # course + le central), que l'athlète RECALE en course : « je passe plus près de la
    # colonne prudente → je vise l'arrivée prudente ».
    rel_width = (
        (prediction.interval_high_h - prediction.interval_low_h) / prediction.finish_hours
        if prediction.finish_hours > 0 else 0.0
    )
    # MODE OBJECTIF (ADR 0002) : les scénarios déclinent la dispersion PRÉDICTIVE — hors sujet
    # quand le plan est ancré sur une durée choisie. On les neutralise plutôt que de laisser
    # trois colonnes probabilistes cohabiter avec une consigne d'exécution.
    on_target = getattr(plan, "anchor", "prediction") == "target"
    scenario_mode = bool(rel_width > cfg.pacing.scenario_rel_width) and not on_target

    def _clock_or_h(clock: str | None, hours: float) -> str:
        return tex_escape(clock) if clock else f"{fr(hours, 1)}\\,h"

    scenario_rows = [
        {
            "idx": s.index,
            "to": tex_escape(s.to),
            "fast": _clock_or_h(s.arr_lo_clock, s.lo_h),
            "central": _clock_or_h(s.arr_clock, s.cum_clock_h),
            "cautious": _clock_or_h(s.arr_hi_clock, s.hi_h),
            "night": s.night,
        }
        for s in plan.segments
    ] if scenario_mode else []

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
        "plan_low": plan_low,
        "plan_high": plan_high,
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
        # bande de PLANIFICATION (fourchette de course des segments) — distincte des bornes
        # de sécurité ci-dessus : deux largeurs, deux usages (pilotage vs logistique)
        "plan_band_pct": fr(
            cfg.pacing.plan_window_high_pct - cfg.pacing.plan_window_low_pct, 0
        ),
        # source réellement servie : quand les bandes sont CONFORMES (calées sur les erreurs
        # LOO réelles), le rapport le dit — la largeur n'est plus la loi supposée du modèle
        "interval_conformal": getattr(prediction, "interval_source", "mc") == "conformal_normalized",
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
        "arrival_clock": arrival_clock,
        "arrival_window": arrival_window,
        "arrival_safety_window": arrival_safety_window,
        "scenario_mode": scenario_mode,
        "scenario_rows": scenario_rows,
        # --- mode OBJECTIF (ADR 0002) ------------------------------------------------------
        # « demandé » ≠ « servi » : une cible refusée reste affichée (avec l'écart chiffré),
        # seul target_mode dit que le PLAN est ancré dessus. Les fenêtres des segments ne
        # veulent alors plus dire « une course sur deux » mais « tolérance d'exécution » :
        # le template DOIT lire target_mode avant de choisir ses mots.
        "target_requested": target is not None,
        "target_mode": on_target,
        "target_hm": hm(target.target_hours) if target else None,
        "target_regime": target.regime if target else None,
        "target_regime_label": (
            tex_escape(_TARGET_REGIME_LABELS.get(target.regime, target.regime))
            if target else None
        ),
        "target_plan_ok": bool(target.plan_ok) if target else False,
        "target_reasons": [tex_escape(r) for r in target.reasons] if target else [],
        # écart signé vs le central prédit : < 0 = l'objectif est plus rapide que la prédiction
        "target_gap_pct": (
            fr(abs(target.gap_vs_central_pct), 1)
            if target and target.gap_vs_central_pct is not None else None
        ),
        "target_faster_than_central": bool(
            target and target.gap_vs_central_pct is not None and target.gap_vs_central_pct < 0
        ),
        "target_speed_gain_pct": (
            fr(abs(target.speed_gain_pct), 1)
            if target and target.speed_gain_pct is not None else None
        ),
        "target_required_v": fr(target.required_v_kmh, 2) if target else None,
        "target_envelope_pct": (
            fr(target.envelope_fraction * 100, 0)
            if target and target.envelope_fraction is not None else None
        ),
        "target_over_envelope": bool(
            target and target.envelope_fraction is not None and target.envelope_fraction > 1.0
        ),
        "target_vc_pct": (
            fr(target.vc_fraction * 100, 0)
            if target and target.vc_fraction is not None else None
        ),
        # demi-largeur RÉELLEMENT servie par le plan (jamais un chiffre en dur dans le texte)
        "target_tolerance_pct": (
            fr(plan.window_tolerance_pct, 1)
            if on_target and plan.window_tolerance_pct is not None else None
        ),
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
