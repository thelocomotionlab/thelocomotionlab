"""Calibration ultra : le moteur de la prédiction (twin-theory §3).

On isole les **vrais ultras engagés** par des conditions explicites, puis on ajuste la
vitesse ajustée moyenne de course en fonction de la durée et du dénivelé. La théorie
impose une **dégradation propre** selon le nombre d'ultras disponibles :

  * ``≥ min_ultras_regression`` (≈3) → **régression personnelle** v = β0 + β1·ln(T) + β2·(D+/km) ;
  * **1–2** → **mélange** : extrapolation VC+E (enveloppe d'endurance) **recalée** sur les
    ultras personnels, incertitude élargie ;
  * **0** → **extrapolation VC+E seule**, incertitude large (→ souvent 🟠/🔴).

C'est le manque clé du _seed (twin_fit.py supposait ~8 ultras) ; on le comble ici.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

import numpy as np

from .config import Config
from .twin.model import Twin
from .twin.record import ActivitySummary

REGIME_REGRESSION = "regression"
REGIME_BLEND = "blend"
REGIME_VC_E = "vc_e"
REGIME_INSUFFICIENT = "insufficient"


@dataclass(frozen=True)
class GenuineUltra:
    date: str | None
    hours: float
    vga_kmh: float       # vitesse ajustée moyenne de course
    dplus_m: float
    dist_km: float
    avg_hr: float | None

    @property
    def dplus_per_km(self) -> float:
        return self.dplus_m / self.dist_km if self.dist_km else 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class UltraCalibration:
    """Modèle de vitesse ajustée de course v(T, D+/km), selon le régime de données."""

    regime: str
    genuine: list[GenuineUltra]
    sigma_kmh: float
    notes: list[str] = field(default_factory=list)
    # paramètres internes selon le régime
    beta: tuple[float, float, float] | None = None  # régression (β0, β1, β2)
    alpha: float | None = None                       # exposant d'endurance (repli)
    endurance_coef: float | None = None              # coef enveloppe (repli)
    dplus_penalty: float = 0.0                        # β2 prior (repli)
    offset_kmh: float = 0.0                           # recalage du mélange (blend)
    # pondération par récence (régime régression) : réutilisée à l'identique par la LOO
    weights: tuple[float, ...] | None = None
    n_eff: float = 0.0                                # nb effectif d'ultras = (Σw)²/Σw²
    recency_halflife_days: float = 0.0

    @property
    def n_genuine(self) -> int:
        return len(self.genuine)

    @property
    def can_predict(self) -> bool:
        return self.regime != REGIME_INSUFFICIENT

    @property
    def supports_cross_validation(self) -> bool:
        """La validation croisée leave-one-out n'a de sens qu'avec une régression."""
        return self.regime == REGIME_REGRESSION and self.n_genuine >= 3

    def predict_vga_kmh(self, hours: float, dplus_per_km: float) -> float | None:
        if self.regime == REGIME_REGRESSION:
            b0, b1, b2 = self.beta  # type: ignore[misc]
            return b0 + b1 * math.log(hours) + b2 * dplus_per_km
        if self.regime in (REGIME_BLEND, REGIME_VC_E):
            v_env = self._envelope_kmh(hours)
            if v_env is None:
                return None
            return v_env + self.dplus_penalty * dplus_per_km + self.offset_kmh
        return None

    def _envelope_kmh(self, hours: float) -> float | None:
        if self.alpha is None or self.endurance_coef is None:
            return None
        return self.endurance_coef * (hours * 3600.0) ** (-self.alpha) * 3.6

    def to_dict(self) -> dict:
        return {
            "regime": self.regime,
            "n_genuine_ultras": self.n_genuine,
            "n_eff_ultras": round(self.n_eff, 2),
            "recency_halflife_days": self.recency_halflife_days,
            "sigma_kmh": round(self.sigma_kmh, 3),
            "beta": None if self.beta is None else [round(b, 5) for b in self.beta],
            "notes": self.notes,
            "genuine": [g.to_dict() for g in self.genuine],
        }


def select_genuine_ultras(summaries: list[ActivitySummary], cfg: Config) -> list[GenuineUltra]:
    """Vrais ultras engagés : durée > seuil, vitesse ajustée ≥ seuil, découplage < seuil."""
    c = cfg.calibration
    out: list[GenuineUltra] = []
    for s in summaries:
        if s.duration_s < c.genuine_min_hours * 3600:
            continue
        hours = s.duration_s / 3600.0
        vga_kmh = s.ga_km / hours
        if vga_kmh < c.genuine_min_ga_kmh:
            continue
        # exclut reconnaissances/randos ; FC absente → on ne peut pas vérifier (on garde, signalé)
        if s.decouple_pct is not None and s.decouple_pct > c.genuine_max_decouple_pct:
            continue
        out.append(
            GenuineUltra(
                date=s.date,
                hours=hours,
                vga_kmh=vga_kmh,
                dplus_m=s.dplus_m,
                dist_km=s.dist_km,
                avg_hr=s.avg_hr,
            )
        )
    return out


def recency_weights(genuine: list[GenuineUltra], cfg: Config) -> np.ndarray:
    """Poids de récence (décroissance exponentielle sur le temps **calendaire**).

    ``w_i = 0.5 ^ (age_i / demi-vie)`` où ``age_i`` est l'écart en jours au **plus récent**
    vrai ultra. Robuste aux trous (décroissance temporelle, pas par nombre d'activités). Une
    demi-vie ≤ 0 — ou moins de deux dates exploitables — désactive la pondération (poids 1).
    Les ultras non datés reçoivent le **plus faible** poids daté (prudence : on ne présume pas
    récent ce qu'on ne peut pas dater).
    """
    n = len(genuine)
    if n == 0:
        return np.zeros(0)
    hl = cfg.calibration.recency_halflife_days
    if hl <= 0:
        return np.ones(n)
    from datetime import date as _date

    parsed: list[_date | None] = []
    for g in genuine:
        d: _date | None = None
        if g.date:
            try:
                d = _date.fromisoformat(g.date)
            except ValueError:
                d = None
        parsed.append(d)
    valid = [d for d in parsed if d is not None]
    if len(valid) < 2:
        return np.ones(n)  # timeline non établissable → pondération neutre
    ref = max(valid)
    w = np.ones(n)
    for i, d in enumerate(parsed):
        if d is not None:
            w[i] = 0.5 ** (max(0, (ref - d).days) / hl)
    dated = [w[i] for i, d in enumerate(parsed) if d is not None]
    fill = min(dated) if dated else 1.0
    for i, d in enumerate(parsed):
        if d is None:
            w[i] = fill
    return w


def _effective_n(weights: np.ndarray) -> float:
    """Nombre effectif d'échantillons ``(Σw)²/Σw²`` (= n quand les poids sont égaux)."""
    sw = float(weights.sum())
    sw2 = float(np.square(weights).sum())
    return (sw * sw / sw2) if sw2 > 0 else 0.0


def _fit_regression(genuine: list[GenuineUltra], weights: np.ndarray | None = None):
    """β = lstsq **pondéré** (v ~ 1 + ln(T) + D+/km). Renvoie (beta, residuals).

    Poids ``None`` ou égaux ⇒ moindres carrés ordinaires (le golden reste identique)."""
    h = np.array([g.hours for g in genuine])
    v = np.array([g.vga_kmh for g in genuine])
    dpk = np.array([g.dplus_per_km for g in genuine])
    X = np.vstack([np.ones_like(h), np.log(h), dpk]).T
    sw = np.sqrt(np.ones_like(h) if weights is None else np.asarray(weights, dtype=float))
    beta, *_ = np.linalg.lstsq(X * sw[:, None], v * sw, rcond=None)
    resid = v - X @ beta
    return beta, resid


def build_calibration(twin: Twin, cfg: Config) -> UltraCalibration:
    c = cfg.calibration
    genuine = select_genuine_ultras(twin.summaries, cfg)
    n = len(genuine)
    notes: list[str] = []

    weights = recency_weights(genuine, cfg)
    n_eff = _effective_n(weights) if n else 0.0

    # ---------- régime régression (≥ ~3 vrais ultras ET N_eff suffisant) ----------
    # Le plancher N_eff empêche la pondération par récence de fabriquer une régression
    # sûre d'elle sur trop peu d'ultras récents (surconfiance) : dans ce cas on bascule
    # dans le repli « peu d'ultras » (incertitude élargie) ci-dessous.
    if n >= c.min_ultras_regression and n_eff >= c.min_ultras_regression:
        beta, resid = _fit_regression(genuine, weights)
        # σ pondérée : variance résiduelle pondérée corrigée par le nb effectif de degrés de
        # liberté. Se réduit EXACTEMENT à √(Σr²/(n−3)) quand les poids sont égaux (golden intact).
        sw = float(weights.sum())
        wmse = float(np.sum(weights * resid**2) / sw) if sw > 0 else 0.0
        dof_eff = max(n_eff - 3.0, 1.0)
        sigma = float(np.sqrt(wmse * n_eff / dof_eff))
        sigma = max(sigma, c.regression_min_sigma_kmh)
        notes.append(
            f"Régression personnelle pondérée par récence sur {n} vrais ultras "
            f"(≈ {n_eff:.1f} effectifs, demi-vie {c.recency_halflife_days:.0f} j)."
        )
        return UltraCalibration(
            regime=REGIME_REGRESSION,
            genuine=genuine,
            sigma_kmh=sigma,
            notes=notes,
            beta=(float(beta[0]), float(beta[1]), float(beta[2])),
            weights=tuple(float(x) for x in weights),
            n_eff=n_eff,
            recency_halflife_days=c.recency_halflife_days,
        )

    # ---------- replis VC+E (nécessitent l'enveloppe d'endurance) ----------
    if twin.alpha is None or twin.endurance_coef is None:
        notes.append(
            "Ni régression ultra (trop peu de vrais ultras) ni enveloppe d'endurance "
            "exploitable → prédiction impossible avec confiance."
        )
        return UltraCalibration(
            regime=REGIME_INSUFFICIENT, genuine=genuine, sigma_kmh=float("inf"), notes=notes,
            n_eff=n_eff, recency_halflife_days=c.recency_halflife_days,
        )

    penalty = c.default_dplus_penalty_kmh_per_dpkm

    # ---------- régime mélange (1–2 ultras) : recalage du niveau ----------
    if n >= 1:
        offsets = []
        for g in genuine:
            v_env = twin.envelope_vga_ms(g.hours * 3600.0)
            if v_env is None:
                continue
            base = v_env * 3.6 + penalty * g.dplus_per_km
            offsets.append(g.vga_kmh - base)
        offset = float(np.mean(offsets)) if offsets else 0.0
        if n >= c.min_ultras_regression:
            # demoté par le plancher N_eff : assez d'ultras, mais trop peu de RÉCENTS
            notes.append(
                f"{n} vrais ultras mais seulement ≈ {n_eff:.1f} récents (non-stationnarité) : "
                "extrapolation VC+E recalée sur vos données, incertitude élargie."
            )
        else:
            notes.append(
                f"Seulement {n} vrai(s) ultra(s) : extrapolation VC+E recalée sur vos données, "
                "incertitude élargie."
            )
        return UltraCalibration(
            regime=REGIME_BLEND,
            genuine=genuine,
            sigma_kmh=c.blend_sigma_kmh,
            notes=notes,
            alpha=twin.alpha,
            endurance_coef=twin.endurance_coef,
            dplus_penalty=penalty,
            offset_kmh=offset,
            n_eff=n_eff,
            recency_halflife_days=c.recency_halflife_days,
        )

    # ---------- régime VC+E seul (0 ultra) ----------
    notes.append(
        "Aucun ultra proche de la durée cible : extrapolation par vitesse critique et "
        "exposant d'endurance, confiance faible (pénalité D+ = prior population)."
    )
    return UltraCalibration(
        regime=REGIME_VC_E,
        genuine=genuine,
        sigma_kmh=c.vc_e_sigma_kmh,
        notes=notes,
        alpha=twin.alpha,
        endurance_coef=twin.endurance_coef,
        dplus_penalty=penalty,
        offset_kmh=0.0,
        n_eff=n_eff,
        recency_halflife_days=c.recency_halflife_days,
    )


__all__ = [
    "GenuineUltra",
    "UltraCalibration",
    "select_genuine_ultras",
    "build_calibration",
    "REGIME_REGRESSION",
    "REGIME_BLEND",
    "REGIME_VC_E",
    "REGIME_INSUFFICIENT",
]
