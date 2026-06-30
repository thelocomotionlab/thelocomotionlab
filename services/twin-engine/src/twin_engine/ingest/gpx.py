"""Adaptateur ``.gpx`` (Polar, Strava, montres diverses) → schéma canonique.

Le GPX porte rarement vitesse ou distance : la distance est reconstruite par
haversine sur lat/lon (dans :meth:`CanonicalActivity.from_samples`). La FC, quand
présente, vit dans les extensions (``gpxtpx:hr`` / ``ns3:hr``). Le sport est souvent
absent → laissé à ``None`` (le bundle Strava le renseigne via activities.csv).
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

import numpy as np

from ._xml import child, descendant, localname, parse_iso_time, text_of
from .canonical import CanonicalActivity


def parse_gpx(data: bytes, source_name: str) -> CanonicalActivity:
    root = ET.fromstring(data)

    timestamps: list = []
    alt: list[float] = []
    lat: list[float] = []
    lon: list[float] = []
    hr: list[float] = []

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
        hr_el = descendant(pt, "hr")
        hr.append(float(hr_el.text) if (hr_el is not None and hr_el.text) else np.nan)

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
        sport=sport,
        source_format="gpx",
        source_name=source_name,
    )


__all__ = ["parse_gpx"]
