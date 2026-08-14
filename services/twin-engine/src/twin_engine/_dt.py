"""Parsing de dates ISO-8601 et de durées, tolérant (``…Z`` / offset / fractions longues).

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


def parse_duration_h(value: str | float | int | None) -> float | None:
    """Durée saisie par un humain → heures décimales. ``None``/vide → ``None``.

    Accepte ``"31h"``, ``"31h30"``, ``"31:00:00"``, ``"31:30"`` ou un nombre d'heures. Une
    saisie non vide mais illisible lève ``ValueError`` : sur un objectif de course, un
    silence coûterait un plan calé sur la mauvaise durée.
    """
    if value is None or value == "":
        return None
    if isinstance(value, bool):  # bool est un int en Python — refusé explicitement
        raise ValueError(f"durée illisible : {value!r}")
    if isinstance(value, (int, float)):
        hours = float(value)
    else:
        s = str(value).strip().lower().replace(" ", "")
        m = re.fullmatch(r"(\d+):(\d{1,2})(?::(\d{1,2}))?", s)
        if m:
            hours = int(m.group(1)) + int(m.group(2)) / 60.0 + int(m.group(3) or 0) / 3600.0
        else:
            m = re.fullmatch(r"(\d+(?:[.,]\d+)?)h(\d{1,2})?", s)
            if m:
                hours = float(m.group(1).replace(",", ".")) + int(m.group(2) or 0) / 60.0
            else:
                try:
                    hours = float(s.replace(",", "."))
                except ValueError:
                    raise ValueError(
                        f"durée illisible : {value!r} (attendu 31h, 31h30, 31:00:00 ou un "
                        "nombre d'heures)"
                    ) from None
    if hours <= 0:
        raise ValueError(f"durée nulle ou négative : {value!r}")
    return hours


__all__ = ["parse_iso", "parse_duration_h"]
