"""Adaptateur ``.gpx`` (Polar, Strava, montres diverses) → schéma canonique.

Le GPX porte rarement vitesse ou distance : la distance est reconstruite par
haversine sur lat/lon (dans :meth:`CanonicalActivity.from_samples`). La FC et la
cadence, quand présentes, vivent dans les extensions (``gpxtpx:hr`` / ``gpxtpx:cad``
de Garmin et Strava, ``gpxdata:hr`` / ``gpxdata:cadence`` de COROS). La distance que
la montre a calculée (``gpxdata:distance``) est gardée à part, dans ``dist_device_m`` :
le moteur choisit laquelle servir (``twin.gpx_distance``). Le sport est souvent absent
→ laissé à ``None`` (le bundle Strava le renseigne via activities.csv).
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

import numpy as np

from ._xml import child, descendant, localname, parse_iso_time, text_of
from .canonical import CanonicalActivity


def _number(el) -> float:
    """Valeur numérique d'une extension, ``NaN`` si absente ou illisible."""
    txt = text_of(el)
    if txt is None:
        return np.nan
    try:
        return float(txt)
    except ValueError:
        return np.nan


def parse_gpx(data: bytes, source_name: str) -> CanonicalActivity:
    root = ET.fromstring(data)

    timestamps: list = []
    alt: list[float] = []
    lat: list[float] = []
    lon: list[float] = []
    hr: list[float] = []
    cad: list[float] = []
    dist: list[float] = []

    # sport éventuel : <trk><type>…</type>
    sport = None
    trk = descendant(root, "trk")
    if trk is not None:
        sport = text_of(child(trk, "type"))

    for pt in root.iter():
        if localname(pt.tag) != "trkpt":
            continue
        try:
            la = float(pt.attrib["lat"])
            lo = float(pt.attrib["lon"])
        except (KeyError, ValueError):
            continue
        lat.append(la)
        lon.append(lo)
        ele = text_of(child(pt, "ele"))
        alt.append(float(ele) if ele is not None else np.nan)
        timestamps.append(parse_iso_time(text_of(child(pt, "time"))))
        hr.append(_number(descendant(pt, "hr")))
        cad_el = descendant(pt, "cad")
        cad.append(_number(cad_el if cad_el is not None else descendant(pt, "cadence")))
        dist.append(_number(descendant(pt, "distance")))

    # sans horodatage par point, pas de grille 1 Hz fiable (cas trace « parcours »
    # sans temps → c'est le module course/, pas une activité d'entraînement).
    if len(timestamps) < 2 or any(t is None for t in timestamps):
        raise ValueError(f"GPX sans horodatage exploitable: {source_name!r}")

    return CanonicalActivity.from_samples(
        timestamps=timestamps,
        alt_m=alt,
        lat=lat,
        lon=lon,
        hr=hr,
        cadence=cad,
        cadence_per_foot=True,
        dist_device_m=dist,
        sport=sport,
        source_format="gpx",
        source_name=source_name,
    )


__all__ = ["parse_gpx"]
