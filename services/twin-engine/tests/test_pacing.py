"""Pacing : fade, conversion d'allure, horloge/nuit (NOAA), fenêtres Monte-Carlo."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import numpy as np

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.pacing import build_pacing, sun_times
from twin_engine.predict import Prediction

CFG = load_config()


def test_sun_times_nice_september():
    sr, ss = sun_times(2026, 9, 25, 43.703, 7.266, 2.0)
    # référence pacing.py : lever ~07:20, coucher ~19:24
    assert 420 < sr < 460          # 7:00–7:40
    assert 1150 < ss < 1180        # 19:10–19:40
    assert ss > sr


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


def _race():
    return RaceSpec(
        "Test", (0.0, 5.0, 10.0), ("départ", "sommet", "arrivée"),
        start_time=datetime(2026, 9, 25, 13, 0, tzinfo=timezone(timedelta(hours=2))),
        lat=43.703, lon=7.266, tz_offset_h=2.0, major_base_indices=(0,),
    )


def _prediction(course, finish=10.0):
    rng = np.random.default_rng(1)
    mc = finish * (1 + rng.normal(0, 0.03, 5000))
    return Prediction(
        finish_hours=finish, v_kmh=course.deq_km / finish, deq_km=course.deq_km,
        dplus_per_km=course.dplus_per_km, interval_low_h=finish * 0.96, interval_high_h=finish * 1.04,
        mc_samples=mc, regime="regression", sigma_kmh=0.14, vc_fraction=0.62, cross_validation=None,
    )


def test_pacing_conserves_clock_and_fades():
    course = build_course(_triangle_gpx(), _race(), CFG)
    pred = _prediction(course, finish=10.0)
    plan = build_pacing(course, pred, _race(), CFG)

    # horloge = mouvement + arrêts ≈ temps prédit
    assert abs(plan.t_clock_h - 10.0) < 0.05
    assert abs((plan.t_move_h + plan.t_stops_h) - plan.t_clock_h) < 1e-6
    # fade : vitesse ajustée qui décroît du début à la fin (dérive contrôlée)
    assert plan.segments[0].v_ga_kmh > plan.segments[-1].v_ga_kmh
    # montée = allure réelle plus lente que la descente
    assert plan.segments[0].pace_min_km > plan.segments[1].pace_min_km


def test_arrival_windows_bracket_median():
    course = build_course(_triangle_gpx(), _race(), CFG)
    plan = build_pacing(course, _prediction(course), _race(), CFG)
    for s in plan.segments:
        assert s.lo_h <= s.cum_clock_h <= s.hi_h     # fenêtre encadre le scénario médian
        assert s.lo_h < s.hi_h


def test_night_detected_for_evening_finish():
    course = build_course(_triangle_gpx(), _race(), CFG)
    plan = build_pacing(course, _prediction(course, finish=10.0), _race(), CFG)
    # départ 13:00 + ~10 h → arrivée ~23:00 → la fin est de nuit
    assert plan.segments[-1].night
    assert plan.sun["sunset"].startswith("19")


def test_arrival_clock_excludes_own_stop():
    """C5 : l'heure affichée est l'ARRIVÉE au ravito — l'arrêt s'écoule APRÈS.

    Avant le correctif, arr_clock/cum_clock incluaient l'arrêt du ravito d'arrivée :
    le coureur lisait en fait son heure de DÉPART du poste (décalage de 5–15 min,
    hérité par les fenêtres et le drapeau nuit)."""
    course = build_course(_triangle_gpx(), _race(), CFG)
    plan = build_pacing(course, _prediction(course, finish=10.0), _race(), CFG)
    s1, s2 = plan.segments
    # cumul à l'arrivée du 1er point = mouvement seul (pas les 15 min d'arrêt de CE ravito)
    assert abs(s1.cum_clock_h - s1.t_move_min / 60.0) < 0.02
    # cumul à l'arrivée finale = tout le mouvement + l'arrêt du ravito intermédiaire
    assert abs(s2.cum_clock_h - (s1.t_move_min + s2.t_move_min) / 60.0 - s1.stop_min / 60.0) < 0.03
    # l'horloge totale reste exactement mouvement + arrêts
    assert abs(plan.t_clock_h - (plan.t_move_h + plan.t_stops_h)) < 1e-6


def test_fade_source_durability_personalizes_delta():
    """T3 : fade_source=durability dérive Δ du découplage mesuré (Δ = X/(200−X), borné) ;
    défaut config = comportement historique ; repli si durabilité non mesurable."""
    from dataclasses import replace

    course = build_course(_triangle_gpx(), _race(), CFG)
    pred = _prediction(course, finish=10.0)
    cfg_d = replace(CFG, pacing=replace(CFG.pacing, fade_source="durability"))

    plan_default = build_pacing(course, pred, _race(), CFG, durability_pct=20.0)
    assert plan_default.fade_delta_used == CFG.pacing.fade_delta        # défaut : constante

    plan_d20 = build_pacing(course, pred, _race(), cfg_d, durability_pct=20.0)
    assert abs(plan_d20.fade_delta_used - 20.0 / 180.0) < 1e-12         # X/(200−X) ≈ 0,111

    plan_d40 = build_pacing(course, pred, _race(), cfg_d, durability_pct=40.0)
    assert plan_d40.fade_delta_used == cfg_d.pacing.fade_delta_max      # borné haut

    plan_none = build_pacing(course, pred, _race(), cfg_d, durability_pct=None)
    assert plan_none.fade_delta_used == CFG.pacing.fade_delta           # repli honnête

    # un athlète qui s'use plus (X=20 % > 15,7 % implicite du défaut) part plus vite et
    # finit plus lentement — le plan devient réellement individuel
    assert plan_d20.segments[0].v_ga_kmh > plan_default.segments[0].v_ga_kmh
    assert plan_d20.segments[-1].v_ga_kmh < plan_default.segments[-1].v_ga_kmh
    # même temps de mouvement total (le fade redistribue, ne change pas la prédiction)
    assert abs(plan_d20.t_move_h - plan_default.t_move_h) < 1e-9


def test_arrival_windows_in_clock_time():
    """La fenêtre de chaque segment existe aussi en HEURES DE PASSAGE (fourchette de
    course), pas seulement la valeur centrale ; sans logistique, pas d'heures."""
    course = build_course(_triangle_gpx(), _race(), CFG)
    plan = build_pacing(course, _prediction(course, finish=10.0), _race(), CFG)
    for s in plan.segments:
        assert s.arr_lo_clock and s.arr_hi_clock
        assert ":" in s.arr_lo_clock and ":" in s.arr_hi_clock
    # départ 13:00 + borne basse du 1er segment → l'heure affichée suit lo_h ; tolérance
    # = arrondi de lo_h (2 déc. ⇒ ±0,3 min) + minutes TRONQUÉES par l'horloge (< 1 min)
    s1 = plan.segments[0]
    expected_min = (13.0 + s1.lo_h) * 60
    hhmm = s1.arr_lo_clock.split()[-1]
    got_min = int(hhmm[:2]) * 60 + int(hhmm[3:])
    assert abs(got_min - expected_min) <= 1.5

    race = RaceSpec("NoLogi", (0.0, 5.0, 10.0), ("d", "s", "a"))
    course2 = build_course(_triangle_gpx(), race, CFG)
    plan2 = build_pacing(course2, _prediction(course2), race, CFG)
    assert all(s.arr_lo_clock is None and s.arr_hi_clock is None for s in plan2.segments)
    assert plan2.safety_lo_clock is None and plan2.safety_hi_clock is None


