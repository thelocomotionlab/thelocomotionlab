"""Plan de pacing par segment + fenêtres horaires (twin-theory §6).

Effort ajusté constant + **fade de durabilité** (dérive contrôlée ~−15 % début→fin),
normalisé pour boucler le temps de mouvement ; conversion en allure réelle par segment
(montées lentes, descentes rapides) ; horloge + sections de nuit (soleil NOAA) ; et —
point clé — **fenêtres horaires** : par segment, une PLAGE d'arrivée (bandes Monte-Carlo),
pas une valeur unique. Repris de pacing.py, paramétré.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict, dataclass, field

import numpy as np

from ..config import Config
from ..course import CourseProfile, RaceSpec
from ..course.spec import stops_policy_min
from ..predict import Prediction
from .sun import is_night, sun_times


@dataclass(frozen=True)
class SegmentPlan:
    index: int
    to: str
    off1: float
    off_len_km: float
    dplus_m: float
    dminus_m: float
    deq_km: float
    mean_grade_pct: float
    alt_end_m: float
    v_ga_kmh: float          # vitesse ajustée cible
    pace_min_km: float       # allure réelle terrain
    t_move_min: float
    stop_min: float
    cum_clock_h: float       # temps cumulé à l'ARRIVÉE du segment (arrêt de CE ravito exclu)
    arr_clock: str | None    # heure de passage (ex. "sam. 19:23") si départ connu
    night: bool
    # Bornes basse/haute du cumul. Leur NATURE dépend de l'ancre du plan (cf. PacingPlan.anchor) :
    #   * ancre « prediction » : FOURCHETTE DE COURSE — bande de probabilité (une course sur
    #     deux s'y joue) issue de la prédiction ;
    #   * ancre « target » (ADR 0002) : FENÊTRE DE PASSAGE — tolérance d'exécution autour de
    #     l'objectif choisi, SANS contenu probabiliste. Le rapport doit changer de mots avec.
    lo_h: float
    hi_h: float
    arr_lo_clock: str | None = None   # borne basse en HEURE DE PASSAGE (ex. "sam. 18:55")
    arr_hi_clock: str | None = None   # borne haute — None si départ/position inconnus
    # cumul NON arrondi (le cumul affiché est au centième d'heure) : sert au score de la
    # forme du plan contre les passages réels, jamais au rapport
    cum_clock_exact_h: float | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("cum_clock_exact_h", None)
        return d


@dataclass
class PacingPlan:
    segments: list[SegmentPlan]
    t_move_h: float
    t_stops_h: float
    t_clock_h: float
    start_time: dt.datetime | None
    sun: dict = field(default_factory=dict)
    fade_delta_used: float = 0.085   # Δ réellement servi (traçabilité : le rapport en dérive le %)
    # bornes de SÉCURITÉ de l'arrivée (intervalle de la prédiction, ex. 80 %) en heure de
    # passage — distinctes de la fourchette de course des segments (bande de planification).
    # Servies AUSSI en mode objectif : c'est le rappel du réel à côté de la cible choisie.
    safety_lo_clock: str | None = None
    safety_hi_clock: str | None = None
    # --- ancre du plan (ADR 0002) : d'où vient le temps total réparti ------------------------
    # "prediction" (défaut, comportement historique) ou "target" (objectif de l'athlète).
    # Le rapport LIT ce champ pour choisir son vocabulaire : les fenêtres des segments ne
    # veulent pas dire la même chose dans les deux cas.
    anchor: str = "prediction"
    anchor_hours: float | None = None        # temps réellement réparti (= la cible si ancre cible)
    window_tolerance_pct: float | None = None  # demi-largeur servie, mode objectif seulement
    # --- Phase 2 : ce qui a réellement servi (traçabilité du rapport) ------------------------
    fade_source_used: str = "config"         # config | durability | splits
    stops_model: str = "carved"              # carved (politique retranchée) | personal | spec
    stops_rate: float | None = None          # taux personnel servi (h d'arrêt par h de mouvement)

    @property
    def night_runs(self) -> list[list[SegmentPlan]]:
        """Les sections de nuit, dans l'ordre : une liste de segments contigus par section.

        Source unique du rapport pour tout ce qui parle de nuit — un parcours peut en compter
        deux (une nuit pleine puis la tombée du jour suivant), et les lire séparément évite de
        reporter un min→max qui laisserait croire à une nuit de bout en bout."""
        runs: list[list[SegmentPlan]] = []
        cur: list[SegmentPlan] = []
        for s in self.segments:
            if s.night:
                cur.append(s)
            elif cur:
                runs.append(cur)
                cur = []
        if cur:
            runs.append(cur)
        return runs

    @property
    def night_hours(self) -> float:
        """Heures passées de nuit (mouvement + arrêts des segments de nuit)."""
        return sum((s.t_move_min + s.stop_min) / 60.0
                   for run in self.night_runs for s in run)

    def to_dict(self) -> dict:
        return {
            "t_move_h": round(self.t_move_h, 2),
            "t_stops_h": round(self.t_stops_h, 2),
            "t_clock_h": round(self.t_clock_h, 2),
            "fade_delta_used": round(self.fade_delta_used, 4),
            "fade_source_used": self.fade_source_used,
            "stops_model": self.stops_model,
            "stops_rate": None if self.stops_rate is None else round(self.stops_rate, 4),
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "sun": self.sun,
            "safety_lo_clock": self.safety_lo_clock,
            "safety_hi_clock": self.safety_hi_clock,
            "anchor": self.anchor,
            "anchor_hours": None if self.anchor_hours is None else round(self.anchor_hours, 3),
            "window_tolerance_pct": self.window_tolerance_pct,
            "segments": [s.to_dict() for s in self.segments],
        }


_WEEKDAYS_FR = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]


def fmt_clock(when: dt.datetime) -> str:
    """« sam. 19h23 » — l'heure comme on l'écrit en français, partout dans le rapport."""
    return f"{_WEEKDAYS_FR[when.weekday()]} {when.hour:02d}h{when.minute:02d}"


def fade_delta_from_splits(calibration) -> float | None:
    """Δ du fade mesuré sur les COURSES de l'athlète : pour chaque vrai ultra dont le rapport
    des moitiés R (vga hors plateaux, seconde moitié de Deq ÷ première) est connu et
    plausible (0,5–1,5), un fade linéaire (1+Δ → 1−Δ) donne des moitiés moyennes 1+Δ/2 et
    1−Δ/2, soit R = (1−Δ/2)/(1+Δ/2) ⇔ Δ = 2(1−R)/(1+R). Moyenne pondérée par les poids de la
    calibration (récence × maximalité) ; None sans ultra mesuré. Peut être négatif (l'athlète
    accélère) : le plan le bornera."""
    genuine = getattr(calibration, "genuine", None) or []
    weights = getattr(calibration, "weights", None)
    w = (np.asarray(weights, dtype=float) if weights is not None and len(weights) == len(genuine)
         else np.ones(len(genuine)))
    deltas, ws = [], []
    for g, wi in zip(genuine, w):
        r = getattr(g, "split_ratio", None)
        if r is None or not (0.5 <= r <= 1.5) or wi <= 0:
            continue
        deltas.append(2.0 * (1.0 - r) / (1.0 + r))
        ws.append(float(wi))
    if not deltas:
        return None
    return float(np.sum(np.asarray(ws) * np.asarray(deltas)) / np.sum(ws))


def _fade_delta(cfg: Config, durability_pct: float | None,
                splits_delta: float | None = None) -> tuple[float, str]:
    """Δ du fade et sa source : constante (défaut), dérivé de la durabilité MESURÉE de
    l'athlète (T3) ou du rapport des moitiés de ses courses (Phase 2, ``splits``).

    Si l'efficacité chute de X % entre les deux moitiés à effort constant, la vitesse fait de
    même ; un fade linéaire (1+Δ → 1−Δ) réalise (1−Δ)/(1+Δ) = 1 − X/100 ⇔ Δ = X/(200−X).
    Borné [fade_delta_min, fade_delta_max] ; ``splits`` retombe sur ``durability`` puis sur
    ``fade_delta`` quand la mesure manque — la source servie est renvoyée."""
    p = cfg.pacing
    if p.fade_source == "splits" and splits_delta is not None:
        return float(min(max(splits_delta, p.fade_delta_min), p.fade_delta_max)), "splits"
    if p.fade_source in ("durability", "splits") and durability_pct is not None and durability_pct > 0:
        delta = durability_pct / (200.0 - min(durability_pct, 100.0))
        return float(min(max(delta, p.fade_delta_min), p.fade_delta_max)), "durability"
    return p.fade_delta, "config"


def build_pacing(
    course: CourseProfile,
    prediction: Prediction,
    race: RaceSpec,
    cfg: Config,
    *,
    durability_pct: float | None = None,
    anchor_hours: float | None = None,
    splits_delta: float | None = None,
) -> PacingPlan:
    """Répartit un temps total sur le parcours (effort ajusté constant + fade).

    ``splits_delta`` : Δ mesuré sur les courses de l'athlète (:func:`fade_delta_from_splits`),
    servi quand ``pacing.fade_source=splits``. Les arrêts suivent le modèle de la prédiction
    (``Prediction.stops_model``) : politique du plan retranchée du temps prédit (``carved``,
    historique), arrêts PERSONNELS de la prédiction répartis sur les ravitos au prorata de la
    politique (``personal``), ou politique du plan ajoutée au mouvement prédit (``spec``).

    ``anchor_hours`` (ADR 0002, mode objectif) remplace le temps PRÉDIT par la durée visée
    par l'athlète. Seules deux choses changent alors : le temps réparti, et la nature des
    fenêtres par segment — qui cessent d'être une bande de probabilité (fourchette de course,
    issue de la dispersion prédictive) pour devenir une **fenêtre de passage** (tolérance
    d'exécution fixe, ``cfg.target.tolerance_pct``). Le fade, les arrêts, l'horloge, la nuit
    et les bornes de sécurité sont identiques dans les deux modes — les bornes de sécurité
    restant, elles, issues de la prédiction : c'est le rappel du réel.

    La faisabilité de la cible ne se juge PAS ici (``twin_engine.feasibility``) : cette
    fonction répartit, elle ne valide pas.
    """
    seg = course.segments
    n = len(seg)
    deq = np.array([s.deq_km for s in seg])
    off_len = np.array([s.off_len for s in seg])

    # --- fade de durabilité sur la vitesse ajustée vs avancement en Deq ---
    cum_deq = np.cumsum(deq)
    mid = (cum_deq - deq / 2) / cum_deq[-1]
    delta, fade_used = _fade_delta(cfg, durability_pct, splits_delta)
    g = 1.0 + delta * (0.5 - mid) * 2.0

    # --- politique d'arrêts : base + supplément aux bases majeures, rien à l'arrivée ---
    stops_min = stops_policy_min(n, race.major_base_indices, cfg, race.reglages)

    # temps total à répartir : la prédiction, ou la CIBLE de l'athlète (mode objectif)
    on_target = anchor_hours is not None
    if on_target and anchor_hours <= 0:
        raise ValueError("anchor_hours doit être strictement positif")
    tpred = float(anchor_hours) if on_target else prediction.finish_hours
    stops_model = getattr(prediction, "stops_model", "carved") or "carved"
    stops_rate = getattr(prediction, "stops_rate", None)
    if stops_model == "personal" and stops_rate is not None:
        # arrêts PERSONNELS : le total vient de la prédiction (ou du taux appliqué à la cible
        # en mode objectif), réparti sur les ravitos au prorata de la politique du plan
        moving = getattr(prediction, "moving_hours", None)
        if on_target or moving is None:
            t_move = tpred / (1.0 + float(stops_rate))
        else:
            t_move = float(moving)
        total_min = max(tpred - t_move, 0.0) * 60.0
        # un arrêt IMPOSÉ par l'athlète ne se redistribue pas : on le retient, et le reste
        # du budget se répartit au prorata sur les autres points de passage.
        fixed = np.zeros(n, dtype=bool)
        for r in race.reglages:
            k = r.aid_index - 1
            if r.stop_min is not None and 0 <= k < n:
                fixed[k] = True
        reste = max(total_min - float(stops_min[fixed].sum()), 0.0)
        share = float(stops_min[~fixed].sum())
        libre = (stops_min[~fixed] / share * reste if share > 0 else np.zeros(int((~fixed).sum())))
        stops_min = stops_min.copy()
        stops_min[~fixed] = libre
    else:
        t_move = max(tpred - float(stops_min.sum() / 60.0), 0.5 * tpred)  # garde-fou si arrêts > temps réparti
    t_stops_h = float(stops_min.sum() / 60.0)

    # --- normalisation : Σ deq_i / v_i = t_move ---
    scale = float(np.sum(deq / g) / t_move)
    v_ga = scale * g
    t_move_h = deq / v_ga
    real_speed = off_len / t_move_h
    pace = 60.0 / real_speed

    # --- horloge + nuit ---
    start = race.start_time
    can_clock = start is not None and race.lat is not None and race.lon is not None
    clock = start
    arr_clocks: list[str | None] = []
    nights: list[bool] = []
    for i in range(n):
        if can_clock:
            # heure d'ARRIVÉE au point de passage = mouvement seul ; l'arrêt du ravito
            # s'écoule ensuite (l'ancien calcul imprimait l'heure de DÉPART du ravito,
            # décalant heure affichée, fenêtres et drapeau nuit de la durée de l'arrêt).
            arrival = clock + dt.timedelta(hours=t_move_h[i])
            arr_clocks.append(fmt_clock(arrival))
            nights.append(is_night(arrival, race.lat, race.lon, race.tz_offset_h))
            clock = arrival + dt.timedelta(minutes=float(stops_min[i]))
        else:
            arr_clocks.append(None)
            nights.append(False)
    # cumul d'horloge à chaque ARRIVÉE = mouvement cumulé + arrêts des ravitos DÉJÀ passés
    cum_stop_before = np.concatenate([[0.0], np.cumsum(stops_min[:-1])]) / 60.0
    cum_clock = np.cumsum(t_move_h) + cum_stop_before
    # horloge totale (l'arrêt d'arrivée vaut 0, donc = mouvement + tous les arrêts)
    t_clock_h = float(cum_clock[-1] + stops_min[-1] / 60.0)

    # --- fenêtres horaires : fourchette de course déclinée par segment ---
    # Les fenêtres PAR SEGMENT sont la « fourchette de course » (bande de PLANIFICATION,
    # défaut interquartile) : une course sur deux s'y joue — c'est l'outil de pilotage.
    # L'intervalle de la prédiction (ex. 80 %) reste les « bornes de sécurité » (logistique).
    # La bande vient de la PRÉDICTION (percentiles MC ou conforme, selon interval_source) et
    # se décline en multiplicateurs de scénario global : un jour lent l'est de bout en bout.
    # Repli (objets sans plan_low/high_h) : percentiles Monte-Carlo — comportement historique
    # (le multiplicateur commute exactement avec le percentile, cum > 0).
    # MODE OBJECTIF (ADR 0002) : la bande prédictive n'a plus de sens autour d'une durée
    # CHOISIE — on sert une tolérance d'exécution fixe. Appliquée au cumul, elle élargit
    # naturellement la fenêtre avec la course.
    tol_pct: float | None = None
    if on_target:
        tol_pct = float(cfg.target.tolerance_pct)
        m_lo, m_hi = 1.0 - tol_pct / 100.0, 1.0 + tol_pct / 100.0
    else:
        mc = prediction.mc_samples
        mult = mc / tpred
        b_lo, b_hi = cfg.pacing.plan_window_low_pct, cfg.pacing.plan_window_high_pct
        if prediction.plan_low_h is not None and prediction.plan_high_h is not None and tpred > 0:
            m_lo = prediction.plan_low_h / tpred
            m_hi = prediction.plan_high_h / tpred
        else:
            m_lo = float(np.percentile(mult, b_lo))
            m_hi = float(np.percentile(mult, b_hi))
    if cfg.pacing.scale_stops:
        # historique : tout le cumul (arrêts compris) est mis à l'échelle
        lo = cum_clock * m_lo
        hi = cum_clock * m_hi
    else:
        # physique (C6) : un scénario lent ne rallonge pas les ravitos — seule la part de
        # MOUVEMENT est mise à l'échelle, les arrêts déjà passés s'ajoutent constants
        cum_move_arr = np.cumsum(t_move_h)
        lo = cum_move_arr * m_lo + cum_stop_before
        hi = cum_move_arr * m_hi + cum_stop_before

    # bornes de la fenêtre en HEURES DE PASSAGE (le plan ne sert pas qu'une valeur centrale :
    # l'athlète lit directement « j'arriverai à ce ravito entre 18:55 et 20:20 »)
    if can_clock and start is not None:
        arr_lo = [fmt_clock(start + dt.timedelta(hours=float(lo[i]))) for i in range(n)]
        arr_hi = [fmt_clock(start + dt.timedelta(hours=float(hi[i]))) for i in range(n)]
        safety_lo = fmt_clock(start + dt.timedelta(hours=float(prediction.interval_low_h)))
        safety_hi = fmt_clock(start + dt.timedelta(hours=float(prediction.interval_high_h)))
    else:
        arr_lo = [None] * n
        arr_hi = [None] * n
        safety_lo = safety_hi = None

    segments = [
        SegmentPlan(
            index=seg[i].index,
            to=seg[i].to,
            off1=seg[i].off1,
            off_len_km=round(float(off_len[i]), 2),
            dplus_m=round(seg[i].dplus_m),
            dminus_m=round(seg[i].dminus_m),
            deq_km=round(float(deq[i]), 2),
            mean_grade_pct=round(seg[i].mean_grade_pct, 1),
            alt_end_m=round(seg[i].alt_end_m),
            v_ga_kmh=round(float(v_ga[i]), 2),
            pace_min_km=round(float(pace[i]), 2),
            t_move_min=round(float(t_move_h[i] * 60), 1),
            stop_min=round(float(stops_min[i]), 0),
            cum_clock_h=round(float(cum_clock[i]), 2),
            arr_clock=arr_clocks[i],
            night=nights[i],
            lo_h=round(float(lo[i]), 2),
            hi_h=round(float(hi[i]), 2),
            arr_lo_clock=arr_lo[i],
            arr_hi_clock=arr_hi[i],
            cum_clock_exact_h=float(cum_clock[i]),
        )
        for i in range(n)
    ]

    sun: dict = {}
    if can_clock and start is not None:
        sr, ss = sun_times(start.year, start.month, start.day, race.lat, race.lon, race.tz_offset_h)
        sun = {
            "sunrise": f"{int(sr // 60):02d}h{int(sr % 60):02d}",
            "sunset": f"{int(ss // 60):02d}h{int(ss % 60):02d}",
        }

    return PacingPlan(
        segments=segments,
        t_move_h=float(np.sum(t_move_h)),
        t_stops_h=t_stops_h,
        t_clock_h=t_clock_h,
        start_time=start,
        sun=sun,
        fade_delta_used=float(delta),
        safety_lo_clock=safety_lo,
        safety_hi_clock=safety_hi,
        anchor="target" if on_target else "prediction",
        anchor_hours=float(tpred),
        window_tolerance_pct=tol_pct,
        fade_source_used=fade_used,
        stops_model=stops_model,
        stops_rate=None if stops_rate is None else float(stops_rate),
    )


__all__ = ["SegmentPlan", "PacingPlan", "build_pacing", "fade_delta_from_splits"]
