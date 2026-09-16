"""Rapport v2 (Phase 6) : six pages sur un scénario déterministe, livrables (fiche, bracelet,
ICS, GPX, annexe), charte (tokens et polices), et la règle « aucun chiffre en dur sur les deux
premières pages »."""

from __future__ import annotations

import json
import math
import re
import shutil
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest

from twin_engine.calibration import build_calibration
from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.pacing import build_pacing
from twin_engine.predict import predict_finish
from twin_engine.report import (build_document, build_pdf, build_report_context, generate_figures,
                                render_template, render_tex, write_livrables)
from twin_engine.report.charte import CLS_COLORS, FONT_FILES, TOKENS, hexa
from twin_engine.report.livrables import (crew_indices, crew_points, finish_point, gpx_text,
                                          ics_text)
from twin_engine.report.render import BRACELET_TEMPLATE, FICHE_TEMPLATE
from twin_engine.sufficiency import GREEN, assess_sufficiency
from twin_engine.twin.model import CriticalSpeed, Twin
from twin_engine.twin.record import ActivitySummary, RecordCurve, RecordPoint

CFG = load_config()
HAS_TEX = shutil.which("xelatex") is not None and shutil.which("biber") is not None
TEMPLATE_DIR = Path(__file__).parents[1] / "src" / "twin_engine" / "report" / "latex" / "template"
D0 = date(2025, 1, 1)


# --------------------------------------------------------------------------- #
# Le scénario déterministe du rapport v2 : un 100 km-éq en montagne, une archive fournie,
# cinq vrais ultras avec FC, une analyse le lendemain de la dernière sortie.
def _triangle_gpx(n=800, length_m=100_000.0, climb_m=3000.0):
    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(n + 1):
        x = length_m * i / n
        half = length_m / 2
        ele = climb_m * (x / half) if x <= half else climb_m * (2 - x / half)
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0 + x / 4e6:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


def _plane(h, dpk):
    return 8.5 - 0.35 * math.log(h) - 0.0148 * dpk


def _run(day, dur_s):
    return ActivitySummary((D0 + timedelta(days=day)).isoformat(), "running", dur_s, dur_s / 360,
                           dur_s / 360, 140, 200, 200, 15, True)


def _ultra(day, h, dpk, pert):
    dist = _plane(h, dpk) * h / 1.2
    return ActivitySummary((D0 + timedelta(days=day)).isoformat(), "running", h * 3600, dist,
                           (_plane(h, dpk) + pert) * h, 142, dpk * dist, dpk * dist, 19, True)


ULTRAS = [(30, 12, 50, 0.05), (80, 20, 55, -0.08), (140, 16, 45, 0.03), (200, 24, 53, -0.02),
          (260, 18, 52, 0.06)]


def race_spec(**over) -> RaceSpec:
    base = dict(
        name="Golden 100", aid_km=(0.0, 12.0, 27.0, 41.0, 55.0, 70.0, 84.0, 100.0),
        aid_names=("Départ", "Col", "Refuge", "Base 1", "Lac", "Base 2", "Crête", "Arrivée"),
        start_time=datetime(2026, 9, 25, 13, 0, tzinfo=timezone(timedelta(hours=2))),
        lat=43.703, lon=7.266, tz_offset_h=2.0, major_base_indices=(2, 4),
        crew_access_indices=(2, 4, 5),
    )
    base.update(over)
    return RaceSpec(**base)


def scenario(cfg=CFG, race: RaceSpec | None = None):
    race = race or race_spec()
    course = build_course(_triangle_gpx(), race, cfg)
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
    cal = build_calibration(twin, cfg)
    pred = predict_finish(course.deq_km, course.dplus_per_km, twin, cal, cfg)
    plan = build_pacing(course, pred, race, cfg)
    suf = assess_sufficiency(twin, cal, pred, cfg, analysis_date=D0 + timedelta(days=301))
    return course, twin, cal, pred, plan, race, suf


def context(cfg=CFG, race=None, ref="LL-TWIN-GOLDEN01"):
    course, twin, cal, pred, plan, race, suf = scenario(cfg, race)
    ctx = build_report_context(course=course, twin=twin, calibration=cal, prediction=pred,
                               plan=plan, race=race, sufficiency=suf, cfg=cfg,
                               athlete="Camille & Léo", report_ref=ref,
                               report_date=datetime(2026, 9, 16, 10, 0))
    return ctx, (course, twin, cal, pred, plan, race, suf)


# --------------------------------------------------------------------------- #
def test_scenario_is_sold_with_full_confidence():
    _, (_, _, cal, pred, _, _, suf) = context()
    assert cal.n_genuine == 5 and pred.cross_validation is not None
    assert suf.verdict == GREEN


