"""Phase 5 du chantier v2 : le coût de pente personnel (C1) — décomposition exacte de
l'équivalent plat, sommes par tranche de pente, facteurs κ (montée, descente) retrouvés,
application à la calibration et au parcours derrière ``calibration.slope_cost``, défaut
inchangé (golden intact, cf. test_golden)."""

from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np
import pytest

from twin_engine.calibration import (adjusted_km, build_calibration, genuine_gate_failures,
                                     select_genuine_ultras)
from twin_engine.config import load_config, override_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.ingest.canonical import CanonicalActivity
from twin_engine.minetti import grade_factor
from twin_engine.pipeline import analyze_preview_from_twin
from twin_engine.twin.model import Twin, build_twin, fit_slope_cost
from twin_engine.twin.record import (ActivitySummary, RecordCurve, process_activity_full,
                                     slope_bin_centers)

CFG = load_config()
PERSONAL = override_config(CFG, "calibration.slope_cost=personal")
KAPPA_UP, KAPPA_DOWN = 1.4, 0.6


def _f_personal(grade: float, cfg=CFG) -> float:
    """Facteur de pente personnel synthétique : 1 + κ × (f_Minetti − 1), selon le signe."""
    fm = float(grade_factor(grade, cfg.course.cr0, cap=cfg.twin.f_cap))
    k = KAPPA_UP if grade > 0 else KAPPA_DOWN if grade < 0 else 1.0
    return 1.0 + k * (fm - 1.0)


def _profile_activity(grades_pct, seg_m=2000.0, v0=3.0, hr=150.0, *, personal=True):
    """Activité 1 Hz par segments de pente constante : sur la pente i l'athlète court à
    v0 ÷ f_personal(i) (ou v0 ÷ f_Minetti(i)), FC constante — altitude cumulée des pentes."""
    speeds, grades = [0.0], [0.0]
    for g_pct in grades_pct:
        g = g_pct / 100.0
        f = _f_personal(g) if personal else float(grade_factor(g, CFG.course.cr0, cap=CFG.twin.f_cap))
        v = v0 / f
        n = int(round(seg_m / v))
        speeds += [v] * n
        grades += [g] * n
    speeds = np.asarray(speeds)
    dist = np.cumsum(speeds)
    dist -= dist[0]
    alt = 100.0 + np.cumsum(np.asarray(grades) * speeds)
    n = speeds.size
    return CanonicalActivity.from_samples(
        timestamps=list(range(n)), dist_m=dist.tolist(), speed_ms=speeds.tolist(),
        hr=[hr] * n, alt_m=alt.tolist(), sport="running", source_format="fit",
        source_name="pente", start_time=datetime(2026, 5, 1, 7, tzinfo=timezone.utc),
    )


_PATTERN = [0, 5, 0, -5, 0, 10, 0, -10, 0, 15, 0, -15, 0, 20, 0, -20, 0]


# ----------------------------------------------------------------------------- décomposition
def test_adjusted_distance_splits_into_flat_up_and_down():
    act = _profile_activity(_PATTERN)
    s, _, _, _ = process_activity_full(act, CFG)
    assert s.ga_up_excess_km > 0 and s.ga_down_excess_km < 0
    # identité exacte : équivalent plat = brut + surcoût de montée + surcoût de descente
    assert s.dist_km + s.ga_up_excess_km + s.ga_down_excess_km == pytest.approx(s.ga_km, abs=2e-3)
    # sous κ = (1, 1) l'équivalent plat est rendu ; κ_montée > 1 l'augmente, κ_descente > 1 le baisse
    assert adjusted_km(s, (1.0, 1.0)) == pytest.approx(s.ga_km, abs=2e-3)
    assert adjusted_km(s, (1.5, 1.0)) > s.ga_km > adjusted_km(s, (1.0, 1.5))
    assert adjusted_km(s, None) == s.ga_km
    # un vieil agrégat sans décomposition retombe sur la loi
    old = ActivitySummary("2025-06-01", "running", 36000, 60.0, 66.0, 140, 2000, 2000, 10.0, True)
    assert adjusted_km(old, (1.5, 0.5)) == 66.0
    # les sommes par tranche existent (FC présente, pente exploitable), pas sans FC
    assert s.slope_bins is not None and len(s.slope_bins["n"]) == len(slope_bin_centers(CFG))
    s_nohr, _, _, _ = process_activity_full(_profile_activity(_PATTERN, hr=None) if False else
                                            CanonicalActivity.from_samples(
                                                timestamps=list(range(3601)), dist_m=[3.0 * i for i in range(3601)],
                                                speed_ms=[3.0] * 3601, alt_m=[100.0] * 3601, sport="running",
                                                source_format="fit", source_name="flat"), CFG)
    assert s_nohr.slope_bins is None and s_nohr.ga_up_excess_km == 0.0


