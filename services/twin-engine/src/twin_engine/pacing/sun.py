"""Heures de lever/coucher du soleil — algorithme solaire NOAA (twin-theory §6).

Repris de pacing.py. Renvoie des minutes depuis minuit en heure locale (via le décalage
``tz``). Sert à marquer les sections de nuit du plan de pacing.
"""

from __future__ import annotations

import datetime as dt
import math


def sun_times(year: int, month: int, day: int, lat: float, lon: float, tz: float):
    """→ (lever, coucher) en minutes depuis minuit local. Clampe au pôle (soleil de minuit)."""
    n = dt.date(year, month, day).timetuple().tm_yday
    g = 2 * math.pi / 365 * (n - 1 + 0.5)
    eot = 229.18 * (
        0.000075
        + 0.001868 * math.cos(g)
        - 0.032077 * math.sin(g)
        - 0.014615 * math.cos(2 * g)
        - 0.040849 * math.sin(2 * g)
    )
    decl = (
        0.006918
        - 0.399912 * math.cos(g)
        + 0.070257 * math.sin(g)
        - 0.006758 * math.cos(2 * g)
        + 0.000907 * math.sin(2 * g)
        - 0.002697 * math.cos(3 * g)
        + 0.00148 * math.sin(3 * g)
    )
    latr = math.radians(lat)
    zen = math.radians(90.833)
    cos_h = (math.cos(zen) - math.sin(latr) * math.sin(decl)) / (math.cos(latr) * math.cos(decl))
    cos_h = max(-1.0, min(1.0, cos_h))  # garde-fou polaire
    h = math.degrees(math.acos(cos_h))
    sunrise = 720 - 4 * (lon + h) - eot + tz * 60
    sunset = 720 - 4 * (lon - h) - eot + tz * 60
    return sunrise, sunset


def is_night(when: dt.datetime, lat: float, lon: float, tz: float) -> bool:
    sr, ss = sun_times(when.year, when.month, when.day, lat, lon, tz)
    minutes = when.hour * 60 + when.minute
    return minutes < sr or minutes > ss


__all__ = ["sun_times", "is_night"]