def test_context_v2_keys():
    ctx, (course, _, _, _, plan, race, _) = context()
    assert ctx["confidence_word"] == "confiance pleine" and ctx["confidence_color"] == "LLSuccess"
    assert ctx["cover_sentence"].startswith("Tu arrives autour de")
    assert "une course sur deux" in ctx["cover_sentence"]
    assert ctx["annex_url"].endswith("/LL-TWIN-GOLDEN01") and ctx["annex_ref"] == "LL-TWIN-GOLDEN01"
    assert ctx["report_version"] == CFG.report.version
    assert len(ctx["gauges"]) == 4 and all(0.0 <= g["fraction"] <= 1.0 for g in ctx["gauges"])
    assert len(ctx["limits"]) == 4
    assert ctx["honesty"].startswith("Sur tes 5 ultras")
    assert ctx["assumptions"][0].startswith("Arr")
    assert len(ctx["plan_rows"]) == len(plan.segments)
    for row in ctx["plan_rows"]:
        assert row["consigne"] and ":" in row["central"] and ":" in row["fast"] and ":" in row["cautious"]
    # un index d'assistance désigne le segment, qui FINIT au point suivant : 2 → « Base 1 »
    assert [r["name"] for r in ctx["crew_rows"]] == ["Base 1", "Base 2", "Crête"]
    assert ctx["finish_row"]["name"] == "Arrivée"
    assert len(ctx["bracelet_rows"]) == len(plan.segments)
    assert ctx["stops_policy"]["n_major"] == 2 and ctx["stops_budget"] is None
    assert "5 vrais ultras dont 5 avec fr" in ctx["verdict_sentence"]
    assert "parcours dans le domaine" in ctx["verdict_sentence"]


def _flatten(value, out: list[str]) -> None:
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, dict):
        for v in value.values():
            _flatten(v, out)
    elif isinstance(value, (list, tuple)):
        for v in value:
            _flatten(v, out)
    elif isinstance(value, bool) or value is None:
        return
    elif isinstance(value, (int, float)):
        out.append(str(value))


def _slice(tex: str, name: str) -> str:
    m = re.search(rf"% LL:BEGIN {name}\n(.*?)% LL:END {name}", tex, re.S)
    assert m, f"marqueurs {name} absents du gabarit"
    return m.group(1)


def test_every_number_on_pages_one_and_two_comes_from_the_context():
    """Couverture et « Ta course en une page » : une fois retirées les valeurs du contexte et
    les dimensions de mise en page, il ne reste aucun chiffre."""
    ctx, _ = context()
    tex = render_tex(ctx)
    values: list[str] = []
    _flatten(ctx, values)
    values = sorted({v for v in values if v.strip()}, key=len, reverse=True)
    for name in ("cover", "une-page"):
        body = _slice(tex, name)
        body = re.sub(r"-?\d+(\.\d+)?\s*(pt|mm|cm|em|ex|\\linewidth|\\textwidth|\\textheight)", "", body)
        body = re.sub(r"\\(LL\w+|vspace|hspace|includegraphics|begin|end)(\[[^\]]*\])?", "", body)
        for v in values:
            if len(v) >= 2:
                body = body.replace(v, " ")
        for v in values:
            if len(v) == 1 and v.isdigit():
                body = re.sub(rf"(?<![\d,.:])\d(?![\d,.:])", " ", body)
        leftovers = re.findall(r"\d[\d,.:]*", body)
        assert not leftovers, f"chiffres hors contexte sur {name} : {leftovers[:8]}"


def test_render_has_no_residual_delimiters():
    ctx, _ = context()
    for name in ("report.tex.j2", FICHE_TEMPLATE, BRACELET_TEMPLATE):
        tex = render_template(name, ctx)
        for token in ("<<", ">>", "<%", "%>", "<#", "#>"):
            assert token not in tex, f"{name} : délimiteur Jinja résiduel {token}"
        assert "\\begin{document}" in tex and "\\end{document}" in tex
    tex = render_tex(ctx)
    assert "Camille \\& L" in tex
    assert "\\LLtoc" not in tex and "llabstract" not in tex and "keywords" not in tex
    for page in ("Ta course en une page", "Le plan", "Ton profil", "Pourquoi tu peux y croire"):
        assert page in tex
    assert "une course sur deux" in tex and "quatre courses sur cinq" in tex
    assert CFG.report.fade_evidence.split(",")[0] in tex


