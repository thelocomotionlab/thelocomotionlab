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
from datetime import date as dt_date
from typing import Iterable, Iterator

import numpy as np

from ..config import Config
from ..ingest.canonical import CanonicalActivity
from ..minetti import grade_factor
from .stops import detect_stops as _detect_stops
from .stops import moving_mask as _moving_mask

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
    start_time: str | None = None        # départ ISO 8601 (UTC) ; clé du dédoublonnage — None sur
    #                                      les vieux agrégats (alors jamais fusionnés)
    # --- mesures du chantier v2 (Phase 2), None quand non mesurables ---------------------
    stops_s: float | None = None         # secondes dans les plateaux de distance ≥ twin.stop_min_s
    n_stops: int | None = None
    longest_stop_s: float | None = None  # plus long plateau de distance (s) — garde « sommeil »
    # --- coût de pente (Phase 5, C1) : ga = dist + surcoût de montée + surcoût de descente
    # (loi de Minetti, km) ; sommes par tranche de pente des secondes en mouvement avec FC
    ga_up_excess_km: float | None = None
    ga_down_excess_km: float | None = None
    slope_bins: dict | None = None
    night_share: float | None = None     # part de nuit (0–1) de l'écoulé (efforts longs, position connue)
    n_nights: int | None = None          # nombre de nuits traversées (blocs de nuit)
    # plus longue montée / descente CONTINUE de l'activité, mesurées comme sur un parcours
    # (même grille, même lissage, même hystérésis) : c'est ce qui rend comparable « la plus
    # grosse descente de ta course » et « la plus grosse que tu aies déjà descendue »
    longest_climb_m: float | None = None
    longest_descent_m: float | None = None
    half_split_ratio: float | None = None  # vga hors plateaux : seconde moitié de Deq ÷ première
    mean_alt_m: float | None = None      # altitude moyenne du canal altitude (efforts longs)

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
    # queue de la courbe (Phase 3, B2) : meilleures fenêtres LONGUES (twin.record_tail_durations_s)
    # des vrais ultras — séparée des points historiques, que VC, exposant et figure consomment
    tail_durations_s: np.ndarray = field(default_factory=lambda: np.zeros(0))
    tail_vga: np.ndarray = field(default_factory=lambda: np.zeros(0))
    tail_points: list[RecordPoint] = field(default_factory=list)

    @property
    def flat_points(self) -> list[RecordPoint]:
        return [p for p in self.points if p.flat]


def _distance_smoothed_altitude(dmono: np.ndarray, alt_f: np.ndarray, window_m: float) -> np.ndarray:
    """Altitude moyennée sur une fenêtre de DISTANCE (±window/2 m), comme le parcours (C1).

    Fenêtre par ``searchsorted`` sur la distance monotone + sommes cumulées : chaque
    échantillon reçoit la moyenne des altitudes des points situés à ±window/2 m — l'analogue,
    côté activité, du lissage 150 m du profil de course (base distance, pas base temps)."""
    half = window_m / 2.0
    lo = np.searchsorted(dmono, dmono - half, side="left")
    hi = np.searchsorted(dmono, dmono + half, side="right")
    cs = np.concatenate([[0.0], np.cumsum(alt_f)])
    return (cs[hi] - cs[lo]) / np.maximum(hi - lo, 1)


