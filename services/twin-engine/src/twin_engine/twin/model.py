"""Des données aux paramètres physiologiques (twin-theory §2.4–2.6).

Vitesse critique + réserve D′ (modèle hyperbolique sur efforts plats propres, incertitude
par bootstrap), exposant d'endurance E (loi de puissance sur l'enveloppe longue),
durabilité (découplage médian des longues sorties). Reprend twin_fit.py (parties A et B),
paramétré et dégradant proprement quand la donnée manque.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as _date
from datetime import timedelta

import numpy as np

from ..config import Config
from ..ingest.canonical import CanonicalActivity
from .record import (ActivitySummary, RecordCurve, iter_contributions,
                     record_from_contributions)


@dataclass(frozen=True)
class CriticalSpeed:
    vc_ms: float
    vc_sd: float
    dprime_m: float
    dprime_sd: float
    from_flat_efforts: bool   # False = ajusté faute d'efforts plats (confiance réduite)
    n_points: int
    plausible: bool = True     # False = VC au-dessus du plafond physiologique → % de VC non affiché

    @property
    def vc_kmh(self) -> float:
        return self.vc_ms * 3.6


@dataclass
class Twin:
    """Le « jumeau » physiologique de l'athlète, calculé depuis ses données."""

    critical_speed: CriticalSpeed | None
    alpha: float | None
    endurance_E: float | None
    endurance_coef: float | None  # v_env(t) = coef · t^(−α) (m/s), pour le fallback VC+E
    durability_pct: float | None
    record: RecordCurve
    summaries: list[ActivitySummary] = field(default_factory=list)
    # --- Phase 3 : information sur la pente au-delà de 6 h (mesures ; servies derrière flag)
    alpha_eff: float | None = None            # efficacité-durée : ln(vga ÷ (FC − FC0)) = c − α_eff·ln T
    alpha_eff_detail: dict | None = None      # n, FC0 et sa source, plage de durées
    alpha_tail: float | None = None           # exposant de la queue de la courbe record (≥ record_tail_from_s)
    alpha_tail_n: int = 0                     # points de l'ajustement de queue
    level_marks: dict[str, float] | None = None   # VC (m/s) de l'époque des candidats ultras, par date

    @property
    def vc_ms(self) -> float | None:
        return self.critical_speed.vc_ms if self.critical_speed else None

    def envelope_vga_ms(self, t_s: float) -> float | None:
        """Enveloppe d'endurance (vitesse ajustée, m/s) extrapolée à la durée ``t_s``.

        Sert au repli « peu d'ultras » : la meilleure allure ajustée soutenable sur la
        durée de course, en l'absence de vrais ultras pour caler la régression.
        """
        if self.alpha is None or self.endurance_coef is None:
            return None
        return float(self.endurance_coef * t_s ** (-self.alpha))

    def to_dict(self) -> dict:
        cs = self.critical_speed
        return {
            "vc_ms": None if cs is None else round(cs.vc_ms, 4),
            "vc_kmh": None if cs is None else round(cs.vc_kmh, 3),
            "vc_sd_ms": None if cs is None else round(cs.vc_sd, 4),
            "dprime_m": None if cs is None else round(cs.dprime_m),
            "dprime_sd_m": None if cs is None else round(cs.dprime_sd),
            "vc_from_flat_efforts": None if cs is None else cs.from_flat_efforts,
            "vc_plausible": None if cs is None else cs.plausible,
            "alpha": None if self.alpha is None else round(self.alpha, 4),
            "endurance_E": None if self.endurance_E is None else round(self.endurance_E, 3),
            "durability_pct": None if self.durability_pct is None else round(self.durability_pct, 1),
            "n_activities": len(self.summaries),
            "alpha_eff": None if self.alpha_eff is None else round(self.alpha_eff, 4),
            "alpha_tail": None if self.alpha_tail is None else round(self.alpha_tail, 4),
        }