@pytest.mark.skipif(not HAS_TEX, reason="XeLaTeX/biber absents (validés dans l'image Docker)")
def test_pdf_v2_compiles_on_the_golden_scenario(tmp_path):
    ctx, (course, twin, cal, pred, plan, race, _) = context()
    fig_dir = tmp_path / "figures"
    generate_figures(course, twin, cal, pred, plan, race, fig_dir, cfg=CFG)
    pdf = build_pdf(ctx, fig_dir, tmp_path / "tex")
    assert pdf.exists() and pdf.stat().st_size > 100_000


@pytest.mark.skipif(not HAS_TEX, reason="XeLaTeX/biber absents (validés dans l'image Docker)")
def test_a_stale_aux_from_a_previous_run_does_not_break_the_build(tmp_path):
    """Un dossier de sortie réutilisé garde les auxiliaires de la compilation d'avant. Le .aux
    est RELU au démarrage : s'il appelle une macro d'un gabarit qui n'est plus chargé, XeLaTeX
    meurt sur « Undefined control sequence » en accusant le document neuf."""
    from twin_engine.report.render import clean_aux

    ctx, (course, twin, cal, pred, plan, race, _) = context()
    fig_dir = tmp_path / "figures"
    generate_figures(course, twin, cal, pred, plan, race, fig_dir, cfg=CFG)
    tex_dir = tmp_path / "tex"
    tex_dir.mkdir()
    (tex_dir / "main.aux").write_text(
        "\\relax\n\\nicematrix@redefine@check@rerun\n", encoding="utf-8")
    (tex_dir / "main.bcf").write_text("<vestige/>", encoding="utf-8")
    pdf = build_pdf(ctx, fig_dir, tex_dir)
    assert pdf.exists() and pdf.stat().st_size > 100_000

    clean_aux(tex_dir, "main")
    assert not (tex_dir / "main.aux").exists()
    clean_aux(tex_dir, "absent")          # idempotent : aucun fichier, aucune erreur


@pytest.mark.skipif(not HAS_TEX, reason="XeLaTeX absent")
def test_fiche_and_bracelet_compile(tmp_path):
    ctx, _ = context()
    fiche = build_document(FICHE_TEMPLATE, ctx, tmp_path / "f", name="fiche")
    bracelet = build_document(BRACELET_TEMPLATE, ctx, tmp_path / "b", name="bracelet")
    assert fiche.stat().st_size > 20_000 and bracelet.stat().st_size > 5_000


def test_crew_indices_fallback():
    assert crew_indices(race_spec(), 7) == (2, 4, 5)         # Base 1, Base 2, Crête
    assert crew_indices(race_spec(crew_access_indices=()), 7) == (2, 4)
    assert crew_indices(race_spec(crew_access_indices=(), major_base_indices=()), 7) == (0, 1, 2, 3, 4, 5)
    # l'arrivée n'est jamais un point d'assistance : servie à part avec les bornes de sécurité
    assert 6 not in crew_indices(race_spec(crew_access_indices=(2, 6)), 7)


def test_ics_events_match_the_plan_windows():
    _, (course, _, _, pred, plan, race, _) = context()
    points = crew_points(plan, race)
    finish = finish_point(plan, pred)
    ics = ics_text(points, finish, race_name=course.name, athlete="Camille", ref="LL-TWIN-X",
                   now=datetime(2026, 9, 16, 8, 0, tzinfo=timezone.utc))
    assert ics.count("BEGIN:VEVENT") == len(points) + 1
    assert ics.startswith("BEGIN:VCALENDAR\r\n") and ics.endswith("END:VCALENDAR\r\n")
    starts = re.findall(r"DTSTART:(\d{8}T\d{6}Z)", ics)
    ends = re.findall(r"DTEND:(\d{8}T\d{6}Z)", ics)
    assert len(starts) == len(ends) == len(points) + 1
    assert all(s < e for s, e in zip(starts, ends))
    first = points[0]
    assert starts[0] == first.earliest.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    assert ends[-1] == finish.latest.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    assert all(len(line.encode()) <= 75 for line in ics.split("\r\n"))
    assert ics_text(points, None, race_name="x", athlete="y", ref="z") is not None
    plan_no_start = plan.__class__(**{**plan.__dict__, "start_time": None})
    assert ics_text(crew_points(plan_no_start, race), None, race_name="x", athlete="y", ref="z") is None


def test_gpx_has_a_waypoint_per_crew_point_and_the_track():
    _, (course, _, _, pred, plan, race, _) = context()
    points = crew_points(plan, race)
    finish = finish_point(plan, pred)
    gpx = gpx_text(course, points, finish, race_name=course.name, athlete="Camille", ref="LL-TWIN-X")
    assert gpx.count("<wpt ") == len(points) + 1
    assert "<trk>" in gpx and gpx.count("<trkpt ") >= 100
    assert "Base 1 km 41,0" in gpx and "Arrivée" in gpx
    assert "passage prévu" in gpx and "bornes de sécurité" in gpx


