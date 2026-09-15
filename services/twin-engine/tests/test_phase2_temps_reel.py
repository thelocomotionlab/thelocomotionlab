"""Phase 2 du chantier v2 : temps réel = mouvement + arrêts (B4), nuit dans la régression
(C2), fade des moitiés, environnement déclaré (C3) — chacun derrière un flag, défauts
inchangés (golden intact, cf. test_golden)."""

from __future__ import annotations

import json
import math
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from twin_engine.calibration import (_basis_hours, build_calibration, night_deviations,
                                     select_genuine_ultras, stops_statistics)
from twin_engine.config import load_config, override_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.ingest.canonical import CanonicalActivity
from twin_engine.pacing.plan import build_pacing, fade_delta_from_splits
from twin_engine.predict import (Prediction, environment_factor, leave_one_out,
                                 night_share_function, predict_finish, predict_race,
                                 sd_rel_target)
from twin_engine.twin.model import Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve, process_activity

CFG = load_config()
LOG = override_config(CFG, "calibration.link=log")
PERSONAL = override_config(LOG, "calibration.stops_model=personal")


def _ultra(hours, vga_kmh, dpk, date="2025-06-01", *, stops_frac=None, night=None,
           split=None, alt=None):
    """Vrai ultra synthétique. Avec ``stops_frac``, ``hours`` sont des heures de MOUVEMENT
    (écoulé = mouvement × (1 + stops_frac), plateaux = stops_frac × mouvement) ; sans, l'écoulé."""
    moving_h = hours
    elapsed_h = hours * (1.0 + stops_frac) if stops_frac is not None else hours
    dist_km = vga_kmh * moving_h / 1.2
    return ActivitySummary(
        date=date, sport="running", duration_s=elapsed_h * 3600, dist_km=dist_km,
        ga_km=vga_kmh * moving_h, avg_hr=140, dplus_m=dpk * dist_km, dminus_m=dpk * dist_km,
        decouple_pct=10.0, has_hr=True,
        stops_s=None if stops_frac is None else stops_frac * moving_h * 3600,
        night_share=night, half_split_ratio=split, mean_alt_m=alt,
    )


def _twin(summaries, alpha=0.18):
    return Twin(critical_speed=None, alpha=alpha, endurance_E=1.0 / (1 - alpha),
                endurance_coef=10.0, durability_pct=20.0,
                record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=summaries)


def _riegel(h, dpk, *, k=9.5, b=-0.07, c=-0.0027):
    return k * h**b * math.exp(c * dpk)


_GRID = [(12, 50), (20, 55), (16, 45), (24, 53), (18, 52), (11, 60), (14, 40)]


# ----------------------------------------------------------------------------- mesures par activité
def _long_activity(*, v1=3.0, v2=None, first_half_s=3 * 3600, plateaus=((3600, 3900), (7000, 7030)),
                   start=datetime(2026, 6, 20, 22, 0, tzinfo=timezone.utc), lat=45.0, lon=5.0):
    """Course à v1 sur la première moitié de la DISTANCE puis v2, plateaux insérés (début, fin)."""
    v2 = v1 if v2 is None else v2
    half_m = v1 * first_half_s
    speeds = [0.0]
    d = 0.0
    while d < 2 * half_m - 1e-9:
        v = v1 if d < half_m else v2
        speeds.append(v)
        d += v
    speeds = np.array(speeds)
    for a, b in plateaus:
        speeds[a:b] = 0.0
    n = speeds.size
    dist = np.cumsum(speeds)
    return CanonicalActivity.from_samples(
        timestamps=list(range(n)), dist_m=dist.tolist(), speed_ms=speeds.tolist(),
        hr=[140.0] * n, alt_m=[100.0] * n, lat=[lat] * n, lon=[lon] * n,
        sport="running", source_format="fit", source_name="long", start_time=start,
    )


