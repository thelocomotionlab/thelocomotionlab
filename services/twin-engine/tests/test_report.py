"""Rapport : substitution complète, figures, et compilation PDF réelle (si XeLaTeX)."""

from __future__ import annotations

import math
import shutil
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from twin_engine.calibration import build_calibration
from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.pacing import build_pacing
from twin_engine.predict import predict_finish
from twin_engine.report import build_report_context, generate_figures, render_tex
from twin_engine.sufficiency import assess_sufficiency
from twin_engine.twin.model import CriticalSpeed, Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve, RecordPoint

CFG = load_config()


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


def _plane(h, dpk):
    return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk


def _scenario():
    race = RaceSpec(
        "Course Test 100M", (0.0, 5.0, 10.0), ("Base", "Sommet", "Arrivée"),
        start_time=datetime(2026, 9, 25, 13, 0, tzinfo=timezone(timedelta(hours=2))),
        lat=43.703, lon=7.266, tz_offset_h=2.0, major_base_indices=(0,),
    )
    course = build_course(_triangle_gpx(), race, CFG)

    # courbe record plausible pour la figure
    durs = np.array(CFG.twin.record_durations_s, float)
    vga = 4.2 * np.maximum(durs, 1) ** (-0.18)
    points = [RecordPoint(int(T), float(vga[i]), float(vga[i]),
                          "2025-06-01", bool(600 <= T <= 5400)) for i, T in enumerate(durs)]
    rec = RecordCurve(durs, vga, vga.copy(), points)

    summaries = [
        ActivitySummary("2025-01-10", "running", 3600, 10, 10, 145, 200, 200, None, True),
        ActivitySummary("2025-03-10", "running", 5400, 15, 15, 150, 300, 300, 17, True),
    ]
    for d, (h, dpk) in zip(("2025-02", "2025-04", "2025-06", "2025-08"),
                           [(12, 50), (20, 55), (16, 45), (24, 53)]):
        dist = _plane(h, dpk) * h / 1.2
        summaries.append(ActivitySummary(f"{d}-01", "running", h * 3600, dist,
                                          _plane(h, dpk) * h, 142, dpk * dist, dpk * dist, 19, True))

    twin = Twin(critical_speed=CriticalSpeed(2.9, 0.12, 1500, 300, True, 6),
                alpha=0.18, endurance_E=1.22, endurance_coef=4.2, durability_pct=20.0,
                record=rec, summaries=summaries)
    cal = build_calibration(twin, CFG)
    pred = predict_finish(course.deq_km, course.dplus_per_km, twin, cal, CFG)
    plan = build_pacing(course, pred, race, CFG)
    suf = assess_sufficiency(twin, cal, pred, CFG)
    return course, twin, cal, pred, plan, race, suf


def _context():
    course, twin, cal, pred, plan, race, suf = _scenario()
    return build_report_context(course=course, twin=twin, calibration=cal, prediction=pred,
                                plan=plan, race=race, sufficiency=suf, athlete="Valentin & co")


def test_render_has_no_unresolved_placeholders():
    tex = render_tex(_context())
    for token in ("<<", ">>", "<%", "%>", "<#", "#>"):
        assert token not in tex, f"délimiteur Jinja résiduel: {token}"
    assert "\\begin{document}" in tex and "\\end{document}" in tex
    assert "Valentin \\& co" in tex          # nom échappé pour LaTeX


def test_context_french_date_and_new_fields():
    ctx = _context()
    # date FR, minuscule, format demandé
    assert ctx["start_time"] == "vendredi 25 septembre 2026 à 13h00"
    # volume récent (les résumés sont datés)
    assert ctx["recent_weeks"] and "km" in ctx["recent_weeks"][0]
    # colonnes cumulées dans la table de demande
    assert "cum_dist" in ctx["demande_rows"][0]
    last = ctx["demande_rows"][-1]
    assert "cum_dplus" in last and "cum_dminus" in last


def test_night_span_is_contiguous_not_minmax():
    """Régression : la nuit ne doit pas s'étaler du 1er au dernier segment de nuit isolés."""
    from types import SimpleNamespace

    from twin_engine.report.context import _main_night_span

    segs = [SimpleNamespace(off1=k, night=n) for k, n in
            [(10, False), (20, True), (30, True), (40, False), (90, True)]]
    # plus long passage contigu = [20,30] → (20, 30), pas (20, 90)
    assert _main_night_span(SimpleNamespace(segments=segs)) == (20, 30)


def test_figures_generated(tmp_path):
    course, twin, cal, pred, plan, race, _ = _scenario()
    figs = generate_figures(course, twin, cal, pred, plan, race, tmp_path)
    for name in ("profil", "record", "demande", "pacing", "cumul", "validation"):
        assert name in figs
        assert (tmp_path / f"{name}.png").stat().st_size > 1000


@pytest.mark.skipif(shutil.which("xelatex") is None or shutil.which("biber") is None,
                    reason="XeLaTeX/biber absents (validés dans l'image Docker)")
def test_pdf_compiles(tmp_path):
    from twin_engine.report import build_pdf

    course, twin, cal, pred, plan, race, _ = _scenario()
    fig_dir = tmp_path / "figures"
    generate_figures(course, twin, cal, pred, plan, race, fig_dir)
    pdf = build_pdf(_context(), fig_dir, tmp_path / "tex")
    assert pdf.exists() and pdf.stat().st_size > 20_000  # un vrai PDF non vide
