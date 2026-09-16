"""Décision 2 (DIAGNOSTIC §10.17) : la garde du domaine lit la DEMANDE du parcours, jamais la
sortie du modèle — durée attendue = Deq ÷ vitesse de référence de l'athlète, contre le seuil
du domaine majoré d'une marge. Réplique du cas E1 (Crasse · Lut 36k 2021 : 3,5 h réels,
prédite 10,06 h sous la queue d'enveloppe, vendue 🟠 à +185 % parce que la garde lisait le
temps prédit)."""

from __future__ import annotations

import json
import math
from dataclasses import replace
from datetime import date, timedelta

import numpy as np
import pytest

from tools.registre import garde_domaine, summarize, tableau_markdown
from twin_engine.calibration import build_calibration, domain_demand, genuine_floor_kmh
from twin_engine.config import load_config
from twin_engine.predict import predict_finish
from twin_engine.sufficiency import RED, assess_sufficiency
from twin_engine.twin.model import Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve

CFG = load_config()
D0 = date(2025, 1, 1)
MIN_H = CFG.calibration.genuine_min_hours          # 10 h
FLOOR = CFG.calibration.genuine_min_ga_kmh         # 5,5 km/h


def _plane(h, dpk):
    return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk


def _run(day_offset, dur_s):
    return ActivitySummary(
        date=(D0 + timedelta(days=day_offset)).isoformat(), sport="running",
        duration_s=dur_s, dist_km=dur_s / 360, ga_km=dur_s / 360, avg_hr=140,
        dplus_m=200, dminus_m=200, decouple_pct=15, has_hr=True,
    )


def _ultra(day_offset, hours, dpk):
    dur = hours * 3600
    dist_km = _plane(hours, dpk) * hours / 1.2
    return ActivitySummary(
        date=(D0 + timedelta(days=day_offset)).isoformat(), sport="running", duration_s=dur,
        dist_km=dist_km, ga_km=_plane(hours, dpk) * hours, avg_hr=140,
        dplus_m=dpk * dist_km, dminus_m=dpk * dist_km, decouple_pct=18, has_hr=True,
    )


def _twin(summaries, *, coef=10.0, alpha=0.18):
    rec = RecordCurve(np.array([]), np.array([]), np.array([]), [])
    return Twin(critical_speed=None, alpha=alpha, endurance_E=1.22, endurance_coef=coef,
                durability_pct=20.0, record=rec, summaries=summaries)


def _cfg(**sufficiency):
    return replace(CFG, sufficiency=replace(CFG.sufficiency, **sufficiency))


def _domain_criteria(suf):
    return [c for c in suf.criteria if c.name == "Domaine de calibration"]


ARCHIVE_SANS_ULTRA = [_run(i * 3, 3600) for i in range(120)]
ULTRAS = [_ultra(30, 12, 50), _ultra(120, 20, 55), _ultra(200, 16, 45), _ultra(300, 24, 53)]


# --------------------------------------------------------------------------- #
# Le cas E1 : refusé par la demande, laissé passer par la prédiction.
def test_replique_e1_refusee_par_la_demande_et_non_par_la_prediction():
    """Athlète sans vrai ultra dont l'enveloppe prédit ≈ 10,7 h pour 39 km-équivalent : la
    lecture historique (temps prédit ≥ 10 h) laisse passer, la demande (39 km-éq ÷ 5,5 km/h
    ≈ 7 h) refuse. Un seuil sur la prédiction se déplace avec le modèle, la demande non."""
    twin = _twin(ARCHIVE_SANS_ULTRA, coef=7.8)
    cal = build_calibration(twin, CFG)
    pred = predict_finish(39.4, 30.0, twin, cal, CFG)
    assert pred is not None and MIN_H <= pred.finish_hours < 12.0     # prédite « dans » le domaine

    for gate in ("predicted", "on"):
        suf_pred = assess_sufficiency(twin, cal, pred, _cfg(domain_gate=gate))
        assert not _domain_criteria(suf_pred) and suf_pred.domain is None

    suf = assess_sufficiency(twin, cal, pred, CFG)                      # défaut servi : demand
    dom = _domain_criteria(suf)
    assert dom and dom[0].level == RED
    assert suf.verdict == RED and suf.sellable is False
    assert suf.domain is not None and suf.domain.below
    assert suf.domain.origin == "plancher" and suf.domain.n_ultras == 0
    assert suf.domain.v_ref_kmh == pytest.approx(FLOOR)
    assert suf.domain.expected_hours == pytest.approx(39.4 / FLOOR, rel=1e-9)
    assert suf.domain.threshold_hours == pytest.approx(MIN_H * 1.05)
    assert dom[0].value == round(suf.domain.expected_hours, 1)
    assert "aucun vrai ultra" in dom[0].detail
    assert any("Parcours plus court que le domaine" in r for r in suf.reasons)

    suf_off = assess_sufficiency(twin, cal, pred, _cfg(domain_gate="off"))
    assert not _domain_criteria(suf_off) and suf_off.domain is None