def despike_stats(act: CanonicalActivity, cfg: Config) -> dict:
    """Variables de décision du sauvetage §9.11 pour UNE activité — source unique.

    Utilisée par le moteur (:func:`_adjusted_distance`) pour DÉCIDER, et par l'outillage
    (``tools/diag_archive``) pour AFFICHER pourquoi un sauvetage a eu lieu ou a été refusé :
    on calibre les seuils sur des mesures, pas sur des suppositions. Clés :
    ``raw_km``/``despiked_km``/``kept_ratio``, ``n_bursts`` (fronts montants écrêtés),
    ``clipped_s`` (secondes écrêtées), ``max_block_loss_share`` (part de la perte portée
    par le plus gros bloc contigu — une téléportation ≈ 1.0), ``rescued``, ``refus``
    (raison humaine si le sauvetage était envisageable mais refusé, sinon None)."""
    tw = cfg.twin
    dmono = act.dist_m
    n = act.n
    dd_raw = np.diff(dmono)
    dd = np.clip(dd_raw, 0.0, tw.v_max_ms)
    raw_total = float(dmono[-1] - dmono[0]) if n else 0.0
    despiked = float(dd.sum())
    dur_s = float(act.t[-1]) if n else 0.0

    clip_mask = dd_raw > tw.v_max_ms
    edges = np.diff(clip_mask.astype(np.int8), prepend=0)
    starts = np.flatnonzero(edges == 1)
    ends = np.flatnonzero(edges == -1)
    if ends.size < starts.size:                      # masque se terminant écrêté
        ends = np.append(ends, dd_raw.size)
    loss = np.where(clip_mask, dd_raw - tw.v_max_ms, 0.0)
    total_loss = float(loss.sum())
    max_block = max((float(loss[a:b].sum()) for a, b in zip(starts, ends)), default=0.0)

    kept = despiked / raw_total if raw_total > 0 else 1.0
    raw_kmh = raw_total / dur_s * 3.6 if dur_s > 0 else 0.0
    rescued, refus = False, None
    if tw.despike_rescue_floor <= 0 or raw_total <= 0 or kept >= tw.despike_rescue_floor:
        pass                                          # rien à sauver (ou flag off)
    elif dur_s < tw.despike_rescue_min_hours * 3600:
        refus = f"durée < {tw.despike_rescue_min_hours:g} h"
    elif raw_kmh > tw.despike_rescue_max_raw_kmh:
        refus = (f"total brut {raw_kmh:.1f} km/h > {tw.despike_rescue_max_raw_kmh:g} "
                 "(pas de la course)")
    elif int(starts.size) < tw.despike_rescue_min_bursts:
        refus = f"{starts.size} bloc(s) écrêté(s) < {tw.despike_rescue_min_bursts}"
    else:
        rescued = True
    return {
        "raw_km": raw_total / 1000.0,
        "despiked_km": despiked / 1000.0,
        "kept_ratio": kept,
        "n_bursts": int(starts.size),
        "clipped_s": int(np.count_nonzero(clip_mask)),
        "max_block_loss_share": (max_block / total_loss) if total_loss > 0 else 0.0,
        "rescued": rescued,
        "refus": refus,
    }


def _adjusted_distance(act: CanonicalActivity, cfg: Config):
    """Distance ajustée à la pente (cumulée) + distance brute dé-spikée + altitude lissée."""
    dmono = act.dist_m  # déjà monotone (schéma canonique)
    n = act.n
    # écrêtage de la vitesse brute par seconde (pas dt = 1 s)
    dd_raw = np.diff(dmono)
    dd = np.clip(dd_raw, 0.0, cfg.twin.v_max_ms)
    draw = np.concatenate([[0.0], np.cumsum(dd)])

    # --- sauvetage du canal distance haché (§9.11) : l'écrêtage est prévu pour quelques
    # artefacts — quand il ampute une grande part de la distance d'une activité LONGUE dont
    # le total brut reste plausible pour de la course, c'est l'ENREGISTREMENT qui est en
    # rafales (paquets de distance), pas la distance qui est fausse. Repli : distance brute
    # non écrêtée ; l'appelant EXCLUT alors l'activité de la courbe record (les fenêtres de
    # vitesse par-seconde d'un canal haché n'ont plus de sens), le résumé est conservé.
    # Discriminant téléportation (min_bursts) et décision : voir :func:`despike_stats`.
    stats = despike_stats(act, cfg)
    rescued = bool(stats["rescued"])
    if rescued:
        dd = dd_raw
        draw = np.concatenate([[0.0], np.cumsum(dd)])
        logger.info(
            "canal distance haché sauvé (§9.11, %s) : brut %.1f km conservé "
            "(écrêté %.1f km, %d bloc(s) écrêté(s)) — hors courbe record",
            act.start_time.date().isoformat() if act.start_time else "date inconnue",
            stats["raw_km"], stats["despiked_km"], stats["n_bursts"],
        )

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
    return draw, dga, alts, alt_f, rescued, grad, f, dd


_HR_REF = 60.0   # FC de référence des sommes par tranche de pente (ln(FC − 60), 1/(FC − 60))


def slope_bin_centers(cfg: Config) -> np.ndarray:
    """Centres des tranches de pente (%), de −slope_max_pct à +slope_max_pct par slope_bin_pct,
    la tranche centrale à 0 (le plat)."""
    tw = cfg.twin
    k = int(round(tw.slope_max_pct / tw.slope_bin_pct))
    return np.arange(-k, k + 1) * float(tw.slope_bin_pct)


