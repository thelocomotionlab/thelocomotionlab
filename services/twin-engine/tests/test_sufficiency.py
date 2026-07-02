"""Test de suffisance : verdict 🟢/🟠/🔴 et son « pourquoi » (twin-theory §10)."""

from __future__ import annotations

import math
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


def _plane(h, dpk):
    return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk


def _run(day_offset, dur_s, *, hr=True):
    return ActivitySummary(
        date=(D0 + timedelta(days=day_offset)).isoformat(), sport="running",
        duration_s=dur_s, dist_km=dur_s / 360, ga_km=dur_s / 360, avg_hr=140 if hr else None,
        dplus_m=200, dminus_m=200, decouple_pct=15 if hr else None, has_hr=hr,
    )


def _ultra(day_offset, hours, dpk, *, decouple=18):
    dur = hours * 3600
    dist_km = _plane(hours, dpk) * hours / 1.2
    return ActivitySummary(
        date=(D0 + timedelta(days=day_offset)).isoformat(), sport="running", duration_s=dur,
        dist_km=dist_km, ga_km=_plane(hours, dpk) * hours, avg_hr=140,
        dplus_m=dpk * dist_km, dminus_m=dpk * dist_km, decouple_pct=decouple, has_hr=True,
    )


def _twin(summaries):
    rec = RecordCurve(np.array([]), np.array([]), np.array([]), [])
    return Twin(critical_speed=None, alpha=0.18, endurance_E=1.22, endurance_coef=10.0,
                durability_pct=20.0, record=rec, summaries=summaries)


def _assess(summaries):
    twin = _twin(summaries)
    cal = build_calibration(twin, CFG)
    pred = predict_finish(200.0, 53.0, twin, cal, CFG)
    return assess_sufficiency(twin, cal, pred, CFG), pred


def test_green_when_everything_strong():
    # 130 sorties sur ~7 mois, toutes avec FC, + 4 vrais ultras (régression, LOO ≈ 0)
    summaries = [_run(int(i * 210 / 130), 3600) for i in range(130)]
    summaries += [_ultra(d, h, dpk) for d, (h, dpk) in
                  zip((20, 80, 140, 200), [(12, 50), (20, 55), (16, 45), (24, 53)])]
    suf, pred = _assess(summaries)
    assert pred is not None and pred.cross_validation is not None
    assert suf.verdict == GREEN and suf.sellable


def test_orange_when_few_ultras_and_medium_history():
    # ~70 sorties sur ~4 mois, 1 seul ultra → régime mélange, CV non calculable
    summaries = [_run(int(i * 120 / 70), 3600) for i in range(70)]
    summaries.append(_ultra(60, 20, 52))
    suf, _ = _assess(summaries)
    assert suf.verdict == ORANGE and suf.sellable
    # la CV non calculable ne doit PAS forcer le rouge
    cv = next(c for c in suf.criteria if "validation" in c.name)
    assert cv.level is None


def test_red_when_too_few_usable():
    summaries = [_run(i, 3600) for i in range(30)]  # < 50 exploitables, < 3 mois
    suf, _ = _assess(summaries)
    assert suf.verdict == RED and not suf.sellable


def test_red_when_prediction_impossible():
    # aucune donnée → calibration insuffisante → pas de prédiction → 🔴
    twin = Twin(critical_speed=None, alpha=None, endurance_E=None, endurance_coef=None,
                durability_pct=None, record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=[])
    cal = build_calibration(twin, CFG)
    suf = assess_sufficiency(twin, cal, None, CFG)
    assert suf.verdict == RED and not suf.sellable


def test_reasons_explain_verdict():
    suf, _ = _assess([_run(i, 3600) for i in range(30)])
    assert suf.reasons  # le « pourquoi » est renseigné
    assert any("ne vend pas" in r for r in suf.reasons)


# --------------------------------------------------------------------------- #
# T4 : CV incalculable → verdict plafonné à 🟠 (jamais 🟢 sans indice de confiance)
# --------------------------------------------------------------------------- #
def _all_green_but_no_cv():
    """1 seul vrai ultra (→ blend, CV incalculable) mais TOUT le reste 🟢."""
    summaries = [_run(int(i * 210 / 130), 3600) for i in range(130)]   # 130 sorties / ~7 mois
    summaries.append(_ultra(60, 20, 52))                               # l'unique vrai ultra
    summaries.append(_ultra(80, 16, 50, decouple=35))                  # long mais découplé (pas « vrai »)
    return summaries


def test_cv_missing_caps_verdict_at_orange():
    suf, pred = _assess(_all_green_but_no_cv())
    assert pred is not None and pred.cross_validation is None       # blend → pas de LOO
    others = [c for c in suf.criteria if "validation" not in c.name and c.level is not None]
    assert all(c.level == GREEN for c in others), [c.to_dict() for c in others]
    assert suf.verdict == ORANGE and suf.sellable                    # plafonné, mais vendable
    assert any("plafonné" in r for r in suf.reasons)


