"""Construit le contexte d'injection du template LaTeX depuis les objets calculés.

Tout ce que le rapport affiche (valeurs, tables, encadrés d'honnêteté conditionnels) est
calculé ici puis injecté dans report.tex.j2 — le template ne fait que de la mise en page.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import numpy as np

from ..calibration import REGIME_BLEND, REGIME_REGRESSION, REGIME_VC_E, stops_statistics
from ..feasibility import AMBITIEUX, CONFORTABLE, HORS_DOMAINE, HORS_PORTEE, INDECIDABLE, NOMINAL
from ..sufficiency import GREEN, ORANGE, RED
from ._format import courses_sur, fr, french_datetime, fr_thousands, hm, tex_escape
from .livrables import crew_points, finish_point
from .narrative import build_narrative, vc_frac_band

def _pente_servie(twin, calibration, cfg) -> str | None:
    """Phrase du rapport quand la pente au-delà de 6 h vient d'ailleurs que de l'exposant
    historique : queue de l'enveloppe (replis), source du prior (régression), recalage sur
    le niveau actuel (Phase 3). None quand rien de tout cela n'a servi."""
    parts: list[str] = []
    tail_a = getattr(calibration, "tail_alpha", None)
    if tail_a is not None and calibration.regime in ("blend", "vc_e"):
        src = {"efficiency": "ton efficacité à effort donné", "record_tail":
               "tes fenêtres les plus longues (queue de ta courbe record)"}.get(
            getattr(calibration, "tail_source", None), "tes données")
        parts.append(f"au-delà de {int(round((calibration.tail_from_s or 0) / 3600))} h, ton "
                     f"enveloppe décroît avec l'exposant {fr(tail_a, 3)}, lu sur {src}, au lieu "
                     f"de {fr(twin.alpha, 3) if twin.alpha else '?'}")
    origin = getattr(calibration, "duration_prior_origin", None)
    if origin in ("efficiency", "record_tail") and calibration.duration_prior is not None:
        src = {"efficiency": "ton exposant d'efficacité-durée",
               "record_tail": "l'exposant de tes fenêtres les plus longues"}[origin]
        parts.append(f"la pente de ta régression est tirée vers {src} "
                     f"({fr(-calibration.duration_prior[0], 3)})")
    n_anch = getattr(calibration, "level_n_anchored", 0)
    if n_anch:
        parts.append(f"{n_anch} de tes {calibration.n_genuine} ultras ont été ramenés à ton niveau "
                     f"actuel (vitesse critique de leur époque contre aujourd'hui, "
                     f"{fr(calibration.level_shift_mean_pct, 1)} % en moyenne)")
    if not parts:
        return None
    text = " ; ".join(parts)
    return tex_escape(text[0].upper() + text[1:] + ".")


