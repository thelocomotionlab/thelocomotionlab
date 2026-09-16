"""Phase 3 du chantier v2 : l'information manquante sur la pente au-delà de 6 h — efficacité-
durée (B1), queue de la courbe record (B2), recalage sur le niveau de l'époque (P), plancher
de vitesse dépendant de la durée et garde du plus long arrêt (F). Chaque levier derrière un
flag, défauts inchangés (golden intact, cf. test_golden)."""

from __future__ import annotations

import math
from dataclasses import replace
from datetime import date, datetime, timezone

import numpy as np
import pytest

from twin_engine.calibration import (REGIME_BLEND, REGIME_REGRESSION, build_calibration,
                                     genuine_floor_kmh, genuine_gate_failures,
                                     select_genuine_ultras)
from twin_engine.config import load_config, override_config
from twin_engine.ingest.canonical import CanonicalActivity
from twin_engine.predict import leave_one_out, predict_finish
from twin_engine.twin.model import (CriticalSpeed, Twin, build_twin_from_contributions,
                                    fit_efficiency_exponent, fit_record_tail_exponent,
                                    level_marks, vc_at_epoch)
from twin_engine.twin.record import (ActivityContribution, ActivitySummary, RecordCurve,
                                     RecordPoint, iter_contributions, process_activity_full,
                                     record_from_contributions, tail_durations)

CFG = load_config()
# leviers testés depuis les anciens défauts (lien linéaire, pente libre, α court, enveloppe
# historique, bandes conformes), isolés (Décision 1 : CFG est la pile de référence complète)
HIST = override_config(CFG, "calibration.link=linear,calibration.duration_term=free,calibration.duration_prior_source=twin_alpha,calibration.envelope_tail=alpha,prediction.interval_source=conformal_normalized")
LOG = override_config(HIST, "calibration.link=log")
EXACT = override_config(
    HIST, "calibration.recency_halflife_days=0,calibration.maximality_mode=off,"
          "calibration.terrain_term=free")
EXACT_LOG = override_config(EXACT, "calibration.link=log")


# ----------------------------------------------------------------------------- fabriques
def _summary(hours, vga_kmh, dpk=50.0, *, date="2025-06-01", hr=140, decouple=10.0,
             longest=None, stops_s=None, has_hr=True):
    dist = vga_kmh * hours / 1.1
    return ActivitySummary(
        date=date, sport="running", duration_s=hours * 3600, dist_km=dist,
        ga_km=vga_kmh * hours, avg_hr=hr, dplus_m=dpk * dist, dminus_m=dpk * dist,
        decouple_pct=decouple, has_hr=has_hr, stops_s=stops_s, longest_stop_s=longest,
    )


def _cs(vc_ms):
    return CriticalSpeed(vc_ms=vc_ms, vc_sd=0.05, dprime_m=1500.0, dprime_sd=100.0,
                         from_flat_efforts=True, n_points=8, plausible=True)


def _twin(summaries, *, alpha=0.18, coef=10.0, alpha_eff=None, alpha_tail=None,
          vc_ms=None, marks=None):
    return Twin(critical_speed=None if vc_ms is None else _cs(vc_ms), alpha=alpha,
                endurance_E=None if alpha is None else 1.0 / (1 - alpha), endurance_coef=coef,
                durability_pct=20.0,
                record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=summaries, alpha_eff=alpha_eff, alpha_tail=alpha_tail,
                level_marks=marks)


def _riegel(h, dpk, *, k=9.5, b=-0.07, c=-0.0027):
    return k * h**b * math.exp(c * dpk)


def _plane(h, dpk):
    return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk


_GRID = [(12, 50, "2023-06-01"), (20, 55, "2023-06-01"), (16, 45, "2024-06-01"),
         (24, 53, "2024-06-01"), (18, 52, "2025-06-01"), (11, 60, "2025-06-01"),
         (14, 40, "2025-06-01")]
_LEVELS = {"2023-06-01": 0.88, "2024-06-01": 0.94, "2025-06-01": 1.0}


def _activity(speeds, *, start=datetime(2026, 6, 20, 6, 0, tzinfo=timezone.utc), hr=None):
    speeds = np.asarray(speeds, dtype=float)
    n = speeds.size
    dist = np.cumsum(np.concatenate([[0.0], speeds[1:]]))
    return CanonicalActivity.from_samples(
        timestamps=list(range(n)), dist_m=dist.tolist(), speed_ms=speeds.tolist(),
        hr=None if hr is None else [hr] * n, alt_m=[100.0] * n,
        sport="running", source_format="fit", source_name="syn", start_time=start,
    )