def test_process_activity_measures_plateau_stops_night_halves_and_altitude():
    act = _long_activity(v2=2.4)
    s, _, _ = process_activity(act, CFG)
    assert s.duration_s >= CFG.twin.long_effort_min_hours * 3600
    # seuls les plateaux ≥ stop_min_s comptent : 300 s oui, 30 s non
    assert s.stops_s == 300.0 and s.n_stops == 1
    # départ 22:00 UTC à 45°N, 5°E, fin de juin : la nuit domine
    assert s.night_share is not None and 0.5 < s.night_share <= 1.0
    # seconde moitié de distance à 2,4 m/s contre 3,0 : rapport des moitiés ≈ 0,8 hors plateaux
    assert s.half_split_ratio == pytest.approx(0.8, abs=0.02)
    assert s.mean_alt_m == 100
    # sortie courte : arrêts mesurés, mesures d'efforts longs absentes
    short = _long_activity(first_half_s=900, plateaus=((300, 400),))
    s2, _, _ = process_activity(short, CFG)
    assert s2.stops_s == 100.0 and s2.night_share is None
    assert s2.half_split_ratio is None and s2.mean_alt_m is None


def test_plateau_basis_removes_only_measured_stops():
    s = _ultra(12, 7.0, 50, stops_frac=0.1)            # 12 h de mouvement, 13,2 h écoulées
    assert _basis_hours(s, CFG) == pytest.approx(13.2)
    assert _basis_hours(s, PERSONAL) == pytest.approx(12.0)
    assert _basis_hours(replace(s, stops_s=None), PERSONAL) == pytest.approx(13.2)   # pas d'invention
    g = select_genuine_ultras([s], PERSONAL)[0]
    assert (g.elapsed_hours, g.stops_h, g.moving_hours) == pytest.approx((13.2, 1.2, 12.0))
    assert g.stops_rate == pytest.approx(0.1) and g.vga_kmh == pytest.approx(7.0)
    # en base écoulée (carved), les arrêts diluent la vitesse
    assert select_genuine_ultras([s], CFG)[0].vga_kmh == pytest.approx(7.0 / 1.1)


def test_stops_statistics_weighted_mean_dispersion_and_population_fallback():
    gen = select_genuine_ultras([_ultra(12, 7.0, 50, stops_frac=0.05),
                                 _ultra(20, 6.5, 55, stops_frac=0.15),
                                 _ultra(16, 6.8, 45)], PERSONAL)
    st = stops_statistics(gen, np.array([1.0, 3.0, 1.0]), PERSONAL)
    assert st["origin"] == "ultras" and st["n"] == 2
    assert st["rate"] == pytest.approx((0.05 + 3 * 0.15) / 4)
    assert st["sd_log"] > 0
    assert st["ref_hours"] == pytest.approx(math.exp((math.log(12) + 3 * math.log(20)) / 4))
    st0 = stops_statistics(gen[2:], np.array([1.0]), PERSONAL)
    assert st0["origin"] == "population" and st0["rate"] == PERSONAL.calibration.stops_rate_population


def test_night_deviations_centre_on_the_weighted_mean_and_ignore_unknowns():
    gen = select_genuine_ultras([_ultra(12, 7.0, 50, night=0.1), _ultra(20, 6.5, 55, night=0.3),
                                 _ultra(16, 6.8, 45)], CFG)
    dev, mean = night_deviations(gen, np.array([1.0, 1.0, 5.0]))
    assert mean == pytest.approx(0.2) and dev == pytest.approx([-0.1, 0.1, 0.0])
    dev0, mean0 = night_deviations(gen[2:], np.array([1.0]))
    assert mean0 is None and dev0.tolist() == [0.0]


