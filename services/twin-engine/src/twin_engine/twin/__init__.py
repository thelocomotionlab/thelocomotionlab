"""Le jumeau physiologique : courbe record ajustée, vitesse critique, exposant E, durabilité."""

from __future__ import annotations

from .model import (
    CriticalSpeed,
    Twin,
    build_twin,
    estimate_durability,
    fit_critical_speed,
    fit_endurance_exponent,
)
from .record import (
    ActivitySummary,
    RecordCurve,
    RecordPoint,
    build_record_curve,
    process_activity,
)

__all__ = [
    "ActivitySummary",
    "RecordCurve",
    "RecordPoint",
    "process_activity",
    "build_record_curve",
    "CriticalSpeed",
    "Twin",
    "build_twin",
    "fit_critical_speed",
    "fit_endurance_exponent",
    "estimate_durability",
]