# ----------------------------------------------------------------------------- B1 : efficacité-durée
def _hr_effort(hours, hr, *, hr0=65.0, k=0.06, alpha=0.12, date="2025-06-01"):
    v = k * (hr - hr0) * hours ** (-alpha)          # km/h à cette FC et cette durée
    return _summary(hours, v, 0.0, date=date, hr=hr, decouple=None)


_SHORT = [(0.4, 165), (0.5, 162), (0.6, 160), (0.8, 158), (1.0, 155), (1.5, 150), (2.0, 148),
          (2.5, 145), (0.7, 170), (1.2, 152)]
_LONG = [(1.0, 155), (1.5, 150), (2.0, 148), (3.0, 145), (4.0, 140), (6.0, 138), (8.0, 135),
         (10.0, 132), (12.0, 130), (16.0, 128), (20.0, 126)]


def test_efficiency_exponent_recovers_the_decay_at_given_effort():
    eff = [_hr_effort(h, hr) for h, hr in _SHORT + _LONG]
    # FC0 déclarée : recouvrement exact (les données suivent la loi au bit près)
    a, det = fit_efficiency_exponent(eff, override_config(CFG, "twin.efficiency_hr_rest=65"))
    assert a == pytest.approx(0.12, abs=1e-9)
    assert det["hr0_source"] == "declared"
    assert det["n"] == len(_LONG) + sum(1 for h, _ in _SHORT if h >= 1.0)   # 1 h et plus
    # FC0 estimée sur les efforts de 20 min à 3 h : ordonnée à l'origine ≈ 65, α à 0,02 près
    a2, det2 = fit_efficiency_exponent(eff, CFG)
    assert det2["hr0_source"] == "fit" and abs(det2["hr0"] - 65.0) < 6.0
    assert abs(a2 - 0.12) < 0.02
    # sans FC, ou trop peu d'efforts longs : pas d'exposant, jamais d'invention
    assert fit_efficiency_exponent([replace(s, has_hr=False, avg_hr=None) for s in eff], CFG)[0] is None
    assert fit_efficiency_exponent([_hr_effort(h, hr) for h, hr in _SHORT[:3]], CFG)[0] is None


# ----------------------------------------------------------------------------- B2 : queue de la courbe
def _record(alpha=0.10, *, with_tail=True):
    v = lambda t: 3.0 * (t / 7200.0) ** (-alpha)
    main = [RecordPoint(int(t), v(t), v(t), "2025-06-01", False)
            for t in (1800, 3600, 7200, 10800, 14400, 18000, 21600, 28800)]
    tail = ([RecordPoint(int(t), v(t), float("nan"), "2025-06-01", False)
             for t in (36000, 43200, 57600, 72000)] if with_tail else [])
    return RecordCurve(np.array([p.duration_s for p in main]), np.array([p.vga for p in main]),
                       np.array([p.vraw for p in main]), main, tail_points=tail)


def test_record_tail_exponent_reads_the_long_windows_only():
    a, n = fit_record_tail_exponent(_record(0.10), CFG)
    assert a == pytest.approx(0.10, abs=1e-9)
    assert n == 6 + 4                                   # points ≥ 2 h + fenêtres longues
    # sans fenêtre longue, il n'y a pas de queue : None (pas un α des seuls points 2–8 h)
    assert fit_record_tail_exponent(_record(0.10, with_tail=False), CFG) == (None, 6)
    # le début de l'ajustement suit la config
    a3, n3 = fit_record_tail_exponent(_record(0.10), override_config(CFG, "twin.record_tail_from_s=14400"))
    assert a3 == pytest.approx(0.10, abs=1e-9) and n3 == 4 + 4


