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

import logging
from collections import Counter
from dataclasses import asdict, dataclass, field

import numpy as np

from ..config import Config
from ..ingest.canonical import CanonicalActivity
from ..minetti import grade_factor

logger = logging.getLogger(__name__)


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
    moving_time_s: float | None = None   # temps en mouvement (§4.4) ; None si non mesurable
    has_altitude: bool | None = None     # None = inconnu (vieux agrégats sérialisés sans ce champ)

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
    vga: np.ndarray         # vitesse ajustée retenue par durée (m/s) ; 0 si pas de donnée
    vraw: np.ndarray        # vitesse brute de l'effort retenu par durée (m/s)
    points: list[RecordPoint]
    skipped: list[dict] = field(default_factory=list)  # activités écartées de la courbe (+ raison)

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

    # altitude : remplissage médian si trous, léger lissage (règle fixe : alt_smooth_s).
    # Sans aucun point d'altitude (activité écartée en amont de la courbe record), on évite
    # nanmedian sur un vecteur tout-NaN (bruit inutile) : la pente sera nulle de toute façon.
    alt = act.alt_m
    medalt = np.nanmedian(alt) if np.isfinite(alt).any() else np.nan
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

    # temps en mouvement (§4.4) : secondes où la vitesse dépasse le seuil (échantillonné à 1 Hz).
    # Sert au mode ``speed_basis=moving`` (ne pas diluer l'allure d'ultra avec les longs arrêts).
    speed = act.speed_ms
    moving_time_s = (
        float(np.count_nonzero(speed > cfg.twin.moving_speed_threshold_ms))
        if speed is not None and speed.size else None
    )

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
        moving_time_s=moving_time_s,
        has_altitude=act.has_altitude,
    )
    return summary, vga, vraw


def _windowed_speed_reject(vraw: np.ndarray, durs: np.ndarray, cfg: Config) -> bool:
    """True si une fenêtre ≥ ``record_reject_window_s`` soutient une vitesse brute impossible.

    Filet plus propre que le seul écrêtage par-seconde ``v_max_ms`` : un vélo ou un artefact
    GPS qui tient > ``record_reject_speed_ms`` (m/s) pendant ≥ 10 min trahit une activité qui
    n'est pas de la course → on l'écarte entièrement de la courbe record (twin-theory §2.3).
    """
    win = cfg.twin.record_reject_window_s
    ceil = cfg.twin.record_reject_speed_ms
    mask = durs >= win
    vr = vraw[mask]
    return bool(np.any(np.isfinite(vr) & (vr > ceil)))


def build_record_curve(
    activities: list[CanonicalActivity], cfg: Config
) -> tuple[RecordCurve, list[ActivitySummary]]:
    """Agrège les activités de course → courbe record ajustée robuste + résumés par activité.

    Durcissement (twin-theory §2.3, Problème A) contre les VC/exposants aberrants :
      * une activité **sans altitude** ne peut pas être ajustée à la pente → exclue de la
        courbe record (mais conservée dans les résumés pour la calibration/durabilité) ;
      * une activité à **vitesse soutenue impossible** (fenêtre ≥ seuil) est écartée ;
      * l'enveloppe est **robuste** : par durée, on retient la ``record_min_support``-ième
        meilleure vitesse (repli sur la meilleure disponible aux durées rares), si bien
        qu'**une seule** activité ne peut plus fixer VC ni l'exposant.
    """
    durs = np.asarray(cfg.twin.record_durations_s, dtype=float)
    ndur = len(durs)
    # contributions éligibles par durée : (vga, vraw, date)
    contrib: list[list[tuple[float, float, str | None]]] = [[] for _ in range(ndur)]
    summaries: list[ActivitySummary] = []
    skipped: list[dict] = []

    for act in activities:
        if not act.is_running or act.duration_s < 60:
            continue
        try:
            summary, vga, vraw = process_activity(act, cfg)
        except Exception as exc:  # noqa: BLE001 — une activité brouillonne n'arrête pas l'agrégat
            # ... mais elle doit être COMPTÉE : un diagnostic d'archive qui tait la casse ment.
            skipped.append({
                "date": act.start_time.date().isoformat() if act.start_time else None,
                "reason": f"processing_error: {type(exc).__name__}",
            })
            continue
        summaries.append(summary)

        # sans altitude : impossible d'ajuster à la pente → hors courbe record (résumé conservé)
        if not act.has_altitude:
            skipped.append({"date": summary.date, "reason": "no_altitude"})
            continue
        # vitesse soutenue impossible pour de la course (vélo/artefact) → écartée
        if _windowed_speed_reject(vraw, durs, cfg):
            skipped.append({"date": summary.date, "reason": "sustained_speed"})
            continue

        for j in range(ndur):
            if np.isfinite(vga[j]) and vga[j] > 0:
                vr = float(vraw[j]) if np.isfinite(vraw[j]) else float("nan")
                contrib[j].append((float(vga[j]), vr, summary.date))

    if skipped:
        by_reason = Counter(s["reason"] for s in skipped)
        logger.info("courbe record : %d activité(s) écartée(s) (%s)", len(skipped),
                    ", ".join(f"{r}: {c}" for r, c in by_reason.items()))

    flat_thr = cfg.twin.vc_flat_threshold
    w0, w1 = cfg.twin.vc_window_s
    # plancher de durée du fit VC (twin-theory §2.3) — 600 par défaut = no-op (début de fenêtre)
    w0 = max(w0, cfg.twin.vc_short_effort_floor_s)
    ceil = cfg.twin.vc_max_plausible_ms
    min_support = max(1, cfg.twin.record_min_support)

    best_vga = np.zeros(ndur)
    best_vraw = np.zeros(ndur)
    points: list[RecordPoint] = []
    for j, T in enumerate(durs):
        items = contrib[j]
        if not items:
            continue
        items.sort(key=lambda it: it[0], reverse=True)  # par vga décroissante
        # enveloppe robuste : N-ième meilleure si assez soutenue, sinon meilleure disponible
        k = min_support - 1 if len(items) >= min_support else 0
        vga_j, vr_j, date_j = items[k]
        best_vga[j] = vga_j
        best_vraw[j] = vr_j if np.isfinite(vr_j) else 0.0
        # plafond physiologique (m/s) sur les points « plats » servant à la VC
        if np.isfinite(vr_j) and vr_j > 0:
            ratio = (vga_j - vr_j) / vr_j
            # signé par défaut (capture du golden) ; symétrique = théorie §2.4 (|·| < seuil),
            # qui écarte aussi les records en DESCENTE nette (v_ga ≪ v_raw) du fit de la VC
            if cfg.twin.vc_flat_symmetric:
                ratio = abs(ratio)
            flat = bool(ratio < flat_thr and w0 <= T <= w1 and vga_j <= ceil)
        else:
            flat = False
        points.append(
            RecordPoint(
                duration_s=int(T),
                vga=float(vga_j),
                vraw=float(vr_j) if np.isfinite(vr_j) else float("nan"),
                source_date=date_j,
                flat=flat,
            )
        )

    return (
        RecordCurve(durations_s=durs, vga=best_vga, vraw=best_vraw, points=points, skipped=skipped),
        summaries,
    )


__all__ = ["ActivitySummary", "RecordPoint", "RecordCurve", "process_activity", "build_record_curve"]
