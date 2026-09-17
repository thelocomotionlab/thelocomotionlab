"""Rapport v3 : trois pages et la feuille à emporter sur un scénario déterministe, livrables
(feuille, ICS, GPX, annexe), charte (tokens et polices), et les règles du chantier v3 — aucun
chiffre en dur sur ce que l'athlète lit en course, une seule lecture de la nuit et des arrêts,
une consigne par segment jamais répétée, pas de nom de ravitaillement bouchon."""

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
from twin_engine.course import CrewAccess, Nutrition, RaceSpec, build_course
from twin_engine.pacing import build_pacing
from twin_engine.predict import predict_finish
from twin_engine.report import (build_feuille, build_pdf, build_report_context,
                                generate_figures, render_template, render_tex,
                                write_livrables)
from twin_engine.report.charte import CLS_COLORS, FONT_FILES, TOKENS, hexa
from twin_engine.report.feuille import consignes as consignes_feuille
from twin_engine.report.livrables import (crew_indices, crew_points, finish_point,
                                          gpx_text, ics_text)
from twin_engine.report.render import FEUILLE_TEMPLATE
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
        crew=(CrewAccess(3, "bidons + frontale"), CrewAccess(5), CrewAccess(6)),
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


def test_context_v3_keys():
    ctx, (course, _, _, _, plan, race, _) = context()
    assert ctx["confidence_word"] == "confiance pleine" and ctx["confidence_color"] == "LLSuccess"
    assert ctx["annex_url"].endswith("/LL-TWIN-GOLDEN01") and ctx["annex_ref"] == "LL-TWIN-GOLDEN01"
    assert ctx["report_version"] == CFG.report.version
    assert len(ctx["gauges"]) == 4 and all(0.0 <= g["fraction"] <= 1.0 for g in ctx["gauges"])
    assert len(ctx["limits"]) == 4 and len(ctx["limits_short"]) == 4
    assert ctx["honesty"].startswith("Sur tes 5 ultras")
    assert ctx["assumptions"][0].startswith("Arr")
    assert len(ctx["plan_rows"]) == len(ctx["feuille_rows"]) == len(plan.segments)
    # les points d'assistance viennent du règlement (crew), l'arrivée est servie à part
    assert [r["name"] for r in ctx["crew_rows"]] == ["Base 1", "Base 2", "Crête"]
    assert ctx["crew_declared"] is True
    assert ctx["crew_rows"][0]["note"] == "bidons + frontale"
    assert all(c["note"] == "" for c in ctx["crew_rows"][1:])
    assert ctx["finish_row"]["name"] == "Arrivée"
    assert ctx["stops_policy"]["n_major"] == 2


def test_the_report_number_never_reaches_the_pdf():
    """La référence reste côté moteur (nom de fichier, registre, adresse de l'annexe) : elle
    n'a rien à faire sur une page que l'athlète lit."""
    ctx, _ = context(ref="LL-TWIN-SECRET7")
    assert "report_ref" not in ctx
    tex = render_tex(ctx)
    feuille = render_template(FEUILLE_TEMPLATE, ctx)
    # seule l'adresse du QR porte la référence, et elle ne s'imprime pas en clair
    assert tex.count("LL-TWIN-SECRET7") == 1
    assert "\\LLqr{" in tex and "\\url{" not in tex
    assert "LL-TWIN-SECRET7" not in feuille


def test_placeholder_aid_names_refuse_to_be_sold():
    """Un plan dont les lieux s'appellent « AS3 » n'est pas vendable : le rendu s'arrête."""
    from twin_engine.course.spec import placeholder_aid_names

    race = race_spec(aid_names=("Départ", "AS1", "AS2 km27", "Base 1", "Lac", "Base 2", "Crête",
                                "Arrivée"))
    assert placeholder_aid_names(race) == ["AS1", "AS2 km27"]
    with pytest.raises(ValueError, match="bouchons"):
        context(race=race)
    assert placeholder_aid_names(race_spec()) == []


def test_the_night_is_read_once_and_reports_every_section():
    """Une seule lecture de la nuit (PacingPlan.night_runs) : le contexte, le récit et la
    feuille disent la même chose, et toutes les sections sont publiées."""
    ctx, (_, _, _, _, plan, _, _) = context()
    runs = plan.night_runs
    assert runs and len(ctx["night_sections"]) == len(runs)
    for section, run in zip(ctx["night_sections"], runs):
        assert section["to_name"] == run[-1].to
    assert ctx["night_hours_hm"] and ctx["night_share_pct"]
    # la part de nuit est celle du plan, pas un second calcul
    assert abs(plan.night_hours - sum((s.t_move_min + s.stop_min) / 60.0
                                      for r in runs for s in r)) < 1e-9
    tex = render_tex(ctx)
    for section in ctx["night_sections"]:
        assert f"km\\,{section['from_km']} au km\\,{section['to_km']}" in tex