def test_segment_windows_use_plan_band_not_safety_interval():
    """Double bande : les fenêtres PAR SEGMENT sont la fourchette de course (percentiles de
    pacing, défaut 25–75), plus étroite que l'intervalle de la prédiction (80 %) qui, lui,
    sort en HEURES DE PASSAGE au niveau du plan (bornes de sécurité)."""
    course = build_course(_triangle_gpx(), _race(), CFG)
    pred = _prediction(course, finish=10.0)
    plan = build_pacing(course, pred, _race(), CFG)
    last = plan.segments[-1]
    mult = pred.mc_samples / pred.finish_hours
    exp_lo = float(np.percentile(plan.t_clock_h * mult, CFG.pacing.plan_window_low_pct))
    exp_hi = float(np.percentile(plan.t_clock_h * mult, CFG.pacing.plan_window_high_pct))
    assert abs(last.lo_h - exp_lo) < 0.01
    assert abs(last.hi_h - exp_hi) < 0.01
    # plus étroite que ce que donneraient les percentiles de la prédiction (10/90)
    p10 = float(np.percentile(plan.t_clock_h * mult, CFG.prediction.interval_low_pct))
    p90 = float(np.percentile(plan.t_clock_h * mult, CFG.prediction.interval_high_pct))
    assert (last.hi_h - last.lo_h) < (p90 - p10)
    # bornes de sécurité = intervalle de la PRÉDICTION converti en heures de passage
    assert plan.safety_lo_clock and ":" in plan.safety_lo_clock
    assert plan.safety_hi_clock and ":" in plan.safety_hi_clock


