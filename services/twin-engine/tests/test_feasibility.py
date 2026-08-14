"""Mode objectif (ADR 0002) : verdict de faisabilité d'une cible face au jumeau."""

from __future__ import annotations

import dataclasses
import math

import numpy as np
import pytest

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.feasibility import (
    AMBITIEUX,
    CONFORTABLE,
    HORS_DOMAINE,
    HORS_PORTEE,
    INDECIDABLE,
    NOMINAL,
    assess_target,
)
from twin_engine.predict import Prediction
from twin_engine.twin.model import CriticalSpeed, Twin
from twin_engine.twin.record import RecordCurve

CFG = load_config()


def _gpx(n=300, climb_m=1000.0, half_km=8.0):
    """Aller-retour triangulaire : montée jusqu'à ``half_km`` puis descente symétrique."""
    lat0, lon0 = 45.08, 5.77
    total_m = 2 * half_km * 1000.0
    rows = []
    for i in range(n + 1):
        x = total_m * i / n
        ele = (climb_m * x / (half_km * 1000.0) if x <= half_km * 1000.0
               else climb_m * (2 - x / (half_km * 1000.0)))
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


def _course():
    return build_course(_gpx(), RaceSpec(name="Test"), CFG)


def _twin(*, vc_ms=2.9, coef=10.0, alpha=0.18):
    cs = None if vc_ms is None else CriticalSpeed(vc_ms, 0.1, 1500, 300, True, 5)
    rec = RecordCurve(np.array([]), np.array([]), np.array([]), [])
    return Twin(critical_speed=cs, alpha=alpha, endurance_E=1.22, endurance_coef=coef,
                durability_pct=20.0, record=rec, summaries=[])


def _prediction(course, central=20.0):
    """Prédiction jouet : fourchette de course ±5 %, bornes de sécurité ±12 %."""
    rng = np.random.default_rng(1)
    return Prediction(
        finish_hours=central, v_kmh=course.deq_km / central, deq_km=course.deq_km,
        dplus_per_km=course.dplus_per_km,
        interval_low_h=central * 0.88, interval_high_h=central * 1.12,
        mc_samples=central * (1 + rng.normal(0, 0.03, 2000)),
        regime="regression", sigma_kmh=0.14, vc_fraction=0.62, cross_validation=None,
        plan_low_h=central * 0.95, plan_high_h=central * 1.05,
    )


# --------------------------------------------------------------------------- #
# Les quatre régimes, frontières comprises.
def test_cible_plus_lente_que_le_central_est_confortable():
    course = _course()
    a = assess_target(22.0, course, _twin(), _prediction(course, central=20.0), CFG)
    assert a.regime == CONFORTABLE and a.plan_ok
    assert a.gap_vs_central_pct == pytest.approx(10.0, abs=0.01)
    assert a.speed_gain_pct < 0        # il peut ralentir


def test_cible_dans_la_fourchette_est_nominale():
    course = _course()
    a = assess_target(19.5, course, _twin(), _prediction(course, 20.0), CFG)
    assert a.regime == NOMINAL and a.plan_ok


def test_cible_entre_fourchette_et_securite_est_ambitieuse():
    course = _course()
    a = assess_target(18.0, course, _twin(), _prediction(course, 20.0), CFG)
    assert a.regime == AMBITIEUX and a.plan_ok
    assert a.speed_gain_pct > 0        # il faut accélérer


def test_cible_hors_bornes_de_securite_ne_sert_pas_de_plan():
    course = _course()
    a = assess_target(16.0, course, _twin(), _prediction(course, 20.0), CFG)
    assert a.regime == HORS_PORTEE
    assert a.plan_ok is False          # on rend l'écart, pas un plan
    assert any("objectif d'entraînement" in r for r in a.reasons)