def _slope_bins(dd: np.ndarray, grad: np.ndarray, hr: np.ndarray, moving: np.ndarray,
                cfg: Config) -> dict | None:
    """Sommes par tranche de pente (Phase 5, C1) sur les incréments en mouvement avec FC :
    secondes, Σ ln(vitesse brute), Σ ln(FC − 60), Σ 1/(FC − 60) — la FC lue ``slope_hr_lag_s``
    plus tard que l'incrément (retard de la réponse cardiaque). La matière du coût de pente
    personnel, sans tableau 1 Hz ; None sans incrément exploitable."""
    tw = cfg.twin
    centers = slope_bin_centers(cfg)
    nb = len(centers)
    m = dd.size
    lag = max(int(tw.slope_hr_lag_s), 0)
    hr_l = np.full(m, np.nan)
    if lag < m:
        hr_l[: m - lag] = hr[1 + lag: 1 + m]
    with np.errstate(invalid="ignore"):
        ok = (moving & (dd > 0) & np.isfinite(hr_l) & (hr_l >= tw.slope_hr_min_bpm)
              & np.isfinite(grad) & (hr_l > _HR_REF))
    if not ok.any():
        return None
    idx = np.rint(grad * 100.0 / tw.slope_bin_pct).astype(int) + nb // 2
    ok &= (idx >= 0) & (idx < nb)
    if not ok.any():
        return None
    idx, v, h = idx[ok], dd[ok], hr_l[ok] - _HR_REF
    return {
        "n": np.bincount(idx, minlength=nb).tolist(),
        "sum_lnv": np.bincount(idx, weights=np.log(v), minlength=nb).tolist(),
        "sum_lnh": np.bincount(idx, weights=np.log(h), minlength=nb).tolist(),
        "sum_invh": np.bincount(idx, weights=1.0 / h, minlength=nb).tolist(),
    }


def tail_durations(cfg: Config) -> tuple[int, ...]:
    """Durées de la queue de la courbe record : celles de ``record_tail_durations_s``
    strictement au-delà de la plus longue durée historique (jamais de doublon)."""
    top = max(cfg.twin.record_durations_s) if cfg.twin.record_durations_s else 0
    return tuple(int(t) for t in cfg.twin.record_tail_durations_s if int(t) > top)


def process_activity(act: CanonicalActivity, cfg: Config):
    """→ (:class:`ActivitySummary`, vga_par_durée, vraw_par_durée) — interface historique."""
    summary, vga, vraw, _ = process_activity_full(act, cfg)
    return summary, vga, vraw