def test_two_night_sections_are_both_published():
    """Un parcours qui traverse une nuit puis rattrape la tombée du jour en a deux : min→max
    laisserait croire à une nuit de bout en bout."""
    from twin_engine.report.feuille import night_sections

    _, (_, _, _, _, plan, _, _) = context()
    segs = plan.segments
    faux = plan.__class__(**{**plan.__dict__, "segments": [
        s.__class__(**{**s.__dict__, "night": i in (1, 2, 5)}) for i, s in enumerate(segs)]})
    sections = night_sections(faux)
    assert len(sections) == 2
    assert sections[0]["to_name"] == segs[2].to and sections[1]["to_name"] == segs[5].to


def test_stops_have_one_source_and_one_rounding():
    """Le total des arrêts vient du plan, le taux en découle : deux lectures donnaient trois
    chiffres qui ne se retrouvaient pas."""
    ctx, (_, _, _, _, plan, _, _) = context()
    stops = ctx["stops_plain"]
    assert stops["hours"] == plan.t_stops_h
    assert abs(stops["rate_min_per_h"] - plan.t_stops_h / plan.t_move_h * 60.0) < 1e-9
    gauge = next(g for g in ctx["gauges"] if g["label"] == "Arrêts")
    assert gauge["value"] == ctx["stops"]["rate_text"]
    assert ctx["stops"]["hours_hm"] == ctx["t_stops_h"]
    assert "stops_budget" not in ctx


def test_the_fade_claim_matches_what_the_plan_actually_served():
    """La dérive « faite pour toi » ne se dit que si le plan l'a vraiment réglée sur l'athlète."""
    from twin_engine.report.narrative import durability_pourtoi

    _, (_, twin, _, _, plan, _, _) = context()
    commun = durability_pourtoi(twin, CFG, fade_source="config")
    mesure = durability_pourtoi(twin, CFG, fade_source="splits")
    assert "valeur commune" in commun and "valeur commune" not in mesure
    assert "moiti" in mesure
    ctx, _ = context()
    attendu = {"config": "valeur commune", "durability": "d\\'ecouplage",
               "splits": "moiti"}[plan.fade_source_used]
    assert attendu in ctx["durability_pourtoi"]


def test_one_instruction_per_segment_never_twice_the_same():
    ctx, (_, _, _, _, plan, race, _) = context()
    marches = [r["marche"] for r in ctx["feuille_rows"]]
    assert len(marches) == len(plan.segments)
    pleines = [m for m in marches if m]
    assert pleines and len(set(pleines)) == len(pleines)
    assert all(len(m) <= CFG.report.consigne_max_chars for m in pleines)
    # une note d'assistance déclarée devient une consigne quand rien de plus urgent ne sort
    brutes = consignes_feuille(plan, race, CFG)
    assert [r["marche"] for r in ctx["feuille_rows"]] == [m.replace("&", "\\&") for m in brutes]


def test_the_day_prefix_is_not_repeated():
    ctx, _ = context()
    for key in ("fast", "central", "cautious"):
        jours = [r[key]["day"] for r in ctx["feuille_rows"]]
        vus = [j for j in jours if j]
        assert len(vus) == len(set(vus)), f"{key} : préfixe de jour répété"
        assert jours[0], "le premier passage porte son jour"


def test_the_three_columns_are_titled_by_their_arrival():
    ctx, (_, _, _, _, plan, _, _) = context()
    last = plan.segments[-1]
    assert ctx["clock_titles"]["fast"] == ctx["plan_low"]
    assert ctx["clock_titles"]["cautious"] == ctx["plan_high"]
    assert ctx["clock_titles"]["central"] == ctx["pred_central"]
    assert ctx["feuille_rows"][-1]["central"]["hour"] in (last.arr_clock or "").split(" ")[-1]


def test_the_crew_window_gives_back_the_arrival_of_page_one():
    """Les bornes de sécurité étalées le long du parcours redonnent EXACTEMENT, à l'arrivée,
    la fenêtre annoncée en première page."""
    ctx, (_, _, _, pred, plan, race, _) = context()
    points = crew_points(plan, race, pred)
    finish = finish_point(plan, pred)
    assert points and finish is not None
    assert abs(finish.lo_h - pred.interval_low_h) < 1e-9
    assert abs(finish.hi_h - pred.interval_high_h) < 1e-9
    # dernier point d'assistance : la fenêtre est bien un étalement du même intervalle
    ratio_lo = pred.interval_low_h / plan.segments[-1].cum_clock_h
    for p in points:
        assert abs(p.lo_h - p.central_h * ratio_lo) < 1e-9
    assert ctx["finish_row"]["earliest"] == ctx["arrival_safety_lo_clock"]