def _cout_de_pente(twin, course, cfg) -> str | None:
    """Phrase du rapport quand le parcours et la calibration sont servis sous le coût de pente
    personnel de l'athlète (Phase 5) : ce qui a été mesuré, ce que ça change à ±10 %, la
    distance équivalente qui en résulte. None sous la loi de Minetti."""
    kappa = getattr(course, "slope_kappa", None)
    if kappa is None:
        return None
    from ..minetti import grade_factor

    ku, kd = kappa
    det = getattr(twin, "slope_detail", None) or {}
    f_up = float(grade_factor(0.10, cfg.course.cr0))
    f_down = float(grade_factor(-0.10, cfg.course.cr0))
    up_pct = 100.0 * ((1.0 + ku * (f_up - 1.0)) / f_up - 1.0)
    down_pct = 100.0 * ((1.0 + kd * (f_down - 1.0)) / f_down - 1.0)

    def _vs(pct: float) -> str:
        return f"{fr(abs(pct), 0)} % de {'plus' if pct >= 0 else 'moins'} que la loi"

    txt = (f"Mesuré sur {fr(det.get('hours_up', 0.0), 0)} h de montée et "
           f"{fr(det.get('hours_down', 0.0), 0)} h de descente avec fréquence cardiaque : à effort "
           f"égal, un mètre à +10 % te coûte {_vs(up_pct)}, un mètre à 10 % de descente "
           f"{_vs(down_pct)}. Le moteur applique ces facteurs ({fr(ku, 2)} sur le surcoût de "
           f"montée, {fr(kd, 2)} sur celui de descente) à tes courses comme à ce parcours, dont "
           f"la distance équivalente vaut {fr(course.deq_km, 1)} km.")
    return tex_escape(txt)


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
    report_version: str | None = None,
    report_date: datetime | None = None,
    target=None,
) -> dict:
    # contrat : le rapport complet n'est construit que pour une prédiction existante
    # (analyze_full s'arrête au preview si prediction is None) — on le rend explicite.
    if prediction is None:
        raise ValueError("build_report_context requiert une prédiction (depth full uniquement)")
    if report_version is None:
        report_version = cfg.report.version
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

    # MODE OBJECTIF (ADR 0002) : le plan est ancré sur une durée CHOISIE — les colonnes du plan
    # cessent d'être trois scénarios probabilistes pour devenir les bornes d'une tolérance
    # d'exécution. Le gabarit LIT ce drapeau avant de choisir ses mots.
    on_target = getattr(plan, "anchor", "prediction") == "target"

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
        "interval_conformal": getattr(prediction, "interval_source", "mc").startswith(
            ("conformal_normalized", "studentized_scale")),
        # le gabarit nomme la méthode : quantile conforme ou facteur d'échelle studentisé
        "interval_studentized": getattr(prediction, "interval_source", "mc").startswith(
            "studentized_scale"),
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
        # TERRAIN DÉCLARÉ : le Deq affiché est majoré — le rapport doit le dire, sinon il
        # présente une hypothèse d'entrée comme une mesure du moteur.
        "technicity_pct": (fr(course.technicity_pct, 0)
                           if getattr(course, "technicity_pct", 0) else None),
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
        # Phase 3 : exposants mesurés au-delà de 6 h et ce qui a réellement servi à la pente
        "alpha_eff": fr(twin.alpha_eff, 3) if getattr(twin, "alpha_eff", None) else None,
        "alpha_tail": fr(twin.alpha_tail, 3) if getattr(twin, "alpha_tail", None) else None,
        "pente_servie": _pente_servie(twin, calibration, cfg),
        "cout_de_pente": _cout_de_pente(twin, course, cfg),
        "durability_pct": fr(twin.durability_pct, 0) if twin.durability_pct is not None else None,
        "n_activities": twin.summaries.__len__(),
        "n_ultras": calibration.n_genuine,
        # plan
        "plan_rows": plan_rows,
        "t_move_h": hm(plan.t_move_h),
        "t_stops_h": hm(plan.t_stops_h),
        "t_clock_h": hm(plan.t_clock_h),
        # Phase 2 : ce qui a servi — source du fade et modèle d'arrêts (le gabarit change de
        # mots quand les arrêts sont ceux de l'athlète et non la politique du plan)
        "fade_source_used": getattr(plan, "fade_source_used", "config"),
        "stops_model": getattr(plan, "stops_model", "carved"),
        "stops_rate_min_per_h": (None if getattr(plan, "stops_rate", None) is None
                                 else fr(plan.stops_rate * 60.0, 0)),
        "arrival_clock": arrival_clock,
        "arrival_window": arrival_window,
        "arrival_safety_window": arrival_safety_window,
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
    # rapport v2 : couverture, verdict en mots, jauges, consignes, limites, assistance, annexe
    ctx.update(_v2_context(ctx, course=course, twin=twin, calibration=calibration,
                           prediction=prediction, plan=plan, race=race,
                           sufficiency=sufficiency, cfg=cfg, athlete=athlete,
                           report_ref=report_ref, target=target))
    return ctx


# --------------------------------------------------------------------------- #
# Rapport v2 (Phase 6) : ce que les six pages disent, dérivé des objets calculés.
# --------------------------------------------------------------------------- #
_CONFIDENCE = {
    GREEN: ("confiance pleine", "LLSuccess"),
    ORANGE: ("confiance réduite", "LLAccentInk"),
    RED: ("pas vendable en l'état", "LLDeepDark"),
}


def _clamp(x: float) -> float:
    return float(min(max(x, 0.0), 1.0))


