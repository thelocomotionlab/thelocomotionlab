"""Jumeau : vitesse ajustée, courbe record, VC/D′, exposant E, durabilité.

Validation sur des athlètes SYNTHÉTIQUES aux paramètres connus (le golden sur le vrai
athlète s'active avec l'archive réelle, cf. test_golden.py).
"""

from __future__ import annotations

import numpy as np

from twin_engine.config import load_config
from twin_engine.ingest.canonical import CanonicalActivity
from twin_engine.twin import (
    RecordCurve,
    RecordPoint,
    build_twin,
    fit_critical_speed,
    fit_endurance_exponent,
    process_activity,
)

CFG = load_config()


def _run(v, dur, *, grade=0.0, alt0=100.0, hr=None):
    t = list(range(dur + 1))
    dist = [v * s for s in t]
    alt = [alt0 + grade * d for d in dist] if grade else [alt0] * len(t)
    hr_arr = hr if hr is not None else [None] * len(t)
    return CanonicalActivity.from_samples(
        timestamps=t, dist_m=dist, speed_ms=[v] * len(t), alt_m=alt, hr=hr_arr,
        sport="running", source_format="fit", source_name="syn",
    )


def test_flat_run_vga_equals_vraw():
    summary, vga, vraw = process_activity(_run(3.0, 3600), CFG)
    durs = np.asarray(CFG.twin.record_durations_s, float)
    j = list(durs).index(3600)
    assert abs(vga[j] - 3.0) < 0.02
    assert abs(vraw[j] - 3.0) < 0.02
    assert abs(summary.ga_km - summary.dist_km) < 0.05  # plat → ajusté ≈ brut


def test_uphill_run_vga_exceeds_vraw():
    summary, vga, vraw = process_activity(_run(2.0, 3600, grade=0.06), CFG)
    durs = np.asarray(CFG.twin.record_durations_s, float)
    j = list(durs).index(3600)
    assert vga[j] > vraw[j] * 1.1     # la montée « vaut » plus en équivalent plat
    assert summary.dplus_m > 300      # 0.06 * (2*3600) ≈ 432 m
    assert summary.ga_km > summary.dist_km


def test_fit_critical_speed_recovers_known_params():
    durs = np.array([600, 900, 1200, 1800, 2400, 3000, 3600, 4500, 5400], float)
    vc_true, dprime_true = 2.90, 1500.0
    vga = (vc_true * durs + dprime_true) / durs
    pts = [RecordPoint(int(T), float(vga[i]), float(vga[i]), "2025-01-01", True)
           for i, T in enumerate(durs)]
    rec = RecordCurve(durs, vga, vga.copy(), pts)
    cs = fit_critical_speed(rec, CFG)
    assert cs is not None and cs.from_flat_efforts
    assert abs(cs.vc_ms - vc_true) < 0.02
    assert abs(cs.dprime_m - dprime_true) < 50
    assert cs.n_points == 9


def test_fit_endurance_exponent_recovers_E():
    durs = np.array([1800, 2400, 3000, 3600, 4500, 5400, 7200, 9000, 10800, 14400, 18000, 21600], float)
    alpha_true = 0.18
    vga = 4.0 * durs ** (-alpha_true)
    rec = RecordCurve(durs, vga, vga.copy(),
                      [RecordPoint(int(T), float(vga[i]), float(vga[i]), None, False)
                       for i, T in enumerate(durs)])
    alpha, E, coef = fit_endurance_exponent(rec, CFG)
    assert abs(alpha - alpha_true) < 1e-3
    assert abs(E - 1.0 / (1.0 - alpha_true)) < 0.01  # E ≈ 1.2195
    # le coefficient reconstruit l'enveloppe : coef·t^(−α) ≈ vga mesurée
    assert abs(coef * durs[0] ** (-alpha) - vga[0]) < 1e-6


def test_build_twin_end_to_end():
    # FC qui dérive en 2e moitié d'une longue sortie → durabilité positive
    long_dur = 5400
    hr = [140 + 20 * s / long_dur for s in range(long_dur + 1)]
    acts = [
        _run(3.6, 700),
        _run(3.05, 3000),
        _run(2.95, 5400),
        _run(2.6, long_dur, grade=0.0, hr=hr),
    ]
    twin = build_twin(acts, CFG)
    assert twin.critical_speed is not None
    assert 2.5 < twin.vc_ms < 3.7
    assert twin.endurance_E is not None
    assert twin.durability_pct is not None and twin.durability_pct > 0
    d = twin.to_dict()
    assert d["vc_kmh"] is not None and d["n_activities"] == 4


def test_no_hr_means_no_durability():
    twin = build_twin([_run(2.6, 5400)], CFG)  # pas de FC
    assert twin.durability_pct is None