# ----------------------------------------------------------------------------- B4 : arrêts
def test_personal_stops_recover_riegel_and_equal_carved_at_constant_rate():
    f = 0.08
    twin = _twin([_ultra(h, _riegel(h, d), d, stops_frac=f) for h, d in _GRID])
    cal = build_calibration(twin, PERSONAL)
    assert cal.regime == "regression" and cal.stops_model == "personal"
    assert cal.stops_rate == pytest.approx(f, abs=1e-9) and cal.stops_rate_sd_log == pytest.approx(0.0, abs=1e-9)
    assert cal.beta == pytest.approx((math.log(9.5), -0.07, -0.0027), abs=1e-4)
    pred = predict_finish(200.0, 53.0, twin, cal, PERSONAL)
    assert pred.stops_model == "personal" and pred.stops_rate == pytest.approx(f)
    assert pred.stops_hours == pytest.approx(pred.moving_hours * f)
    assert pred.finish_hours == pytest.approx(pred.moving_hours * (1 + f))
    # à taux constant, séparer mouvement et arrêts ne change PAS le temps écoulé prédit :
    # le modèle historique (vitesse écoulée) donne le même point fixe
    cal_c = build_calibration(twin, LOG)
    pred_c = predict_finish(200.0, 53.0, twin, cal_c, LOG)
    assert cal_c.stops_model == "carved" and pred_c.stops_hours == pytest.approx(0.0)
    assert pred.finish_hours == pytest.approx(pred_c.finish_hours, rel=1e-6)
    # la LOO prédit l'ÉCOULÉ de chaque course avec le taux des autres : exact ici
    cv = leave_one_out(cal, PERSONAL)
    assert cv is not None and cv.mae_pct < 1e-6
    assert cal.moving_from_elapsed(pred.finish_hours) == pytest.approx(pred.moving_hours)
    # élasticité : à 32 h la cible s'arrête plus qu'à 16 h de référence → écoulé plus long
    cfg_e = override_config(PERSONAL, "calibration.stops_duration_elasticity=0.5")
    pred_e = predict_finish(200.0, 53.0, twin, build_calibration(twin, cfg_e), cfg_e)
    assert pred_e.stops_rate > f and pred_e.finish_hours > pred.finish_hours


def test_personal_stops_dispersion_widens_the_predictive_sd():
    rng = np.random.default_rng(3)
    twin = _twin([_ultra(h, _riegel(h, d), d, stops_frac=0.08 + 0.04 * rng.normal())
                  for h, d in _GRID])
    cal = build_calibration(twin, PERSONAL)
    assert cal.stops_rate_sd_log > 0
    pred = predict_finish(200.0, 53.0, twin, cal, PERSONAL)
    sd = sd_rel_target(pred.moving_hours, pred.v_kmh, 53.0, cal)
    assert sd is not None and sd**2 >= cal.stops_rate_sd_log**2
    assert pred.interval_low_h < pred.plan_low_h < pred.finish_hours < pred.plan_high_h < pred.interval_high_h


def test_spec_stops_add_the_plan_policy_to_the_moving_time():
    cfg_s = override_config(LOG, "calibration.stops_model=spec")
    twin = _twin([_ultra(h, _riegel(h, d), d, stops_frac=0.08) for h, d in _GRID])
    cal = build_calibration(twin, cfg_s)
    pred = predict_finish(200.0, 53.0, twin, cal, cfg_s, spec_stops_h=1.5)
    assert pred.stops_model == "spec" and pred.stops_hours == pytest.approx(1.5)
    assert pred.finish_hours == pytest.approx(pred.moving_hours + 1.5)


# ----------------------------------------------------------------------------- C2 : nuit
def _night_twin(d_true=-0.20):
    shares = [0.0, 0.1, 0.25, 0.4, 0.05, 0.3, 0.15]
    return _twin([_ultra(h, _riegel(h, d) * math.exp(d_true * (s - 0.18)), d, night=s)
                  for (h, d), s in zip(_GRID, shares)]), shares


def test_night_term_recovers_the_athletes_night_slowdown_and_bows_to_a_strong_prior():
    twin, shares = _night_twin()
    cfg_n = override_config(LOG, "calibration.night_term=prior_shrunk,calibration.night_shrink_lambda=1e-6")
    cal = build_calibration(twin, cfg_n)
    assert cal.has_night_term and cal.night_coef == pytest.approx(-0.20, abs=1e-3)
    assert cal.night_share_mean == pytest.approx(float(np.mean(shares)))
    assert np.asarray(cal.beta_cov).shape == (4, 4)
    cv = leave_one_out(cal, cfg_n)
    assert cv is not None and cv.mae_pct < 1e-3
    cfg_big = override_config(cfg_n, "calibration.night_shrink_lambda=1e6,calibration.night_prior_log_per_share=-0.05")
    assert build_calibration(twin, cfg_big).night_coef == pytest.approx(-0.05, abs=1e-4)
    # sans part de nuit mesurée sur les ultras : terme inactif, signalé
    cal0 = build_calibration(_twin([_ultra(h, _riegel(h, d), d) for h, d in _GRID]), cfg_n)
    assert not cal0.has_night_term and any("inactif" in n for n in cal0.notes)