def _consigne(seg, cfg) -> str:
    """Consigne d'un segment, lue sur sa pente moyenne et sur la nuit."""
    steep, gentle = cfg.report.consigne_steep_pct, cfg.report.consigne_gentle_pct
    g = seg.mean_grade_pct
    if g >= steep:
        base = "marche dès que ça grimpe, mange en montant"
    elif g >= gentle:
        base = "petites foulées, sans forcer"
    elif g <= -steep:
        base = "foulée courte, cadence haute, protège tes quadriceps"
    elif g <= -gentle:
        base = "laisse rouler sans freiner"
    else:
        base = "allure régulière, bois et mange"
    return base + (" · frontale" if seg.night else "")


def _gauges(ctx: dict, twin, calibration, plan, cfg, stops_budget: dict | None) -> list[dict]:
    r = cfg.report
    cs = twin.critical_speed
    vc_ok = cs is not None and cs.plausible
    lo, hi = r.gauge_vc_kmh
    e_hi, e_lo = r.gauge_endurance_e
    pw, dw = ctx.get("profile_word"), ctx.get("durability_word")
    gauges = [{
        "label": "Vitesse critique",
        "value": f"{fr(cs.vc_kmh, 1)} km/h" if vc_ok else "non affichée",
        "fraction": _clamp((cs.vc_kmh - lo) / (hi - lo)) if vc_ok else 0.0,
        "sentence": ("ta frontière entre « je tiens longtemps » et « ça brûle », mesurée sur tes "
                     "efforts plats" if vc_ok else
                     "estimation hors du plausible : ni affichée ni utilisée"),
    }, {
        "label": "Endurance",
        "value": f"E = {fr(twin.endurance_E, 2)}" if twin.endurance_E else "non mesurée",
        "fraction": _clamp((e_hi - twin.endurance_E) / (e_hi - e_lo)) if twin.endurance_E else 0.0,
        "sentence": {"diesel": "ton allure baisse peu quand la durée s'allonge : un profil diesel",
                     "équilibré": "ton allure baisse comme celle de la plupart des ultra-traileurs",
                     "fade": "ton allure baisse nettement avec la durée : garde de la marge tôt"}.get(
            pw or "", "à quelle vitesse ton allure soutenable baisse quand la durée s'allonge"),
    }, {
        "label": "Durabilité",
        "value": (f"{fr(twin.durability_pct, 0)} % de découplage" if twin.durability_pct is not None
                  else "non chiffrée"),
        "fraction": (_clamp(1.0 - twin.durability_pct / r.gauge_durability_pct)
                     if twin.durability_pct is not None else 0.0),
        "sentence": {"excellente": "ton efficacité tient jusqu'au bout de tes longues sorties",
                     "bonne": "ton efficacité baisse modérément en fin de longue sortie",
                     "à surveiller": "ton efficacité chute nettement en fin d'effort : le point à gérer"}.get(
            dw or "", "la fréquence cardiaque manque sur tes longues sorties"),
    }, {
        "label": "Arrêts",
        "value": (f"{fr(stops_budget['rate_min_per_h'], 0)} min par heure" if stops_budget
                  else "non mesurés"),
        "fraction": (_clamp(1.0 - stops_budget["rate_min_per_h"] / r.gauge_stops_min_per_h)
                     if stops_budget else 0.0),
        "sentence": (f"mesurés sur {stops_budget['n']} de tes ultras : le temps que tu passes "
                     "aux ravitos et à l'arrêt" if stops_budget else
                     "aucun ultra avec des arrêts mesurés dans ton archive"),
    }]
    return [{**g, "label": tex_escape(g["label"]), "value": tex_escape(g["value"]),
             "sentence": tex_escape(g["sentence"]), "fraction": round(g["fraction"], 3)}
            for g in gauges]


def _stops_budget(calibration, plan, cfg) -> dict | None:
    """Le budget d'arrêts PERSONNEL (taux mesuré sur les ultras × mouvement du plan) :
    une information de logistique à côté de la politique du plan, jamais sa répartition."""
    genuine = list(calibration.genuine)
    if not genuine:
        return None
    w = (np.asarray(calibration.weights, dtype=float)
         if calibration.weights is not None and len(calibration.weights) == len(genuine)
         else np.ones(len(genuine)))
    st = stops_statistics(genuine, w, cfg)
    if st.get("origin") != "ultras" or not st.get("n"):
        return None
    hours = float(st["rate"]) * float(plan.t_move_h)
    return {"rate_min_per_h": float(st["rate"]) * 60.0, "hours": hours, "n": int(st["n"]),
            "hours_hm": hm(hours)}


