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


def _fit_regression(genuine: list[GenuineUltra]):
    """β = lstsq(v ~ 1 + ln(T) + D+/km). Renvoie (beta, residuals)."""
    h = np.array([g.hours for g in genuine])
    v = np.array([g.vga_kmh for g in genuine])
    dpk = np.array([g.dplus_per_km for g in genuine])
    X = np.vstack([np.ones_like(h), np.log(h), dpk]).T
    beta, *_ = np.linalg.lstsq(X, v, rcond=None)
    resid = v - X @ beta
    return beta, resid


def build_calibration(twin: Twin, cfg: Config) -> UltraCalibration:
    c = cfg.calibration
    genuine = select_genuine_ultras(twin.summaries, cfg)
    n = len(genuine)
    notes: list[str] = []

    # ---------- régime régression (≥ ~3 vrais ultras) ----------
    if n >= c.min_ultras_regression:
        beta, resid = _fit_regression(genuine)
        dof = max(n - 3, 1)
        sigma = float(np.sqrt(np.sum(resid**2) / dof))
        sigma = max(sigma, c.regression_min_sigma_kmh)
        notes.append(f"Régression personnelle sur {n} vrais ultras.")
        return UltraCalibration(
            regime=REGIME_REGRESSION,
            genuine=genuine,
            sigma_kmh=sigma,
            notes=notes,
            beta=(float(beta[0]), float(beta[1]), float(beta[2])),
        )

    # ---------- replis VC+E (nécessitent l'enveloppe d'endurance) ----------
    if twin.alpha is None or twin.endurance_coef is None:
        notes.append(
            "Ni régression ultra (trop peu de vrais ultras) ni enveloppe d'endurance "
            "exploitable → prédiction impossible avec confiance."
        )
        return UltraCalibration(
            regime=REGIME_INSUFFICIENT, genuine=genuine, sigma_kmh=float("inf"), notes=notes
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