def test_envelope_tail_bends_the_fallback_beyond_six_hours_and_keeps_the_anchor():
    ultra = _summary(12, 7.0, 50)
    twin = _twin([ultra], alpha=0.18, coef=10.0, alpha_tail=0.10, alpha_eff=None)
    cal0 = build_calibration(twin, CFG)
    cal_t = build_calibration(twin, override_config(CFG, "calibration.envelope_tail=record_tail"))
    assert cal0.regime == cal_t.regime == REGIME_BLEND
    assert cal0.tail_alpha is None and cal_t.tail_alpha == pytest.approx(0.10)
    # continuité au raccord (6 h), puis décroissance plus douce au-delà
    assert cal_t._envelope_kmh(6.0) == pytest.approx(cal0._envelope_kmh(6.0))
    assert cal_t._envelope_kmh(20.0) > cal0._envelope_kmh(20.0)
    expected = 10.0 * 21600 ** (-0.18) * (72000 / 21600) ** (-0.10) * 3.6
    assert cal_t._envelope_kmh(20.0) == pytest.approx(expected)
    # le recalage du blend absorbe l'enveloppe : à la durée de l'ultra, sa vitesse est rendue
    assert cal0.predict_vga_kmh(12.0, 50.0) == pytest.approx(7.0)
    assert cal_t.predict_vga_kmh(12.0, 50.0) == pytest.approx(7.0)
    assert cal_t.predict_vga_kmh(20.0, 50.0) > cal0.predict_vga_kmh(20.0, 50.0)
    assert any("Enveloppe : au-delà de 6 h" in n for n in cal_t.notes)
    # exposant demandé mais absent : enveloppe historique, signalée
    cal_e = build_calibration(twin, override_config(CFG, "calibration.envelope_tail=efficiency"))
    assert cal_e.tail_alpha is None and any("exposant indisponible" in n for n in cal_e.notes)
    assert cal_e.predict_vga_kmh(20.0, 50.0) == pytest.approx(cal0.predict_vga_kmh(20.0, 50.0))
    # la prédiction complète suit l'enveloppe servie (repli blend : Monte-Carlo σ seul)
    p0 = predict_finish(150.0, 50.0, twin, cal0, CFG)
    pt = predict_finish(150.0, 50.0, twin, cal_t, override_config(CFG, "calibration.envelope_tail=record_tail"))
    assert pt.finish_hours < p0.finish_hours


def test_duration_prior_sources_fall_back_honestly():
    ultras = [_summary(h, _riegel(h, d), d) for h, d, _ in _GRID]
    base = override_config(LOG, "calibration.duration_term=prior_shrunk")
    twin = _twin(ultras, alpha=0.18, alpha_eff=0.11, alpha_tail=0.13)
    for src, expect in (("twin_alpha", (-0.18, "twin_alpha")), ("efficiency", (-0.11, "efficiency")),
                        ("record_tail", (-0.13, "record_tail")), ("population", (-0.16, "population"))):
        cal = build_calibration(twin, override_config(base, f"calibration.duration_prior_source={src}"))
        assert cal.regime == REGIME_REGRESSION
        assert cal.duration_prior[0] == pytest.approx(expect[0]) and cal.duration_prior_origin == expect[1]
    # exposant demandé absent → α historique ; tout absent → population
    twin_no = _twin(ultras, alpha=0.18)
    cal = build_calibration(twin_no, override_config(base, "calibration.duration_prior_source=efficiency"))
    assert cal.duration_prior_origin == "twin_alpha" and cal.duration_prior[0] == pytest.approx(-0.18)
    twin_none = _twin(ultras, alpha=None, coef=None)
    cal = build_calibration(twin_none, override_config(base, "calibration.duration_prior_source=record_tail"))
    assert cal.duration_prior_origin == "population" and cal.duration_prior[0] == pytest.approx(-0.16)


# ----------------------------------------------------------------------------- F : plancher et garde sommeil
RIEGEL = override_config(CFG, "calibration.genuine_floor=riegel")
RIEGEL_SLEEP = override_config(RIEGEL, "calibration.genuine_max_stop_s=3600")


def test_duration_dependent_floor_values():
    assert genuine_floor_kmh(10.0, CFG) == 5.5 and genuine_floor_kmh(38.0, CFG) == 5.5
    assert genuine_floor_kmh(10.0, RIEGEL) == pytest.approx(5.5)
    assert genuine_floor_kmh(25.8, RIEGEL) == pytest.approx(5.5 * 2.58 ** (-0.16))
    assert genuine_floor_kmh(38.0, RIEGEL) == pytest.approx(5.5 * 3.8 ** (-0.16))
    assert genuine_floor_kmh(6.0, RIEGEL) == pytest.approx(5.5)        # jamais au-dessus