def _verdict_sentence(sufficiency, calibration, twin) -> str:
    """Ce qui fonde le verdict, dit en une ligne sous le badge de la couverture."""
    n = calibration.n_genuine
    n_hr = sum(1 for g in calibration.genuine if g.avg_hr is not None)
    parts = [f"{n} vrai{'s' if n > 1 else ''} ultra{'s' if n > 1 else ''}"
             + (f" dont {n_hr} avec fréquence cardiaque" if n else "")]
    fresh = next((c for c in sufficiency.criteria if c.name == "Fraîcheur des données"), None)
    if fresh is not None and fresh.value is not None:
        parts.append(f"dernière sortie il y a {int(fresh.value)} j")
    dom = getattr(sufficiency, "domain", None)
    if dom is not None:
        parts.append("parcours hors du domaine" if dom.below else "parcours dans le domaine")
    blocking = [c.name for c in sufficiency.criteria if c.level == RED]
    if blocking:
        parts.append("bloquant : " + ", ".join(b.lower() for b in blocking))
    return tex_escape(" · ".join(parts))


def _limits(ctx: dict, sufficiency, race, cfg) -> list[str]:
    """Les quatre limites de la dernière page (toujours quatre, dans cet ordre)."""
    fresh = next((c for c in sufficiency.criteria if c.name == "Fraîcheur des données"), None)
    if fresh is not None and fresh.value is not None:
        forme = (f"Forme du jour : tes données s'arrêtent {int(fresh.value)} jour"
                 f"{'s' if fresh.value > 1 else ''} avant cette analyse ; la prédiction suppose "
                 "ta forme du moment et se recalcule à l'approche de la course.")
    else:
        forme = ("Forme du jour : la prédiction suppose ta forme du moment ; si tes données "
                 "s'arrêtent avant la course, recalcule à l'approche.")
    tech = ctx.get("technicity_pct")
    if tech:
        terrain = (f"Technicité : +{tech} % déclarés, pas mesurés. Le moteur ne distingue pas une "
                   "piste d'une arête à D+ égal ; ce chiffre vient de la connaissance du parcours "
                   "et porte l'écart si le terrain surprend.")
    else:
        terrain = ("Technicité du terrain non prise en compte : à D+ égal, une piste roulante et "
                   "une arête chaotique sont traitées pareil. Sur un parcours très technique, les "
                   "temps réels sont plus lents que prédit.")
    descentes = ("Descentes : les allures servies sont des plafonds métaboliques, et la loi de "
                 "Minetti perd sa validité au-delà de ±25 à 30 % de pente (marche active).")
    meteo = "Météo, chaleur et nutrition ne sont pas modélisées"
    if race.heat_c is not None:
        meteo = (f"Nutrition non modélisée ; la chaleur déclarée ({fr(race.heat_c, 0)} °C) entre "
                 "dans la prédiction, la météo du jour non")
    return [tex_escape(forme), tex_escape(terrain), tex_escape(descentes), tex_escape(meteo + ".")]


def _honesty(prediction, cfg) -> str:
    cv = prediction.cross_validation
    if cv is None:
        return tex_escape(
            "Moins de trois vrais ultras dans ton archive : rien ne valide encore la méthode sur "
            "toi. Prends la fourchette, pas le chiffre, et recalcule après ton prochain ultra.")
    interp = (f", {fr(cv.mae_interpolation_pct, 1)} % en interpolation"
              if cv.mae_interpolation_pct is not None else "")
    return tex_escape(
        f"Sur tes {cv.n} ultras passés, rejoués en aveugle (chacun prédit sans lui-même), "
        f"l'erreur moyenne est de {fr(cv.mae_pct, 1)} %{interp}. Les fourchettes de ce rapport "
        "sont calées sur ces erreurs mesurées, pas sur la seule dispersion supposée du modèle.")


