"""Génère de PETITS échantillons réels (un par format) pour les tests d'ingestion.

Dev-only (n'est PAS un runtime du moteur : utilise fit-tool, hors deps de prod).
Rejouable :  python services/twin-engine/tests/fixtures/_generate.py

Produit une même activité « course » logique en .fit / .tcx / .gpx + un mini bundle
Strava (activities.csv + traces compressées) pour couvrir le dispatch d'archive.
"""

from __future__ import annotations

import gzip
import io
import math
import zipfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
START = datetime(2026, 1, 1, 8, 0, 0, tzinfo=timezone.utc)
N = 120  # 2 min à 1 Hz — minuscule mais suffisant pour tester le parsing
LAT0, LON0, ALT0 = 43.70, 7.26, 100.0
SPEED = 3.0  # m/s


def _track():
    """Trajectoire déterministe : avance vers l'est à 3 m/s, bosse d'altitude, FC 130→150."""
    pts = []
    lat = LAT0
    lon = LON0
    dist = 0.0
    for i in range(N):
        t = START.timestamp() + i
        alt = ALT0 + 40.0 * math.sin(math.pi * i / N)  # monte puis redescend
        hr = 130 + 20 * i / N
        pts.append(dict(i=i, t=t, lat=lat, lon=lon, alt=alt, hr=hr, dist=dist, speed=SPEED))
        # pas de longitude correspondant à SPEED m/s (pour une distance haversine réaliste)
        dlon = SPEED / (111_320.0 * math.cos(math.radians(lat)))
        lon += dlon
        dist += SPEED
    return pts


def _iso(t: float) -> str:
    return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------- #
def write_fit(pts) -> bytes:
    from fit_tool.fit_file_builder import FitFileBuilder
    from fit_tool.profile.messages.file_id_message import FileIdMessage
    from fit_tool.profile.messages.record_message import RecordMessage
    from fit_tool.profile.messages.session_message import SessionMessage
    from fit_tool.profile.profile_type import FileType, Manufacturer, Sport

    builder = FitFileBuilder(auto_define=True)
    fid = FileIdMessage()
    fid.type = FileType.ACTIVITY
    fid.manufacturer = Manufacturer.DEVELOPMENT.value
    fid.time_created = round(START.timestamp() * 1000)
    builder.add(fid)

    for p in pts:
        r = RecordMessage()
        r.timestamp = round(p["t"] * 1000)
        r.distance = p["dist"]
        r.speed = p["speed"]
        r.heart_rate = round(p["hr"])
        r.altitude = p["alt"]
        r.position_lat = p["lat"]
        r.position_long = p["lon"]
        builder.add(r)

    sess = SessionMessage()
    sess.sport = Sport.RUNNING
    sess.start_time = round(START.timestamp() * 1000)
    builder.add(sess)

    return builder.build().to_bytes()


def write_tcx(pts, *, with_sport: bool = True) -> bytes:
    sport = ' Sport="Running"' if with_sport else ""
    rows = []
    for p in pts:
        rows.append(
            f"""      <Trackpoint>
        <Time>{_iso(p['t'])}</Time>
        <Position><LatitudeDegrees>{p['lat']:.6f}</LatitudeDegrees>"""
            f"<LongitudeDegrees>{p['lon']:.6f}</LongitudeDegrees></Position>\n"
            f"        <AltitudeMeters>{p['alt']:.1f}</AltitudeMeters>\n"
            f"        <DistanceMeters>{p['dist']:.1f}</DistanceMeters>\n"
            f"        <HeartRateBpm><Value>{round(p['hr'])}</Value></HeartRateBpm>\n"
            f"      </Trackpoint>"
        )
    body = "\n".join(rows)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">\n'
        f"  <Activities><Activity{sport}>\n"
        f"    <Id>{_iso(pts[0]['t'])}</Id>\n"
        "    <Lap><Track>\n"
        f"{body}\n"
        "    </Track></Lap>\n"
        "  </Activity></Activities>\n"
        "</TrainingCenterDatabase>\n"
    ).encode("utf-8")


def write_gpx(pts, *, with_type: bool = True) -> bytes:
    typ = "<type>running</type>" if with_type else ""
    rows = []
    for p in pts:
        rows.append(
            f'    <trkpt lat="{p["lat"]:.6f}" lon="{p["lon"]:.6f}">'
            f"<ele>{p['alt']:.1f}</ele><time>{_iso(p['t'])}</time>"
            "<extensions><gpxtpx:TrackPointExtension>"
            f"<gpxtpx:hr>{round(p['hr'])}</gpxtpx:hr>"
            "</gpxtpx:TrackPointExtension></extensions></trkpt>"
        )
    body = "\n".join(rows)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" creator="twin-engine-test" '
        'xmlns="http://www.topografix.com/GPX/1/1" '
        'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n'
        f"  <trk>{typ}<trkseg>\n{body}\n  </trkseg></trk>\n"
        "</gpx>\n"
    ).encode("utf-8")


def write_strava_zip(pts) -> bytes:
    """Bundle Strava : activities.csv + traces mixtes (gpx nu, fit.gz, tcx.gz)."""
    fit = write_fit(pts)
    tcx = write_tcx(pts, with_sport=False)
    gpx = write_gpx(pts, with_type=False)  # pas de type → sport vient du CSV
    csv_text = (
        "Activity ID,Activity Date,Activity Name,Activity Type,Filename\n"
        "1,2026-01-01 08:00:00,Run GPX,Run,activities/1.gpx\n"
        "2,2026-01-01 08:00:00,Run FIT,Run,activities/2.fit.gz\n"
        "3,2026-01-01 08:00:00,Run TCX,Run,activities/3.tcx.gz\n"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("activities.csv", csv_text)
        zf.writestr("activities/1.gpx", gpx)
        zf.writestr("activities/2.fit.gz", gzip.compress(fit))
        zf.writestr("activities/3.tcx.gz", gzip.compress(tcx))
    return buf.getvalue()


def main() -> None:
    pts = _track()
    (HERE / "sample.fit").write_bytes(write_fit(pts))
    (HERE / "sample.tcx").write_bytes(write_tcx(pts))
    (HERE / "sample.gpx").write_bytes(write_gpx(pts))
    (HERE / "strava-bulk.zip").write_bytes(write_strava_zip(pts))
    for f in ("sample.fit", "sample.tcx", "sample.gpx", "strava-bulk.zip"):
        print(f"  {f}: {(HERE / f).stat().st_size} octets")


if __name__ == "__main__":
    main()