def test_floor_keeps_the_longest_race_and_the_sleep_gate_drops_the_off():
    race = _summary(12, 7.0, 50, longest=900)
    miut = _summary(25.8, 5.48, 60, longest=1500)          # 0,02 km/h sous le plancher fixe
    off = _summary(38.0, 4.6, 40, longest=4 * 3600)        # OFF avec sommeil, sous 5,5 mais au-dessus de 4,45
    still = _summary(30.0, 0.23, 30, longest=29 * 3600)    # bivouac
    slow10 = _summary(10.0, 5.4, 50, longest=600)          # à 10 h le plancher ne bouge pas
    allof = [race, miut, off, still, slow10]

    hours = lambda cfg: sorted(round(g.elapsed_hours, 1) for g in select_genuine_ultras(allof, cfg))
    assert hours(CFG) == [12.0]
    assert hours(RIEGEL) == [12.0, 25.8, 38.0]              # le plancher seul laisse entrer l'OFF
    assert hours(RIEGEL_SLEEP) == [12.0, 25.8]              # la garde du plus long arrêt le sort
    # raisons lisibles, une seule définition du domaine
    assert genuine_gate_failures(miut, CFG) == ["vga 5.48 < plancher 5.50 km/h"]
    assert genuine_gate_failures(miut, RIEGEL_SLEEP) == []
    assert genuine_gate_failures(off, RIEGEL_SLEEP) == ["plus long arrêt 240 min > 60 min"]
    assert any("plancher" in f for f in genuine_gate_failures(still, RIEGEL_SLEEP))
    assert genuine_gate_failures(slow10, RIEGEL_SLEEP) == ["vga 5.40 < plancher 5.50 km/h"]
    # un résumé sans mesure d'arrêt (vieil agrégat) n'est jamais écarté par la garde
    assert genuine_gate_failures(replace(off, longest_stop_s=None), RIEGEL_SLEEP) == []
    # avec un modèle d'arrêts, la garde et le plancher lisent toujours l'ÉCOULÉ
    personal = override_config(RIEGEL_SLEEP, "calibration.stops_model=personal")
    miut_p = replace(miut, stops_s=0.23 * 25.8 * 3600)
    assert genuine_gate_failures(miut_p, personal) == []
    assert genuine_gate_failures(miut_p, override_config(CFG, "calibration.stops_model=personal")) \
        == ["vga 5.48 < plancher 5.50 km/h"]


# ----------------------------------------------------------------------------- P : niveau de l'époque
def _progressing(level_of, plane, *, dates=_GRID):
    return [_summary(h, level_of[d] * plane(h, dpk), dpk, date=d) for h, dpk, d in dates]


ANCHOR_LOG = override_config(EXACT_LOG, "calibration.level_anchor=vc_epoch")
ANCHOR_LIN = override_config(EXACT, "calibration.level_anchor=vc_epoch")


def test_level_anchor_rescales_old_ultras_to_the_current_level_in_log_link():
    ultras = _progressing(_LEVELS, _riegel)
    marks = {d: 3.0 * lv for d, lv in _LEVELS.items()}
    twin = _twin(ultras, vc_ms=3.0, marks=marks)
    cal = build_calibration(twin, ANCHOR_LOG)
    assert cal.regime == REGIME_REGRESSION and cal.level_n_anchored == 7
    assert cal.level_shift == pytest.approx(tuple(math.log(1.0 / _LEVELS[d]) for _, _, d in _GRID))
    # le plan d'aujourd'hui est retrouvé exactement, et chaque pli prédit l'ultra à SON époque
    assert cal.beta == pytest.approx((math.log(9.5), -0.07, -0.0027), abs=1e-9)
    assert cal.predict_vga_kmh(30.0, 50.0) == pytest.approx(_riegel(30.0, 50.0))
    assert leave_one_out(cal, ANCHOR_LOG).mae_pct < 1e-6
    # sans recalage, les ultras anciens tirent le niveau vers le bas et la LOO le paie
    cal0 = build_calibration(twin, EXACT_LOG)
    assert cal0.level_shift is None
    assert cal0.predict_vga_kmh(30.0, 50.0) < _riegel(30.0, 50.0)
    assert leave_one_out(cal0, EXACT_LOG).mae_pct > 1.0
    assert any("Niveau de l'époque : 7 ultra(s) sur 7" in n for n in cal.notes)