def process_activity_full(act: CanonicalActivity, cfg: Config):
    """→ (:class:`ActivitySummary`, vga_par_durée, vraw_par_durée, vga_fenêtres_longues)."""
    durs = np.asarray(cfg.twin.record_durations_s, dtype=float)
    draw, dga, alts, alt_f, distance_rescued, grad, f_slope, dd_used = _adjusted_distance(act, cfg)
    tg = act.t
    n = act.n

    # --- plausibilité du ratio ga/brut (§9.10) : une activité LONGUE dont l'équivalent
    # plat s'effondre sous floor × distance brute est physiquement impossible (il faudrait
    # descendre raide pendant des heures) — altitude corrompue. Repli : f=1 (l'équivalent
    # plat redevient la distance brute), D± nuls, activité marquée sans altitude fiable.
    # Symétrique du plafond f_cap (anti-bruit vers le haut) ; 0 = désactivé.
    alt_unusable = False
    tw = cfg.twin
    if (act.has_altitude and tw.ga_plausibility_floor > 0 and n
            and float(tg[-1]) >= tw.ga_plausibility_min_hours * 3600
            and draw[-1] > 0 and dga[-1] / draw[-1] < tw.ga_plausibility_floor):
        alt_unusable = True
        dga = draw

    # canal distance sauvé (§9.11) : l'alignement altitude↔distance par seconde est cassé —
    # la pente échantillonnée pendant les blocs de rattrapage est du bruit, et l'ajustement
    # Minetti pondéré par ces incréments a produit un équivalent plat ×2,10 MESURÉ sur le
    # cas réel (ga 150,5 km pour 71,5 brut). Mêmes replis que §9.10 : f=1, D± nuls,
    # altitude marquée non fiable. Seuls le TOTAL et la durée d'un canal haché sont sûrs.
    slope_unusable = alt_unusable or distance_rescued
    if distance_rescued:
        dga = draw
    # décomposition exacte de l'équivalent plat (Phase 5, C1) : brut + surcoût de montée +
    # surcoût de descente sous la loi de Minetti ; nuls quand la pente n'est pas exploitable
    if slope_unusable:
        ga_up_excess = ga_down_excess = 0.0
    else:
        exc = (f_slope[:-1] - 1.0) * dd_used
        g_inc = grad[:-1]
        ga_up_excess = float(np.sum(exc[g_inc > 0])) / 1000.0
        ga_down_excess = float(np.sum(exc[g_inc < 0])) / 1000.0

    vga = np.full(len(durs), np.nan)
    vraw = np.full(len(durs), np.nan)
    # canal distance sauvé (§9.11) : les fenêtres de vitesse par-seconde d'un canal en
    # rafales sont des artefacts → aucune contribution à la courbe record (vga/vraw NaN),
    # le résumé (distance totale, vga moyenne, D±) reste servi à la calibration.
    if not distance_rescued:
        for j, T in enumerate(durs):
            T = int(T)
            if n <= T:
                break
            vga[j] = np.nanmax((dga[T:] - dga[:-T]) / T)
            vraw[j] = np.nanmax((draw[T:] - draw[:-T]) / T)
    # fenêtres LONGUES (Phase 3, B2) : même mesure, durées de la queue de la courbe record
    tail = tail_durations(cfg)
    vga_tail = np.full(len(tail), np.nan)
    if not distance_rescued:
        for j, T in enumerate(tail):
            if n <= T:
                break
            vga_tail[j] = np.nanmax((dga[T:] - dga[:-T]) / T)

    # D+ / D− : sur l'altitude lissée 5 s (historique) ou sur base de DISTANCE 150 m —
    # cohérente avec le D+ du parcours, cf. C1 (le D+ étant une variation totale, l'échelle
    # de lissage change la valeur ; β2 doit être appris et appliqué sur la MÊME échelle).
    if cfg.twin.dplus_basis == "distance_150m" and act.has_altitude:
        da = np.diff(_distance_smoothed_altitude(act.dist_m, alt_f, cfg.twin.dplus_smooth_window_m))
    else:
        da = np.diff(alts)
    if slope_unusable:
        da = np.zeros(0)   # D± issus d'un couple altitude↔distance cassé : on n'invente pas
        # §9.11 (a) : le TOTAL du D± ne dépend que du canal altitude — sur un canal DISTANCE
        # haché dont l'altitude n'est pas elle-même condamnée (§9.10), on le récupère en base
        # TEMPS (échelle time_5s, ≈ +15 % vs distance_150m — §9.6 : biais d'échelle borné,
        # très supérieur à dpk=0 qui faussait l'ancre du blend et la régression).
        if (distance_rescued and not alt_unusable and act.has_altitude
                and cfg.twin.despike_rescue_dplus_basis == "time"):
            da = np.diff(alts)
    dur = float(tg[-1])

    # masque « en mouvement » sur les incréments de distance (partagé par moving_time et le
    # découplage en base moving) — le canal vitesse, interpolé à travers les pauses, ment (C2)
    dd_raw = np.diff(act.dist_m)
    moving_mask = _moving_mask(act.dist_m, cfg.twin.moving_speed_threshold_ms)

    # découplage (durabilité) : nécessite la FC ; sinon None → signalé en aval
    decouple = None
    hr = act.hr
    if dur >= cfg.twin.decouple_min_duration_s and np.isfinite(hr).any():
        sp = np.gradient(dga, tg)
        half = n // 2
        # base configurable (C7) : en ``elapsed`` (défaut) toutes les secondes comptent —
        # identique au calcul historique ; en ``moving`` les arrêts (ravitos : v≈0, FC>60)
        # ne plombent plus la moitié qui les contient. skip_start ignore l'échauffement.
        valid = np.ones(n, dtype=bool)
        skip = int(cfg.twin.decouple_skip_start_s)
        if skip > 0:
            valid[: min(skip, n)] = False
        if cfg.twin.decouple_basis == "moving":
            valid &= moving_mask
        with np.errstate(all="ignore"):
            eff = sp / np.where(hr > 60, hr, np.nan)
            eff = np.where(valid, eff, np.nan)
            e1 = np.nanmean(eff[:half]) if np.isfinite(eff[:half]).any() else np.nan
            e2 = np.nanmean(eff[half:]) if np.isfinite(eff[half:]).any() else np.nan
        if np.isfinite(e1) and e1 > 0 and np.isfinite(e2):
            decouple = float((e1 - e2) / e1 * 100)

    has_hr = bool(np.isfinite(hr).any())
    avhr = float(np.nanmean(hr)) if has_hr else float("nan")

    # temps en mouvement (§4.4) : compté sur les INCRÉMENTS DE DISTANCE à 1 Hz, pas sur le
    # canal vitesse — celui-ci est interpolé À TRAVERS les pauses de montre (entre deux
    # échantillons à ~3 m/s, la vitesse interpolée reste ~3 m/s pendant toute la pause, alors
    # que la distance fait un plateau) : compté sur la vitesse, une pause passait pour du
    # mouvement et émoussait le mode ``speed_basis=moving`` (H2, revue C2).
    moving_time_s = float(np.count_nonzero(moving_mask)) if dd_raw.size else None

    # sommes par tranche de pente (Phase 5, C1) : secondes en mouvement avec FC, pente
    # exploitable et canal distance sain
    slope_bins = None
    if has_hr and not slope_unusable and dd_raw.size:
        slope_bins = _slope_bins(dd_used, grad[:-1], hr, moving_mask[1:], cfg)

    # arrêts francs = plateaux de distance ≥ stop_min_s (Phase 2, B4) : la base « plateaux »
    # de la calibration retire ces secondes-là, pas la marche lente sous le seuil de vitesse
    stops = _detect_stops(moving_mask, cfg.twin.stop_min_s) if dd_raw.size else []
    stops_s = float(sum(st.duration_s for st in stops)) if dd_raw.size else None
    n_stops = len(stops) if dd_raw.size else None
    longest_stop_s = float(max((st.duration_s for st in stops), default=0)) if dd_raw.size else None

    # mesures réservées aux efforts longs : nuit (C2), moitiés (fade), altitude moyenne (C3)
    night_share = half_split = mean_alt = None
    n_nights = longest_climb = longest_descent = None
    if dur >= cfg.twin.long_effort_min_hours * 3600:
        night_share = _night_share_of(act)
        n_nights = _nights_of(act)
        longest_climb, longest_descent = _plus_longs_reliefs(act.dist_m, act.alt_m, cfg)
        half_split = _half_split_ratio(dga, stops, n)
        if act.has_altitude and not alt_unusable and np.isfinite(act.alt_m).any():
            mean_alt = float(np.nanmean(act.alt_m))

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
        has_altitude=act.has_altitude and not slope_unusable,
        start_time=act.start_time.isoformat() if act.start_time else None,
        stops_s=stops_s,
        n_stops=n_stops,
        longest_stop_s=longest_stop_s,
        ga_up_excess_km=round(ga_up_excess, 4),
        ga_down_excess_km=round(ga_down_excess, 4),
        slope_bins=slope_bins,
        night_share=None if night_share is None else round(night_share, 4),
        n_nights=n_nights,
        longest_climb_m=None if longest_climb is None else round(longest_climb),
        longest_descent_m=None if longest_descent is None else round(longest_descent),
        half_split_ratio=None if half_split is None else round(half_split, 4),
        mean_alt_m=None if mean_alt is None else round(mean_alt),
    )
    return summary, vga, vraw, vga_tail


