"""Schéma canonique : resampling 1 Hz, distance monotone, dégradation propre."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pytest

from twin_engine.ingest import CanonicalActivity, haversine_cumulative, normalize_sport


def test_normalize_sport():
    assert normalize_sport("Running") == "running"
    assert normalize_sport("trail_running") == "running"
    assert normalize_sport("Biking") == "cycling"
    assert normalize_sport("  ") is None
    assert normalize_sport(None) is None


def test_haversine_known_distance():
    # ~1 degré de longitude à l'équateur ≈ 111.3 km
    lat = np.array([0.0, 0.0])
    lon = np.array([0.0, 1.0])
    d = haversine_cumulative(lat, lon)
    assert d[0] == 0.0
    assert abs(d[1] - 111_195) < 500


def test_resample_to_1hz_and_monotonic():
    t0 = dt.datetime(2026, 1, 1, 8, 0, 0, tzinfo=dt.timezone.utc)
    ts = [t0 + dt.timedelta(seconds=s) for s in [0, 0.5, 1.2, 2.0, 5.0, 6.0]]
    dist = [0, 1.5, 3.6, 6.0, 15.0, 18.0]
    act = CanonicalActivity.from_samples(
        timestamps=ts, dist_m=dist, source_format="gpx", source_name="s.gpx",
        hr=[120, 121, 122, 123, 130, 131], sport="run",
    )
    assert act.n == 7  # 0..6 s inclus
    assert np.allclose(act.t, np.arange(7))
    assert np.all(np.diff(act.dist_m) >= -1e-9)
    assert act.has_hr and act.is_running
    assert act.start_time == t0


def test_missing_hr_is_nan_not_invented():
    act = CanonicalActivity.from_samples(
        timestamps=[0, 1, 2, 3], dist_m=[0, 3, 6, 9],
        source_format="gpx", source_name="s.gpx",
    )
    assert not act.has_hr
    assert np.all(np.isnan(act.hr))


def test_distance_derived_from_speed_when_absent():
    act = CanonicalActivity.from_samples(
        timestamps=[0, 1, 2, 3, 4], speed_ms=[3.0, 3.0, 3.0, 3.0, 3.0],
        source_format="tcx", source_name="s.tcx",
    )
    # 3 m/s sur 4 s ≈ 12 m
    assert abs(float(act.dist_m[-1]) - 12.0) < 1e-6


def test_empty_activity_raises():
    with pytest.raises(ValueError):
        CanonicalActivity.from_samples(
            timestamps=[0], dist_m=[0], source_format="gpx", source_name="empty.gpx",
        )