def _assumptions(ctx: dict, plan, race, cfg, stops_policy: dict) -> list[str]:
    """Ce que le plan suppose et ce qui a été déclaré — des morceaux LaTeX-sûrs assemblés
    (les durées ``hm`` portent déjà leurs espaces fines)."""
    out = [tex_escape("Arrêts : ") + stops_policy["sentence"] + "."]
    fade_src = {"config": "la dérive du plan est la valeur commune",
                "durability": "la dérive du plan est dérivée de ta durabilité mesurée",
                "splits": "la dérive du plan est mesurée sur les moitiés de tes ultras"}
    out.append(tex_escape(f"Dérive : {fade_src.get(ctx.get('fade_source_used', 'config'))}, ")
               + f"$-${ctx['fade_pct']}\\,\\% du d\\'ebut \\`a la fin.")
    if ctx.get("technicity_pct"):
        out.append(tex_escape("Terrain : +") + f"{ctx['technicity_pct']}\\,\\% "
                   + tex_escape("de technicité déclarés."))
    else:
        out.append(tex_escape("Terrain : aucune technicité déclarée, sol comparable à tes "
                              "courses de référence."))
    if race.heat_c is not None:
        out.append(tex_escape(f"Chaleur : {fr(race.heat_c, 0)} °C déclarés."))
    if ctx.get("target_requested"):
        out.append(tex_escape("Objectif demandé : ") + f"{ctx['target_hm']} ({ctx['target_regime_label']}).")
    return out


