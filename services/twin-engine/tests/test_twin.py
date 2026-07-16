"""Jumeau : vitesse ajustée, courbe record, VC/D′, exposant E, durabilité.

Validation sur des athlètes SYNTHÉTIQUES aux paramètres connus (le golden sur le vrai
athlète s'active avec l'archive réelle, cf. test_golden.py).
"""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest

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


def test_endurance_exponent_is_athlete_specific_not_frozen():
    """Garde-fou H3 : E est ajusté sur les données de CHAQUE athlète, jamais figé (ex. à 1,22).

    Deux courbes record différentes → deux exposants nettement distincts ; un déclin plus marqué
    (α plus grand) donne un E plus élevé (Riegel). Verrouille l'absence de valeur en dur."""
    durs = np.array([1800, 2400, 3000, 3600, 4500, 5400, 7200, 9000, 10800, 14400, 18000, 21600], float)

    def _E(alpha_true):
        vga = 4.0 * durs ** (-alpha_true)
        rec = RecordCurve(durs, vga, vga.copy(),
                          [RecordPoint(int(T), float(vga[i]), float(vga[i]), None, False)
                           for i, T in enumerate(durs)])
        _, E, _ = fit_endurance_exponent(rec, CFG)
        return E

    e_diesel = _E(0.10)      # allure qui décline peu
    e_fade = _E(0.25)        # allure qui décline plus
    assert abs(e_diesel - e_fade) > 0.1                       # deux athlètes → deux E distincts
    assert e_fade > e_diesel                                  # plus de déclin ⇒ E plus grand
    assert e_diesel == pytest.approx(1 / (1 - 0.10), abs=0.02)
    assert e_fade == pytest.approx(1 / (1 - 0.25), abs=0.02)


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


def test_downhill_record_flat_flag_follows_symmetry_flag():
    """T2 : par défaut (ratio signé, capture du golden) un record en DESCENTE nette est « plat » ;
    vc_flat_symmetric=True (théorie §2.4, |·|) l'écarte du fit de la VC."""
    from twin_engine.twin.record import build_record_curve

    downhill = [_run(3.0, 5400, grade=-0.10), _run(2.95, 5400, grade=-0.10)]
    rec_default, _ = build_record_curve(downhill, CFG)
    cfg_sym = replace(CFG, twin=replace(CFG.twin, vc_flat_symmetric=True))
    rec_sym, _ = build_record_curve(downhill, cfg_sym)

    def _flat_at(rec, T=3600):
        return next(p.flat for p in rec.points if p.duration_s == T)

    assert _flat_at(rec_default) is True     # v_ga ≈ 0,6·v_raw → ratio −0,4 < 0,1 (signé)
    assert _flat_at(rec_sym) is False        # |−0,4| ≥ 0,1 → écarté (descente ≠ plat)


def test_vc_short_effort_floor_excludes_short_durations():
    """T1 : le plancher (défaut 600 = no-op) borne le fit VC ; à 1800, plus rien sous 30 min."""
    from twin_engine.twin.record import build_record_curve

    acts = _clean_athlete()
    rec_default, _ = build_record_curve(acts, CFG)
    cfg_floor = replace(CFG, twin=replace(CFG.twin, vc_short_effort_floor_s=1800))
    rec_floor, _ = build_record_curve(acts, cfg_floor)

    durs_default = {p.duration_s for p in rec_default.flat_points}
    durs_floor = {p.duration_s for p in rec_floor.flat_points}
    assert 600 in durs_default and 1800 in durs_default   # défaut : fenêtre 10–90 min inchangée
    assert durs_floor and min(durs_floor) >= 1800          # théorie stricte : < 30 min écartés

    # la VC de repli (modèle) respecte le même plancher
    cs_floor = fit_critical_speed(rec_floor, cfg_floor)
    assert cs_floor is not None and cs_floor.n_points == len(durs_floor)


