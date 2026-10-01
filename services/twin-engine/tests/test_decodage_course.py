"""Étape 1 du chantier terrain : un fichier de course se décode entier — cadence, distance
de la montre, horloge réparée.

* l'horloge : les trois accidents d'une montre (horodatage isolé aberrant, recul, les deux
  enchaînés) sont réparés comme dans l'analyse de référence, départ et arrivée conservés ;
* la cadence : lue par chaque format, ramenée en pas par minute pour les deux pieds, l'unité
  de la source vérifiée sur les données (réelles : exports Garmin, Polar, Strava) ;
* la distance de la montre d'un GPX COROS : gardée à part, servie sous ``twin.gpx_distance``.
"""

from __future__ import annotations

import datetime as dt
import gzip
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest

from _gpx_coros import gpx_coros, point
from twin_engine.config import load_config
from twin_engine.ingest import CanonicalActivity
from twin_engine.ingest.canonical import CLOCK_JUMP_S, repair_clock
from twin_engine.ingest.gpx import parse_gpx
from twin_engine.ingest.polar import parse_polar
from twin_engine.ingest.registry import parse_bytes
from twin_engine.ingest.tcx import parse_tcx
from twin_engine.ingest.walker import walk_activity_files
from twin_engine.twin.record import activity_distance, process_activity

FIX = Path(__file__).parent / "fixtures"
CFG = load_config()


# --------------------------------------------------------------------------- #
# Horloge
# --------------------------------------------------------------------------- #
def test_clean_clock_is_left_untouched():
    t = np.arange(0.0, 500.0)
    out, notes = repair_clock(t)
    assert notes == []
    assert np.array_equal(out, t)


def test_isolated_aberrant_timestamp_is_interpolated():
    t = np.arange(0.0, 100.0)
    t[40] += 2 * CLOCK_JUMP_S              # un seul point écrit deux heures plus tard
    out, notes = repair_clock(t)
    assert len(notes) == 1 and "aberrant" in notes[0]
    assert out[40] == pytest.approx(40.0)
    assert out[0] == 0.0 and out[-1] == 99.0
    assert np.all(np.diff(out) > 0)


def test_long_pause_is_not_taken_for_an_aberrant_timestamp():
    """Deux heures d'arrêt montre en marche : les voisins ne se suivent pas, rien à réparer."""
    t = np.concatenate([np.arange(0.0, 50.0), 2 * CLOCK_JUMP_S + np.arange(0.0, 50.0)])
    out, notes = repair_clock(t)
    assert notes == []
    assert np.array_equal(out, t)


def test_clock_going_back_is_absorbed_by_what_precedes():
    t = np.concatenate([np.arange(0.0, 51.0), np.arange(21.0, 100.0)])   # 50 → 21 : recul de 29 s
    out, notes = repair_clock(t)
    assert len(notes) == 1 and "recule de 29 s" in notes[0]
    assert np.all(np.diff(out) > 0)
    assert out[0] == 0.0 and out[-1] == t[-1]                          # départ et arrivée conservés
    assert out[50] == pytest.approx(20.0)                              # juste avant le point qui suit
    assert out[25] == pytest.approx(10.0)                              # recalage linéaire


def test_aberrant_timestamp_then_clock_going_back():
    t = np.concatenate([np.arange(0.0, 51.0), np.arange(21.0, 100.0)])
    t[10] += 3 * CLOCK_JUMP_S
    out, notes = repair_clock(t)
    assert len(notes) == 2
    assert "aberrant" in notes[0] and "recule" in notes[1]
    assert np.all(np.diff(out) > 0)
    assert out[0] == 0.0 and out[-1] == t[-1]


def _coros_run(n: int = 900, *, v: float = 3.0, cad: float = 85.0, hr: float = 150.0,
               scale_device: float = 0.97, accidents: bool = False) -> bytes:
    pts = []
    for i in range(n):
        t = float(i)
        if accidents and i == 300:
            t = i + 2 * CLOCK_JUMP_S          # horodatage isolé aberrant
        if accidents and i >= 600:
            t = i - 40.0                       # recul d'horloge de 41 s au point 600
        p = point(t, v * i, 500.0 + 0.05 * v * i, hr=hr, cad_per_foot=cad)
        p["dist"] = scale_device * v * i       # la montre ne mesure pas l'haversine
        pts.append(p)
    return gpx_coros(pts)


