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
    lo_h: float              # borne basse de la fenêtre d'arrivée (cumul, 80 %)
    hi_h: float              # borne haute

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PacingPlan:
    segments: list[SegmentPlan]
    t_move_h: float
    t_stops_h: float
    t_clock_h: float
    start_time: dt.datetime | None
    sun: dict = field(default_factory=dict)
    fade_delta_used: float = 0.085   # Δ réellement servi (traçabilité : le rapport en dérive le %)

    def to_dict(self) -> dict:
        return {
            "t_move_h": round(self.t_move_h, 2),
            "t_stops_h": round(self.t_stops_h, 2),
            "t_clock_h": round(self.t_clock_h, 2),
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "sun": self.sun,
            "segments": [s.to_dict() for s in self.segments],
        }


_WEEKDAYS_FR = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]


def _fmt_clock(when: dt.datetime) -> str:
    return f"{_WEEKDAYS_FR[when.weekday()]} {when.hour:02d}:{when.minute:02d}"


def _fade_delta(cfg: Config, durability_pct: float | None) -> float:
    """Δ du fade : constante (défaut) ou dérivé de la durabilité MESURÉE de l'athlète (T3).

    Si l'efficacité chute de X % entre les deux moitiés à effort constant, la vitesse fait de
    même ; un fade linéaire (1+Δ → 1−Δ) réalise (1−Δ)/(1+Δ) = 1 − X/100 ⇔ Δ = X/(200−X).
    Borné [fade_delta_min, fade_delta_max] ; repli sur ``fade_delta`` si non mesurable."""
    p = cfg.pacing
    if p.fade_source == "durability" and durability_pct is not None and durability_pct > 0:
        delta = durability_pct / (200.0 - min(durability_pct, 100.0))
        return float(min(max(delta, p.fade_delta_min), p.fade_delta_max))
    return p.fade_delta


def build_pacing(
    course: CourseProfile,
    prediction: Prediction,
    race: RaceSpec,
    cfg: Config,
    *,
    durability_pct: float | None = None,
) -> PacingPlan:
    seg = course.segments
    n = len(seg)
    deq = np.array([s.deq_km for s in seg])
    off_len = np.array([s.off_len for s in seg])

    # --- fade de durabilité sur la vitesse ajustée vs avancement en Deq ---
    cum_deq = np.cumsum(deq)
    mid = (cum_deq - deq / 2) / cum_deq[-1]
    delta = _fade_delta(cfg, durability_pct)
    g = 1.0 + delta * (0.5 - mid) * 2.0

    # --- politique d'arrêts : base + supplément aux bases majeures, rien à l'arrivée ---
    stops_min = np.full(n, cfg.pacing.default_stop_min)
    for k in race.major_base_indices:
        if 0 <= k < n:
            stops_min[k] += cfg.pacing.major_base_extra_min
    stops_min[-1] = 0.0
    t_stops_h = float(stops_min.sum() / 60.0)

    tpred = prediction.finish_hours
    t_move = max(tpred - t_stops_h, 0.5 * tpred)  # garde-fou si arrêts > prédiction

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
    cum_move = 0.0
    cum_clock = np.zeros(n)
    arr_clocks: list[str | None] = []
    nights: list[bool] = []
    for i in range(n):
        cum_move += t_move_h[i]
        if can_clock:
            # heure d'ARRIVÉE au point de passage = mouvement seul ; l'arrêt du ravito
            # s'écoule ensuite (l'ancien calcul imprimait l'heure de DÉPART du ravito,
            # décalant heure affichée, fenêtres et drapeau nuit de la durée de l'arrêt).
            arrival = clock + dt.timedelta(hours=t_move_h[i])
            arr_clocks.append(_fmt_clock(arrival))
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

    # --- fenêtres horaires : bandes Monte-Carlo (on met à l'échelle tout le profil) ---
    mc = prediction.mc_samples
    mult = mc / tpred
    lo = np.array([np.percentile(cum_clock[i] * mult, cfg.prediction.interval_low_pct) for i in range(n)])
    hi = np.array([np.percentile(cum_clock[i] * mult, cfg.prediction.interval_high_pct) for i in range(n)])

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
        )
        for i in range(n)
    ]

    sun: dict = {}
    if can_clock and start is not None:
        sr, ss = sun_times(start.year, start.month, start.day, race.lat, race.lon, race.tz_offset_h)
        sun = {
            "sunrise": f"{int(sr // 60):02d}:{int(sr % 60):02d}",
            "sunset": f"{int(ss // 60):02d}:{int(ss % 60):02d}",
        }

    return PacingPlan(
        segments=segments,
        t_move_h=float(np.sum(t_move_h)),
        t_stops_h=t_stops_h,
        t_clock_h=t_clock_h,
        start_time=start,
        sun=sun,
        fade_delta_used=float(delta),
    )


__all__ = ["SegmentPlan", "PacingPlan", "build_pacing"]