# --------------------------------------------------------------------------- #
# Dans le domaine : rien ne change ; à la frontière, la marge tranche.
def test_dans_le_domaine_passe_et_la_marge_tranche_a_la_frontiere():
    twin = _twin(ARCHIVE_SANS_ULTRA + ULTRAS)
    cal = build_calibration(twin, CFG)
    median = float(np.median([u.ga_km / (u.duration_s / 3600.0) for u in ULTRAS]))

    d90 = domain_demand(90.0, twin, CFG)
    assert d90.origin == "ultras" and d90.n_ultras == 4
    assert d90.v_ref_kmh == pytest.approx(median)
    assert d90.expected_hours == pytest.approx(90.0 / median)
    assert d90.threshold_hours == pytest.approx(10.5) and not d90.below

    pred = predict_finish(90.0, 50.0, twin, cal, CFG)
    suf = assess_sufficiency(twin, cal, pred, CFG)
    assert not _domain_criteria(suf)
    assert suf.domain is not None and not suf.domain.below           # lu, consigné, pas bloquant
    assert suf.domain.deq_km == pytest.approx(pred.deq_km)

    # 70 km-éq ≈ 10,4 h attendues : refusé sous la marge de 5 %, accepté sans marge
    d70 = domain_demand(70.0, twin, CFG)
    assert MIN_H < d70.expected_hours < d70.threshold_hours and d70.below
    assert not domain_demand(70.0, twin, _cfg(domain_margin_pct=0.0)).below
    assert domain_demand(70.0, twin, _cfg(domain_margin_pct=20.0)).threshold_hours == pytest.approx(12.0)


def test_la_demande_ne_depend_pas_de_la_calibration():
    """Même parcours, même athlète, deux piles de calibration : la lecture du domaine est
    identique — c'est tout l'objet de la Décision 2."""
    twin = _twin(ARCHIVE_SANS_ULTRA + ULTRAS)
    hist = replace(CFG, calibration=replace(
        CFG.calibration, link="linear", duration_term="free", duration_prior_source="twin_alpha",
        envelope_tail="alpha"))
    assert domain_demand(70.0, twin, CFG).to_dict() == domain_demand(70.0, twin, hist).to_dict()