def test_moving_time_ignores_watch_pauses():
    """C2/H2 : une pause de montre (trou d'enregistrement) n'est PAS du temps en mouvement.

    Le canal vitesse est interpolé à travers le trou (reste ~3 m/s pendant la pause) : compté
    dessus, moving_time incluait la pause. Compté sur la distance (plateau), il l'exclut."""
    t1 = list(range(0, 600))                                # 10 min de course
    t2 = list(range(2400, 3001))                            # pause 30 min, puis 10 min
    ts = t1 + t2
    dist = [3.0 * s for s in t1] + [3.0 * 599 + 3.0 * (s - 2400) for s in t2]
    act = CanonicalActivity.from_samples(
        timestamps=ts, dist_m=dist, speed_ms=[3.0] * len(ts), alt_m=[100.0] * len(ts),
        sport="running", source_format="fit", source_name="pause",
    )
    summary, _, _ = process_activity(act, CFG)
    assert summary.duration_s >= 2900                       # l'écoulé inclut la pause
    assert summary.moving_time_s is not None
    assert summary.moving_time_s < 1300                     # ~20 min de course réelle
    # l'ancien comptage (canal vitesse interpolé) aurait donné ~3000 s
    assert float(np.count_nonzero(act.speed_ms > CFG.twin.moving_speed_threshold_ms)) > 2900


def _run_with_stop(n=7200, stop=(5000, 6200)):
    """2 h de course régulière (FC constante) avec un long arrêt en 2e moitié."""
    v = np.full(n + 1, 3.0)
    v[stop[0]:stop[1]] = 0.0
    dist = np.concatenate([[0.0], np.cumsum(v[1:])])
    return CanonicalActivity.from_samples(
        timestamps=list(range(n + 1)), dist_m=dist.tolist(), speed_ms=v.tolist(),
        hr=[140.0] * (n + 1), alt_m=[100.0] * (n + 1),
        sport="running", source_format="fit", source_name="stop",
    )


def test_decouple_moving_basis_ignores_stops():
    """C7 : en base elapsed, un arrêt en 2e moitié gonfle le découplage (il mesure l'ARRÊT,
    pas l'usure) ; en base moving, l'usure réelle (nulle ici : FC et allure constantes)."""
    act = _run_with_stop()
    s_elapsed, _, _ = process_activity(act, CFG)
    cfg_m = replace(CFG, twin=replace(CFG.twin, decouple_basis="moving"))
    s_moving, _, _ = process_activity(act, cfg_m)
    assert s_elapsed.decouple_pct is not None and s_elapsed.decouple_pct > 15
    assert s_moving.decouple_pct is not None and abs(s_moving.decouple_pct) < 3


def test_decouple_skip_start_ignores_warmup():
    """C7 : la dérive FC d'échauffement gonflait e1 ; decouple_skip_start_s l'ignore."""
    n = 7200
    hr = [110 + 30 * min(s, 600) / 600 for s in range(n + 1)]   # FC 110→140 sur 10 min
    act = _run(3.0, n, hr=hr)
    d_full = process_activity(act, CFG)[0].decouple_pct
    cfg_s = replace(CFG, twin=replace(CFG.twin, decouple_skip_start_s=600))
    d_skip = process_activity(act, cfg_s)[0].decouple_pct
    assert d_full is not None and d_skip is not None
    assert d_full > 1.0 and d_skip < 0.5 and d_full > d_skip


def _cfg_dplus(basis):
    return replace(CFG, twin=replace(CFG.twin, dplus_basis=basis))