def test_night_of_the_target_comes_from_the_race_calendar_and_slows_a_night_race():
    twin, _ = _night_twin()
    cfg_n = override_config(LOG, "calibration.night_term=prior_shrunk,calibration.night_shrink_lambda=1e-6")
    cal = build_calibration(twin, cfg_n)
    tz = timezone(timedelta(hours=0))
    night_race = RaceSpec(name="nuit", start_time=datetime(2026, 6, 20, 21, 0, tzinfo=tz),
                          lat=45.0, lon=5.0, tz_offset_h=0.0)
    day_race = RaceSpec(name="jour", start_time=datetime(2026, 6, 20, 5, 0, tzinfo=tz),
                        lat=45.0, lon=5.0, tz_offset_h=0.0)
    p_night = predict_finish(200.0, 53.0, twin, cal, cfg_n, night_fn=night_share_function(night_race, cfg_n))
    p_day = predict_finish(200.0, 53.0, twin, cal, cfg_n, night_fn=night_share_function(day_race, cfg_n))
    p_none = predict_finish(200.0, 53.0, twin, cal, cfg_n)
    assert p_night.night_share_target > p_day.night_share_target
    assert p_night.night_dev == pytest.approx(p_night.night_share_target - cal.night_share_mean)
    assert p_night.finish_hours > p_day.finish_hours
    assert p_none.night_dev is None and p_none.night_share_target is None
    for p in (p_night, p_day):
        assert np.isfinite(p.mc_samples).all()
        assert p.interval_low_h <= p.plan_low_h <= p.finish_hours <= p.plan_high_h <= p.interval_high_h
    # sans terme de nuit dans le modèle, le calendrier ne change rien à la prédiction
    cal_l = build_calibration(twin, LOG)
    a = predict_finish(200.0, 53.0, twin, cal_l, LOG, night_fn=night_share_function(night_race, LOG))
    b = predict_finish(200.0, 53.0, twin, cal_l, LOG)
    assert a.finish_hours == b.finish_hours and a.night_dev is None


# ----------------------------------------------------------------------------- C3 : environnement
class _CourseStub:
    deq_km = 200.0
    dplus_per_km = 53.0
    segments: list = []

    def __init__(self, alt):
        self.alt_smooth_m = np.full(20, float(alt))


def test_environment_term_is_off_by_default_and_costs_declared_heat_and_altitude():
    twin = _twin([_ultra(h, _riegel(h, d), d, alt=500.0) for h, d in _GRID])
    cal = build_calibration(twin, LOG)
    assert environment_factor(_CourseStub(1500.0), RaceSpec(name="x", heat_c=30.0), cal, LOG) == (1.0, None)
    cfg_env = override_config(LOG, "prediction.environment_term=declared")
    f, det = environment_factor(_CourseStub(1500.0), RaceSpec(name="x", heat_c=30.0), cal, cfg_env)
    expected = 1.0 - 0.004 * 15.0 - 0.05 * 1.0
    assert f == pytest.approx(expected) and det["alt_ref_m"] == pytest.approx(500.0)
    # plus bas et plus frais que d'habitude : aucun bonus
    f2, _ = environment_factor(_CourseStub(200.0), RaceSpec(name="x", heat_c=5.0), cal, cfg_env)
    assert f2 == 1.0
    base = predict_finish(200.0, 53.0, twin, cal, cfg_env)
    slow = predict_finish(200.0, 53.0, twin, cal, cfg_env, env_factor=f, env_detail=det)
    # v × f dans le point fixe de Riegel : T ∝ f^(−1/(1+b))
    assert slow.finish_hours / base.finish_hours == pytest.approx((1 / f) ** (1 / (1 - 0.07)), rel=1e-3)
    assert slow.env_factor == pytest.approx(f) and base.env_factor is None
    assert slow.interval_high_h > base.interval_high_h


# ----------------------------------------------------------------------------- plan : arrêts et fade
def _triangle_gpx(n=300):
    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(n + 1):
        x = 10000.0 * i / n
        ele = 1000.0 * (x / 5000.0) if x <= 5000 else 1000.0 * (2 - x / 5000.0)
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


