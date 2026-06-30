"""Module parcours : GPX de course → pente, Minetti, Deq, segments."""

from __future__ import annotations

from .profile import CourseProfile, Segment, build_course
from .spec import RaceSpec

__all__ = ["RaceSpec", "CourseProfile", "Segment", "build_course"]
