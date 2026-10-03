"""La marche prévue en descente dans la colonne « Sur ce segment ».

Le scénario du rapport v3 sur un parcours plus raide (montée puis descente à 10 %) : le
jumeau porte un modèle de marche ; sous ``report.consignes_marche``, la consigne va au
segment libre où la marche prévue est la plus longue, et nulle part ailleurs.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_report_v3 import D0, ULTRAS, _run, _triangle_gpx, _ultra, race_spec  # noqa: E402

from twin_engine.calibration import build_calibration  # noqa: E402
from twin_engine.config import load_config, override_config  # noqa: E402
from twin_engine.course import build_course  # noqa: E402
from twin_engine.pacing import build_pacing  # noqa: E402
from twin_engine.predict import predict_finish  # noqa: E402
from twin_engine.report.context import build_report_context  # noqa: E402
from twin_engine.sufficiency import assess_sufficiency  # noqa: E402
from twin_engine.twin.model import CriticalSpeed, Twin  # noqa: E402
from twin_engine.twin.record import RecordCurve, RecordPoint  # noqa: E402

CFG = load_config()
MARCHE = {"marche": {"intercepts": [-0.5, -1.0, -1.5, -2.0], "dminus_par_km": 0.4, "nuit": 0.5}}


def _scenario(cfg):
    race = race_spec()
    course = build_course(_triangle_gpx(climb_m=5000.0), race, cfg)
    durs = np.array(cfg.twin.record_durations_s, float)
    vga = 4.2 * np.maximum(durs, 1) ** (-0.18)
    points = [RecordPoint(int(T), float(vga[i]), float(vga[i]), "2025-06-01", bool(600 <= T <= 5400))
              for i, T in enumerate(durs)]
    rec = RecordCurve(durs, vga, vga.copy(), points)
    summaries = [_run(int(i * 300 / 130), 3600) for i in range(130)]
    summaries += [_ultra(*u) for u in ULTRAS] + [_run(300, 3600)]
    twin = Twin(critical_speed=CriticalSpeed(2.9, 0.12, 1500, 300, True, 6), alpha=0.18,
                endurance_E=1.22, endurance_coef=4.2, durability_pct=20.0, record=rec,
                summaries=summaries)
    twin.terrain = MARCHE
    cal = build_calibration(twin, cfg)
    pred = predict_finish(course.deq_km, course.dplus_per_km, twin, cal, cfg)
    plan = build_pacing(course, pred, race, cfg)
    suf = assess_sufficiency(twin, cal, pred, cfg, analysis_date=D0 + timedelta(days=301))
    ctx = build_report_context(course=course, twin=twin, calibration=cal, prediction=pred, plan=plan,
                               race=race, sufficiency=suf, cfg=cfg, athlete="Camille",
                               report_ref="LL-TWIN-MARCHE", report_date=datetime(2026, 9, 16, 10, 0))
    return ctx, (course, twin, cal, pred, plan, race, suf)


def _marche(consignes) -> list[int]:
    return [i for i, c in enumerate(consignes) if "prévues à la marche" in c]


def test_the_walking_instruction_lands_on_one_free_segment_and_only_under_its_setting():
    ctx0, _ = _scenario(CFG)
    assert _marche(ctx0["consignes_plain"]) == [] and _marche(ctx0["consignes_auto_plain"]) == []
    un = override_config(CFG, "report.consignes_marche=1")
    ctx1, (course, twin, _, _, plan, _, _) = _scenario(un)
    [i] = _marche(ctx1["consignes_plain"])
    assert _marche(ctx1["consignes_auto_plain"]) == [i]
    assert ctx1["consignes_plain"][i].startswith("descentes : environ ")
    assert plan.segments[i].off1 > course.length_km / 2          # la descente est la seconde moitié
    # les autres consignes (nuit, moments, assistance) ne bougent pas
    autres0 = [c for k, c in enumerate(ctx0["consignes_plain"]) if k != i]
    autres1 = [c for k, c in enumerate(ctx1["consignes_plain"]) if k != i]
    assert autres0 == autres1
    deux = override_config(CFG, "report.consignes_marche=2")
    assert len(_marche(_scenario(deux)[0]["consignes_plain"])) == 2