def _night_share_of(act: CanonicalActivity) -> float | None:
    """Part de nuit de l'écoulé, par le test jour/nuit du plan (``pacing/sun``) au fuseau
    solaire de la longitude — la même mesure que la radiographie des ultras. None sans
    position ni heure de départ."""
    if act.start_time is None:
        return None
    finite = np.isfinite(act.lat) & np.isfinite(act.lon)
    if not finite.any():
        return None
    from datetime import timedelta, timezone

    from ..pacing.sun import night_share   # import différé : pacing dépend de twin

    la, lo = float(np.median(act.lat[finite])), float(np.median(act.lon[finite]))
    tz = float(round(lo / 15.0))
    start_local = act.start_time.astimezone(timezone(timedelta(hours=tz)))
    return night_share(start_local, act.duration_s / 3600.0, la, lo, tz)


def _nights_of(act: CanonicalActivity) -> int | None:
    """Nombre de nuits traversées : les blocs de nuit du même masque que le plan. Un départ
    de nuit compte pour une nuit. None sans position ni heure de départ."""
    from datetime import timedelta, timezone

    if act.start_time is None:
        return None
    finite = np.isfinite(act.lat) & np.isfinite(act.lon)
    if not finite.any():
        return None
    from ..pacing.sun import night_mask   # import différé : pacing dépend de twin

    la, lo = float(np.median(act.lat[finite])), float(np.median(act.lon[finite]))
    tz = float(round(lo / 15.0))
    start_local = act.start_time.astimezone(timezone(timedelta(hours=tz)))
    mask = night_mask(start_local, act.duration_s, la, lo, tz, step_s=300)
    if mask.size == 0:
        return None
    debuts = int(np.count_nonzero(np.diff(mask.astype(np.int8)) == 1))
    return debuts + (1 if bool(mask[0]) else 0)


