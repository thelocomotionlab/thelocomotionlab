"""Des données aux paramètres physiologiques (twin-theory §2.4–2.6).

Vitesse critique + réserve D′ (modèle hyperbolique sur efforts plats propres, incertitude
par bootstrap), exposant d'endurance E (loi de puissance sur l'enveloppe longue),
durabilité (découplage médian des longues sorties). Reprend twin_fit.py (parties A et B),
paramétré et dégradant proprement quand la donnée manque.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..config import Config
from ..ingest.canonical import CanonicalActivity
from .record import ActivitySummary, RecordCurve, build_record_curve


@dataclass(frozen=True)
class CriticalSpeed:
    vc_ms: float
    vc_sd: float
    dprime_m: float
    dprime_sd: float
    from_flat_efforts: bool   # False = ajusté faute d'efforts plats (confiance réduite)
    n_points: int

    @property
    def vc_kmh(self) -> float:
        return self.vc_ms * 3.6


@dataclass
class Twin:
    """Le « jumeau » physiologique de l'athlète, calculé depuis ses données."""

    critical_speed: CriticalSpeed | None
    alpha: float | None
    endurance_E: float | None
    durability_pct: float | None
    record: RecordCurve
    summaries: list[ActivitySummary] = field(default_factory=list)

    @property
    def vc_ms(self) -> float | None:
        return self.critical_speed.vc_ms if self.critical_speed else None

    def to_dict(self) -> dict:
        cs = self.critical_speed
        return {
            "vc_ms": None if cs is None else round(cs.vc_ms, 4),
            "vc_kmh": None if cs is None else round(cs.vc_kmh, 3),
            "vc_sd_ms": None if cs is None else round(cs.vc_sd, 4),
            "dprime_m": None if cs is None else round(cs.dprime_m),
            "dprime_sd_m": None if cs is None else round(cs.dprime_sd),
            "vc_from_flat_efforts": None if cs is None else cs.from_flat_efforts,
            "alpha": None if self.alpha is None else round(self.alpha, 4),
            "endurance_E": None if self.endurance_E is None else round(self.endurance_E, 3),
            "durability_pct": None if self.durability_pct is None else round(self.durability_pct, 1),
            "n_activities": len(self.summaries),
        }


def fit_critical_speed(record: RecordCurve, cfg: Config) -> CriticalSpeed | None:
    """Modèle hyperbolique d = VC·t + D′ sur les efforts plats propres (bootstrap)."""
    w0, w1 = cfg.twin.vc_window_s
    flat = [(p.duration_s, p.vga) for p in record.flat_points]
    from_flat = True
    if len(flat) < 2:
        # dégradation : faute d'efforts plats, on prend les points de la fenêtre VC
        from_flat = False
        flat = [(p.duration_s, p.vga) for p in record.points if w0 <= p.duration_s <= w1 and p.vga > 0]
    if len(flat) < 2:
        return None

    pts = np.asarray(flat, dtype=float)
    t = pts[:, 0]
    d = pts[:, 0] * pts[:, 1]
    a = np.vstack([t, np.ones_like(t)]).T
    (vc, dprime), *_ = np.linalg.lstsq(a, d, rcond=None)

    rng = np.random.default_rng(cfg.twin.vc_bootstrap_seed)
    vcs = np.empty(cfg.twin.vc_bootstrap_n)
    dps = np.empty(cfg.twin.vc_bootstrap_n)
    for b in range(cfg.twin.vc_bootstrap_n):
        ii = rng.integers(0, len(t), len(t))
        (c0, c1), *_ = np.linalg.lstsq(np.vstack([t[ii], np.ones_like(t[ii])]).T, d[ii], rcond=None)
        vcs[b] = c0
        dps[b] = c1

    return CriticalSpeed(
        vc_ms=float(vc),
        vc_sd=float(vcs.std()),
        dprime_m=float(dprime),
        dprime_sd=float(dps.std()),
        from_flat_efforts=from_flat,
        n_points=len(t),
    )


def fit_endurance_exponent(record: RecordCurve, cfg: Config):
    """Loi de puissance v_ga ∝ t^(−α) sur l'enveloppe longue → exposant de Riegel E."""
    w0, w1 = cfg.twin.endurance_window_s
    mask = (record.durations_s >= w0) & (record.durations_s <= w1) & (record.vga > 0)
    if mask.sum() < 2:
        return None, None
    lt = np.log(record.durations_s[mask])
    lv = np.log(record.vga[mask])
    slope, _ = np.polyfit(lt, lv, 1)
    alpha = -float(slope)
    if alpha >= 1.0:  # garde-fou numérique (E exploserait)
        return alpha, None
    return alpha, 1.0 / (1.0 - alpha)


def estimate_durability(summaries: list[ActivitySummary], cfg: Config) -> float | None:
    """Découplage médian sur les longues sorties (None si aucune FC exploitable)."""
    vals = [
        s.decouple_pct
        for s in summaries
        if s.decouple_pct is not None and s.duration_s >= cfg.twin.decouple_min_duration_s
    ]
    return float(np.median(vals)) if vals else None


def build_twin(activities: list[CanonicalActivity], cfg: Config) -> Twin:
    """Pipeline jumeau complet : courbe record → VC, E, durabilité."""
    record, summaries = build_record_curve(activities, cfg)
    cs = fit_critical_speed(record, cfg)
    alpha, E = fit_endurance_exponent(record, cfg)
    dur = estimate_durability(summaries, cfg)
    return Twin(
        critical_speed=cs,
        alpha=alpha,
        endurance_E=E,
        durability_pct=dur,
        record=record,
        summaries=summaries,
    )


__all__ = [
    "CriticalSpeed",
    "Twin",
    "fit_critical_speed",
    "fit_endurance_exponent",
    "estimate_durability",
    "build_twin",
]
