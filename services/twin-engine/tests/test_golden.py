"""Golden test de NON-RÉGRESSION : mêmes entrées → mêmes sorties (à tolérance).

Deux niveaux :
  1. Cœur scientifique sur des entrées FIXES committées (déterministe, rapide) — garde
     toute la chaîne contre une dérive numérique accidentelle.
  2. Cas RÉEL Nice 100M (twin-theory §12) — activé quand l'archive + la trace GPX sont
     fournies via les variables d'env TWIN_NICE_ARCHIVE et TWIN_NICE_GPX (option B :
     on branche les vraies données quand elles sont là).

Références capturées depuis le code courant ; toute modification numérique les casse.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import numpy as np
import pytest

from twin_engine.calibration import build_calibration
from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.ingest import ingest_path
from twin_engine.pipeline import analyze_preview, run_preview
from twin_engine.predict import predict_finish
from twin_engine.twin.model import Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve

CFG = load_config()
FIX = Path(__file__).parent / "fixtures"
EXAMPLES = Path(__file__).parents[1] / "examples"


def _triangle(n=400, climb=1200.0, half_km=6.0):
    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(n + 1):
        x = 2 * half_km * 1000 * i / n
        ele = climb * (x / (half_km * 1000)) if x <= half_km * 1000 else climb * (2 - x / (half_km * 1000))
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


def _golden_course():
    return build_course(_triangle(), RaceSpec("Golden", (0.0, 6.0, 12.0), ("d", "s", "a")), CFG)


def test_course_geometry_golden():
    c = _golden_course()
    assert c.dplus_m == pytest.approx(1184.99, abs=0.1)
    assert c.dminus_m == pytest.approx(1184.68, abs=0.1)
    assert c.deq_km == pytest.approx(17.9082, abs=0.005)
    assert c.length_km == pytest.approx(12.0, abs=0.01)
    assert c.dplus_per_km == pytest.approx(98.76, abs=0.05)


def _plane(h, dpk):
    return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk


_ULTRAS = [(12, 50, 0.05), (20, 55, -0.08), (16, 45, 0.03), (24, 53, -0.02), (18, 52, 0.06)]


def _ultra(h, dpk, pert):
    dist = _plane(h, dpk) * h / 1.2
    return ActivitySummary("2025-06-01", "running", h * 3600, dist, (_plane(h, dpk) + pert) * h,
                           142, dpk * dist, dpk * dist, 19, True)


def test_prediction_chain_golden():
    twin = Twin(critical_speed=None, alpha=0.18, endurance_E=1.22, endurance_coef=4.2,
                durability_pct=20.0, record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=[_ultra(*u) for u in _ULTRAS])
    cal = build_calibration(twin, CFG)
    pred = predict_finish(200.1, 53.0, twin, cal, CFG)
    # régression + point fixe + Monte-Carlo (seed fixe) + LOO : tous déterministes
    assert cal.beta[0] == pytest.approx(9.06698, abs=1e-3)
    assert cal.beta[1] == pytest.approx(-0.44203, abs=1e-3)
    assert cal.beta[2] == pytest.approx(-0.02059, abs=1e-4)
    assert pred.finish_hours == pytest.approx(30.9853, abs=1e-2)
    assert pred.v_kmh == pytest.approx(6.4579, abs=1e-3)
    assert pred.interval_low_h == pytest.approx(29.8196, abs=2e-2)
    assert pred.interval_high_h == pytest.approx(32.2833, abs=2e-2)
    assert pred.cross_validation.mae_pct == pytest.approx(1.3359, abs=1e-2)


def test_full_pipeline_on_fixtures_nonregression():
    acts = []
    for f in ("sample.fit", "sample.tcx", "sample.gpx"):
        acts += ingest_path(FIX / f).running
    res = analyze_preview(acts, _golden_course(), CFG)
    assert len(acts) == 3
    # 120 s plats → ni VC ni ultras → 🔴, pas de prédiction (stable)
    assert res.sufficiency.verdict == "🔴"
    assert res.prediction is None


# --------------------------------------------------------------------------- #
# Golden RÉEL Nice 100M — activé quand les vraies données sont fournies.
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(
    not (os.environ.get("TWIN_NICE_ARCHIVE") and os.environ.get("TWIN_NICE_GPX")),
    reason="archive Coros + trace GPX Nice non fournies (TWIN_NICE_ARCHIVE / TWIN_NICE_GPX)",
)
def test_nice_100m_reference():
    """twin-theory §12 : VC 2,912 m/s · E 1,222 · prédiction 30,4 h · MAE 2,8 %."""
    race = RaceSpec.from_json(EXAMPLES / "nice-100m.json")
    gpx = Path(os.environ["TWIN_NICE_GPX"]).read_bytes()
    res = run_preview(training_path=os.environ["TWIN_NICE_ARCHIVE"], course_gpx=gpx,
                      race=race, cfg=CFG, purge_source=False)
    course = res.course
    twin = res.twin
    pred = res.prediction
    assert course.deq_km == pytest.approx(200.1, abs=3.0)
    assert course.dplus_m == pytest.approx(8874, abs=150)
    assert twin.vc_ms == pytest.approx(2.912, abs=0.08)
    assert twin.endurance_E == pytest.approx(1.222, abs=0.05)
    assert pred is not None
    assert pred.finish_hours == pytest.approx(30.4, rel=0.04)        # ±4 %
    assert pred.cross_validation.mae_pct == pytest.approx(2.8, abs=2.0)
