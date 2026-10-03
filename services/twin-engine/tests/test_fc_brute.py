"""La FC des fichiers bruts contre celle que le moteur lit (``tools/fc_brute``), et les noms de
FC que l'adaptateur GPX connaît."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.fc_brute import analyser, main, rapport  # noqa: E402
from twin_engine.ingest.gpx import parse_gpx  # noqa: E402


def _gpx(extension: str) -> str:
    pts = "".join(
        f'<trkpt lat="45.{7000 + i:04d}" lon="4.{8000 + i:04d}"><ele>{200 + i}</ele>'
        f"<time>2026-05-01T08:00:{i:02d}Z</time>{extension.format(v=140 + i)}</trkpt>"
        for i in range(30))
    return ('<?xml version="1.0"?><gpx version="1.1" creator="Essai" '
            'xmlns="http://www.topografix.com/GPX/1/1" '
            'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">'
            f"<trk><type>running</type><trkseg>{pts}</trkseg></trk></gpx>")


_TCX_TOUR_SEUL = """<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
<Activities><Activity Sport="Running"><Id>2026-05-01T08:00:00Z</Id>
<Lap StartTime="2026-05-01T08:00:00Z"><AverageHeartRateBpm><Value>150</Value></AverageHeartRateBpm>
<Track>""" + "".join(
    f"<Trackpoint><Time>2026-05-01T08:00:{i:02d}Z</Time><Position><LatitudeDegrees>45.{7000 + i}"
    f"</LatitudeDegrees><LongitudeDegrees>4.{8000 + i}</LongitudeDegrees></Position>"
    f"<AltitudeMeters>{200 + i}</AltitudeMeters></Trackpoint>" for i in range(30)) + """
</Track></Lap></Activity></Activities></TrainingCenterDatabase>"""


def test_the_gpx_adapter_reads_the_heart_rate_under_its_other_names():
    for balise in ("gpxtpx:hr", "heartrate", "heart_rate", "heartRate", "HeartRate", "pulse"):
        ext = f"<extensions><{balise}>{{v}}</{balise}></extensions>"
        act = parse_gpx(_gpx(ext).encode(), "a.gpx")
        assert np.nanmax(act.hr) > 0, balise
    assert not np.isfinite(parse_gpx(_gpx("").encode(), "c.gpx").hr).any()


def test_the_raw_scan_finds_the_heart_rate_the_engine_misses(tmp_path):
    (tmp_path / "a.gpx").write_text(_gpx(
        "<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>{v}</gpxtpx:hr>"
        "</gpxtpx:TrackPointExtension></extensions>"))
    (tmp_path / "b.gpx").write_text(_gpx("<extensions><bpm>{v}</bpm></extensions>"))
    (tmp_path / "c.gpx").write_text(_gpx(""))
    (tmp_path / "d.tcx").write_text(_TCX_TOUR_SEUL)
    r = analyser(tmp_path)
    gpx, tcx = r["par_format"]["gpx"], r["par_format"]["tcx"]
    assert (gpx["fichiers"], gpx["FC brute"], gpx["FC lue"], gpx["brute non lue"]) == (3, 2, 1, 1)
    # une moyenne de tour n'est pas une FC point par point
    assert (tcx["fichiers"], tcx["FC brute"], tcx["FC lue"]) == (1, 0, 0)
    assert gpx["course : brute non lue"] == 1
    md = rapport(r)
    assert "bpm (1)" in md and "hr (1)" in md and "Essai (3)" in md
    assert "fichier(s) de course à pied et le moteur ne la lit pas" in md
    # les fichiers se nomment comme à l'ingestion : aucun nom d'origine
    assert "b.gpx" not in md and "activity-0000" in md

    # la même FC non lue sur une sortie à vélo : sans effet sur le jumeau, et dit comme tel
    (tmp_path / "b.gpx").write_text(_gpx("<extensions><bpm>{v}</bpm></extensions>").replace(
        "<type>running</type>", "<type>cycling</type>"))
    assert "fichier(s) d'autres sports gardent une FC" in rapport(analyser(tmp_path))
    (tmp_path / "b.gpx").unlink()
    sortie = tmp_path / "fc.md"
    assert main([str(tmp_path), "--out", str(sortie)]) == 0
    assert "la FC est lue partout où elle est dans les fichiers" in sortie.read_text(encoding="utf-8")
    vide = tmp_path / "vide"
    vide.mkdir()
    (vide / "c.gpx").write_text(_gpx(""))
    assert "aucune FC dans les fichiers" in rapport(analyser(vide))
    assert main([str(tmp_path / "absent")]) == 2
