"""Du schéma canonique à la courbe record ajustée à la pente (twin-theory §2).

Reprend extract_all2.py, paramétré : pour chaque activité, vitesse ajustée à la pente
seconde par seconde (pente sur base ±50 m, facteur plafonné), distance ajustée cumulée,
puis enveloppe des meilleures moyennes glissantes. Agrège sur toutes les activités →
:class:`RecordCurve`. Produit aussi un résumé par activité (durée, distances, FC,
découplage) pour la calibration ultra et la durabilité.

Durcissement vs _seed : la vitesse brute par seconde est **écrêtée à ``v_max``**
(twin-theory §2.2, déclaré mais non appliqué dans extract_all2) → robustesse aux
téléportations GPS / montres bruyantes, sans effet sur les durées utiles d'un athlète
propre.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from ..config import Config
from ..ingest.canonical import CanonicalActivity
from ..minetti import grade_factor


@dataclass(frozen=True)
class ActivitySummary:
    date: str | None
    sport: str | None
    duration_s: float
    dist_km: float
    ga_km: float            # distance ajustée à la pente (équivalent plat)
    avg_hr: float | None
    dplus_m: float
    dminus_m: float
    decouple_pct: float | None
    has_hr: bool

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class RecordPoint:
    duration_s: int
    vga: float              # meilleure vitesse ajustée (m/s)
    vraw: float             # meilleure vitesse brute de l'activité source (m/s)
    source_date: str | None
    flat: bool              # effort « plat propre » → utilisable pour la vitesse critique


@dataclass
class RecordCurve:
    durations_s: np.ndarray
    vga: np.ndarray         # meilleure vitesse ajustée par durée (m/s) ; 0 si pas de donnée
    vraw: np.ndarray        # meilleure vitesse brute par durée (m/s)
    points: list[RecordPoint]

    @property
    def flat_points(self) -> list[RecordPoint]:
        return [p for p in self.points if p.flat]


def _adjusted_distance(act: CanonicalActivity, cfg: Config):
    """Distance ajustée à la pente (cumulée) + distance brute dé-spikée + altitude lissée."""
    dmono = act.dist_m  # déjà monotone (schéma canonique)
    n = act.n
    # écrêtage de la vitesse brute par seconde (pas dt = 1 s)
    dd = np.clip(np.diff(dmono), 0.0, cfg.twin.v_max_ms)
    draw = np.concatenate([[0.0], np.cumsum(dd)])

    # altitude : remplissage médian si trous, léger lissage (règle fixe : alt_smooth_s)
    alt = act.alt_m
    medalt = np.nanmedian(alt)
    alt_f = np.nan_to_num(alt, nan=(medalt if np.isfinite(medalt) else 0.0))
    k = max(1, cfg.twin.alt_smooth_s)
    altp = np.pad(alt_f, k, mode="reflect")
    alts = np.convolve(altp, np.ones(k) / k, mode="same")[k:-k]

    # pente sur base de distance ±grade_base_m (pas par seconde → anti-bruit)
    base = cfg.twin.grade_base_m
    lo = np.clip(np.searchsorted(dmono, dmono - base, side="left"), 0, n - 1)
    hi = np.clip(np.searchsorted(dmono, dmono + base, side="right") - 1, 0, n - 1)
    ddist = dmono[hi] - dmono[lo]
    dalt = alts[hi] - alts[lo]
    with np.errstate(all="ignore"):
        grad = np.where(ddist > 5.0, dalt / ddist, 0.0)
    grad = np.clip(grad, -cfg.course.grade_clip, cfg.course.grade_clip)
    f = grade_factor(grad, cfg.course.cr0, cap=cfg.twin.f_cap)
    dga = np.concatenate([[0.0], np.cumsum(f[:-1] * dd)])
    return draw, dga, alts


def process_activity(act: CanonicalActivity, cfg: Config):
    """→ (:class:`ActivitySummary`, vga_par_durée, vraw_par_durée)."""
    durs = np.asarray(cfg.twin.record_durations_s, dtype=float)
    draw, dga, alts = _adjusted_distance(act, cfg)
    tg = act.t
    n = act.n

    vga = np.full(len(durs), np.nan)
    vraw = np.full(len(durs), np.nan)
    for j, T in enumerate(durs):
        T = int(T)
        if n <= T:
            break
        vga[j] = np.nanmax((dga[T:] - dga[:-T]) / T)
        vraw[j] = np.nanmax((draw[T:] - draw[:-T]) / T)

    da = np.diff(alts)
    dur = float(tg[-1])

    # découplage (durabilité) : nécessite la FC ; sinon None → signalé en aval
    decouple = None
    hr = act.hr
    if dur >= cfg.twin.decouple_min_duration_s and np.isfinite(hr).any():
        sp = np.gradient(dga, tg)
        half = n // 2
        with np.errstate(all="ignore"):
            e1 = np.nanmean(sp[:half] / np.where(hr[:half] > 60, hr[:half], np.nan))
            e2 = np.nanmean(sp[half:] / np.where(hr[half:] > 60, hr[half:], np.nan))
        if np.isfinite(e1) and e1 > 0 and np.isfinite(e2):
            decouple = float((e1 - e2) / e1 * 100)

    has_hr = bool(np.isfinite(hr).any())
    avhr = float(np.nanmean(hr)) if has_hr else float("nan")

    summary = ActivitySummary(
        date=act.start_time.date().isoformat() if act.start_time else None,
        sport=act.sport,
        duration_s=round(dur),
        dist_km=round(float(draw[-1]) / 1000, 3),
        ga_km=round(float(dga[-1]) / 1000, 3),
        avg_hr=None if not np.isfinite(avhr) else round(float(avhr)),
        dplus_m=round(float(da[da > 0].sum())),
        dminus_m=round(float(-da[da < 0].sum())),
        decouple_pct=None if decouple is None else round(decouple, 2),
        has_hr=has_hr,
    )
    return summary, vga, vraw


def build_record_curve(
    activities: list[CanonicalActivity], cfg: Config
) -> tuple[RecordCurve, list[ActivitySummary]]:
    """Agrège les activités de course → courbe record ajustée + résumés par activité."""
    durs = np.asarray(cfg.twin.record_durations_s, dtype=float)
    best_vga = np.zeros(len(durs))
    best_vraw = np.zeros(len(durs))
    best_date: list[str | None] = [None] * len(durs)
    best_vraw_src = np.full(len(durs), np.nan)  # vraw de l'activité gagnante (test de platitude)
    summaries: list[ActivitySummary] = []

    for act in activities:
        if not act.is_running or act.duration_s < 60:
            continue
        try:
            summary, vga, vraw = process_activity(act, cfg)
        except Exception:  # noqa: BLE001 — une activité brouillonne n'arrête pas l'agrégat
            continue
        summaries.append(summary)
        for j in range(len(durs)):
            if np.isfinite(vga[j]) and vga[j] > best_vga[j]:
                best_vga[j] = vga[j]
                best_date[j] = summary.date
                best_vraw_src[j] = vraw[j]
            if np.isfinite(vraw[j]) and vraw[j] > best_vraw[j]:
                best_vraw[j] = vraw[j]

    flat_thr = cfg.twin.vc_flat_threshold
    w0, w1 = cfg.twin.vc_window_s
    points: list[RecordPoint] = []
    for j, T in enumerate(durs):
        if best_vga[j] <= 0:
            continue
        vr = best_vraw_src[j]
        flat = bool(
            np.isfinite(vr) and vr > 0 and (best_vga[j] - vr) / vr < flat_thr and w0 <= T <= w1
        )
        points.append(
            RecordPoint(
                duration_s=int(T),
                vga=float(best_vga[j]),
                vraw=float(vr) if np.isfinite(vr) else float("nan"),
                source_date=best_date[j],
                flat=flat,
            )
        )

    return RecordCurve(durations_s=durs, vga=best_vga, vraw=best_vraw, points=points), summaries


__all__ = ["ActivitySummary", "RecordPoint", "RecordCurve", "process_activity", "build_record_curve"]
