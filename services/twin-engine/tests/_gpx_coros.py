"""Fabrique de GPX « à la COROS » pour les tests : positions, altitude barométrique et, dans
les extensions ``gpxdata`` (cluetrust), FC, cadence PAR PIED et distance de la montre."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

START = datetime(2026, 9, 25, 11, 0, 0, tzinfo=timezone.utc)
LAT0, LON0 = 44.25, 6.92


def point(t_s: float, dist_m: float, alt_m: float, hr: float | None = None,
          cad_per_foot: float | None = None, lat: float | None = None,
          lon: float | None = None) -> dict:
    """Un point de trace ; la position avance vers l'est avec la distance sauf si donnée."""
    if lat is None or lon is None:
        lat = LAT0
        lon = LON0 + dist_m / (111_320.0 * math.cos(math.radians(LAT0)))
    return {"t": t_s, "dist": dist_m, "alt": alt_m, "hr": hr, "cad": cad_per_foot,
            "lat": lat, "lon": lon}


def gpx_coros(points: list[dict], *, start: datetime = START, with_distance: bool = True) -> bytes:
    """GPX 1.1 avec extensions gpxdata, horodatages ``start + t`` (en secondes, tels quels :
    un horodatage aberrant ou un recul s'écrivent en donnant le ``t`` voulu)."""
    rows = []
    for p in points:
        when = (start + timedelta(seconds=float(p["t"]))).strftime("%Y-%m-%dT%H:%M:%SZ")
        ext = []
        if p.get("hr") is not None:
            ext.append(f"<gpxdata:hr>{p['hr']:.0f}</gpxdata:hr>")
        if p.get("cad") is not None:
            ext.append(f"<gpxdata:cadence>{p['cad']:.0f}</gpxdata:cadence>")
        if with_distance:
            ext.append(f"<gpxdata:distance>{p['dist']:.2f}</gpxdata:distance>")
        rows.append(
            f'<trkpt lat="{p["lat"]:.7f}" lon="{p["lon"]:.7f}"><ele>{p["alt"]:.1f}</ele>'
            f"<time>{when}</time><extensions>{''.join(ext)}</extensions></trkpt>"
        )
    body = "".join(rows)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<gpx version="1.1" creator="COROS" xmlns="http://www.topografix.com/GPX/1/1" '
        'xmlns:gpxdata="http://www.cluetrust.com/XML/GPXDATA/1/0">'
        f"<trk><name>course</name><type>running</type><trkseg>{body}</trkseg></trk></gpx>"
    ).encode()