def _plus_longs_reliefs(dist_m: np.ndarray, alt_m: np.ndarray, cfg: Config):
    """(plus longue montée, plus longue descente) continues, en mètres de dénivelé.

    Même chaîne que pour un parcours : grille de distance au pas de la config, lissage à la
    fenêtre de la config, puis l'hystérésis de ``course.montees``. Sans altitude exploitable
    ou sous un kilomètre, (None, None).
    """
    from ..course.montees import TOLERANCE_M, bornes   # module sans dépendance lourde

    ok = np.isfinite(dist_m) & np.isfinite(alt_m)
    if int(ok.sum()) < 10:
        return None, None
    d, a = np.asarray(dist_m, float)[ok], np.asarray(alt_m, float)[ok]
    d = d - d[0]
    total = float(d[-1])
    if total < 1000.0 or not np.all(np.diff(d) >= 0):
        d, a = np.maximum.accumulate(d), a
        total = float(d[-1])
        if total < 1000.0:
            return None, None
    step = float(cfg.course.grid_step_m)
    xg = np.arange(0.0, total, step)
    eg = np.interp(xg, d, a)
    k = max(1, int(round(cfg.course.smooth_window_m / step)))
    es = np.convolve(np.pad(eg, k, mode="reflect"), np.ones(k) / k, mode="same")[k:-k]
    haut, bas = bornes(es, TOLERANCE_M)
    up = max((float(es[i1] - es[i0]) for i0, i1 in haut if i1 > i0), default=0.0)
    down = max((float(es[i0] - es[i1]) for i0, i1 in bas if i1 > i0), default=0.0)
    return up, down


def _half_split_ratio(dga: np.ndarray, stops, n: int) -> float | None:
    """Rapport des moitiés : vitesse ajustée HORS PLATEAUX de la seconde moitié de la distance
    ajustée ÷ celle de la première. < 1 = l'athlète ralentit (fade réel) ; None si une moitié
    n'a pas de temps actif ou si la distance est nulle."""
    total = float(dga[-1]) if n else 0.0
    if total <= 0:
        return None
    active = np.ones(n, dtype=bool)
    active[0] = False
    for st in stops:
        active[st.start_s:st.end_s] = False
    i_half = int(np.searchsorted(dga, total / 2.0))
    sec1 = int(np.count_nonzero(active[: i_half + 1]))
    sec2 = int(np.count_nonzero(active[i_half + 1:]))
    if sec1 <= 0 or sec2 <= 0:
        return None
    d1 = float(dga[i_half])
    d2 = total - d1
    if d1 <= 0 or d2 <= 0:
        return None
    return (d2 / sec2) / (d1 / sec1)


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


@dataclass(frozen=True)
class ActivityContribution:
    """Ce qu'UNE activité apporte au jumeau, une fois le 1 Hz digéré : des agrégats.

    Sépare le coût (décodage + ``process_activity``, qui domine tout) de l'agrégation
    (maximum par durée, instantanée). Une coupure temporelle ne fait que **retirer** des
    activités : elle ne change pas ce que chacune apporte. Le banc walk-forward peut donc
    décoder l'archive **une seule fois** et rejouer N coupures dessus — cf.
    :func:`record_from_contributions`.

    Ne porte AUCUN tableau 1 Hz : la mémoire reste O(1 activité) en flux, et une liste de
    contributions pèse quelques Ko par activité.
    """

    start_date: dt_date | None            # date de l'activité (coupure) ; None = non datée
    summary: ActivitySummary | None       # None = pré-filtrée (non course / < 60 s) ou en erreur
    vga: np.ndarray | None                # None = hors courbe record (cf. ``skipped``)
    vraw: np.ndarray | None
    skipped: dict | None = None           # {"date", "reason"} si écartée de la courbe record
    vga_tail: np.ndarray | None = None    # meilleures fenêtres LONGUES (record_tail_durations_s), Phase 3


