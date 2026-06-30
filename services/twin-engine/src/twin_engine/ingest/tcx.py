"""Adaptateur ``.tcx`` (Polar, Garmin) → schéma canonique.

Le TCX (XML Garmin TrainingCenterDatabase) porte généralement temps, distance,
altitude, FC et parfois vitesse (extension ``TPX``). Le sport est sur
``Activity@Sport`` (``Running`` / ``Biking`` / ``Other``).
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

import numpy as np

from ._xml import child, descendant, localname, parse_iso_time, text_of
from .canonical import CanonicalActivity


def _float_or_nan(el) -> float:
    txt = text_of(el)
    if txt is None:
        return np.nan
    try:
        return float(txt)
    except ValueError:
        return np.nan


def parse_tcx(data: bytes, source_name: str) -> CanonicalActivity:
    root = ET.fromstring(data)

    sport = None
    activity = descendant(root, "Activity")
    if activity is not None:
        sport = activity.attrib.get("Sport")

    timestamps: list = []
    dist: list[float] = []
    alt: list[float] = []
    hr: list[float] = []
    speed: list[float] = []
    lat: list[float] = []
    lon: list[float] = []

    for tp in root.iter():
        if localname(tp.tag) != "Trackpoint":
            continue
        ts = parse_iso_time(text_of(child(tp, "Time")))
        if ts is None:
            continue
        timestamps.append(ts)
        dist.append(_float_or_nan(child(tp, "DistanceMeters")))
        alt.append(_float_or_nan(child(tp, "AltitudeMeters")))
        # HeartRateBpm/Value
        hr_el = child(tp, "HeartRateBpm")
        hr.append(_float_or_nan(child(hr_el, "Value")) if hr_el is not None else np.nan)
        # Position/LatitudeDegrees, LongitudeDegrees
        pos = child(tp, "Position")
        if pos is not None:
            lat.append(_float_or_nan(child(pos, "LatitudeDegrees")))
            lon.append(_float_or_nan(child(pos, "LongitudeDegrees")))
        else:
            lat.append(np.nan)
            lon.append(np.nan)
        # vitesse éventuelle : Extensions/…/Speed
        speed.append(_float_or_nan(descendant(tp, "Speed")))

    if len(timestamps) < 2:
        raise ValueError(f"TCX sans Trackpoint exploitable: {source_name!r}")

    return CanonicalActivity.from_samples(
        timestamps=timestamps,
        dist_m=dist,
        speed_ms=speed,
        alt_m=alt,
        hr=hr,
        lat=lat,
        lon=lon,
        sport=sport,
        source_format="tcx",
        source_name=source_name,
    )


__all__ = ["parse_tcx"]