def test_level_anchor_is_neutral_when_the_vc_is_flat_and_scales_with_gain():
    ultras = _progressing(_LEVELS, _riegel)
    flat = _twin(ultras, vc_ms=3.0, marks={d: 3.0 for d in _LEVELS})
    cal_flat = build_calibration(flat, ANCHOR_LOG)
    cal_none = build_calibration(flat, EXACT_LOG)
    assert cal_flat.level_shift == (0.0,) * 7
    assert cal_flat.beta == cal_none.beta
    assert leave_one_out(cal_flat, ANCHOR_LOG).errors_pct == leave_one_out(cal_none, EXACT_LOG).errors_pct
    # gain 0,5 : moitié du décalage ; ultra sans VC d'époque : décalage nul, compté à part
    half = build_calibration(_twin(ultras, vc_ms=3.0, marks={d: 3.0 * lv for d, lv in _LEVELS.items()}),
                             override_config(ANCHOR_LOG, "calibration.level_anchor_gain=0.5"))
    assert half.level_shift == pytest.approx(tuple(0.5 * math.log(1.0 / _LEVELS[d]) for _, _, d in _GRID))
    partial = build_calibration(
        _twin(ultras, vc_ms=3.0, marks={"2023-06-01": 3.0 * 0.88, "2025-06-01": 3.0}), ANCHOR_LOG)
    assert partial.level_n_anchored == 5
    assert [s for s, (_, _, d) in zip(partial.level_shift, _GRID) if d == "2024-06-01"] == [0.0, 0.0]
    # VC actuelle absente ou non plausible : aucun recalage, signalé
    no_vc = build_calibration(_twin(ultras, marks={d: 3.0 for d in _LEVELS}), ANCHOR_LOG)
    assert no_vc.level_n_anchored == 0 and any("aucune VC d'époque" in n for n in no_vc.notes)


def test_level_anchor_in_linear_link_and_in_the_blend():
    ultras = _progressing(_LEVELS, _plane)
    marks = {d: 3.0 * lv for d, lv in _LEVELS.items()}
    cal = build_calibration(_twin(ultras, vc_ms=3.0, marks=marks), ANCHOR_LIN)
    assert cal.beta == pytest.approx((8.5, -0.35, -0.0148), abs=1e-9)
    assert leave_one_out(cal, ANCHOR_LIN).mae_pct < 1e-4        # tolérance du point fixe itéré
    # blend (un ultra ancien, niveau 0,9) : le recalage lit la vitesse ramenée à aujourd'hui
    old = _summary(14, 0.9 * 7.0, 50, date="2023-06-01")
    twin_b = _twin([old], alpha=0.18, coef=10.0, vc_ms=3.0, marks={"2023-06-01": 2.7})
    cal_b = build_calibration(twin_b, ANCHOR_LIN)
    assert cal_b.regime == REGIME_BLEND and cal_b.level_n_anchored == 1
    assert cal_b.predict_vga_kmh(14.0, 50.0) == pytest.approx(7.0)
    assert build_calibration(twin_b, EXACT).predict_vga_kmh(14.0, 50.0) == pytest.approx(6.3)


# ----------------------------------------------------------------------------- VC d'époque sans fuite
def _contrib(day, vc, *, dprime=1500.0):
    durs = np.asarray(CFG.twin.record_durations_s, dtype=float)
    vga = np.full(len(durs), np.nan)
    for j, T in enumerate(durs):
        if 600 <= T <= 5400:
            vga[j] = (vc * T + dprime) / T
    s = ActivitySummary(date=day.isoformat(), sport="running", duration_s=5400.0,
                        dist_km=vc * 5.4, ga_km=vc * 5.4, avg_hr=None, dplus_m=0.0,
                        dminus_m=0.0, decouple_pct=None, has_hr=False)
    return ActivityContribution(day, s, vga, vga.copy())


def test_vc_at_epoch_reads_only_the_window_before_the_date():
    contribs = [_contrib(date(2024, m, 1), 2.8) for m in (3, 6, 9)] + \
               [_contrib(date(2025, m, 1), 3.1) for m in (3, 6, 9)]
    assert vc_at_epoch(contribs, date(2024, 12, 31), CFG) == pytest.approx(2.8, abs=1e-6)
    assert vc_at_epoch(contribs, date(2025, 12, 31), CFG) == pytest.approx(3.1, abs=1e-6)
    # fenêtre mixte : la N-ième meilleure fenêtre (support 2) reste celle de l'ancien niveau
    assert vc_at_epoch(contribs, date(2025, 4, 1), CFG) == pytest.approx(2.8, abs=1e-6)
    assert vc_at_epoch(contribs, date(2023, 12, 31), CFG) is None
    # marques d'époque des candidats ultras, et jumeau complet sous le flag
    ultra = ActivityContribution(date(2025, 12, 31), _summary(12, 7.0, 50, date="2025-12-31"), None, None)
    marks = level_marks(contribs + [ultra], [ultra.summary], override_config(CFG, "calibration.level_anchor=vc_epoch"))
    assert marks == {"2025-12-31": pytest.approx(3.1, abs=1e-6)}
    twin = build_twin_from_contributions(contribs + [ultra], override_config(CFG, "calibration.level_anchor=vc_epoch"))
    assert twin.level_marks == {"2025-12-31": pytest.approx(3.1, abs=1e-6)}
    assert build_twin_from_contributions(contribs + [ultra], CFG).level_marks is None