def test_nutrition_stays_blank_until_the_athlete_declares_it():
    """Le moteur n'invente ni un débit ni une valeur de population : sans déclaration, les
    colonnes eau et ravito existent mais restent vides."""
    ctx, _ = context()
    assert ctx["nutrition"] is None
    assert all(r["water"] == "" and r["carbs"] == "" for r in ctx["feuille_rows"])

    ctx2, (_, _, _, _, plan, _, _) = context(
        race=race_spec(nutrition=Nutrition(water_l_per_h=0.5, carbs_g_per_h=60.0)))
    assert ctx2["nutrition"]["water_rate"] == "0,5" and ctx2["nutrition"]["carbs_g"]
    assert all(r["water"] and r["carbs"] for r in ctx2["feuille_rows"])
    heures = sum((s.t_move_min + s.stop_min) / 60.0 for s in plan.segments)
    assert ctx2["nutrition"]["water_l"] == f"{0.5 * heures:.1f}".replace(".", ",")


def test_contact_points_fall_back_and_say_so():
    from twin_engine.report.feuille import contact_points

    declares, sur = contact_points(race_spec(), 7)
    assert declares == (2, 4, 5) and sur is True          # crew : ravitos 3, 5, 6
    sans_crew, sur = contact_points(race_spec(crew=()), 7)
    assert sans_crew == (2, 4, 5) and sur is True         # crew_access_indices
    supposes, sur = contact_points(race_spec(crew=(), crew_access_indices=()), 7)
    assert supposes == (2, 4) and sur is False            # bases majeures : une hypothèse
    ctx, _ = context(race=race_spec(crew=(), crew_access_indices=()))
    assert ctx["crew_declared"] is False
    assert "suppos" in render_template(FEUILLE_TEMPLATE, ctx)


def test_the_course_is_cut_in_two_parts():
    ctx, (_, _, _, _, plan, _, _) = context()
    parts = ctx["feuille_parts"]
    assert len(parts) == 2
    assert [p["name"] for p in parts] == ["Retenue", "Exécution"]
    assert parts[0]["first"] == 0 and parts[1]["last"] == len(plan.segments) - 1
    assert parts[0]["last"] + 1 == parts[1]["first"]
    assert all(p["note"] for p in parts)
    # la coupure tombe au ravitaillement le plus proche de la mi-temps prédite
    mi = plan.segments[-1].cum_clock_h / 2.0
    cut = parts[1]["first"]
    ecart = abs(plan.segments[cut - 1].cum_clock_h - mi)
    assert all(abs(s.cum_clock_h - mi) >= ecart - 1e-9 for s in plan.segments[:-1])


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


def test_no_number_is_hard_coded_in_what_the_athlete_reads_in_the_race():
    """Les deux premières pages du rapport et la feuille à emporter : une fois retirées les
    valeurs du contexte et les dimensions de mise en page, il ne reste aucun chiffre."""
    ctx, _ = context()
    values: list[str] = []
    _flatten(ctx, values)
    values = sorted({v for v in values if v.strip()}, key=len, reverse=True)

    def _reste(body: str) -> list[str]:
        # dimensions de mise en page : corps de police, largeurs de colonne, ressorts
        body = re.sub(r"\\fontsize\{[\d.]+\}\{[\d.]+\}", "", body)
        body = re.sub(r"\\renewcommand\{\\arraystretch\}\{[\d.]+\}", "", body)
        body = re.sub(r"\\LLphase(?:un|deux)\{\d+\}", "", body)   # nombre de colonnes
        body = re.sub(r"[\d.]+\\(linewidth|textwidth|textheight|height)", "", body)
        body = re.sub(r"-?\d+(\.\d+)?\s*(pt|mm|cm|em|ex)", "", body)
        body = re.sub(r"\\(LL\w+|vspace|hspace|includegraphics|begin|end|selectfont"
                      r"|setlength|renewcommand|arraystretch|rowcolor|cellcolor|multicolumn"
                      r"|colorlet|rule|hrule|qrcode)(\[[^\]]*\])?", "", body)
        for v in values:
            if len(v) >= 2:
                body = body.replace(v, " ")
        body = re.sub(r"(?<![\d,.:])\d(?![\d,.:])", " ", body)
        return re.findall(r"\d[\d,.:]*", body)

    tex = render_tex(ctx)
    for name in ("page-course", "page-plan"):
        assert not _reste(_slice(tex, name)), f"chiffres hors contexte sur {name}"
    feuille = render_template(FEUILLE_TEMPLATE, ctx)
    for name in ("feuille-recto", "feuille-verso"):
        assert not _reste(_slice(feuille, name)), f"chiffres hors contexte sur {name}"