def test_dplus_bases_agree_on_clean_ramp():
    """C1 : sur une rampe propre, les deux bases retrouvent le vrai D+ (validité du lissage)."""
    n = 7200
    dist = [2.0 * s for s in range(n + 1)]
    alt = [100.0 + 400.0 * s / n for s in range(n + 1)]
    act = CanonicalActivity.from_samples(
        timestamps=list(range(n + 1)), dist_m=dist, speed_ms=[2.0] * (n + 1), alt_m=alt,
        sport="running", source_format="fit", source_name="ramp",
    )
    s_time, _, _ = process_activity(act, _cfg_dplus("time_5s"))
    s_dist, _, _ = process_activity(act, _cfg_dplus("distance_150m"))
    assert abs(s_time.dplus_m - 400) < 10
    assert abs(s_dist.dplus_m - 400) < 10


def test_dplus_time_basis_inflates_on_noisy_altimetry():
    """C1 : sur une altimétrie bruitée, le lissage 5 s gonfle le D+ (variation totale) alors
    que la base distance 150 m — l'échelle du parcours — reste proche du vrai dénivelé.
    C'était l'incohérence d'échelle entre le D+/km appris (activités) et appliqué (parcours) ;
    mesurée à +14,9 % (médiane) sur l'archive réelle → le DÉFAUT est désormais la base distance."""
    rng = np.random.default_rng(0)
    n = 7200
    dist = [2.0 * s for s in range(n + 1)]
    alt = (100.0 + np.linspace(0, 400, n + 1) + rng.normal(0, 1.0, n + 1)).tolist()
    act = CanonicalActivity.from_samples(
        timestamps=list(range(n + 1)), dist_m=dist, speed_ms=[2.0] * (n + 1), alt_m=alt,
        sport="running", source_format="fit", source_name="noisy",
    )
    s_time, _, _ = process_activity(act, _cfg_dplus("time_5s"))
    s_dist, _, _ = process_activity(act, _cfg_dplus("distance_150m"))
    assert s_time.dplus_m > s_dist.dplus_m * 1.2     # l'échelle fine accumule le bruit
    assert 380 < s_dist.dplus_m < 560                 # la base distance reste près du vrai 400 m
    # le DÉFAUT livré est la base distance (activé 2026-07-02 sur mesure réelle, DIAGNOSTIC §9.6)
    assert process_activity(act, CFG)[0].dplus_m == s_dist.dplus_m


def test_failed_activity_is_counted_in_skipped():
    """C9d : une activité qui plante au traitement est COMPTÉE (processing_error), pas tue."""
    broken = CanonicalActivity(
        start_time=None, sport="running", sub_sport=None, source_format="fit",
        source_name="broken", t=np.arange(120.0), dist_m=np.arange(5.0),
        speed_ms=np.zeros(120), hr=np.full(120, np.nan), alt_m=np.full(120, 100.0),
        lat=np.full(120, np.nan), lon=np.full(120, np.nan),
    )
    twin = build_twin(_clean_athlete() + [broken], CFG)
    assert any(str(s["reason"]).startswith("processing_error") for s in twin.record.skipped)
    assert 2.5 < twin.vc_ms < 3.7      # l'athlète propre n'est pas affecté


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


def test_ga_plausibility_guard_recovers_corrupted_altitude():
    """§9.10 : une activité LONGUE dont l'équivalent plat s'effondre (altitude corrompue,
    ex. FIT à −10 % de pente continue pendant 5 h) est récupérée en f=1 — vga = vitesse
    brute, D± nuls, altitude marquée non fiable. Courte : intacte. Flag à 0 : intact."""
    from dataclasses import replace

    from twin_engine.config import load_config
    from twin_engine.ingest.canonical import CanonicalActivity
    from twin_engine.twin.record import process_activity

    CFG = load_config()

    def _falling(hours):
        n = int(hours * 3600)
        t = list(range(0, n, 10))
        dist = [1.9 * s for s in t]                       # 6,84 km/h brut
        alt = [4000.0 - 0.10 * 1.9 * s for s in t]        # −10 % en continu (impossible longtemps)
        return CanonicalActivity.from_samples(
            timestamps=t, dist_m=dist, speed_ms=[1.9] * len(t), alt_m=alt,
            sport="running", source_format="fit", source_name="corrompue",
        )

    s5, _, _ = process_activity(_falling(5.0), CFG)       # ≥ 4 h → garde-fou
    assert s5.ga_km == pytest.approx(s5.dist_km, rel=0.01)
    assert s5.dplus_m == 0 and s5.dminus_m == 0
    assert s5.has_altitude is False

    s1, _, _ = process_activity(_falling(1.0), CFG)       # 1 h : descente raide LÉGITIME
    assert s1.ga_km < 0.75 * s1.dist_km                    # l'ajustement de pente s'applique
    assert s1.has_altitude is True

    cfg_off = replace(CFG, twin=replace(CFG.twin, ga_plausibility_floor=0.0))
    s_off, _, _ = process_activity(_falling(5.0), cfg_off)
    assert s_off.ga_km < 0.75 * s_off.dist_km              # ancien comportement restauré


