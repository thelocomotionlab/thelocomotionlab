"""Arrêts et temps de mouvement (twin/stops.py) : le masque du moteur, exposé et mesuré."""

from __future__ import annotations

import numpy as np
import pytest

from twin_engine.config import load_config
from twin_engine.ingest.canonical import CanonicalActivity
from twin_engine.twin.record import process_activity
from twin_engine.twin.stops import detect_stops, moving_mask, stop_stats

CFG = load_config()


def _run_pause_run(v=3.0, run_s=600, pause_s=1800):
    """10 min de course, 30 min de plateau de distance, 10 min de course (1 Hz)."""
    n = 2 * run_s + pause_s + 1
    dist = np.concatenate([
        v * np.arange(run_s + 1),
        np.full(pause_s, v * run_s),
        v * run_s + v * np.arange(1, run_s + 1),
    ])
    assert dist.size == n
    return CanonicalActivity.from_samples(
        timestamps=list(range(n)), dist_m=dist, alt_m=[100.0] * n,
        sport="running", source_format="fit", source_name="syn",
    )


def test_moving_mask_is_the_engines_mask():
    """Le temps de mouvement du résumé (record.py) et le masque exposé comptent la même chose."""
    act = _run_pause_run()
    summary, _, _ = process_activity(act, CFG)
    m = moving_mask(act.dist_m, CFG.twin.moving_speed_threshold_ms)
    assert m.shape == (act.n,) and not m[0]
    assert summary.moving_time_s == np.count_nonzero(m) == 1200
    assert moving_mask(np.zeros(0), 0.5).size == 0


def test_detect_stops_finds_plateaus_and_respects_min_duration():
    mask = np.array([False, True, True, False, False, False, True, False, False, True, True])
    assert [(s.start_s, s.end_s) for s in detect_stops(mask, 3)] == [(3, 6)]
    assert [(s.start_s, s.end_s) for s in detect_stops(mask, 2)] == [(3, 6), (7, 9)]
    assert detect_stops(mask, 2)[0].duration_s == 3
    # un plateau qui court jusqu'à la fin est fermé sur n
    assert detect_stops(np.array([False, True, False, False]), 2)[0].end_s == 4
    # l'échantillon 0 (sans incrément) n'ouvre jamais un arrêt
    assert detect_stops(np.array([False, True, True]), 1) == []
    assert detect_stops(np.zeros(0, dtype=bool), 1) == []


def test_stop_stats_on_run_pause_run():
    act = _run_pause_run()
    st = stop_stats(act.dist_m, CFG.twin.moving_speed_threshold_ms, min_stop_s=60)
    assert st.elapsed_s == 3000 and st.moving_s == 1200 and st.stopped_s == 1800
    assert st.n_stops == 1 and st.n_stops_5min == 1
    assert st.longest_stop_s == 1800 and st.in_stops_s == 1800
    assert st.stopped_pct == pytest.approx(60.0)
    assert st.stopped_min_per_hour == pytest.approx(36.0)       # 30 min d'arrêt sur 50 min
    assert st.in_stops_min_per_hour == pytest.approx(36.0)
    d = st.to_dict()
    assert d["stopped_pct"] == 60.0 and d["n_stops"] == 1
    # un seuil plus haut que le plateau : plus aucun « vrai arrêt », les secondes restent
    st2 = stop_stats(act.dist_m, CFG.twin.moving_speed_threshold_ms, min_stop_s=3600)
    assert st2.n_stops == 0 and st2.in_stops_s == 0 and st2.stopped_s == 1800
