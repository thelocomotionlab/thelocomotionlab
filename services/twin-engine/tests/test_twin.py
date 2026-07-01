"""Jumeau : vitesse ajustée, courbe record, VC/D′, exposant E, durabilité.

Validation sur des athlètes SYNTHÉTIQUES aux paramètres connus (le golden sur le vrai
athlète s'active avec l'archive réelle, cf. test_golden.py).
"""

from __future__ import annotations

from dataclasses import replace

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
    # seuil de durabilité abaissé pour ce test (la sortie longue ne fait que 1,5 h)
    cfg = replace(CFG, twin=replace(CFG.twin, durability_min_hours=1.0))
    twin = build_twin(acts, cfg)
    assert twin.critical_speed is not None
    assert 2.5 < twin.vc_ms < 3.7
    assert twin.endurance_E is not None
    assert twin.durability_pct is not None and twin.durability_pct > 0
    d = twin.to_dict()
    assert d["vc_kmh"] is not None and d["n_activities"] == 4


def test_durability_only_on_long_efforts():
    """Découplage reporté sur les efforts longs (§2.6) : une sortie de 1,5 h ne compte pas."""
    hr = [140 + 20 * s / 5400 for s in range(5401)]
    acts = [_run(2.6, 5400, hr=hr)]  # 1,5 h avec FC → découplage calculé mais < seuil 10 h
    assert build_twin(acts, CFG).durability_pct is None              # seuil défaut 10 h
    cfg = replace(CFG, twin=replace(CFG.twin, durability_min_hours=1.0))
    assert build_twin(acts, cfg).durability_pct is not None          # seuil abaissé → compte


def test_no_hr_means_no_durability():
    twin = build_twin([_run(2.6, 5400)], CFG)  # pas de FC
    assert twin.durability_pct is None


# --------------------------------------------------------------------------- #
# Robustesse de la VC (Problème A) : une activité contaminée ne doit plus
# faire exploser la vitesse critique.
# --------------------------------------------------------------------------- #
def _no_alt_run(v, dur):
    """Course rapide SANS altitude (non ajustable à la pente)."""
    t = list(range(dur + 1))
    dist = [v * s for s in t]
    return CanonicalActivity.from_samples(
        timestamps=t, dist_m=dist, speed_ms=[v] * len(t), alt_m=None,
        sport="running", source_format="fit", source_name="noalt",
    )


def _clean_athlete():
    # plusieurs sorties plates « propres » ~3 m/s → VC plausible et bien soutenue
    return [_run(3.0, 5400), _run(2.95, 5400), _run(3.05, 5400)]


def test_fast_flat_contaminant_does_not_explode_vc():
    """Une activité plate MAIS rapide (vélo/artefact) est écartée par le rejet fenêtré."""
    contaminant = _run(6.6, 3600)  # plat, 6,6 m/s soutenu 1 h → impossible en course
    twin = build_twin(_clean_athlete() + [contaminant], CFG)
    assert twin.critical_speed is not None
    assert twin.vc_ms < CFG.twin.vc_max_plausible_ms   # VC reste plausible (< 6 m/s)
    assert 2.5 < twin.vc_ms < 3.7                       # ~ celle de l'athlète propre
    assert twin.critical_speed.plausible
    assert any(s["reason"] == "sustained_speed" for s in twin.record.skipped)


def test_no_altitude_fast_run_excluded_from_record():
    """Sans altitude, impossible d'ajuster à la pente → hors courbe record (donc hors VC)."""
    contaminant = _no_alt_run(6.0, 3600)  # rapide, sans altitude
    twin = build_twin(_clean_athlete() + [contaminant], CFG)
    assert twin.vc_ms < CFG.twin.vc_max_plausible_ms
    assert 2.5 < twin.vc_ms < 3.7
    assert any(s["reason"] == "no_altitude" for s in twin.record.skipped)


def test_single_activity_cannot_set_record_point():
    """L'enveloppe robuste (support ≥ 2) : une seule activité ne fixe pas un point record."""
    # deux sorties lentes + une seule sortie anormalement rapide sur toute la fenêtre
    acts = [_run(2.8, 5400), _run(2.8, 5400), _run(5.5, 5400)]
    twin = build_twin(acts, CFG)
    # 5,5 m/s reste sous le rejet fenêtré (6,5) mais, isolé, il est écarté par le support ≥ 2
    # → le point record retenu est la 2ᵉ meilleure (≈ 2,8), pas le pic isolé.
    assert twin.vc_ms < 3.5


def test_fast_contaminant_does_not_corrupt_endurance_exponent():
    """Le plafond physiologique protège aussi l'exposant (pas seulement la VC)."""
    clean = [_run(3.0, d) for d in (1800, 2400, 3000, 3600, 4500)] + [_run(2.9, 5400)]
    twin_clean = build_twin(clean, CFG)
    assert twin_clean.endurance_E is not None and twin_clean.endurance_E >= 1.0
    # artefact rapide (6,4 m/s < 6,5 → non rejeté par la fenêtre) atteignant une durée rare (9000 s) :
    # sans plafond sur la régression log-log, il inversait la pente (E < 1, α < 0, absurde).
    twin_dirty = build_twin(clean + [_run(6.4, 9000)], CFG)
    assert twin_dirty.endurance_E is None or twin_dirty.endurance_E >= 1.0
    assert abs(twin_dirty.endurance_E - twin_clean.endurance_E) < 0.05