# --------------------------------------------------------------------------- #
# La vitesse de référence : plancher, médiane, enveloppe.
def test_vitesse_de_reference_plancher_mediane_et_enveloppe():
    # un vrai ultra lent admis par le plancher de Riegel (30 h à 4,8 km/h) : la médiane est
    # relevée au plancher du domaine, la garde ne devient jamais plus laxiste que lui
    cfg_r = replace(CFG, calibration=replace(CFG.calibration, genuine_floor="riegel"))
    slow = ActivitySummary(
        date=(D0 + timedelta(days=200)).isoformat(), sport="running", duration_s=30 * 3600,
        dist_km=144.0, ga_km=144.0, avg_hr=135, dplus_m=3000, dminus_m=3000,
        decouple_pct=15, has_hr=True,
    )
    assert genuine_floor_kmh(30.0, cfg_r) < 4.8 < FLOOR
    twin = _twin([_run(i * 3, 3600) for i in range(60)] + [slow])
    d = domain_demand(100.0, twin, cfg_r)
    assert d.origin == "ultras" and d.n_ultras == 1
    assert d.v_ref_kmh == pytest.approx(genuine_floor_kmh(MIN_H, cfg_r)) == pytest.approx(FLOOR)

    # variante ``envelope`` : l'enveloppe servie à 10 h (ici sans queue : α_eff absent)
    cfg_e = replace(cfg_r, sufficiency=replace(cfg_r.sufficiency, domain_speed="envelope"))
    d_e = domain_demand(100.0, twin, cfg_e)
    assert d_e.origin == "enveloppe"
    assert d_e.v_ref_kmh == pytest.approx(10.0 * (MIN_H * 3600.0) ** -0.18 * 3.6)
    assert d_e.expected_hours == pytest.approx(100.0 / d_e.v_ref_kmh)

    # sans enveloppe (exposant absent) : repli sur la lecture observée
    twin.alpha = None
    assert domain_demand(100.0, twin, cfg_e).origin == "ultras"
    # sous le plancher fixe, l'ultra lent n'est pas un vrai ultra : plancher du domaine
    assert domain_demand(100.0, twin, CFG).origin == "plancher"


def test_serialisation_de_la_lecture():
    twin = _twin(ARCHIVE_SANS_ULTRA + ULTRAS)
    cal = build_calibration(twin, CFG)
    pred = predict_finish(90.0, 50.0, twin, cal, CFG)
    d = assess_sufficiency(twin, cal, pred, CFG).to_dict()
    assert set(d["domain"]) == {"deq_km", "v_ref_kmh", "origin", "n_ultras", "expected_hours",
                                "threshold_hours", "below"}
    json.dumps(d)


# --------------------------------------------------------------------------- #
# Le registre compte les deux lectures exigées au banc.
def _entry(athlete, race, *, below, verdict, blocking, err=5.0):
    return {
        "athlete": athlete, "dev_set": True, "race": race, "date": "2025-06-01", "dnf": False,
        "official_time_h": 25.0, "below_domain": below,
        "course": {"deq_km": 100.0},
        "model": {"verdict": verdict, "blocking": blocking, "sigma_kmh": 0.5},
        "prediction": {"central_h": 25.0 * (1 + err / 100.0), "plan_low_h": 22.0,
                       "plan_high_h": 28.0, "safety_low_h": 20.0, "safety_high_h": 30.0,
                       "err_pct": err, "sd_rel": 0.10, "in_plan": True, "in_safety": True},
    }


def test_registre_compte_les_fuites_et_les_clients_perdus():
    fuite = _entry("A", "50k", below=True, verdict="🟠", blocking=[], err=150.0)
    perdu = _entry("A", "100k", below=False, verdict="🔴", blocking=["Domaine de calibration"])
    juste = _entry("B", "100m", below=False, verdict="🟢", blocking=[])
    refus_double = _entry("B", "90k", below=False, verdict="🔴",
                          blocking=["Domaine de calibration", "Qualité (FC / altitude / distance)"])
    refus_hors = _entry("B", "40k", below=True, verdict="🔴", blocking=["Domaine de calibration"])
    entries = [fuite, perdu, juste, refus_double, refus_hors]
    g = garde_domaine(entries)
    assert g["hors_domaine_vendus"] == 1 and g["dans_domaine_refuses_seul_motif"] == 1
    assert g["cas"] == ["A · 50k (vendu hors domaine)", "A · 100k (refusé dans le domaine)"]
    assert summarize(entries)["garde_domaine"] == g
    assert "hors domaine vendus 1 · dans le domaine refusés pour ce seul motif 1" in tableau_markdown(entries)
    assert garde_domaine([juste, refus_hors])["cas"] == []