def test_segment_windows_follow_served_plan_band():
    """S5 : quand la prédiction PORTE une fourchette de course (plan_low/high_h, ex. conforme),
    les fenêtres des segments s'y calent (multiplicateurs de scénario global), au lieu des
    percentiles Monte-Carlo."""
    course = build_course(_triangle_gpx(), _race(), CFG)
    pred = _prediction(course, finish=10.0)
    pred.plan_low_h = 9.0
    pred.plan_high_h = 11.5
    plan = build_pacing(course, pred, _race(), CFG)
    last = plan.segments[-1]
    # dernier segment : fenêtre = bornes servies (le cumul total ≈ la prédiction)
    assert abs(last.lo_h - 9.0 * plan.t_clock_h / 10.0) < 0.02
    assert abs(last.hi_h - 11.5 * plan.t_clock_h / 10.0) < 0.02
    # segments intermédiaires : mêmes multiplicateurs appliqués au cumul
    s1 = plan.segments[0]
    assert abs(s1.lo_h - 0.9 * s1.cum_clock_h) < 0.02
    assert abs(s1.hi_h - 1.15 * s1.cum_clock_h) < 0.02


def test_unscaled_stops_narrow_the_windows():
    """C6 : scale_stops=false — les arrêts (constants) ne sont plus gonflés par le scénario
    lent : fenêtres légèrement plus étroites, toujours encadrantes."""
    from dataclasses import replace

    course = build_course(_triangle_gpx(), _race(), CFG)
    pred = _prediction(course, finish=10.0)
    plan_scaled = build_pacing(course, pred, _race(), CFG)
    cfg_u = replace(CFG, pacing=replace(CFG.pacing, scale_stops=False))
    plan_unscaled = build_pacing(course, pred, _race(), cfg_u)

    for s_sc, s_un in zip(plan_scaled.segments, plan_unscaled.segments):
        assert s_un.lo_h <= s_un.cum_clock_h <= s_un.hi_h          # encadre toujours le médian
        assert (s_un.hi_h - s_un.lo_h) <= (s_sc.hi_h - s_sc.lo_h) + 1e-9   # jamais plus large
    # au dernier segment (0,25 h d'arrêts cumulés), la fenêtre non scalée est STRICTEMENT
    # plus étroite : la part « arrêts » ne fluctue plus avec le multiplicateur MC
    last_sc, last_un = plan_scaled.segments[-1], plan_unscaled.segments[-1]
    assert (last_un.hi_h - last_un.lo_h) < (last_sc.hi_h - last_sc.lo_h)


def test_pacing_without_logistics_still_produces_paces():
    race = RaceSpec("NoLogi", (0.0, 5.0, 10.0), ("d", "s", "a"))  # pas de départ/lat/lon
    course = build_course(_triangle_gpx(), race, CFG)
    plan = build_pacing(course, _prediction(course), race, CFG)
    assert all(s.arr_clock is None and s.night is False for s in plan.segments)
    assert all(s.v_ga_kmh > 0 for s in plan.segments)


# --------------------------------------------------------------------------- #
# Mode OBJECTIF (ADR 0002) : le plan s'ancre sur la cible de l'athlète.
_WINDOW_FIELDS = {"lo_h", "hi_h", "arr_lo_clock", "arr_hi_clock"}


def test_anchor_on_prediction_time_is_invariant():
    """LE garde-fou du lot : ancré sur le temps PRÉDIT, le mode objectif redonne exactement
    le plan historique — sauf les fenêtres, qui changent de nature par décision (bande de
    probabilité → tolérance d'exécution). C'est ce qui prouve qu'on n'a rien cassé sans
    toucher au golden."""
    course = build_course(_triangle_gpx(), _race(), CFG)
    pred = _prediction(course, finish=10.0)
    ref = build_pacing(course, pred, _race(), CFG)
    same = build_pacing(course, pred, _race(), CFG, anchor_hours=pred.finish_hours)

    assert (ref.t_move_h, ref.t_stops_h, ref.t_clock_h) == (
        same.t_move_h, same.t_stops_h, same.t_clock_h)
    assert ref.fade_delta_used == same.fade_delta_used
    # bornes de sécurité inchangées : elles viennent de la prédiction dans les DEUX modes
    assert (ref.safety_lo_clock, ref.safety_hi_clock) == (same.safety_lo_clock, same.safety_hi_clock)
    for a, b in zip(ref.segments, same.segments):
        da, db = a.to_dict(), b.to_dict()
        for k in da:
            if k not in _WINDOW_FIELDS:
                assert da[k] == db[k], f"champ {k} modifié par l'ancrage"
    # ... et l'ancre est tracée, pour que le rapport choisisse ses mots
    assert ref.anchor == "prediction" and ref.window_tolerance_pct is None
    assert same.anchor == "target" and same.window_tolerance_pct == CFG.target.tolerance_pct