def test_render_has_no_residual_delimiters():
    ctx, _ = context()
    for name in ("report.tex.j2", FEUILLE_TEMPLATE):
        tex = render_template(name, ctx)
        for token in ("<<", ">>", "<%", "%>", "<#", "#>"):
            assert token not in tex, f"{name} : délimiteur Jinja résiduel {token}"
        assert "\\begin{document}" in tex and "\\end{document}" in tex
    tex = render_tex(ctx)
    assert "Camille \\& L" in tex
    assert "\\LLtoc" not in tex and "llabstract" not in tex and "keywords" not in tex
    # les titres-formules du v2 ont disparu, remplacés par des titres simples
    for page in ("Le plan", "Ton profil", "La preuve"):
        assert page in tex
    cls = (TEMPLATE_DIR / "locomotionreport.cls").read_text(encoding="utf-8")
    assert "{llhonnete}[1][Les limites]" in cls
    for formule in ("Ce que ça te demande", "Ce que ce rapport ne sait pas",
                    "Pourquoi tu peux y croire", "Ce que tes données disent de toi",
                    "Ce que ça change pour toi", "(on prévient)"):
        assert formule not in tex, formule
    assert "une course sur deux" in tex and "quatre courses sur cinq" in tex
    assert CFG.report.fade_evidence.split(",")[0] in tex
    assert "en Synth" not in tex                      # plus aucun renvoi mort


@pytest.mark.skipif(not HAS_TEX, reason="XeLaTeX/biber absents (validés dans l'image Docker)")
def test_the_report_is_three_pages_and_the_sheet_two(tmp_path):
    PdfReader = pytest.importorskip("pypdf").PdfReader   # extra « dev » du pyproject

    ctx, (course, twin, cal, pred, plan, race, _) = context()
    fig_dir = tmp_path / "figures"
    generate_figures(course, twin, cal, pred, plan, race, fig_dir, cfg=CFG)
    rapport = build_pdf(ctx, fig_dir, tmp_path / "tex")
    feuille = build_feuille(ctx, fig_dir, tmp_path / "tex-feuille")
    assert len(PdfReader(str(rapport)).pages) == 3
    assert len(PdfReader(str(feuille)).pages) == 2


@pytest.mark.skipif(not HAS_TEX, reason="XeLaTeX/biber absents (validés dans l'image Docker)")
def test_pdf_v3_compiles_on_the_golden_scenario(tmp_path):
    ctx, (course, twin, cal, pred, plan, race, _) = context()
    fig_dir = tmp_path / "figures"
    figs = generate_figures(course, twin, cal, pred, plan, race, fig_dir, cfg=CFG)
    assert set(figs) == {"profil", "record", "cumul", "validation", "profil_feuille"}
    pdf = build_pdf(ctx, fig_dir, tmp_path / "tex")
    assert pdf.exists() and pdf.stat().st_size > 100_000
    feuille = build_feuille(ctx, fig_dir, tmp_path / "tex-feuille")
    assert feuille.exists() and feuille.stat().st_size > 60_000


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


def test_crew_indices_fallback():
    assert crew_indices(race_spec(), 7) == (2, 4, 5)         # Base 1, Base 2, Crête
    assert crew_indices(race_spec(crew=(), crew_access_indices=()), 7) == (2, 4)
    assert crew_indices(race_spec(crew=(), crew_access_indices=(),
                                  major_base_indices=()), 7) == (0, 1, 2, 3, 4, 5)
    # l'arrivée n'est jamais un point d'assistance : servie à part avec les bornes de sécurité
    assert 6 not in crew_indices(race_spec(crew=(), crew_access_indices=(2, 6)), 7)


def test_ics_events_match_the_plan_windows():
    _, (course, _, _, pred, plan, race, _) = context()
    points = crew_points(plan, race, pred)
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
    assert ics_text(crew_points(plan_no_start, race, pred), None, race_name="x",
                    athlete="y", ref="z") is None


def test_gpx_has_a_waypoint_per_crew_point_and_the_track():
    _, (course, _, _, pred, plan, race, _) = context()
    points = crew_points(plan, race, pred)
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
    consignes = [s["consigne"] for s in annexe["plan"]["segments"]]
    pleines = [c for c in consignes if c]
    assert pleines and len(set(pleines)) == len(pleines)
    assert annexe["plan"]["stops"]["hours"] and annexe["plan"]["nuit"]["sections"]
    assert len(annexe["plan"]["parties"]) == 2


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