def test_coros_gpx_with_clock_accidents_decodes_whole():
    act = parse_gpx(_coros_run(accidents=True), "course.gpx")
    assert len(act.clock_notes) == 2
    assert act.duration_s == pytest.approx(899.0 - 40.0, abs=1.0)    # arrivée conservée
    assert np.all(np.diff(act.dist_m) >= 0)
    assert np.nanmedian(act.hr) == pytest.approx(150.0)
    assert act.cadence_unit == "par_pied"
    assert np.nanmedian(act.cadence_spm) == pytest.approx(170.0)
    summary, _, _ = process_activity(act, CFG)
    assert summary.clock_repairs == 2


# --------------------------------------------------------------------------- #
# Distance de la montre
# --------------------------------------------------------------------------- #
def test_device_distance_is_kept_aside_and_served_on_demand():
    act = parse_gpx(_coros_run(), "course.gpx")
    assert act.has_device_distance
    assert act.dist_device_m[-1] == pytest.approx(0.97 * 3.0 * 899, rel=1e-3)
    assert act.dist_m[-1] == pytest.approx(3.0 * 899, rel=0.01)         # haversine des positions
    assert activity_distance(act, CFG) is act                           # défaut : rien ne change
    device = replace(CFG, twin=replace(CFG.twin, gpx_distance="device"))
    served = activity_distance(act, device)
    assert np.array_equal(served.dist_m, act.dist_device_m)
    s_default, _, _ = process_activity(act, CFG)
    s_device, _, _ = process_activity(act, device)
    assert s_device.dist_km == pytest.approx(0.97 * s_default.dist_km, rel=0.01)


def test_gpx_without_watch_distance_is_unchanged_under_device():
    act = parse_gpx(_coros_run_without_distance(), "course.gpx")
    assert not act.has_device_distance
    device = replace(CFG, twin=replace(CFG.twin, gpx_distance="device"))
    assert activity_distance(act, device) is act


def _coros_run_without_distance() -> bytes:
    return gpx_coros([point(float(i), 3.0 * i, 500.0, hr=150, cad_per_foot=85)
                      for i in range(300)], with_distance=False)


def test_recording_gap_is_carried_on_the_grid():
    pts = [point(float(i), 3.0 * i, 500.0) for i in range(100)]
    pts += [point(float(i + 30), 3.0 * i + 30.0, 500.0) for i in range(100, 200)]   # trou de 31 s
    act = parse_gpx(gpx_coros(pts), "trou.gpx")
    assert act.gap_s[50] == pytest.approx(1.0)
    assert act.gap_s[110] == pytest.approx(31.0)
    assert act.gap_s[150] == pytest.approx(1.0)


# --------------------------------------------------------------------------- #
# Cadence : unité, formats
# --------------------------------------------------------------------------- #
def _samples(v: float, cad: float, n: int = 900, *, declared: bool | None = True):
    t0 = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
    return CanonicalActivity.from_samples(
        timestamps=[t0 + dt.timedelta(seconds=s) for s in range(n)],
        dist_m=[v * s for s in range(n)], cadence=[cad] * n, cadence_per_foot=declared,
        source_format="fit", source_name="a.fit", sport="running",
    )


@pytest.mark.parametrize(
    "v, cad, attendu, unite",
    [
        (3.0, 85.0, 170.0, "par_pied"),     # course, valeurs par pied (FIT, GPX, TCX)
        (3.0, 172.0, 172.0, "deux_pieds"),  # course, valeurs déjà pour les deux pieds
        (1.2, 55.0, 110.0, "par_pied"),     # marche seule, par pied
        (1.2, 112.0, 112.0, "deux_pieds"),  # marche seule, deux pieds
    ],
)
def test_cadence_unit_is_read_on_the_data(v, cad, attendu, unite):
    act = _samples(v, cad)
    assert act.cadence_unit == unite
    assert np.nanmedian(act.cadence_spm) == pytest.approx(attendu)


