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
# anciens défauts (jusqu'à la Décision 1 du chantier v2, 2026-09-16) : le rollback nommé
HIST = load_config(EXAMPLES / "twin.config.historique.json")


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


def _golden_twin():
    return Twin(critical_speed=None, alpha=0.18, endurance_E=1.22, endurance_coef=4.2,
                durability_pct=20.0, record=RecordCurve(np.array([]), np.array([]), np.array([]), []),
                summaries=[_ultra(*u) for u in _ULTRAS])


def test_prediction_chain_golden():
    """Défauts servis depuis la Décision 1 du chantier v2 (2026-09-16) : lien log, prior sur
    la pente (α du jumeau ici, l'efficacité-durée n'étant pas mesurable sur cinq agrégats),
    échelle studentisée. Recapturé ce jour ; les anciens défauts gardent leurs valeurs dans
    ``test_prediction_chain_golden_historique`` (DIAGNOSTIC §10.16)."""
    twin = _golden_twin()
    cal = build_calibration(twin, CFG)
    pred = predict_finish(200.1, 53.0, twin, cal, CFG)
    assert cal.link == "log" and cal.duration_prior == (-0.18, 2.0)
    assert cal.duration_prior_origin == "twin_alpha"          # α_eff absent ⇒ α du jumeau
    assert cal.beta[0] == pytest.approx(2.43688, abs=1e-3)
    assert cal.beta[1] == pytest.approx(-0.16844, abs=1e-3)
    assert cal.beta[2] == pytest.approx(-0.00088, abs=1e-4)
    assert pred.finish_hours == pytest.approx(33.0471, abs=1e-2)
    assert pred.v_kmh == pytest.approx(6.0550, abs=1e-3)
    # bandes servies STUDENTISÉES (A3) : κ = RMS des scores, Student à ν = n_eff − 3 = 2
    assert pred.interval_source == "studentized_scale"
    assert pred.scale_dof == pytest.approx(2.0, abs=1e-6)
    assert pred.scale_kappa == pytest.approx(0.7675, abs=2e-3)
    assert pred.interval_low_h == pytest.approx(30.7999, abs=2e-2)
    assert pred.interval_high_h == pytest.approx(35.4583, abs=2e-2)
    assert pred.plan_low_h == pytest.approx(32.0546, abs=2e-2)
    assert pred.plan_high_h == pytest.approx(34.0704, abs=2e-2)
    assert pred.cross_validation.mae_pct == pytest.approx(2.6326, abs=1e-2)


def test_prediction_chain_golden_historique():
    """Le rollback nommé (``examples/twin.config.historique.json``) rend au chiffre près les
    défauts servis jusqu'à la Décision 1 : lien linéaire, pente libre, bandes conformes.
    Re-capturé le 2026-07-03 (terrain_term=prior_shrunk) : β2 tiré de −0.02059 vers le prior
    −0.0170 (λ=50), MAE LOO 1.34 → 0.74 ; valeurs libres (terrain_term=free, 2026-07-02) :
    β 9.06698/−0.44203/−0.02059, 30.9853 h, [29.1424, 33.5271], MAE 1.3359."""
    twin = _golden_twin()
    cal = build_calibration(twin, HIST)
    pred = predict_finish(200.1, 53.0, twin, cal, HIST)
    assert cal.beta[0] == pytest.approx(9.01097, abs=1e-3)
    assert cal.beta[1] == pytest.approx(-0.45744, abs=1e-3)
    assert cal.beta[2] == pytest.approx(-0.01863, abs=1e-4)
    assert pred.finish_hours == pytest.approx(31.0103, abs=1e-2)
    assert pred.v_kmh == pytest.approx(6.4527, abs=1e-3)
    # (Percentiles MC prédictif, interval_source=mc : sécurité [29.1876, 33.4840].)
    assert pred.interval_source == "conformal_normalized"
    assert pred.interval_low_h == pytest.approx(30.3839, abs=2e-2)
    assert pred.interval_high_h == pytest.approx(31.6368, abs=2e-2)
    assert pred.plan_low_h == pytest.approx(30.8070, abs=2e-2)
    assert pred.plan_high_h == pytest.approx(31.2136, abs=2e-2)
    assert pred.cross_validation.mae_pct == pytest.approx(0.7430, abs=1e-2)


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
    """twin-theory §12 (recapture 2026-09-16, Décision 1 du chantier v2, archive fraîche
    dédoublonnée) : VC 2,708 m/s · E 1,167 · durabilité 19,1 % · 32,43 h · LOO 6,4 %.

    Deux causes d'écart avec la référence de juillet (VC 2,952 · E 1,244 · 31,28 h · MAE
    3,1 %, archive de 449 activités), séparées en DIAGNOSTIC §10.16 : l'ARCHIVE (918 activités
    uniques sur 55 mois) explique VC, E et durabilité ; les DÉFAUTS (lien log, prior sur la
    pente lu sur l'efficacité-durée, échelle studentisée) expliquent le central et les bandes
    (32,33 h sous les anciens défauts sur la même archive). L'historique pré-C1 (VC 2,912 ·
    E 1,222 · 30,4 h · MAE 2,8 %) reste lisible dans l'historique git."""
    race = RaceSpec.from_json(EXAMPLES / "nice-100m.json")
    gpx = Path(os.environ["TWIN_NICE_GPX"]).read_bytes()
    res = run_preview(training_path=os.environ["TWIN_NICE_ARCHIVE"], course_gpx=gpx,
                      race=race, cfg=CFG, purge_source=False)
    course = res.course
    twin = res.twin
    pred = res.prediction
    assert course.deq_km == pytest.approx(200.1, abs=3.0)
    assert course.dplus_m == pytest.approx(8874, abs=150)
    assert twin.vc_ms == pytest.approx(2.708, abs=0.08)
    assert twin.endurance_E == pytest.approx(1.167, abs=0.05)
    assert twin.durability_pct == pytest.approx(19, abs=8)          # §2.6 : 19,1 %
    assert twin.alpha_eff == pytest.approx(0.067, abs=0.02)
    assert res.calibration.link == "log" and res.calibration.duration_prior_origin == "efficiency"
    assert pred is not None
    assert pred.interval_source == "studentized_scale"
    assert pred.finish_hours == pytest.approx(32.43, rel=0.04)       # ±4 %
    assert pred.interval_low_h == pytest.approx(28.69, rel=0.06)
    assert pred.interval_high_h == pytest.approx(36.65, rel=0.06)
    assert pred.cross_validation.mae_pct == pytest.approx(6.4, abs=2.0)