def test_write_livrables_without_latex(tmp_path):
    ctx, (course, twin, cal, pred, plan, race, suf) = context()
    fig_dir = tmp_path / "figures"
    generate_figures(course, twin, cal, pred, plan, race, fig_dir, cfg=CFG)
    written = write_livrables(context=ctx, course=course, twin=twin, calibration=cal,
                              prediction=pred, plan=plan, race=race, sufficiency=suf, cfg=CFG,
                              out_dir=tmp_path, figures_dir=fig_dir, render_pdf=False,
                              generated_at=datetime(2026, 9, 16, 8, 0))
    assert set(written) == {"plan.ics", "plan.gpx", "annexe.json"}
    annexe = json.loads((tmp_path / "annexe.json").read_text(encoding="utf-8"))
    assert annexe["ref"] == "LL-TWIN-GOLDEN01" and annexe["athlete"] == "Camille & Léo"
    for key in ("course", "prediction", "verdict", "jumeau", "calibration", "validation", "pente",
                "plan", "assistance", "arrivee", "textes", "glossaire", "references", "figures"):
        assert key in annexe, key
    assert annexe["verdict"]["confiance"] == "confiance pleine"
    assert len(annexe["calibration"]["ultras"]) == 5
    assert len(annexe["validation"]["points"]) == 5
    assert len(annexe["assistance"]) == 3 and annexe["arrivee"]["is_finish"]
    assert annexe["figures"]["record"].startswith("data:image/png;base64,")
    assert annexe["references"] and any(r["key"] == "minetti2002" for r in annexe["references"])
    assert "\\" not in annexe["textes"]["profil"]           # texte lisible, plus de LaTeX
    assert len(annexe["textes"]["limites"]) == 4
    assert annexe["plan"]["segments"][0]["consigne"]


# --------------------------------------------------------------------------- #
# La charte : une seule source (theme.css → charte.py → classe → figures).
def _theme_css() -> str | None:
    css = Path(__file__).parents[3] / "packages" / "ui" / "src" / "styles" / "theme.css"
    return css.read_text(encoding="utf-8") if css.exists() else None


def test_charte_tokens_match_theme_css():
    css = _theme_css()
    if css is None:
        pytest.skip("theme.css absent (hors monorepo)")
    for name, (token, value) in TOKENS.items():
        m = re.search(re.escape(token) + r"\s*:\s*(#[0-9A-Fa-f]{6})", css)
        assert m, f"{token} absent de theme.css"
        assert m.group(1).upper() == value.upper(), name


def test_cls_colours_are_the_tokens():
    cls = (TEMPLATE_DIR / "locomotionreport.cls").read_text(encoding="utf-8")
    defined = dict(re.findall(r"\\definecolor\{(LL\w+)\}\{HTML\}\{([0-9A-Fa-f]{6})\}", cls))
    assert set(defined) == set(CLS_COLORS)
    for latex_name, short in CLS_COLORS.items():
        assert "#" + defined[latex_name].upper() == hexa(short).upper(), latex_name
        assert f"% {TOKENS[short][0]}" in cls
    # aucune autre valeur en dur : les alias sont des \colorlet
    assert not re.findall(r"\\definecolor\{(?!LL)", cls)


def test_fonts_are_the_static_ubuntu_sans_instances():
    fonts = sorted(p.name for p in (TEMPLATE_DIR / "fonts").glob("*.ttf"))
    assert fonts == sorted(["UbuntuSans-Light.ttf", "UbuntuSans-Regular.ttf", "UbuntuSans-Medium.ttf",
                            "UbuntuSans-SemiBold.ttf", "UbuntuSans-Bold.ttf", "UbuntuSans-ExtraBold.ttf",
                            "UbuntuSans-Italic.ttf", "UbuntuSans-BoldItalic.ttf"])
    assert not [f for f in fonts if "Mono" in f]
    for f in FONT_FILES:
        assert (TEMPLATE_DIR / "fonts" / f).exists()
    cls = (TEMPLATE_DIR / "locomotionreport.cls").read_text(encoding="utf-8")
    assert "UbuntuMono" not in cls and "Numbers={Monospaced,Lining}" in cls


def test_figures_palette_is_the_charte():
    from twin_engine.report import figures as f

    assert (f.SAGE, f.GOLD, f.GOLDINK, f.TERRA, f.TEXT, f.BG, f.GREEN) == (
        hexa("primary"), hexa("accent"), hexa("accent_ink"), hexa("deep"), hexa("text"),
        hexa("bg"), hexa("success"))