def _race4():
    return RaceSpec("Test", (0.0, 2.5, 5.0, 7.5, 10.0), ("d", "a1", "a2", "a3", "arr"),
                    start_time=datetime(2026, 9, 25, 13, 0, tzinfo=timezone(timedelta(hours=2))),
                    lat=43.703, lon=7.266, tz_offset_h=2.0, major_base_indices=(1,))


def _stand_in(course, finish, *, stops_model="carved", stops_rate=None):
    moving = finish if stops_model == "carved" else finish / (1 + stops_rate)
    return Prediction(finish_hours=finish, v_kmh=course.deq_km / finish, deq_km=course.deq_km,
                      dplus_per_km=course.dplus_per_km, interval_low_h=finish * 0.9,
                      interval_high_h=finish * 1.1, mc_samples=np.array([finish]),
                      regime="regression", sigma_kmh=0.1, vc_fraction=None, cross_validation=None,
                      plan_low_h=finish * 0.95, plan_high_h=finish * 1.05, moving_hours=moving,
                      stops_hours=finish - moving, stops_model=stops_model, stops_rate=stops_rate)


def test_plan_distributes_personal_stops_over_aid_stations_in_policy_proportions():
    course = build_course(_triangle_gpx(), _race4(), CFG)
    carved = build_pacing(course, _stand_in(course, 10.0), _race4(), CFG)
    assert carved.stops_model == "carved" and carved.t_stops_h == pytest.approx((5 + 15 + 5) / 60)
    personal = build_pacing(course, _stand_in(course, 11.0, stops_model="personal", stops_rate=0.1),
                            _race4(), CFG)
    assert personal.stops_model == "personal" and personal.stops_rate == pytest.approx(0.1)
    assert personal.t_move_h == pytest.approx(10.0) and personal.t_stops_h == pytest.approx(1.0)
    assert abs(personal.t_clock_h - 11.0) < 1e-6
    stops = [s.stop_min for s in personal.segments]
    assert stops[-1] == 0.0 and stops[1] == pytest.approx(3 * stops[0], abs=1.0)   # base majeure × 3
    assert sum(stops) == pytest.approx(60.0, abs=1.5)                              # arrondis d'affichage
    # en mode objectif le taux s'applique à la cible
    on_target = build_pacing(course, _stand_in(course, 11.0, stops_model="personal", stops_rate=0.1),
                             _race4(), CFG, anchor_hours=22.0)
    assert on_target.t_move_h == pytest.approx(20.0) and on_target.t_stops_h == pytest.approx(2.0)


def test_fade_from_race_splits_with_honest_fallbacks():
    class Cal:
        def __init__(self, ratios, weights=None):
            from twin_engine.calibration import GenuineUltra
            self.genuine = [GenuineUltra(date=None, hours=12, vga_kmh=7, dplus_m=100, dist_km=60,
                                         avg_hr=None, split_ratio=r) for r in ratios]
            self.weights = weights

    assert fade_delta_from_splits(Cal([0.9])) == pytest.approx(2 * 0.1 / 1.9)
    assert fade_delta_from_splits(Cal([0.9, 0.8], (1.0, 3.0))) == pytest.approx(
        (2 * 0.1 / 1.9 + 3 * 2 * 0.2 / 1.8) / 4)
    assert fade_delta_from_splits(Cal([None, 2.0])) is None            # inconnu / implausible
    course = build_course(_triangle_gpx(), _race4(), CFG)
    cfg_s = replace(CFG, pacing=replace(CFG.pacing, fade_source="splits"))
    plan = build_pacing(course, _stand_in(course, 10.0), _race4(), cfg_s, durability_pct=20.0,
                        splits_delta=2 * 0.1 / 1.9)
    assert plan.fade_source_used == "splits" and plan.fade_delta_used == pytest.approx(2 * 0.1 / 1.9)
    plan_d = build_pacing(course, _stand_in(course, 10.0), _race4(), cfg_s, durability_pct=20.0)
    assert plan_d.fade_source_used == "durability" and plan_d.fade_delta_used == pytest.approx(20 / 180)
    plan_c = build_pacing(course, _stand_in(course, 10.0), _race4(), cfg_s)
    assert plan_c.fade_source_used == "config" and plan_c.fade_delta_used == CFG.pacing.fade_delta
    # borné : un athlète qui accélère (R > 1) ne reçoit pas de fade négatif
    plan_b = build_pacing(course, _stand_in(course, 10.0), _race4(), cfg_s, splits_delta=-0.2)
    assert plan_b.fade_delta_used == CFG.pacing.fade_delta_min