def test_despike_rescue_recovers_bursty_distance_channel():
    """§9.11 : canal distance en RAFALES (cas réel : course 71,5 km réduite à 28,6 km par
    l'écrêtage) — repli sur la distance brute quand le total reste plausible pour de la
    course, et EXCLUSION de la courbe record (fenêtres par-seconde non fiables)."""
    from dataclasses import replace

    from twin_engine.config import load_config
    from twin_engine.ingest.canonical import CanonicalActivity
    from twin_engine.twin.record import process_activity

    CFG = load_config()

    def _bursty(hours, step_m):
        n = int(hours * 3600)
        t = list(range(n))
        dist = [step_m * (s // 10) for s in t]     # +step_m tous les 10 s, plat entre
        return CanonicalActivity.from_samples(
            timestamps=t, dist_m=dist, alt_m=[500.0] * n,
            sport="running", source_format="fit", source_name="rafales",
        )

    # 5 h, +20 m/10 s → brut 36 km (7,2 km/h, plausible), pics 20 m/s → écrêtage garderait 7/20
    s, vga, vraw = process_activity(_bursty(5.0, 20.0), CFG)
    assert s.dist_km == pytest.approx(36.0, rel=0.02)          # distance brute conservée
    assert not np.isfinite(vga).any() and not np.isfinite(vraw).any()   # hors courbe record

    # total brut IMPLAUSIBLE pour de la course (15 km/h sur 5 h) → pas de sauvetage
    s_fast, _, _ = process_activity(_bursty(5.0, 42.0), CFG)
    assert s_fast.dist_km == pytest.approx(75.6 * 7 / 42, rel=0.05)   # écrêté : 7 m gardés par rafale de 42

    # TÉLÉPORTATION unique (montre en pause pendant 20 km de voiture) : total plausible
    # (52,4 km / 6 h = 8,7 km/h), perte > 20 %… mais UN SEUL front écrêté → PAS de sauvetage
    # (la distance brute est FAUSSE ici : l'écrêtage historique reste le bon comportement).
    n_tp = 6 * 3600
    dist_tp = [1.5 * s + (20000.0 if s > n_tp // 2 else 0.0) for s in range(n_tp)]
    teleport = CanonicalActivity.from_samples(
        timestamps=list(range(n_tp)), dist_m=dist_tp, alt_m=[500.0] * n_tp,
        sport="running", source_format="fit", source_name="teleport",
    )
    s_tp, _, _ = process_activity(teleport, CFG)
    assert s_tp.dist_km == pytest.approx(1.5 * n_tp / 1000, rel=0.02)   # écrêté : le bond saute

    # flag désactivé → ancien comportement (écrêté)
    cfg_off = replace(CFG, twin=replace(CFG.twin, despike_rescue_floor=0.0))
    s_off, _, _ = process_activity(_bursty(5.0, 20.0), cfg_off)
    assert s_off.dist_km == pytest.approx(0.35 * 36.0, rel=0.05)    # 7 m gardés sur 20