def fit_critical_speed(record: RecordCurve, cfg: Config, *, bootstrap: bool = True
                       ) -> CriticalSpeed | None:
    """Modèle hyperbolique d = VC·t + D′ sur les efforts plats propres (bootstrap).

    ``bootstrap=False`` ne rend que l'estimation ponctuelle (écarts-types à 0) : c'est ce
    que demande la VC d'époque du recalage de niveau, calculée pour chaque candidat ultra."""
    w0, w1 = cfg.twin.vc_window_s
    w0 = max(w0, cfg.twin.vc_short_effort_floor_s)  # même plancher que le marquage « plat »
    ceil = cfg.twin.vc_max_plausible_ms
    flat = [(p.duration_s, p.vga) for p in record.flat_points]
    from_flat = True
    if len(flat) < 2:
        # dégradation : faute d'efforts plats, on prend les points de la fenêtre VC, toujours
        # bornés par le plafond physiologique (un point trop rapide ne peut pas caler la VC)
        from_flat = False
        flat = [
            (p.duration_s, p.vga)
            for p in record.points
            if w0 <= p.duration_s <= w1 and 0 < p.vga <= ceil
        ]
    if len(flat) < 2:
        return None

    pts = np.asarray(flat, dtype=float)
    t = pts[:, 0]
    d = pts[:, 0] * pts[:, 1]
    a = np.vstack([t, np.ones_like(t)]).T
    (vc, dprime), *_ = np.linalg.lstsq(a, d, rcond=None)

    n_boot = cfg.twin.vc_bootstrap_n if bootstrap else 0
    rng = np.random.default_rng(cfg.twin.vc_bootstrap_seed)
    vcs = np.zeros(max(n_boot, 1))
    dps = np.zeros(max(n_boot, 1))
    for b in range(n_boot):
        ii = rng.integers(0, len(t), len(t))
        (c0, c1), *_ = np.linalg.lstsq(np.vstack([t[ii], np.ones_like(t[ii])]).T, d[ii], rcond=None)
        vcs[b] = c0
        dps[b] = c1

    # garde-fou final : une VC ajustée encore au-dessus du plafond → confiance réduite, pas de % VC
    plausible = bool(vc <= ceil)
    if not plausible:
        from_flat = False

    return CriticalSpeed(
        vc_ms=float(vc),
        vc_sd=float(vcs.std()),
        dprime_m=float(dprime),
        dprime_sd=float(dps.std()),
        from_flat_efforts=from_flat,
        n_points=len(t),
        plausible=plausible,
    )


def fit_endurance_exponent(record: RecordCurve, cfg: Config):
    """Loi de puissance v_ga ∝ t^(−α) → (α, exposant de Riegel E, coefficient).

    Le coefficient ``coef = exp(intercept)`` permet de reconstruire l'enveloppe
    ``v_env(t) = coef·t^(−α)`` (m/s) pour le repli VC+E.

    Durcissement (Problème A) : l'exposant se lit sur la même enveloppe record que la VC,
    donc il hérite du **même plafond physiologique** — un point plus rapide que
    ``vc_max_plausible_ms`` (activité contaminée résiduelle) est écarté de la régression
    log-log, sinon il tire l'exposant vers l'absurde. Une pente log-log positive (α ≤ 0,
    « allure qui augmente avec la durée ») est elle aussi rejetée : ni exposant ni enveloppe.
    """
    w0, w1 = cfg.twin.endurance_window_s
    ceil = cfg.twin.vc_max_plausible_ms
    mask = (
        (record.durations_s >= w0)
        & (record.durations_s <= w1)
        & (record.vga > 0)
        & (record.vga <= ceil)
    )
    if mask.sum() < 2:
        return None, None, None
    lt = np.log(record.durations_s[mask])
    lv = np.log(record.vga[mask])
    slope, intercept = np.polyfit(lt, lv, 1)
    alpha = -float(slope)
    coef = float(np.exp(intercept))
    if alpha <= 0.0:  # pente positive → non physique (contamination résiduelle) → inexploitable
        return None, None, None
    if alpha >= 1.0:  # garde-fou numérique (E exploserait)
        return alpha, None, coef
    return alpha, 1.0 / (1.0 - alpha), coef


def _recency_weights_by_date(dates: list[str | None], halflife_days: float) -> np.ndarray:
    """Poids 0,5^(âge ÷ demi-vie) par rapport à la date la plus récente ; poids 1 partout
    sans demi-vie ou sans deux dates lisibles ; un effort non daté reçoit le plus faible
    poids daté (même convention que la calibration)."""
    n = len(dates)
    if halflife_days <= 0:
        return np.ones(n)
    parsed: list[_date | None] = []
    for d in dates:
        try:
            parsed.append(_date.fromisoformat(d) if d else None)
        except ValueError:
            parsed.append(None)
    valid = [d for d in parsed if d is not None]
    if len(valid) < 2:
        return np.ones(n)
    ref = max(valid)
    w = np.array([0.5 ** (max(0, (ref - d).days) / halflife_days) if d is not None else np.nan
                  for d in parsed])
    fill = float(np.nanmin(w)) if np.isfinite(w).any() else 1.0
    return np.where(np.isfinite(w), w, fill)


