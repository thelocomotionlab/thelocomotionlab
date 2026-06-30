"""Chargement de la configuration du moteur.

Règle d'or (calquée sur services/tracking-cache/src/config.ts) :
  * les **chemins** viennent de l'environnement (``DATA_DIR``, ``TWIN_CONFIG_PATH``) —
    AUCUN chemin en dur dans le code ;
  * les **constantes scientifiques** viennent de ``twin.config.json`` (versionné,
    cf. twin-theory §8) avec des valeurs par défaut codées ici en filet de sécurité ;
  * aucun secret n'est lu ici (le moteur n'en a pas à ce stade).

Tout le reste du moteur reçoit un objet :class:`Config` immuable — jamais de lecture
d'environnement ou de fichier ailleurs.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any


# --------------------------------------------------------------------------- #
# Sous-blocs de configuration (1 dataclass par section de twin.config.json).
# Les valeurs ici sont les DÉFAUTS du cas de référence (twin-theory §12) : elles
# servent de filet si une clé manque dans le JSON.
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class CourseParams:
    grid_step_m: float = 5.0
    smooth_window_m: float = 150.0
    grade_clip: float = 0.45
    cr0: float = 3.6


@dataclass(frozen=True)
class TwinParams:
    grade_base_m: float = 50.0
    f_cap: float = 3.0
    v_max_ms: float = 7.0
    alt_smooth_s: int = 5
    record_durations_s: tuple[int, ...] = (
        30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 780, 900, 1200, 1500,
        1800, 2400, 3000, 3600, 4500, 5400, 7200, 9000, 10800, 14400, 18000,
        21600, 28800,
    )
    vc_flat_threshold: float = 0.10
    vc_window_s: tuple[int, int] = (600, 5400)
    vc_bootstrap_n: int = 2000
    vc_bootstrap_seed: int = 0
    vc_short_effort_floor_s: int = 1800
    endurance_window_s: tuple[int, int] = (1800, 21600)
    decouple_min_duration_s: int = 4500


@dataclass(frozen=True)
class CalibrationParams:
    genuine_min_hours: float = 10.0
    genuine_min_ga_kmh: float = 5.5
    genuine_max_decouple_pct: float = 30.0
    min_ultras_regression: int = 3
    # repli « peu d'ultras » (twin-theory §3)
    default_dplus_penalty_kmh_per_dpkm: float = -0.0148  # prior population (β2)
    regression_min_sigma_kmh: float = 0.20               # plancher de σ (anti-surconfiance)
    blend_sigma_kmh: float = 0.45                        # 1–2 ultras : incertitude élargie
    vc_e_sigma_kmh: float = 0.80                         # 0 ultra : extrapolation VC+E


@dataclass(frozen=True)
class PredictionParams:
    mc_n: int = 5000
    mc_seed: int = 1
    interval_low_pct: int = 10
    interval_high_pct: int = 90
    v_floor_kmh: float = 2.0


@dataclass(frozen=True)
class PacingParams:
    fade_delta: float = 0.085
    default_stop_min: float = 5.0
    major_base_extra_min: float = 10.0


@dataclass(frozen=True)
class SufficiencyParams:
    history_months_green: float = 6.0
    history_months_orange: float = 3.0
    usable_green: int = 120
    usable_orange: int = 50
    long_efforts_green: int = 2
    long_efforts_orange: int = 1
    cv_error_green_pct: float = 5.0
    cv_error_orange_pct: float = 10.0
    long_effort_min_fraction: float = 0.5


@dataclass(frozen=True)
class Config:
    data_dir: Path
    course: CourseParams = field(default_factory=CourseParams)
    twin: TwinParams = field(default_factory=TwinParams)
    calibration: CalibrationParams = field(default_factory=CalibrationParams)
    prediction: PredictionParams = field(default_factory=PredictionParams)
    pacing: PacingParams = field(default_factory=PacingParams)
    sufficiency: SufficiencyParams = field(default_factory=SufficiencyParams)


# --------------------------------------------------------------------------- #
# Construction d'un sous-bloc dataclass à partir d'un dict JSON, en ne gardant
# que les clés connues et en coerçant les tuples (JSON ne connaît que les listes).
# --------------------------------------------------------------------------- #
def _build(cls: type, raw: dict[str, Any] | None):
    if not raw:
        return cls()
    known = {f.name: f for f in fields(cls)}
    kwargs: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in known:
            continue  # clé inconnue (ex. "_comment") → ignorée
        default = getattr(cls(), key)
        if isinstance(default, tuple) and isinstance(value, list):
            value = tuple(value)
        kwargs[key] = value
    return cls(**kwargs)


def _default_config_path() -> Path:
    """``twin.config.json`` est posé à la racine du service (à côté de pyproject)."""
    return Path(__file__).resolve().parents[2] / "twin.config.json"


def load_config(config_path: str | os.PathLike[str] | None = None) -> Config:
    """Charge la configuration : env (chemins) > twin.config.json (constantes) > défauts."""
    path = Path(
        config_path
        or os.environ.get("TWIN_CONFIG_PATH")
        or _default_config_path()
    )

    raw: dict[str, Any] = {}
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:  # pragma: no cover - défensif
            raise SystemExit(f"twin.config.json illisible ({path}): {exc}") from exc

    data_dir = Path(os.environ.get("DATA_DIR") or raw.get("data_dir") or "/data")

    return Config(
        data_dir=data_dir,
        course=_build(CourseParams, raw.get("course")),
        twin=_build(TwinParams, raw.get("twin")),
        calibration=_build(CalibrationParams, raw.get("calibration")),
        prediction=_build(PredictionParams, raw.get("prediction")),
        pacing=_build(PacingParams, raw.get("pacing")),
        sufficiency=_build(SufficiencyParams, raw.get("sufficiency")),
    )


__all__ = [
    "Config",
    "CourseParams",
    "TwinParams",
    "CalibrationParams",
    "PredictionParams",
    "PacingParams",
    "SufficiencyParams",
    "load_config",
]
