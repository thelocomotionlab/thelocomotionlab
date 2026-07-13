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


def _scenario(cfg=CFG):
    race = RaceSpec(
        "Course Test 100M", (0.0, 5.0, 10.0), ("Base", "Sommet", "Arrivée"),
        start_time=datetime(2026, 9, 25, 13, 0, tzinfo=timezone(timedelta(hours=2))),
        lat=43.703, lon=7.266, tz_offset_h=2.0, major_base_indices=(0,),
    )
    course = build_course(_triangle_gpx(), race, cfg)

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
    cal = build_calibration(twin, cfg)
    pred = predict_finish(course.deq_km, course.dplus_per_km, twin, cal, cfg)
    plan = build_pacing(course, pred, race, cfg)
    suf = assess_sufficiency(twin, cal, pred, cfg)
    return course, twin, cal, pred, plan, race, suf


def _context(cfg=CFG):
    course, twin, cal, pred, plan, race, suf = _scenario(cfg)
    return build_report_context(course=course, twin=twin, calibration=cal, prediction=pred,
                                plan=plan, race=race, sufficiency=suf, cfg=cfg, athlete="Valentin & co")


def test_render_has_no_unresolved_placeholders():
    tex = render_tex(_context())
    for token in ("<<", ">>", "<%", "%>", "<#", "#>"):
        assert token not in tex, f"délimiteur Jinja résiduel: {token}"
    assert "\\begin{document}" in tex and "\\end{document}" in tex
    assert "Valentin \\& co" in tex          # nom échappé pour LaTeX


def test_vc_low_conditions_intensity_claim():
    """L'affirmation « le moteur n'est pas la limite » dépend de l'intensité calculée."""
    ctx = _context()
    low = render_tex({**ctx, "vc_low": True})
    high = render_tex({**ctx, "vc_low": False})
    assert "ana\\'erobie" in low and "ana\\'erobie" not in high
    assert "restent d\\'ecisives" in high


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


def test_report_date_is_real_and_injectable():
    """R1 : plus de date figée — défaut = aujourd'hui, injectable pour un replay/test."""
    from datetime import datetime

    ctx = _context()
    assert ctx["report_date"] == datetime.now().strftime("%d/%m/%Y")

    course, twin, cal, pred, plan, race, suf = _scenario()
    ctx2 = build_report_context(course=course, twin=twin, calibration=cal, prediction=pred,
                                plan=plan, race=race, sufficiency=suf, cfg=CFG,
                                athlete="A", report_date=datetime(2031, 3, 2))
    assert ctx2["report_date"] == "02/03/2031"


def test_implausible_vc_hidden_with_honest_note():
    """R2 : VC non plausible → encadré VC masqué + note d'honnêteté (pas de mise en vedette)."""
    from dataclasses import replace as dc_replace

    course, twin, cal, pred, plan, race, suf = _scenario()
    bad = CriticalSpeed(7.0, 0.5, 1500, 300, False, 6, plausible=False)
    twin_bad = dc_replace(twin, critical_speed=bad)
    pred_bad = predict_finish(course.deq_km, course.dplus_per_km, twin_bad, cal, CFG)
    ctx = build_report_context(course=course, twin=twin_bad, calibration=cal, prediction=pred_bad,
                               plan=plan, race=race, sufficiency=suf, cfg=CFG, athlete="A")
    assert ctx["vc_kmh"] is None and ctx["vc_implausible"] is True
    assert ctx["vc_fraction_pct"] is None          # aucun « % de VC »
    tex = render_tex(ctx)
    assert "Vitesse critique non affich" in tex     # la note explique le masquage
    assert "min/km" not in tex or "\\VC =" not in tex  # pas d'encadré VC rendu


def test_abstract_uses_gate_consistent_mae():
    """R5 : la MAE affichée en tête est celle du verdict (interpolation en gate honnête)."""
    ctx = _context()
    # cohérence du contexte : sans plis d'interpolation, gate = brute
    if not ctx["cv_gate_is_interp"]:
        assert ctx["cv_gate_mae"] == ctx["cv_mae"]
    # chemin template : quand le gate est l'interpolation, l'abstract l'affiche ET garde la brute
    tex = render_tex({**ctx, "cv_gate_is_interp": True, "cv_gate_mae": "3,0",
                      "cv_extrap_mae": "9,9"})
    assert "en interpolation" in tex and "erreur brute" in tex and "9,9" in tex


