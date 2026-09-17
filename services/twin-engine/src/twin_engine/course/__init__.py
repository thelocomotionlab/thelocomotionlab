"""Module parcours : GPX de course → pente, Minetti, Deq, segments."""

from __future__ import annotations

from .profile import CourseProfile, Segment, build_course
from .spec import CrewAccess, Nutrition, Phase, RaceSpec, placeholder_aid_names

__all__ = ["RaceSpec", "CrewAccess", "Nutrition", "Phase", "placeholder_aid_names",
           "CourseProfile", "Segment", "build_course"]