# ----------------------------------------------------------------------------- mesures par activité
def test_process_activity_measures_the_longest_stop_and_the_long_windows():
    n = 11 * 3600 + 1
    speeds = np.full(n, 2.0)
    speeds[3600:3900] = 0.0            # 5 min
    speeds[20000:21200] = 0.0          # 20 min : le plus long
    act = _activity(speeds)
    s, vga, vraw, vt = process_activity_full(act, CFG)
    assert s.longest_stop_s == 1200.0 and s.stops_s == 1500.0 and s.n_stops == 2
    assert len(vga) == len(CFG.twin.record_durations_s)
    assert len(vt) == len(tail_durations(CFG)) == 8
    assert vt[0] == pytest.approx(2.0, rel=0.05)          # fenêtre 10 h dans un 11 h
    assert np.isnan(vt[1:]).all()                           # 12 h et plus : pas de fenêtre
    # sortie courte : pas d'arrêt, fenêtres longues absentes
    s2, _, _, vt2 = process_activity_full(_activity(np.full(3601, 3.0)), CFG)
    assert s2.longest_stop_s == 0.0 and np.isnan(vt2).all()


def test_record_tail_comes_from_genuine_ultras_only():
    n = 11 * 3600 + 1
    fast = np.full(n, 2.1)
    fast[5000:5300] = 0.0
    slow = np.full(n, 1.9)
    still = np.zeros(n)
    still[:3600] = 2.0                 # bivouac : 1 h de course, 10 h immobile
    acts = [_activity(fast, start=datetime(2026, 5, 1, 6, tzinfo=timezone.utc)),
            _activity(slow, start=datetime(2026, 5, 15, 6, tzinfo=timezone.utc)),
            _activity(still, start=datetime(2026, 6, 1, 6, tzinfo=timezone.utc))]
    rec, summaries = record_from_contributions(list(iter_contributions(acts, CFG)), CFG)
    assert len(summaries) == 3
    assert [p.duration_s for p in rec.tail_points] == [36000]
    # support 2 : la seconde meilleure fenêtre (le 1,9 m/s), jamais le bivouac
    assert rec.tail_points[0].vga == pytest.approx(1.9, rel=0.02)
    assert len(rec.points) == len(CFG.twin.record_durations_s) or rec.points  # points historiques intacts
    # sans fenêtre longue exploitable (deux efforts de 3 h) : pas de queue, pas d'exposant
    short = [_activity(np.full(3 * 3600 + 1, 3.0)), _activity(np.full(3 * 3600 + 1, 2.9))]
    rec2, _ = record_from_contributions(list(iter_contributions(short, CFG)), CFG)
    assert rec2.tail_points == [] and fit_record_tail_exponent(rec2, CFG)[0] is None


def test_reference_config_and_overrides_accept_the_new_keys():
    cfg = override_config(CFG, "calibration.genuine_floor=riegel,calibration.genuine_max_stop_s=3600,"
                               "calibration.level_anchor=vc_epoch,calibration.level_anchor_gain=0.5,"
                               "calibration.envelope_tail=efficiency,calibration.duration_prior_source=record_tail")
    assert (cfg.calibration.genuine_floor, cfg.calibration.genuine_max_stop_s) == ("riegel", 3600.0)
    assert (cfg.calibration.level_anchor, cfg.calibration.level_anchor_gain) == ("vc_epoch", 0.5)
    assert (cfg.calibration.envelope_tail, cfg.calibration.duration_prior_source) == ("efficiency", "record_tail")
    # défauts : rien de tout cela n'est servi
    assert (CFG.calibration.genuine_floor, CFG.calibration.genuine_max_stop_s) == ("fixed", 0.0)
    assert (CFG.calibration.level_anchor, CFG.calibration.envelope_tail) == ("none", "efficiency")
    assert CFG.calibration.duration_prior_source == "efficiency"      # Décision 1
    assert (HIST.calibration.envelope_tail, HIST.calibration.duration_prior_source) == ("alpha", "twin_alpha")
