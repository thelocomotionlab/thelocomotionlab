"""Prédiction auto-cohérente + Monte-Carlo + validation croisée (twin-theory §4–5).

Plus la course est longue, plus la vitesse baisse — mais la durée dépend de cette
vitesse. On résout le **point fixe** ``T = Deq / v(T)``. L'incertitude vient d'un
**Monte-Carlo** (tirages de v dans sa loi prédictive). La fiabilité est mesurée par
**validation croisée leave-one-out** sur les vrais ultras → indice de confiance imprimé
et critère de suffisance.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .calibration import UltraCalibration
from .config import Config
from .twin.model import Twin


@dataclass(frozen=True)
class CrossValidation:
    errors_pct: list[float]
    mae_pct: float
    rmse_pct: float
    n: int
    points: list[tuple[float, float]]  # (temps réel h, temps prédit hors-échantillon h)

    def to_dict(self) -> dict:
        return {
            "mae_pct": round(self.mae_pct, 2),
            "rmse_pct": round(self.rmse_pct, 2),
            "n": self.n,
            "errors_pct": [round(e, 2) for e in self.errors_pct],
        }


@dataclass
class Prediction:
    finish_hours: float
    v_kmh: float                 # vitesse ajustée moyenne de course
    deq_km: float
    dplus_per_km: float
    interval_low_h: float
    interval_high_h: float
    mc_samples: np.ndarray
    regime: str
    sigma_kmh: float
    vc_fraction: float | None    # v / VC (intensité relative)
    cross_validation: CrossValidation | None

    def to_dict(self) -> dict:
        return {
            "finish_hours": round(self.finish_hours, 3),
            "v_kmh": round(self.v_kmh, 3),
            "deq_km": round(self.deq_km, 2),
            "dplus_per_km": round(self.dplus_per_km, 2),
            "interval_80_low_h": round(self.interval_low_h, 3),
            "interval_80_high_h": round(self.interval_high_h, 3),
            "regime": self.regime,
            "sigma_kmh": round(self.sigma_kmh, 3),
            "vc_fraction": None if self.vc_fraction is None else round(self.vc_fraction, 3),
            "cross_validation": None if self.cross_validation is None else self.cross_validation.to_dict(),
        }


def _solve_fixed_point(deq_km: float, dpk: float, vfunc, cfg: Config) -> float | None:
    """Résout T = Deq / v(T) par itération amortie. ``vfunc(T, dpk) -> v[km/h]``."""
    t = 20.0
    floor = cfg.prediction.v_floor_kmh
    for _ in range(200):
        v = vfunc(t, dpk)
        if v is None or v <= 0:
            return None
        tn = deq_km / max(v, floor)
        if abs(tn - t) < 1e-5:
            return tn
        t = 0.5 * t + 0.5 * tn
    return t


def leave_one_out(calibration: UltraCalibration, cfg: Config) -> CrossValidation | None:
    """Réajuste la régression en excluant chaque ultra, prédit son temps, compare au réel.

    Utilise **exactement la même pondération par récence** que la régression réellement servie
    (dans chaque pli ET dans l'agrégation MAE/RMSE), afin que l'indice de confiance reflète le
    modèle utilisé : sur un athlète non stationnaire, les ultras récents (bien prédits) pèsent
    plus que les anciens. Poids égaux ⇒ moyenne simple (le golden reste identique).
    """
    if not calibration.supports_cross_validation:
        return None
    g = calibration.genuine
    n = len(g)
    H = np.array([u.hours for u in g])
    V = np.array([u.vga_kmh for u in g])
    dpk = np.array([u.dplus_per_km for u in g])
    deq_each = V * H  # distance ajustée (Deq) de chaque course
    w = (np.asarray(calibration.weights, dtype=float)
         if calibration.weights is not None else np.ones(n))

    errors: list[float] = []
    w_used: list[float] = []
    points: list[tuple[float, float]] = []
    for i in range(n):
        keep = [j for j in range(n) if j != i]
        wk = np.sqrt(w[keep])
        Xs = np.vstack([np.ones(len(keep)), np.log(H[keep]), dpk[keep]]).T
        beta, *_ = np.linalg.lstsq(Xs * wk[:, None], V[keep] * wk, rcond=None)
        vfunc = lambda T, d, b=beta: b[0] + b[1] * np.log(T) + b[2] * d
        tp = _solve_fixed_point(deq_each[i], dpk[i], vfunc, cfg)
        if tp is None:
            continue
        errors.append(100.0 * (tp - H[i]) / H[i])
        w_used.append(float(w[i]))
        points.append((float(H[i]), float(tp)))

    if not errors:
        return None
    err = np.asarray(errors)
    wu = np.asarray(w_used)
    sw = float(wu.sum())
    return CrossValidation(
        errors_pct=[float(e) for e in err],
        mae_pct=float(np.sum(wu * np.abs(err)) / sw),
        rmse_pct=float(np.sqrt(np.sum(wu * err**2) / sw)),
        n=len(errors),
        points=points,
    )


def predict_finish(
    deq_km: float,
    dplus_per_km: float,
    twin: Twin,
    calibration: UltraCalibration,
    cfg: Config,
) -> Prediction | None:
    if not calibration.can_predict:
        return None
    t_point = _solve_fixed_point(deq_km, dplus_per_km, calibration.predict_vga_kmh, cfg)
    if t_point is None:
        return None
    v_point = calibration.predict_vga_kmh(t_point, dplus_per_km)

    # --- Monte-Carlo : tirages de v dans sa loi prédictive (résidu σ) ---
    rng = np.random.default_rng(cfg.prediction.mc_seed)
    vp = v_point + rng.normal(0.0, calibration.sigma_kmh, cfg.prediction.mc_n)
    vp = np.maximum(vp, cfg.prediction.v_floor_kmh)
    mc = deq_km / vp
    low = float(np.percentile(mc, cfg.prediction.interval_low_pct))
    high = float(np.percentile(mc, cfg.prediction.interval_high_pct))

    # % de VC seulement si la VC est plausible (sinon on n'affiche pas un ratio trompeur)
    cs = twin.critical_speed
    vc_fraction = None
    if cs is not None and cs.plausible and cs.vc_ms:
        vc_fraction = v_point / (cs.vc_ms * 3.6)

    return Prediction(
        finish_hours=float(t_point),
        v_kmh=float(v_point),
        deq_km=float(deq_km),
        dplus_per_km=float(dplus_per_km),
        interval_low_h=low,
        interval_high_h=high,
        mc_samples=mc,
        regime=calibration.regime,
        sigma_kmh=calibration.sigma_kmh,
        vc_fraction=vc_fraction,
        cross_validation=leave_one_out(calibration, cfg),
    )


def predict_race(course, twin: Twin, calibration: UltraCalibration, cfg: Config) -> Prediction | None:
    """Wrapper : prend un :class:`CourseProfile` (utilise Deq et D+/km)."""
    return predict_finish(course.deq_km, course.dplus_per_km, twin, calibration, cfg)


__all__ = ["CrossValidation", "Prediction", "predict_finish", "predict_race", "leave_one_out"]