def test_target_anchor_distributes_the_requested_time():
    """Un objectif de 12 h est réparti en 12 h d'horloge, fade et arrêts compris."""
    course = build_course(_triangle_gpx(), _race(), CFG)
    pred = _prediction(course, finish=10.0)
    plan = build_pacing(course, pred, _race(), CFG, anchor_hours=12.0)

    assert abs(plan.t_clock_h - 12.0) < 0.02
    assert abs((plan.t_move_h + plan.t_stops_h) - plan.t_clock_h) < 1e-6
    assert plan.anchor_hours == 12.0
    # cible plus lente que la prédiction → plan plus lent de bout en bout
    ref = build_pacing(course, pred, _race(), CFG)
    assert plan.segments[0].v_ga_kmh < ref.segments[0].v_ga_kmh
    # le fade reste celui de l'athlète : la cible change le rythme, pas la forme du plan
    assert plan.fade_delta_used == ref.fade_delta_used


def test_target_windows_are_a_fixed_execution_tolerance():
    """Les fenêtres cessent d'être une bande de probabilité : demi-largeur fixe (en % du
    cumul), donc croissante en valeur absolue le long de la course."""
    from dataclasses import replace

    course = build_course(_triangle_gpx(), _race(), CFG)
    pred = _prediction(course, finish=10.0)
    tol = CFG.target.tolerance_pct / 100.0
    plan = build_pacing(course, pred, _race(), CFG, anchor_hours=12.0)

    for s in plan.segments:
        assert s.lo_h <= s.cum_clock_h <= s.hi_h
        # les champs servis sont arrondis au centième d'heure → tolérance de comparaison
        assert abs(s.lo_h - s.cum_clock_h * (1 - tol)) < 0.02
        assert abs(s.hi_h - s.cum_clock_h * (1 + tol)) < 0.02
    # fenêtre absolue croissante : ±quelques minutes au début, davantage à l'arrivée
    assert (plan.segments[-1].hi_h - plan.segments[-1].lo_h) > (
        plan.segments[0].hi_h - plan.segments[0].lo_h)

    # la tolérance est une constante de config, pas un chiffre en dur
    cfg_wide = replace(CFG, target=replace(CFG.target, tolerance_pct=10.0))
    wide = build_pacing(course, pred, _race(), cfg_wide, anchor_hours=12.0)
    assert (wide.segments[0].hi_h - wide.segments[0].lo_h) > (
        plan.segments[0].hi_h - plan.segments[0].lo_h)


def test_target_windows_ignore_prediction_dispersion():
    """Deux prédictions de dispersions très différentes, même cible → mêmes fenêtres.
    C'est la preuve que la bande statistique ne fuit plus dans la consigne d'exécution."""
    course = build_course(_triangle_gpx(), _race(), CFG)
    tight = _prediction(course, finish=10.0)
    loose = Prediction(
        finish_hours=10.0, v_kmh=course.deq_km / 10.0, deq_km=course.deq_km,
        dplus_per_km=course.dplus_per_km, interval_low_h=5.0, interval_high_h=20.0,
        mc_samples=tight.mc_samples * 3.0, regime="blend", sigma_kmh=1.4,
        vc_fraction=0.62, cross_validation=None, plan_low_h=7.0, plan_high_h=15.0,
    )
    a = build_pacing(course, tight, _race(), CFG, anchor_hours=12.0)
    b = build_pacing(course, loose, _race(), CFG, anchor_hours=12.0)
    for sa, sb in zip(a.segments, b.segments):
        assert (sa.lo_h, sa.hi_h) == (sb.lo_h, sb.hi_h)


def test_target_anchor_rejects_nonsense():
    import pytest

    course = build_course(_triangle_gpx(), _race(), CFG)
    with pytest.raises(ValueError):
        build_pacing(course, _prediction(course), _race(), CFG, anchor_hours=0.0)
