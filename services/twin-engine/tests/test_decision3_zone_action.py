"""Décision 3 (DIAGNOSTIC §10.18) : le 🟢 est servi dans la seule zone d'action mesurée au banc —
parcours dans le domaine, au moins trois vrais ultras dont un avec FC, données fraîches. En
dessous, 🟠 au mieux : on vend, on prévient. Un plafond (``sufficiency.green_policy``), aucun
critère recâblé ; ``criteria`` restaure l'ancien comportement."""

from __future__ import annotations

import json
import math
from dataclasses import replace
from datetime import date, timedelta

import numpy as np

from twin_engine.calibration import build_calibration
from twin_engine.config import load_config
from twin_engine.predict import predict_finish
from twin_engine.sufficiency import GREEN, ORANGE, RED, assess_sufficiency
from twin_engine.twin.model import Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve

CFG = load_config()
D0 = date(2025, 1, 1)
FRESH = D0 + timedelta(days=301)          # le lendemain de la dernière sortie


def _plane(h, dpk):
    return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk


def _run(day_offset, dur_s):
    return ActivitySummary(
        date=(D0 + timedelta(days=day_offset)).isoformat(), sport="running",
        duration_s=dur_s, dist_km=dur_s / 360, ga_km=dur_s / 360, avg_hr=140,
        dplus_m=200, dminus_m=200, decouple_pct=15, has_hr=True,
    )


def _ultra(day_offset, hours, dpk, *, hr=True):
    dur = hours * 3600
    dist_km = _plane(hours, dpk) * hours / 1.2
    return ActivitySummary(
        date=(D0 + timedelta(days=day_offset)).isoformat(), sport="running", duration_s=dur,
        dist_km=dist_km, ga_km=_plane(hours, dpk) * hours, avg_hr=140 if hr else None,
        dplus_m=dpk * dist_km, dminus_m=dpk * dist_km, decouple_pct=18 if hr else None,
        has_hr=hr,
    )


def _twin(summaries):
    rec = RecordCurve(np.array([]), np.array([]), np.array([]), [])
    return Twin(critical_speed=None, alpha=0.18, endurance_E=1.22, endurance_coef=10.0,
                durability_pct=20.0, record=rec, summaries=summaries)


def _cfg(**sufficiency):
    return replace(CFG, sufficiency=replace(CFG.sufficiency, **sufficiency))


ULTRAS = ((20, 12, 50), (80, 20, 55), (140, 16, 45), (200, 24, 53))


def _archive(*, hr_ultras=True, ultras=ULTRAS):
    runs = [_run(int(i * 300 / 130), 3600) for i in range(130)]
    return runs + [_ultra(d, h, dpk, hr=hr_ultras) for d, h, dpk in ultras] + [_run(300, 3600)]


def _assess(summaries, cfg=None, *, deq=200.0, analysis_date=FRESH):
    cfg = cfg or CFG
    twin = _twin(summaries)
    cal = build_calibration(twin, cfg)
    pred = predict_finish(deq, 53.0, twin, cal, cfg)
    return assess_sufficiency(twin, cal, pred, cfg, analysis_date=analysis_date)


def test_zone_action_complete_donne_le_vert():
    suf = _assess(_archive())
    assert suf.verdict == GREEN and suf.sellable
    assert not any("zone d'action" in r for r in suf.reasons)


def test_sans_fc_sur_les_ultras_le_vert_devient_orange():
    """Quatre vrais ultras, tous sans FC : durabilité, coût de pente et efficacité-durée ne
    peuvent pas être mesurés — 🟠, vendu, avec le pourquoi."""
    suf = _assess(_archive(hr_ultras=False))
    assert suf.verdict == ORANGE and suf.sellable
    reason = next(r for r in suf.reasons if "zone d'action" in r)
    assert "4 vrai(s) ultra(s) dont 0 avec FC" in reason
    # aucun critère n'a bougé : le pire des critères évalués reste 🟢
    evaluated = [c.level for c in suf.criteria if c.level is not None]
    assert min(evaluated, key=lambda lv: {RED: 0, ORANGE: 1, GREEN: 2}[lv]) == GREEN


def test_fraicheur_non_evaluee_plafonne():
    suf = _assess(_archive(), analysis_date=None)
    assert suf.verdict == ORANGE
    assert any("fraîcheur des données non évaluée" in r for r in suf.reasons)


def test_parcours_hors_domaine_sans_garde_ne_donne_jamais_le_vert():
    """Garde du domaine désactivée (rollback) : le parcours court n'est plus refusé, mais il
    n'obtient pas le 🟢 — la confiance n'est mesurée que dans le domaine."""
    cfg = _cfg(domain_gate="off")
    suf = _assess(_archive(), cfg, deq=45.0)
    assert not [c for c in suf.criteria if c.name == "Domaine de calibration"]
    assert suf.domain is not None and suf.domain.below
    assert suf.verdict == ORANGE
    assert any("hors du domaine" in r for r in suf.reasons)


def test_moins_de_trois_ultras_plafonne_meme_sans_le_plafond_cv():
    """Deux vrais ultras longs (les « efforts longs proches de la cible » restent 🟢) et le
    plafond CV désactivé : seul le plafond de la zone d'action retient le 🟢."""
    cfg = _cfg(cv_missing_policy="ignore")
    suf = _assess(_archive(ultras=ULTRAS[1::2]), cfg)
    assert suf.verdict == ORANGE
    assert any("2 vrai(s) ultra(s)" in r for r in suf.reasons)


def test_politique_criteria_restaure_l_ancien_comportement():
    suf = _assess(_archive(hr_ultras=False), _cfg(green_policy="criteria"))
    assert suf.verdict == GREEN


def test_seuils_configurables_et_serialisation():
    suf = _assess(_archive(), _cfg(green_min_genuine=5))
    assert suf.verdict == ORANGE and "il en faut 5" in " ".join(suf.reasons)
    json.dumps(suf.to_dict())
