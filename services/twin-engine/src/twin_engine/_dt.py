"""Parsing de dates ISO-8601, tolérant (``…Z`` / offset / fractions longues).

Utilisé par l'ingestion XML (``.tcx``/``.gpx``) et la spec de course.
(L'adaptateur Polar parse ses dates directement via ``datetime.fromisoformat``.)
"""

from __future__ import annotations

import re
from datetime import datetime, timezone


def parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        s2 = re.sub(r"(\.\d{6})\d+", r"\1", s)  # tronque > 6 décimales
        try:
            dt = datetime.fromisoformat(s2)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


__all__ = ["parse_iso"]
