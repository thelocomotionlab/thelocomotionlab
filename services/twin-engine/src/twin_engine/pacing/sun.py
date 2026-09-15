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


def night_mask(start: dt.datetime, seconds: float, lat: float, lon: float, tz: float,
               *, step_s: int = 60) -> "np.ndarray":
    """Nuit seconde par seconde sur [start, start + seconds] : tableau booléen de longueur
    ``seconds + 1``, évalué tous les ``step_s`` par le MÊME test que le plan (:func:`is_night`)
    puis répété — 2 400 évaluations pour 40 h, jamais une par seconde.

    ``start`` est lu en heure LOCALE du fuseau ``tz`` (heure et minute, comme le plan) :
    un départ UTC doit être converti par l'appelant avant l'appel."""
    import numpy as np

    n = int(seconds) + 1
    if n <= 0:
        return np.zeros(0, dtype=bool)
    step = max(int(step_s), 1)
    flags = [is_night(start + dt.timedelta(seconds=s + step / 2.0), lat, lon, tz)
             for s in range(0, n, step)]
    return np.repeat(np.asarray(flags, dtype=bool), step)[:n]


def night_share(start: dt.datetime, hours: float, lat: float, lon: float, tz: float,
                *, step_s: int = 60) -> float:
    """Part de NUIT (0–1) de l'intervalle [start, start + hours] — l'intégrale de
    :func:`night_mask`. Sert à mesurer la nuit des vrais ultras comme celle de la cible."""
    if hours <= 0:
        return 0.0
    m = night_mask(start, hours * 3600.0, lat, lon, tz, step_s=step_s)
    return float(m.mean()) if m.size else 0.0


__all__ = ["sun_times", "is_night", "night_mask", "night_share"]