# ----------------------------------------------------------------------------- κ retrouvés
def _bins_from_law(v0=3.0, hr=150.0, n=3600, personal=True):
    """Sommes par tranche de pente fabriquées à la main depuis la loi personnelle (exactes)."""
    centers = slope_bin_centers(CFG)
    nb = len(centers)
    lnv, lnh, invh, ns = [], [], [], []
    for c in centers:
        g = c / 100.0
        f = _f_personal(g) if personal else float(grade_factor(g, CFG.course.cr0, cap=CFG.twin.f_cap))
        v = v0 / f
        ns.append(n)
        lnv.append(n * math.log(v))
        lnh.append(n * math.log(hr - 60.0))
        invh.append(n / (hr - 60.0))
    return {"n": ns, "sum_lnv": lnv, "sum_lnh": lnh, "sum_invh": invh}


def _summary_with_bins(bins, date="2025-06-01"):
    return ActivitySummary(date=date, sport="running", duration_s=5 * 3600, dist_km=50.0,
                           ga_km=55.0, avg_hr=150, dplus_m=1500, dminus_m=1500,
                           decouple_pct=8.0, has_hr=True, slope_bins=bins)


def test_fit_slope_cost_recovers_kappas_exactly_from_bins():
    cfg = override_config(CFG, "calibration.slope_cost_min_hours=1")
    ku, kd, det = fit_slope_cost([_summary_with_bins(_bins_from_law())], cfg, None)
    assert ku == pytest.approx(KAPPA_UP, abs=1e-9) and kd == pytest.approx(KAPPA_DOWN, abs=1e-9)
    assert det["n_activities"] == 1 and det["hours_up"] == pytest.approx(12.0) and det["hours_down"] == pytest.approx(12.0)
    # sous la loi de Minetti elle-même, κ = 1 des deux côtés
    ku1, kd1, _ = fit_slope_cost([_summary_with_bins(_bins_from_law(personal=False))], cfg, None)
    assert ku1 == pytest.approx(1.0, abs=1e-9) and kd1 == pytest.approx(1.0, abs=1e-9)
    # la FC0 profilée n'y change rien à FC constante (les écarts intra-activité s'annulent)
    ku2, kd2, det2 = fit_slope_cost([_summary_with_bins(_bins_from_law())], cfg, 72.0)
    assert ku2 == pytest.approx(KAPPA_UP, abs=1e-6) and det2["hr0"] == 72.0
    # pas assez d'heures (12 tranches × 700 s = 2,3 h par côté sous un seuil de 5 h) : aucun
    # facteur, heures consignées ; une activité sans 10 min de plat ne compte pas du tout
    few = override_config(cfg, "calibration.slope_cost_min_hours=5")
    ku3, kd3, det3 = fit_slope_cost([_summary_with_bins(_bins_from_law(n=700))], few, None)
    assert ku3 is None and kd3 is None and det3["hours_up"] == pytest.approx(12 * 700 / 3600, abs=0.06)
    assert fit_slope_cost([_summary_with_bins(_bins_from_law(n=60))], cfg, None)[2]["n_activities"] == 0
    # bornes respectées, valeur brute conservée
    tight = override_config(cfg, "calibration.slope_kappa_max=1.2,calibration.slope_kappa_min=0.8")
    ku4, kd4, det4 = fit_slope_cost([_summary_with_bins(_bins_from_law())], tight, None)
    assert (ku4, kd4) == (1.2, 0.8) and det4["kappa_up_raw"] == pytest.approx(KAPPA_UP, abs=1e-4)
    # sans sommes (vieux agrégats, pas de FC) : rien
    assert fit_slope_cost([_summary_with_bins(None)], cfg, None)[:2] == (None, None)


def test_slope_cost_is_recovered_through_the_decoding_path():
    """Activité synthétique décodée par le moteur (pente sur base ±50 m, FC décalée) :
    les facteurs sont retrouvés à quelques centièmes, le jumeau les porte."""
    cfg = override_config(CFG, "calibration.slope_cost_min_hours=0.3")
    acts = [_profile_activity(_PATTERN), _profile_activity(list(reversed(_PATTERN)))]
    twin = build_twin(acts, cfg)
    assert twin.slope_kappa_up == pytest.approx(KAPPA_UP, abs=0.03)
    assert twin.slope_kappa_down == pytest.approx(KAPPA_DOWN, abs=0.03)
    assert twin.slope_detail["hours_up"] > 0.3 and twin.slope_detail["hours_down"] > 0.3
    assert twin.to_dict()["slope_kappa_up"] == pytest.approx(KAPPA_UP, abs=0.03)
    # un athlète qui suit la loi : facteurs à 1
    twin_m = build_twin([_profile_activity(_PATTERN, personal=False)] * 2, cfg)
    assert twin_m.slope_kappa_up == pytest.approx(1.0, abs=0.03)
    assert twin_m.slope_kappa_down == pytest.approx(1.0, abs=0.03)
    # servi seulement derrière le flag
    assert twin.slope_factors(cfg) is None
    assert twin.slope_factors(override_config(cfg, "calibration.slope_cost=personal")) == \
        pytest.approx((KAPPA_UP, KAPPA_DOWN), abs=0.03)