def iter_contributions(
    activities: Iterable[CanonicalActivity], cfg: Config
) -> Iterator[ActivityContribution]:
    """Phase COÛTEUSE : une contribution par activité du flux (ordre préservé).

    L'ordre compte : à égalité de vitesse ajustée, c'est lui qui décide quelle activité
    fournit le point record. Filtrer une liste de contributions préserve cet ordre, donc
    les résultats sont identiques à un décodage direct.
    """
    durs = np.asarray(cfg.twin.record_durations_s, dtype=float)
    for act in activities:
        day = act.start_time.date() if act.start_time else None
        if not act.is_running or act.duration_s < 60:
            yield ActivityContribution(day, None, None, None)
            continue
        try:
            summary, vga, vraw, vga_tail = process_activity_full(act, cfg)
        except Exception as exc:  # noqa: BLE001 — une activité brouillonne n'arrête pas l'agrégat
            # ... mais elle doit être COMPTÉE : un diagnostic d'archive qui tait la casse ment.
            yield ActivityContribution(day, None, None, None, skipped={
                "date": day.isoformat() if day else None,
                "reason": f"processing_error: {type(exc).__name__}",
            })
            continue
        # sans altitude : impossible d'ajuster à la pente → hors courbe record (résumé conservé)
        if not act.has_altitude:
            yield ActivityContribution(day, summary, None, None,
                                       skipped={"date": summary.date, "reason": "no_altitude"})
            continue
        # vitesse soutenue impossible pour de la course (vélo/artefact) → écartée
        if _windowed_speed_reject(vraw, durs, cfg):
            yield ActivityContribution(day, summary, None, None,
                                       skipped={"date": summary.date, "reason": "sustained_speed"})
            continue
        yield ActivityContribution(day, summary, vga, vraw, vga_tail=vga_tail)


def _richness(s: ActivitySummary) -> tuple:
    """Ordre de préférence entre copies d'une même activité : FC, altitude, découplage."""
    return (bool(s.has_hr), bool(s.has_altitude), s.decouple_pct is not None)


def select_unique_contributions(
    contributions: list[ActivityContribution], cfg: Config
) -> tuple[list[int], list[dict]]:
    """Indices des contributions à garder, et les doublons écartés (``{"date", "reason"}``).

    Doublon = même heure de départ (ISO, à la seconde), durée à ±5 s, distance à ±2 % :
    deux exports qui se recouvrent livrent la même activité deux fois, parfois sous deux
    formats (l'une avec FC, l'autre sans). On garde la copie la plus riche, sinon la
    première. Sans heure de départ (vieux agrégats), rien n'est fusionné. ``off`` ⇒ tout est
    gardé (comportement historique)."""
    n = len(contributions)
    if cfg.twin.dedup_activities != "on":
        return list(range(n)), []
    by_start: dict[str, list[int]] = {}
    kept: list[int] = []
    for i, c in enumerate(contributions):
        s = c.summary
        if s is None or not s.start_time:
            kept.append(i)
            continue
        by_start.setdefault(s.start_time, []).append(i)
    dropped: list[dict] = []
    for idxs in by_start.values():
        clusters: list[list[int]] = []
        for i in idxs:
            s = contributions[i].summary
            for cl in clusters:
                r = contributions[cl[0]].summary
                if (abs(s.duration_s - r.duration_s) <= 5.0
                        and abs(s.dist_km - r.dist_km) <= 0.02 * max(r.dist_km, 0.1) + 0.05):
                    cl.append(i)
                    break
            else:
                clusters.append([i])
        for cl in clusters:
            best = max(cl, key=lambda j: (_richness(contributions[j].summary), -j))
            kept.append(best)
            dropped += [{"date": contributions[j].summary.date, "reason": "duplicate"}
                        for j in cl if j != best]
    kept.sort()
    return kept, dropped