# ----------------------------------------------------------------------------- tools/score_plan
def test_score_plan_finds_the_shape_that_produced_the_passages(tmp_path):
    from tools.score_plan import main as score_main, score_registre

    course = build_course(_triangle_gpx(), _race4(), CFG)
    official = 1.5
    ref = build_pacing(course, _stand_in(course, official), _race4(), CFG)   # fade config, carved
    cps = [{"km": 0.0, "name": "d", "t_h": 0.0, "method": "radius", "dist_m": 5}]
    for k, s in enumerate(ref.segments):
        cps.append({"km": s.off1, "name": s.to, "t_h": s.cum_clock_exact_h, "method": "radius", "dist_m": 5})
    (tmp_path / "course.gpx").write_bytes(_triangle_gpx())
    (tmp_path / "race.json").write_text(json.dumps({
        "name": "Test", "aid_km": [0.0, 2.5, 5.0, 7.5, 10.0], "aid_names": ["d", "a1", "a2", "a3", "arr"],
        "start_time": "2026-09-25T13:00:00+02:00", "lat": 43.703, "lon": 7.266, "tz_offset_h": 2.0,
        "major_base_indices": [1]}), encoding="utf-8")
    manifest = {"athlete": "T", "archive": "archives", "dev_set": False,
                "races": [{"name": "Test", "date": "2026-09-25", "official_time": "1:30:00",
                           "gpx": "course.gpx", "race_json": "race.json"}]}
    mp = tmp_path / "manifest.json"
    mp.write_text(json.dumps(manifest), encoding="utf-8")
    registre = {"entries": [{"athlete": "T", "dev_set": False, "race": "Test", "date": "2026-09-25",
                             "official_time_h": official, "dnf": False,
                             "model": {"durability_pct": 20.0, "fade_delta_splits": 0.06,
                                       "stops_rate_personal": 0.05},
                             "passages": {"checkpoints": cps, "n_found": len(cps)}}]}
    rows = score_registre(registre, [mp], CFG)
    assert len(rows) == 1
    sc = rows[0]["scores"]
    assert sc[("config", "carved")]["mae_min"] < 1e-6
    assert sc[("durability", "carved")]["mae_min"] > 0.05 and sc[("splits", "carved")]["mae_min"] > 0.05
    assert sc[("config", "personal")]["mae_min"] > 0.05        # d'autres arrêts, d'autres passages
    assert sc[("config", "carved")]["fade_used"] == "config"
    reg_path = tmp_path / "reg.json"
    reg_path.write_text(json.dumps(registre), encoding="utf-8")
    out = tmp_path / "score.md"
    assert score_main([str(mp), "--registre", str(reg_path), "--out", str(out)]) == 0
    text = out.read_text(encoding="utf-8")
    assert "cas frais" in text and "| config | carved |" in text


# ----------------------------------------------------------------------------- défauts intacts
def test_phase_2_defaults_are_untouched():
    assert CFG.calibration.stops_model == "carved" and CFG.calibration.night_term == "none"
    assert CFG.prediction.environment_term == "off" and CFG.pacing.fade_source == "config"
    twin = _twin([_ultra(h, _riegel(h, d), d, stops_frac=0.08, night=0.2, alt=800.0) for h, d in _GRID])
    cal = build_calibration(twin, CFG)
    assert cal.stops_model == "carved" and cal.stops_rate is None and not cal.has_night_term
    assert np.asarray(cal.beta_cov).shape == (3, 3)
    pred = predict_race(_CourseStub(1500.0), twin, cal, CFG, RaceSpec(name="x", heat_c=30.0))
    assert pred.stops_hours == 0.0 and pred.night_dev is None and pred.env_factor is None
    assert pred.finish_hours == pytest.approx(pred.moving_hours)