def test_cadence_unit_falls_back_on_the_declared_one_when_data_cannot_tell():
    act = _samples(0.3, 60.0, n=200, declared=False)    # ni course ni marche franche
    assert act.cadence_unit == "deux_pieds"
    assert np.nanmedian(act.cadence_spm) == pytest.approx(60.0)


def test_no_cadence_is_nan_not_zero():
    t0 = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
    act = CanonicalActivity.from_samples(
        timestamps=[t0 + dt.timedelta(seconds=s) for s in range(100)],
        dist_m=[3.0 * s for s in range(100)], source_format="fit", source_name="a.fit",
    )
    assert not act.has_cadence and act.cadence_unit is None
    assert np.isnan(act.cadence_spm).all()


def test_direct_construction_gets_neutral_optional_channels():
    act = CanonicalActivity(
        start_time=None, sport="running", sub_sport=None, source_format="fit",
        source_name="x", t=np.arange(10.0), dist_m=np.arange(10.0), speed_ms=np.ones(10),
        hr=np.full(10, np.nan), alt_m=np.full(10, np.nan), lat=np.full(10, np.nan),
        lon=np.full(10, np.nan),
    )
    assert not act.has_cadence and not act.has_device_distance
    assert np.array_equal(act.gap_s, np.ones(10)) and act.clock_notes == ()


def test_tcx_run_cadence_is_read():
    pts = []
    t0 = dt.datetime(2026, 1, 1, 8, tzinfo=dt.timezone.utc)
    for i in range(400):
        when = (t0 + dt.timedelta(seconds=i)).strftime("%Y-%m-%dT%H:%M:%SZ")
        pts.append(
            f"<Trackpoint><Time>{when}</Time><DistanceMeters>{3.0 * i}</DistanceMeters>"
            f"<Extensions><ns3:TPX><ns3:RunCadence>88</ns3:RunCadence></ns3:TPX></Extensions>"
            "</Trackpoint>"
        )
    tcx = (
        '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" '
        'xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Activities>'
        f'<Activity Sport="Running"><Lap><Track>{"".join(pts)}</Track></Lap></Activity>'
        "</Activities></TrainingCenterDatabase>"
    ).encode()
    act = parse_tcx(tcx, "a.tcx")
    assert act.cadence_unit == "par_pied"
    assert np.nanmedian(act.cadence_spm) == pytest.approx(176.0)


def _running_cadence(act) -> float:
    v = np.zeros(act.n)
    v[5:-5] = (act.dist_m[10:] - act.dist_m[:-10]) / 10.0
    m = np.isfinite(act.cadence_spm) & (v >= 2.5) & (act.cadence_spm > 0)
    return float(np.median(act.cadence_spm[m]))


def _real_files(name: str, exts: tuple[str, ...]):
    for orig, data in walk_activity_files(FIX / name):
        low = orig.lower()
        if low.endswith(".gz"):
            data, low = gzip.decompress(data), low[:-3]
        if low.endswith(exts):
            yield low, data


def test_real_garmin_and_strava_fit_cadence_is_per_foot():
    seen = 0
    for name in ("garmin_export_fixture.zip", "strava_export_fixture.zip"):
        for low, data in _real_files(name, (".fit",)):
            act = parse_bytes(data, "activity.fit")
            if not act.is_running or not act.has_cadence:
                continue
            seen += 1
            assert act.cadence_unit == "par_pied"
            assert 150.0 <= _running_cadence(act) <= 200.0
    assert seen >= 5


def test_real_polar_and_strava_gpx_cadence():
    polar = [parse_polar(data, "s.json") for low, data in
             _real_files("polar_export_fixture.zip", (".json",))
             if b'"CADENCE"' in data]
    assert len(polar) == 3
    for act in polar:
        assert act.cadence_unit == "par_pied"
        assert 150.0 <= _running_cadence(act) <= 200.0
    gpx = [parse_gpx(data, "a.gpx") for low, data in
           _real_files("strava_export_fixture.zip", (".gpx",)) if b"gpxtpx:cad" in data]
    assert len(gpx) == 1 and gpx[0].cadence_unit == "par_pied"
    assert np.nanmedian(gpx[0].cadence_spm) == pytest.approx(178.0, abs=6.0)