# ----------------------------------------------------------------------------- calibration
def _ultra(hours, dist_km, up_km, down_km, dpk=50.0, *, date="2025-06-01"):
    ga = dist_km + up_km + down_km
    return ActivitySummary(date=date, sport="running", duration_s=hours * 3600, dist_km=dist_km,
                           ga_km=ga, avg_hr=140, dplus_m=dpk * dist_km, dminus_m=dpk * dist_km,
                           decouple_pct=10.0, has_hr=True, ga_up_excess_km=up_km,
                           ga_down_excess_km=down_km)


def _twin(summaries, *, ku=None, kd=None):
    return Twin(critical_speed=None, alpha=0.18, endurance_E=1.0 / 0.82, endurance_coef=10.0,
                durability_pct=20.0, record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=summaries, slope_kappa_up=ku, slope_kappa_down=kd,
                slope_detail={"hours_up": 40.0, "hours_down": 30.0})


def test_personal_cost_changes_the_calibration_speeds_and_the_domain():
    ultras = [_ultra(12, 70.0, 20.0, -6.0), _ultra(20, 110.0, 35.0, -10.0), _ultra(16, 90.0, 26.0, -8.0),
              _ultra(24, 130.0, 42.0, -12.0), _ultra(18, 100.0, 30.0, -9.0)]
    twin = _twin(ultras, ku=1.3, kd=0.7)
    cal0 = build_calibration(twin, CFG)
    cal_p = build_calibration(twin, PERSONAL)
    assert cal0.slope_kappa is None and cal0.slope_cost == "minetti"
    assert cal_p.slope_kappa == (1.3, 0.7) and cal_p.slope_cost == "personal"
    for g0, gp, u in zip(cal0.genuine, cal_p.genuine, ultras):
        assert g0.vga_kmh == pytest.approx(u.ga_km / u.duration_s * 3600)
        assert gp.vga_kmh == pytest.approx((u.dist_km + 1.3 * u.ga_up_excess_km + 0.7 * u.ga_down_excess_km)
                                           / u.duration_s * 3600)
    assert any("Coût de pente personnel : surcoût de montée × 1.30" in n for n in cal_p.notes)
    # la vitesse ajustée personnelle juge aussi le plancher du domaine
    slow = _ultra(12, 56.0, 12.0, -3.0)            # 65 km ga en 12 h : 5,42 < 5,5 sous la loi
    assert genuine_gate_failures(slow, CFG) and not genuine_gate_failures(slow, PERSONAL, (1.5, 1.0))
    assert len(select_genuine_ultras([slow], PERSONAL, slope=(1.5, 1.0))) == 1
    # facteurs non mesurables : loi conservée, signalé
    cal_n = build_calibration(_twin(ultras), PERSONAL)
    assert cal_n.slope_kappa is None and any("non mesurable" in n for n in cal_n.notes)
    assert [g.vga_kmh for g in cal_n.genuine] == [g.vga_kmh for g in cal0.genuine]
    # un seul côté mesuré : l'autre vaut 1
    assert build_calibration(_twin(ultras, ku=1.3), PERSONAL).slope_kappa == (1.3, 1.0)


# ----------------------------------------------------------------------------- parcours
def _sawtooth_gpx(n=600, climb=800.0, half_km=8.0):
    lat0, lon0 = 45.0, 6.0
    rows = []
    for i in range(n + 1):
        x = 2 * half_km * 1000 * i / n
        ele = climb * (x / (half_km * 1000)) if x <= half_km * 1000 else climb * (2 - x / (half_km * 1000))
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