def record_from_contributions(
    contributions: Iterable[ActivityContribution], cfg: Config
) -> tuple[RecordCurve, list[ActivitySummary]]:
    """Phase INSTANTANÉE : agrège des contributions déjà calculées en courbe record.

    Les contributions (agrégats, quelques Ko chacune) sont matérialisées pour le
    dédoublonnage — la mémoire 1 Hz est libérée bien avant."""
    durs = np.asarray(cfg.twin.record_durations_s, dtype=float)
    ndur = len(durs)
    # contributions éligibles par durée : (vga, vraw, date)
    contrib: list[list[tuple[float, float, str | None]]] = [[] for _ in range(ndur)]
    summaries: list[ActivitySummary] = []
    skipped: list[dict] = []

    contributions = list(contributions)
    kept, duplicates = select_unique_contributions(contributions, cfg)
    if duplicates:
        logger.info("dédoublonnage : %d copie(s) d'activité écartée(s)", len(duplicates))
        skipped += duplicates

    # queue de la courbe (Phase 3, B2) : fenêtres longues des seuls efforts qui passent le
    # filtre « vrai ultra » servi (un bivouac ou un OFF avec sommeil n'en fournit pas)
    from ..calibration import genuine_gate_failures   # import différé : calibration dépend de record

    tail_durs = np.asarray(tail_durations(cfg), dtype=float)
    tail_contrib: list[list[tuple[float, str | None]]] = [[] for _ in range(len(tail_durs))]

    for i in kept:
        c = contributions[i]
        if c.summary is not None:
            summaries.append(c.summary)
        if c.skipped is not None:
            skipped.append(c.skipped)
        if c.vga is None:
            continue
        vga, vraw = c.vga, c.vraw
        for j in range(ndur):
            if np.isfinite(vga[j]) and vga[j] > 0:
                vr = float(vraw[j]) if np.isfinite(vraw[j]) else float("nan")
                contrib[j].append((float(vga[j]), vr, c.summary.date))
        vt = c.vga_tail
        if vt is not None and len(vt) == len(tail_durs) and np.isfinite(vt).any() \
                and not genuine_gate_failures(c.summary, cfg):
            for j in range(len(tail_durs)):
                if np.isfinite(vt[j]) and vt[j] > 0:
                    tail_contrib[j].append((float(vt[j]), c.summary.date))

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

    # queue : même règle de support (N-ième meilleure fenêtre si assez soutenue)
    tail_vga = np.zeros(len(tail_durs))
    tail_points: list[RecordPoint] = []
    for j, T in enumerate(tail_durs):
        items = tail_contrib[j]
        if not items:
            continue
        items.sort(key=lambda it: it[0], reverse=True)
        k = min_support - 1 if len(items) >= min_support else 0
        vga_j, date_j = items[k]
        tail_vga[j] = vga_j
        tail_points.append(RecordPoint(duration_s=int(T), vga=float(vga_j), vraw=float("nan"),
                                       source_date=date_j, flat=False))

    return (
        RecordCurve(durations_s=durs, vga=best_vga, vraw=best_vraw, points=points, skipped=skipped,
                    tail_durations_s=tail_durs, tail_vga=tail_vga, tail_points=tail_points),
        summaries,
    )


def build_record_curve(
    activities: Iterable[CanonicalActivity], cfg: Config
) -> tuple[RecordCurve, list[ActivitySummary]]:
    """Agrège les activités de course → courbe record ajustée robuste + résumés par activité.

    Durcissement (twin-theory §2.3, Problème A) contre les VC/exposants aberrants :
      * une activité **sans altitude** ne peut pas être ajustée à la pente → exclue de la
        courbe record (mais conservée dans les résumés pour la calibration/durabilité) ;
      * une activité à **vitesse soutenue impossible** (fenêtre ≥ seuil) est écartée ;
      * l'enveloppe est **robuste** : par durée, on retient la ``record_min_support``-ième
        meilleure vitesse (repli sur la meilleure disponible aux durées rares), si bien
        qu'**une seule** activité ne peut plus fixer VC ni l'exposant.

    Composition des deux phases ci-dessus, en FLUX (générateur consommé paresseusement) :
    la mémoire reste O(1 activité), comme avant la séparation.
    """
    return record_from_contributions(iter_contributions(activities, cfg), cfg)


__all__ = ["ActivitySummary", "ActivityContribution", "RecordPoint", "RecordCurve",
           "despike_stats", "process_activity", "process_activity_full", "tail_durations",
           "slope_bin_centers",
           "build_record_curve", "iter_contributions", "record_from_contributions",
           "select_unique_contributions"]