def test_frontieres_exactes_appartiennent_au_regime_le_moins_dur():
    """Une cible pile sur une borne ne doit pas basculer dans le régime plus dur."""
    course, pred = _course(), _prediction(_course(), 20.0)
    assert assess_target(20.0, course, _twin(), pred, CFG).regime == CONFORTABLE
    assert assess_target(pred.plan_low_h, course, _twin(), pred, CFG).regime == NOMINAL
    assert assess_target(pred.interval_low_h, course, _twin(), pred, CFG).regime == AMBITIEUX


# --------------------------------------------------------------------------- #
# Garde-fous : ils priment sur la cible.
def test_garde_fou_domaine_prime_sur_la_cible():
    """Sous genuine_min_hours, le moteur est hors périmètre — même avec un objectif."""
    course = _course()
    a = assess_target(6.0, course, _twin(), _prediction(course, 6.5), CFG)
    assert a.regime == HORS_DOMAINE and a.plan_ok is False
    assert CFG.calibration.genuine_min_hours == 10.0


def test_garde_fou_domaine_desactivable_par_config():
    course = _course()
    cfg = dataclasses.replace(CFG, sufficiency=dataclasses.replace(CFG.sufficiency, domain_gate="off"))
    a = assess_target(6.0, course, _twin(), _prediction(course, 6.5), cfg)
    assert a.regime != HORS_DOMAINE


def test_sans_prediction_aucun_verdict():
    a = assess_target(31.0, _course(), _twin(), None, CFG)
    assert a.regime == INDECIDABLE and a.plan_ok is False
    assert a.gap_vs_central_pct is None and a.speed_gain_pct is None


def test_rollback_refuse_outside_safety():
    course = _course()
    cfg = dataclasses.replace(CFG, target=dataclasses.replace(CFG.target, refuse_outside_safety=False))
    a = assess_target(16.0, course, _twin(), _prediction(course, 20.0), cfg)
    assert a.regime == HORS_PORTEE and a.plan_ok is True   # rollback explicite


# --------------------------------------------------------------------------- #
# Chiffres servis.
def test_vitesse_exigee_et_enveloppe():
    course = _course()
    a = assess_target(20.0, course, _twin(coef=10.0, alpha=0.18), _prediction(course, 20.0), CFG)
    # même base que Prediction.v_kmh (deq / temps) → comparaison terme à terme légitime
    assert a.required_v_kmh == pytest.approx(course.deq_km / 20.0, rel=1e-9)
    assert a.envelope_v_kmh == pytest.approx(10.0 * (20.0 * 3600) ** -0.18 * 3.6, rel=1e-9)
    assert a.envelope_fraction == pytest.approx(a.required_v_kmh / a.envelope_v_kmh, rel=1e-9)
    assert a.vc_fraction == pytest.approx(a.required_v_kmh / (2.9 * 3.6), rel=1e-9)


def test_enveloppe_absente_ne_casse_rien():
    """Jumeau sans exposant ajusté : l'enveloppe est muette, le verdict tient quand même."""
    course = _course()
    twin = _twin()
    twin.alpha = None
    a = assess_target(19.5, course, twin, _prediction(course, 20.0), CFG)
    assert a.envelope_v_kmh is None and a.envelope_fraction is None
    assert a.regime == NOMINAL


def test_enveloppe_depassee_est_signalee():
    """L'enveloppe n'DÉCIDE pas (les bandes décident) mais elle EXPLIQUE."""
    course = _course()
    a = assess_target(19.5, course, _twin(coef=1.0), _prediction(course, 20.0), CFG)
    assert a.envelope_fraction > 1.0
    assert any("enveloppe d'endurance" in r for r in a.reasons)
    assert a.regime == NOMINAL      # le régime reste celui des bandes


def test_cible_negative_refusee():
    with pytest.raises(ValueError):
        assess_target(0.0, _course(), _twin(), _prediction(_course(), 20.0), CFG)


def test_to_dict_serialisable():
    course = _course()
    d = assess_target(19.5, course, _twin(), _prediction(course, 20.0), CFG).to_dict()
    assert d["regime"] == NOMINAL and d["plan_ok"] is True
    assert isinstance(d["reasons"], list)
    import json

    json.dumps(d)   # aucun type numpy ne doit fuiter vers le rapport/l'API