def _v2_context(ctx: dict, *, course, twin, calibration, prediction, plan, race, sufficiency,
                cfg, athlete: str, report_ref: str, target) -> dict:
    conf_word, conf_color = _CONFIDENCE[sufficiency.verdict]
    plan_band = cfg.pacing.plan_window_high_pct - cfg.pacing.plan_window_low_pct
    interval = cfg.prediction.interval_high_pct - cfg.prediction.interval_low_pct
    plan_word, safety_word = courses_sur(plan_band), courses_sur(interval)

    if ctx["plan_low"] and ctx["plan_high"]:
        cover = (f"Tu arrives autour de {ctx['pred_central']}, {plan_word} entre "
                 f"{ctx['plan_low']} et {ctx['plan_high']}.")
    else:
        cover = (f"Tu arrives autour de {ctx['pred_central']}, {safety_word} entre "
                 f"{ctx['interval_low']} et {ctx['interval_high']}.")
    if sufficiency.verdict == RED:
        cover = ("Ce rapport n'est pas vendable en l'état : tes données ne suffisent pas à "
                 "engager une prédiction. Il dit pourquoi, et ce qui manque.")

    # politique d'arrêts du plan : ce que le plan retranche, et d'où ça vient
    n_seg = len(plan.segments)
    majors = [i for i in race.major_base_indices if 0 <= i < n_seg - 1]
    n_points = max(n_seg - 1, 0)
    if plan.stops_model == "personal":
        policy_tail = (f" d'arrêts, ton taux personnel réparti sur les {n_points} points de "
                       "passage au prorata de la politique du plan")
    else:
        policy_tail = (f" retranchées du temps prédit : {n_points} points de passage à "
                       f"{fr(cfg.pacing.default_stop_min, 0)} min"
                       + (f", dont {len(majors)} base{'s' if len(majors) > 1 else ''} majeure"
                          f"{'s' if len(majors) > 1 else ''} à "
                          f"{fr(cfg.pacing.default_stop_min + cfg.pacing.major_base_extra_min, 0)} min"
                          if majors else ""))
    # la phrase LaTeX (durée ``hm`` avec ses espaces fines) et sa version lisible (annexe)
    policy_sentence = hm(plan.t_stops_h) + tex_escape(policy_tail)
    policy_plain = hm(plan.t_stops_h).replace("\\,", "\u202f") + policy_tail
    stops_policy = {"model": plan.stops_model, "n_points": n_points, "n_major": len(majors),
                    "default_min": float(cfg.pacing.default_stop_min),
                    "extra_min": float(cfg.pacing.major_base_extra_min),
                    "total_h": round(plan.t_stops_h, 2), "total_hm": hm(plan.t_stops_h),
                    "sentence": policy_sentence}
    budget = _stops_budget(calibration, plan, cfg)

    points = crew_points(plan, race)
    finish = finish_point(plan, prediction)
    consignes = [_consigne(s, cfg) for s in plan.segments]

    def _clock_or_h(clock: str | None, hours: float) -> str:
        return tex_escape(clock) if clock else f"{fr(hours, 1)}\\,h"

    for row, seg, consigne in zip(ctx["plan_rows"], plan.segments, consignes):
        row["consigne"] = tex_escape(consigne)
        row["fast"] = _clock_or_h(seg.arr_lo_clock, seg.lo_h)
        row["central"] = _clock_or_h(seg.arr_clock, seg.cum_clock_h)
        row["cautious"] = _clock_or_h(seg.arr_hi_clock, seg.hi_h)
    crew_rows = [{
        "name": tex_escape(p.name), "km": fr(p.km, 1), "earliest": tex_escape(p.earliest_clock),
        "central": tex_escape(p.central_clock), "latest": tex_escape(p.latest_clock),
        "stop": fr(p.stop_min, 0), "night": p.night, "major": p.is_major,
    } for p in points]
    finish_row = None if finish is None else {
        "name": tex_escape(finish.name), "km": fr(finish.km, 1),
        "earliest": tex_escape(finish.earliest_clock), "central": tex_escape(finish.central_clock),
        "latest": tex_escape(finish.latest_clock), "night": finish.night,
    }
    bracelet_rows = [{"km": fr(s.off1, 0), "name": tex_escape(s.to[:14]),
                      "clock": tex_escape(s.arr_clock.split(" ", 1)[1] if s.arr_clock and " " in s.arr_clock
                                          else (s.arr_clock or f"{fr(s.cum_clock_h, 1)} h")),
                      "night": s.night}
                     for s in plan.segments]

    limits = _limits(ctx, sufficiency, race, cfg)
    honesty = _honesty(prediction, cfg)
    assumptions = _assumptions(ctx, plan, race, cfg, stops_policy)
    n_hr = sum(1 for g in calibration.genuine if g.avg_hr is not None)
    fade_pct_plain = int(round(2 * plan.fade_delta_used / (1 + plan.fade_delta_used) * 100))

    return {
        "athlete_plain": athlete,
        "annex_ref": report_ref,
        "annex_url": f"{cfg.report.annex_base_url.rstrip('/')}/{report_ref}",
        "confidence_word": tex_escape(conf_word),
        "confidence_plain": conf_word,
        "confidence_color": conf_color,
        "verdict_sentence": _verdict_sentence(sufficiency, calibration, twin),
        "verdict_reasons": [tex_escape(r.replace("🟢", "confiance pleine").replace("🟠", "confiance réduite")
                                       .replace("🔴", "non vendu")) for r in sufficiency.reasons],
        "cover_sentence": tex_escape(cover) if sufficiency.verdict == RED else cover,
        "plan_band_word": plan_word,
        "safety_word": safety_word,
        "gauges": _gauges(ctx, twin, calibration, plan, cfg, budget),
        "n_ultras_hr": n_hr,
        "stops_policy": stops_policy,
        "stops_policy_plain": {**stops_policy, "sentence": policy_plain,
                               "total_hm": policy_plain.split(" ", 1)[0]},
        "stops_budget": None if budget is None else {
            "rate_min_per_h": fr(budget["rate_min_per_h"], 0), "hours_hm": budget["hours_hm"],
            "n": budget["n"]},
        "stops_budget_plain": budget,
        "fade_pct_plain": fade_pct_plain,
        "fade_evidence": tex_escape(cfg.report.fade_evidence),
        "consignes_plain": consignes,
        "crew_rows": crew_rows,
        "finish_row": finish_row,
        "bracelet_rows": bracelet_rows,
        "limits": limits,
        "honesty": honesty,
        "assumptions": assumptions,
        # bande du bracelet : une colonne par point de passage, bornée au format A4 paysage
        "bracelet_width_mm": int(min(285, max(120, 15 * len(plan.segments) + 24))),
        "has_domain_reading": getattr(sufficiency, "domain", None) is not None,
        "domain_expected_h": (fr(sufficiency.domain.expected_hours, 1)
                              if getattr(sufficiency, "domain", None) is not None else None),
    }


__all__ = ["build_report_context"]
