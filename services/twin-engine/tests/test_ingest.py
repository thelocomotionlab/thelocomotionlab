"""Ingestion : un échantillon par format + bundle Strava + dégradation/purge.

Les fixtures sont générées par tests/fixtures/_generate.py (dev-only, fit-tool).
"""

from __future__ import annotations

import gzip
import zipfile
from pathlib import Path

import numpy as np
import pytest

from twin_engine.ingest import ingest_path, parse_bytes

FIX = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize("name", ["sample.fit", "sample.tcx", "sample.gpx"])
def test_each_format_parses_to_canonical(name):
    result = ingest_path(FIX / name)
    assert result.skipped == []
    assert len(result.activities) == 1
    act = result.activities[0]
    assert act.n == 120
    assert act.is_running
    assert act.has_hr
    assert act.has_altitude
    # distance monotone et cohérente entre formats (~3 m/s * 119 s ≈ 357 m, haversine ~1 m près)
    assert np.all(np.diff(act.dist_m) >= -1e-9)
    assert 350 < float(act.dist_m[-1]) < 365
    assert abs(float(act.lat[0]) - 43.70) < 1e-3


def test_formats_agree_on_distance():
    ends = {
        name: float(ingest_path(FIX / name).activities[0].dist_m[-1])
        for name in ("sample.fit", "sample.tcx", "sample.gpx")
    }
    assert max(ends.values()) - min(ends.values()) < 3.0  # cohérence inter-format


def test_strava_bulk_zip_mixed_formats():
    result = ingest_path(FIX / "strava-bulk.zip")
    assert result.skipped == []
    assert len(result.activities) == 3
    # le .gpx nu (sans <type>) récupère « running » via activities.csv
    by_fmt = {a.source_format: a for a in result.activities}
    assert set(by_fmt) == {"fit", "tcx", "gpx"}
    assert by_fmt["gpx"].sport == "running"
    assert all(a.is_running for a in result.activities)


def test_gz_single_file(tmp_path):
    raw = (FIX / "sample.tcx").read_bytes()
    gz = tmp_path / "act.tcx.gz"
    gz.write_bytes(gzip.compress(raw))
    result = ingest_path(gz)
    assert len(result.activities) == 1
    assert result.activities[0].source_format == "tcx"


def test_unsupported_file_is_skipped_not_fatal(tmp_path):
    junk = tmp_path / "note.txt"
    junk.write_text("pas une trace")
    result = ingest_path(junk)
    assert result.activities == []
    assert result.skipped and "non supporté" in result.skipped[0]["reason"]


def test_corrupt_member_does_not_abort_archive(tmp_path):
    """Un fichier brouillon dans un zip ne doit pas faire tomber les autres."""
    good = (FIX / "sample.gpx").read_bytes()
    # > 1 Ko pour passer le pré-filtre de taille du marcheur et atteindre le parseur,
    # qui le rejettera (aucun point de trace) → fichier ignoré, pas une exception fatale.
    broken = b"<gpx>not valid" + b" " * 1200
    z = tmp_path / "mix.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("ok.gpx", good)
        zf.writestr("broken.gpx", broken)
    result = ingest_path(z)
    assert len(result.activities) == 1
    assert len(result.skipped) == 1
    # nom anonymisé (la PII éventuelle du nom d'origine est effacée), extension conservée
    name = result.skipped[0]["name"]
    assert name.startswith("activity-") and name.endswith(".gpx")
    assert "broken" not in name


def test_purge_source_deletes_raw_archive(tmp_path):
    """Garde-fou confidentialité : l'archive brute est supprimée après parsing."""
    raw = (FIX / "sample.fit").read_bytes()
    f = tmp_path / "perso.fit"
    f.write_bytes(raw)
    result = ingest_path(f, purge_source=True)
    assert len(result.activities) == 1
    assert not f.exists()


def test_directory_walk(tmp_path):
    for name in ("a.gpx", "b.tcx"):
        (tmp_path / name).write_bytes((FIX / ("sample" + Path(name).suffix)).read_bytes())
    result = ingest_path(tmp_path)
    assert len(result.activities) == 2


def test_fit_parsing_emits_no_warnings():
    """fit.py tait les `invalid field size` de fitdecode (sinon flood sur 449 fichiers)."""
    import warnings

    with warnings.catch_warnings():
        warnings.simplefilter("error")  # toute UserWarning fuyant ferait échouer
        result = ingest_path(FIX / "sample.fit")
    assert len(result.activities) == 1


def test_progress_callback_called():
    seen = []
    ingest_path(FIX / "strava-bulk.zip", progress=lambda n, name: seen.append((n, name)))
    assert seen and seen[-1][0] == 3  # 3 fichiers dans le bundle


def test_missing_hr_degrades_cleanly():
    """FC absente → has_hr False, pas de crash (la durabilité le signalera en aval)."""
    gpx_no_hr = (
        '<?xml version="1.0"?>'
        '<gpx xmlns="http://www.topografix.com/GPX/1/1">'
        "<trk><trkseg>"
        '<trkpt lat="43.70" lon="7.26"><ele>100</ele><time>2026-01-01T08:00:00Z</time></trkpt>'
        '<trkpt lat="43.70" lon="7.27"><ele>101</ele><time>2026-01-01T08:00:10Z</time></trkpt>'
        "</trkseg></trk></gpx>"
    ).encode()
    act = parse_bytes(gpx_no_hr, "nohr.gpx")
    assert not act.has_hr
    assert np.all(np.isnan(act.hr))


# --------------------------------------------------------------------------- #
# E1 : ingestion en flux — mêmes résultats que la version matérialisée
# --------------------------------------------------------------------------- #
def test_iter_activities_streams_like_batch(tmp_path):
    """Le flux (mémoire O(1 activité)) produit exactement les mêmes activités et les mêmes
    ignorés que ingest_path — qui est désormais bâti dessus."""
    from twin_engine.ingest import iter_activities

    skipped: list[dict] = []
    streamed = list(iter_activities(FIX / "sample.fit", skipped=skipped))
    batch = ingest_path(FIX / "sample.fit")
    assert len(streamed) == len(batch.activities) == 1
    assert skipped == batch.skipped == []
    assert streamed[0].source_name == batch.activities[0].source_name

    # running_only : le flux signale les sports ignorés comme le lot
    import json as _json
    bad = tmp_path / "meta.json"
    bad.write_bytes(_json.dumps({"pas": "une activité"}).encode())
    sk2: list[dict] = []
    assert list(iter_activities(bad, running_only=True, skipped=sk2)) == []


def test_run_preview_streams_and_counts(tmp_path):
    """E1 : run_preview (flux) compte ingérés/ignorés comme avant et purge en finally."""
    from twin_engine.config import load_config
    from twin_engine.course import RaceSpec
    from twin_engine.pipeline import run_preview

    src = (FIX / "sample.gpx").read_bytes()
    upload = tmp_path / "perso.gpx"
    upload.write_bytes(src)
    cfg = load_config()
    race = RaceSpec("Test", (0.0, 5.0, 10.0), ("d", "s", "a"))
    import math

    def _tri(n=120):
        lat0, lon0 = 43.70, 7.26
        rows = []
        for i in range(n + 1):
            x = 10000.0 * i / n
            ele = 1000.0 * (x / 5000.0) if x <= 5000 else 1000.0 * (2 - x / 5000.0)
            dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
            rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
        return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
                f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()

    result = run_preview(training_path=upload, course_gpx=_tri(), race=race, cfg=cfg,
                         purge_source=True)
    assert not upload.exists()                          # purge après épuisement du flux
    assert result.n_ingested == 1 and result.n_skipped == 0