def _efficiency_fit(pts: list[ActivitySummary], hr0: float, halflife_days: float
                    ) -> tuple[float, float]:
    """Ajustement pondéré ``ln(vga ÷ (FC − FC0)) = c − α·ln T`` : rend ``(α, résidu
    quadratique moyen pondéré)``."""
    T = np.array([s.duration_s / 3600.0 for s in pts])
    v = np.array([s.ga_km / (s.duration_s / 3600.0) for s in pts])
    hr = np.array([float(s.avg_hr) for s in pts])
    x = np.log(T)
    y = np.log(v / (hr - hr0))
    w = _recency_weights_by_date([s.date for s in pts], halflife_days)
    sw = np.sqrt(w)
    A = np.vstack([np.ones_like(x), x]).T * sw[:, None]
    coef, *_ = np.linalg.lstsq(A, y * sw, rcond=None)
    resid = y - (coef[0] + coef[1] * x)
    msr = float(np.sum(w * resid**2) / np.sum(w))
    return -float(coef[1]), msr


def fit_efficiency_exponent(summaries: list[ActivitySummary], cfg: Config
                            ) -> tuple[float | None, dict]:
    """Efficacité-durée (Phase 3, B1) : ``ln(vga ÷ (FC − FC0)) = c − α_eff · ln T`` sur les
    efforts avec FC d'au moins ``efficiency_min_hours``, pondérés par récence.

    La vitesse par battement au-dessus de FC0 (réserve cardiaque) est, au premier ordre,
    indépendante de l'intensité : sa décroissance avec la durée mesure l'usure à effort
    donné, sur des centaines de sorties et pas seulement sur les vrais ultras. FC0 = valeur
    déclarée (``efficiency_hr_rest``), sinon celle qui minimise le résidu de l'ajustement
    sur une grille de 40 à 100 bpm (profil : une FC0 fausse laisse dans le résidu une
    composante liée à la FC de chaque effort) ; profil plat (moins de 2 % d'écart) ⇒ 60 bpm,
    signalé. Rend ``(α_eff, détail)`` ; α_eff est None sous 4 efforts, sans un rapport de
    durées d'au moins 3, ou hors ]0, 1[."""
    tw = cfg.twin
    halflife = cfg.calibration.recency_halflife_days
    detail: dict = {"n": 0, "hr0": None, "hr0_source": None, "t_min_h": None, "t_max_h": None}
    eff = [s for s in summaries
           if s.has_hr and s.avg_hr is not None and s.avg_hr > 0 and s.duration_s > 0 and s.ga_km > 0
           and s.duration_s >= tw.efficiency_min_hours * 3600]
    if not eff:
        return None, detail
    hr_min = min(float(s.avg_hr) for s in eff)
    if tw.efficiency_hr_rest > 0:
        hr0, src = float(tw.efficiency_hr_rest), "declared"
    else:
        hr0, src = 60.0, "fallback"
        grid = [h for h in np.arange(40.0, 100.01, 2.5) if h <= hr_min - 15.0]
        pts_all = [s for s in eff if float(s.avg_hr) - max(grid, default=60.0) >= 15.0]
        if grid and len(pts_all) >= 4:
            profile = np.array([_efficiency_fit(pts_all, float(h), halflife)[1] for h in grid])
            if np.isfinite(profile).all() and profile.max() > 0 \
                    and (profile.max() - profile.min()) / profile.max() >= 0.02:
                hr0, src = float(grid[int(np.argmin(profile))]), "fit"
    detail.update(hr0=round(hr0, 1), hr0_source=src)
    pts = [s for s in eff if float(s.avg_hr) - hr0 >= 15.0]
    detail["n"] = len(pts)
    if len(pts) < 4:
        return None, detail
    T = np.array([s.duration_s / 3600.0 for s in pts])
    detail.update(t_min_h=round(float(T.min()), 2), t_max_h=round(float(T.max()), 2))
    if T.max() / T.min() < 3.0:
        return None, detail
    alpha, _ = _efficiency_fit(pts, hr0, halflife)
    if not (0.0 < alpha < 1.0):
        return None, detail
    return alpha, detail


def fit_record_tail_exponent(record: RecordCurve, cfg: Config) -> tuple[float | None, int]:
    """Exposant de la QUEUE de la courbe record (Phase 3, B2) : loi de puissance log-log sur
    les points historiques ≥ ``record_tail_from_s`` (sous le plafond physiologique) et les
    fenêtres longues (``tail_points``). Rend ``(α_queue, n)`` ; None sans au moins 3 points
    dont au moins une fenêtre longue (sinon il n'y a pas de queue), ou hors ]0, 1[."""
    tw = cfg.twin
    pts = [(float(p.duration_s), float(p.vga)) for p in record.points
           if p.duration_s >= tw.record_tail_from_s and 0.0 < p.vga <= tw.vc_max_plausible_ms]
    tail = [(float(p.duration_s), float(p.vga)) for p in getattr(record, "tail_points", [])
            if p.vga > 0.0]
    pts += tail
    if len(pts) < 3 or not tail:
        return None, len(pts)
    a = np.asarray(pts)
    slope, _ = np.polyfit(np.log(a[:, 0]), np.log(a[:, 1]), 1)
    alpha = -float(slope)
    if not (0.0 < alpha < 1.0):
        return None, len(pts)
    return alpha, len(pts)