def test_cv_missing_policy_ignore_restores_old_behaviour():
    from dataclasses import replace

    cfg = replace(CFG, sufficiency=replace(CFG.sufficiency, cv_missing_policy="ignore"))
    twin = _twin(_all_green_but_no_cv())
    cal = build_calibration(twin, cfg)
    pred = predict_finish(200.0, 53.0, twin, cal, cfg)
    suf = assess_sufficiency(twin, cal, pred, cfg)
    assert suf.verdict == GREEN                                      # ancien comportement


# --------------------------------------------------------------------------- #
# C9c : les artefacts d'enregistrement ne comptent pas comme « efforts longs »
# --------------------------------------------------------------------------- #
def test_long_efforts_exclude_recording_artifacts():
    summaries = _all_green_but_no_cv()
    # 3 « montres laissées tourner » : 12 h à ~1,2 km/h ajusté
    for d in (10, 30, 50):
        summaries.append(ActivitySummary(
            date=(D0 + timedelta(days=d)).isoformat(), sport="running", duration_s=12 * 3600,
            dist_km=15, ga_km=15, avg_hr=None, dplus_m=50, dminus_m=50,
            decouple_pct=None, has_hr=False,
        ))
    suf, _ = _assess(summaries)
    crit = next(c for c in suf.criteria if "longs" in c.name)
    assert crit.value == 2                                           # les 2 vrais longs, pas 5


# --------------------------------------------------------------------------- #
# C8 : fraîcheur des données (l'« Historique » mesure l'étendue, pas la fraîcheur)
# --------------------------------------------------------------------------- #
def test_freshness_criterion_flags_stale_archive():
    from datetime import date as _date

    summaries = [_run(int(i * 210 / 130), 3600) for i in range(130)]
    summaries += [_ultra(d, h, dpk) for d, (h, dpk) in
                  zip((20, 80, 140, 200), [(12, 50), (20, 55), (16, 45), (24, 53)])]
    twin = _twin(summaries)
    cal = build_calibration(twin, CFG)
    pred = predict_finish(200.0, 53.0, twin, cal, CFG)

    # données fraîches (11 j) → critère 🟢, verdict global 🟢 conservé
    suf_fresh = assess_sufficiency(twin, cal, pred, CFG,
                                   analysis_date=_date(2025, 8, 10))
    crit = next(c for c in suf_fresh.criteria if "Fraîcheur" in c.name)
    assert crit.level == GREEN and suf_fresh.verdict == GREEN

    # archive s'arrêtant ~5 mois avant l'analyse → 🔴 (la forme du moment est inconnue)
    suf_stale = assess_sufficiency(twin, cal, pred, CFG,
                                   analysis_date=_date(2026, 1, 1))
    crit = next(c for c in suf_stale.criteria if "Fraîcheur" in c.name)
    assert crit.level == RED and suf_stale.verdict == RED

    # sans date d'analyse (appel direct, compat) : critère absent, comportement historique
    suf_none = assess_sufficiency(twin, cal, pred, CFG)
    assert all("Fraîcheur" not in c.name for c in suf_none.criteria)

    # seuils ≤ 0 → désactivé même avec date
    from dataclasses import replace as _replace
    cfg_off = _replace(CFG, sufficiency=_replace(CFG.sufficiency, freshness_days_green=0.0))
    suf_off = assess_sufficiency(twin, cal, pred, cfg_off, analysis_date=_date(2026, 1, 1))
    assert all("Fraîcheur" not in c.name for c in suf_off.criteria)


# --------------------------------------------------------------------------- #
# T5 : la qualité mesure aussi la fraction d'activités AVEC altitude
# --------------------------------------------------------------------------- #
def test_quality_degrades_when_altitude_missing():
    def _run_alt(day, has_altitude):
        return ActivitySummary(
            date=(D0 + timedelta(days=day)).isoformat(), sport="running", duration_s=3600,
            dist_km=10, ga_km=10, avg_hr=140, dplus_m=200, dminus_m=200,
            decouple_pct=15, has_hr=True, has_altitude=has_altitude,
        )

    # 90 % des activités SANS altitude → qualité 🔴 malgré la FC partout
    summaries = [_run_alt(i, i % 10 == 0) for i in range(60)]
    summaries += [_ultra(d, h, dpk) for d, (h, dpk) in
                  zip((20, 80, 140, 200), [(12, 50), (20, 55), (16, 45), (24, 53)])]
    suf, _ = _assess(summaries)
    crit = next(c for c in suf.criteria if "Qualité" in c.name)
    assert crit.level == RED
    assert "altitude" in crit.detail

    # altitude partout → 🟢 (et le détail l'affiche)
    summaries_ok = [_run_alt(i, True) for i in range(60)]
    summaries_ok += [_ultra(d, h, dpk) for d, (h, dpk) in
                     zip((20, 80, 140, 200), [(12, 50), (20, 55), (16, 45), (24, 53)])]
    suf_ok, _ = _assess(summaries_ok)
    crit_ok = next(c for c in suf_ok.criteria if "Qualité" in c.name)
    assert crit_ok.level == GREEN