def test_plan_windows_and_arrival_in_clock_time():
    """La table du plan affiche la fenêtre en HEURES DE PASSAGE, et la synthèse donne
    l'arrivée centrale + ses DEUX fenêtres (fourchette de course + bornes de sécurité)."""
    ctx = _context()
    assert ctx["arrival_clock"] and ":" in ctx["arrival_clock"]
    assert ctx["arrival_window"] and "–" in ctx["arrival_window"]
    assert ctx["arrival_safety_window"] and "–" in ctx["arrival_safety_window"]
    for row in ctx["plan_rows"]:
        assert ":" in row["window"]          # fenêtre horaire, pas des heures cumulées
    tex = render_tex(ctx)
    # la synthèse imprime les deux fourchettes, étiquetées par leur usage
    assert "fourchette de course" in tex
    assert "s\\'ecurit\\'e" in tex


def test_context_interval_labels_from_config():
    """R6 : les libellés « 80 % », « 50 % » et « 1 chance sur 10 » sont dérivés de la config."""
    ctx = _context()
    assert ctx["interval_pct"] == "80"
    assert ctx["plan_band_pct"] == "50"
    assert ctx["interval_tail_low"] == "10" and ctx["interval_tail_high"] == "10"
    tex = render_tex(ctx)
    assert "80\\,\\%" in tex             # rendu final : le libellé apparaît, injecté
    assert "50\\,\\%" in tex
    assert "chances sur 100" in tex


def test_window_day_prefix_kept_when_any_bound_crosses_midnight():
    """Correctif Montagnhard : « sam. 20:13–09:07 » laissait croire que 09:07 était samedi.
    Dès qu'UNE borne change de jour, les deux jours sont répétés ; sinon on les omet."""
    from types import SimpleNamespace

    from twin_engine.report.context import _window_str

    same = SimpleNamespace(arr_clock="sam. 22:00", arr_lo_clock="sam. 20:13",
                           arr_hi_clock="sam. 23:30", lo_h=1.0, hi_h=2.0)
    assert _window_str(same) == "20:13–23:30"
    cross = SimpleNamespace(arr_clock="sam. 23:50", arr_lo_clock="sam. 20:13",
                            arr_hi_clock="dim. 09:07", lo_h=1.0, hi_h=2.0)
    out = _window_str(cross)
    assert "sam. 20:13" in out and "dim. 09:07" in out


def test_scenario_table_gated_by_relative_width():
    """La table « trois scénarios » n'apparaît que si l'intervalle de sécurité est LARGE
    relativement à la prédiction (pacing.scenario_rel_width) — pas sur les cas étroits."""
    from dataclasses import replace

    cfg_on = replace(CFG, pacing=replace(CFG.pacing, scenario_rel_width=0.0))
    ctx_on = _context(cfg_on)
    assert ctx_on["scenario_mode"]
    assert len(ctx_on["scenario_rows"]) == len(ctx_on["plan_rows"])
    row = ctx_on["scenario_rows"][0]
    assert row["fast"] and row["central"] and row["cautious"]
    tex_on = render_tex(ctx_on)
    assert "Trois sc\\'enarios" in tex_on and "sc\\'enario prudent" in tex_on

    cfg_off = replace(CFG, pacing=replace(CFG.pacing, scenario_rel_width=99.0))
    ctx_off = _context(cfg_off)
    assert not ctx_off["scenario_mode"] and ctx_off["scenario_rows"] == []
    assert "Trois sc\\'enarios" not in render_tex(ctx_off)


def test_figures_generated(tmp_path):
    course, twin, cal, pred, plan, race, _ = _scenario()
    figs = generate_figures(course, twin, cal, pred, plan, race, tmp_path)
    for name in ("profil", "record", "demande", "pacing", "cumul", "validation"):
        assert name in figs
        assert (tmp_path / f"{name}.png").stat().st_size > 1000


def test_figures_parallel_generation_is_safe(tmp_path):
    """R7 : l'API objet matplotlib rend la génération concurrente sûre (2 jobs simultanés)."""
    import threading

    course, twin, cal, pred, plan, race, _ = _scenario()
    errors: list[Exception] = []

    def _work(sub: str) -> None:
        try:
            generate_figures(course, twin, cal, pred, plan, race, tmp_path / sub)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=_work, args=(f"d{i}",)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    for i in range(4):
        for name in ("profil", "record", "cumul"):
            assert (tmp_path / f"d{i}" / f"{name}.png").stat().st_size > 1000


@pytest.mark.skipif(shutil.which("xelatex") is None or shutil.which("biber") is None,
                    reason="XeLaTeX/biber absents (validés dans l'image Docker)")
def test_pdf_compiles(tmp_path):
    from twin_engine.report import build_pdf

    course, twin, cal, pred, plan, race, _ = _scenario()
    fig_dir = tmp_path / "figures"
    generate_figures(course, twin, cal, pred, plan, race, fig_dir)
    pdf = build_pdf(_context(), fig_dir, tmp_path / "tex")
    assert pdf.exists() and pdf.stat().st_size > 20_000  # un vrai PDF non vide