def vc_at_epoch(contributions, day: _date, cfg: Config) -> float | None:
    """Vitesse critique de l'ÉPOQUE ``day`` : courbe record des ``level_anchor_window_days``
    jours qui précèdent (bornes ]day − fenêtre, day]), fit VC sans bootstrap ; None sans
    contribution dans la fenêtre ou sans VC plausible."""
    lo = day - timedelta(days=float(cfg.calibration.level_anchor_window_days))
    kept = [c for c in contributions if c.start_date is not None and lo < c.start_date <= day]
    if not kept:
        return None
    record, _ = record_from_contributions(kept, cfg)
    cs = fit_critical_speed(record, cfg, bootstrap=False)
    if cs is None or not cs.plausible or cs.vc_ms <= 0:
        return None
    return float(cs.vc_ms)


def level_marks(contributions, summaries: list[ActivitySummary], cfg: Config) -> dict[str, float]:
    """VC d'époque de chaque candidat ultra (effort daté ≥ genuine_min_hours), par date —
    la matière du recalage de niveau (``calibration.level_anchor=vc_epoch``)."""
    out: dict[str, float] = {}
    floor_s = cfg.calibration.genuine_min_hours * 3600.0
    for s in summaries:
        if not s.date or s.duration_s < floor_s or s.date in out:
            continue
        try:
            day = _date.fromisoformat(s.date)
        except ValueError:
            continue
        vc = vc_at_epoch(contributions, day, cfg)
        if vc is not None:
            out[s.date] = vc
    return out


def estimate_durability(summaries: list[ActivitySummary], cfg: Config) -> float | None:
    """Découplage médian **sur les efforts longs** (twin-theory §2.6 : « sur les ultras »).

    On ne prend que les sorties ≥ ``durability_min_hours`` (et non toutes les sorties
    > 1,25 h) : inclure les sorties moyennes, peu découplées, sous-estimerait l'usure
    réelle en ultra. ``None`` si aucune FC exploitable sur un effort assez long.
    """
    floor_s = cfg.twin.durability_min_hours * 3600
    vals = [
        s.decouple_pct
        for s in summaries
        if s.decouple_pct is not None and s.duration_s >= floor_s
    ]
    return float(np.median(vals)) if vals else None


def build_twin_from_contributions(contributions, cfg: Config) -> Twin:
    """Jumeau à partir de contributions DÉJÀ calculées (banc walk-forward).

    Même arithmétique que :func:`build_twin` — seule la provenance des agrégats change.
    Permet de décoder une archive une fois et d'en tirer N jumeaux (une coupure temporelle
    par course rejouée) au lieu de N décodages : cf. ``ActivityContribution``.
    """
    contributions = list(contributions)
    record, summaries = record_from_contributions(contributions, cfg)
    return _twin_from_record(record, summaries, cfg, contributions=contributions)


def build_twin(activities: list[CanonicalActivity], cfg: Config) -> Twin:
    """Pipeline jumeau complet : courbe record → VC, E, durabilité (les contributions par
    activité sont conservées le temps du calcul : le recalage de niveau les relit)."""
    return build_twin_from_contributions(iter_contributions(activities, cfg), cfg)


def _twin_from_record(record, summaries, cfg: Config, contributions=None) -> Twin:
    cs = fit_critical_speed(record, cfg)
    alpha, E, coef = fit_endurance_exponent(record, cfg)
    dur = estimate_durability(summaries, cfg)
    alpha_eff, eff_detail = fit_efficiency_exponent(summaries, cfg)
    alpha_tail, tail_n = fit_record_tail_exponent(record, cfg)
    marks = None
    if cfg.calibration.level_anchor == "vc_epoch" and contributions is not None:
        marks = level_marks(contributions, summaries, cfg)
    return Twin(
        critical_speed=cs,
        alpha=alpha,
        endurance_E=E,
        endurance_coef=coef,
        durability_pct=dur,
        record=record,
        summaries=summaries,
        alpha_eff=alpha_eff,
        alpha_eff_detail=eff_detail,
        alpha_tail=alpha_tail,
        alpha_tail_n=tail_n,
        level_marks=marks,
    )


__all__ = [
    "CriticalSpeed",
    "Twin",
    "build_twin_from_contributions",
    "fit_critical_speed",
    "fit_endurance_exponent",
    "fit_efficiency_exponent",
    "fit_record_tail_exponent",
    "vc_at_epoch",
    "level_marks",
    "estimate_durability",
    "build_twin",
]