def test_course_with_slope_cost_keeps_the_identity_and_bends_the_deq():
    race = RaceSpec("Dent", (0.0, 8.0, 16.0), ("d", "s", "a"))
    course = build_course(_sawtooth_gpx(), race, CFG)
    assert course.slope_kappa is None and course.excess_up_grid_m is not None
    # décomposition exacte sur la grille et par segment
    total = (course.base_grid_m[-1] + course.excess_up_grid_m[-1] + course.excess_down_grid_m[-1]) / 1000.0
    assert total == pytest.approx(course.deq_km, abs=1e-9)
    assert sum(s.excess_up_km for s in course.segments) > 0 > sum(s.excess_down_km for s in course.segments)
    same = course.with_slope_cost(1.0, 1.0)
    assert same.deq_km == pytest.approx(course.deq_km, abs=1e-9) and same.slope_kappa == (1.0, 1.0)
    assert [s.deq_km for s in same.segments] == pytest.approx([s.deq_km for s in course.segments], abs=1e-9)
    up = course.with_slope_cost(1.5, 1.0)
    assert up.deq_km > course.deq_km and up.segments[0].deq_km > course.segments[0].deq_km
    # chaque segment bouge d'exactement (κ − 1) × son surcoût de montée (la descente lissée
    # garde quelques mètres de montée au sommet : c'est sa décomposition qui le dit)
    for a, b in zip(up.segments, course.segments):
        assert a.deq_km - b.deq_km == pytest.approx(0.5 * b.excess_up_km, abs=1e-9)
    # les segments couvrent le km officiel, pas toute la grille : l'écart au total est celui
    # du profil de la loi, inchangé
    assert (sum(s.deq_km for s in up.segments) - up.deq_km
            == pytest.approx(sum(s.deq_km for s in course.segments) - course.deq_km, abs=1e-6))
    down = course.with_slope_cost(1.0, 0.5)
    assert down.deq_km > course.deq_km                    # une descente moins « gratuite » coûte plus
    for a, b in zip(down.segments, course.segments):
        assert a.deq_km - b.deq_km == pytest.approx(-0.5 * b.excess_down_km, abs=1e-9)
    # géométrie et D± intacts, technicité conservée, dict lisible
    assert (up.length_km, up.dplus_m, up.dplus_per_km) == (course.length_km, course.dplus_m, course.dplus_per_km)
    tech = build_course(_sawtooth_gpx(), RaceSpec("Dent", (0.0, 8.0, 16.0), ("d", "s", "a"), technicity_pct=10.0), CFG)
    assert tech.with_slope_cost(1.0, 1.0).deq_km == pytest.approx(tech.deq_km, abs=1e-9)
    assert up.to_dict()["slope_kappa"] == [1.5, 1.0] and course.to_dict()["slope_kappa"] is None
    # un profil sans décomposition (construit à la main) est rendu tel quel
    bare = course.__class__(**{**course.__dict__, "base_grid_m": None})
    assert bare.with_slope_cost(1.5, 1.0) is bare


def test_pipeline_serves_the_personal_course_only_behind_the_flag():
    race = RaceSpec("Dent", (0.0, 8.0, 16.0), ("d", "s", "a"))
    course = build_course(_sawtooth_gpx(), race, CFG)
    ultras = [_ultra(12, 70.0, 20.0, -6.0), _ultra(20, 110.0, 35.0, -10.0), _ultra(16, 90.0, 26.0, -8.0),
              _ultra(24, 130.0, 42.0, -12.0), _ultra(18, 100.0, 30.0, -9.0)]
    twin = _twin(ultras, ku=1.3, kd=0.8)
    res0 = analyze_preview_from_twin(twin, course, CFG, n_ingested=5)
    res_p = analyze_preview_from_twin(twin, course, PERSONAL, n_ingested=5)
    assert res0.course is course and res0.calibration.slope_kappa is None
    assert res_p.course.slope_kappa == (1.3, 0.8) and res_p.calibration.slope_kappa == (1.3, 0.8)
    assert res_p.prediction.deq_km == pytest.approx(res_p.course.deq_km)
    assert res_p.course.deq_km != course.deq_km and res_p.prediction.finish_hours != res0.prediction.finish_hours
    assert res_p.course.dplus_per_km == course.dplus_per_km


def test_overrides_accept_the_slope_keys_and_defaults_are_untouched():
    cfg = override_config(CFG, "calibration.slope_cost=personal,calibration.slope_cost_min_hours=5,"
                               "calibration.slope_kappa_min=0.7,twin.slope_hr_lag_s=20")
    assert (cfg.calibration.slope_cost, cfg.calibration.slope_cost_min_hours) == ("personal", 5.0)
    assert (cfg.calibration.slope_kappa_min, cfg.twin.slope_hr_lag_s) == (0.7, 20)
    assert CFG.calibration.slope_cost == "minetti" and CFG.calibration.slope_cost_min_hours == 20.0
    assert (CFG.twin.slope_bin_pct, CFG.twin.slope_max_pct, CFG.twin.slope_hr_min_bpm, CFG.twin.slope_hr_lag_s) \
        == (2.5, 30.0, 100.0, 30)
