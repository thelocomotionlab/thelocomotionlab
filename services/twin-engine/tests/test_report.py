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
from twin_engine.report import (build_report_context, generate_figures, render_template,
                                render_tex)
from twin_engine.report.render import FEUILLE_TEMPLATE
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


def test_the_intensity_is_stated_as_a_measurement_not_a_verdict():
    """L'intensité se dit en chiffres — celle de cette course, celle de ses ultras passés, et
    le rang de l'une dans l'autre — jamais par une phrase en balancier."""
    ctx = _context()
    i = ctx["faits"]["intensites"]
    assert i and i["course"] and i["ultras"] and i["n"] >= 1
    tex = render_tex(ctx)
    assert i["phrase"] in tex
    assert "la vitesse ne sera pas le sujet" not in tex


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


def test_night_sections_are_contiguous_runs_not_minmax():
    """Régression : la nuit ne s'étale pas du 1er au dernier segment de nuit isolés — et les
    DEUX sections sont publiées, pas seulement la plus longue."""
    from types import SimpleNamespace

    from twin_engine.report.feuille import night_sections

    segs = [SimpleNamespace(index=i + 1, off1=k, night=n, arr_clock=None, to=f"P{i}",
                            t_move_min=60, stop_min=0)
            for i, (k, n) in enumerate([(10, False), (20, True), (30, True), (40, False), (90, True)])]
    plan = SimpleNamespace(segments=segs, start_time=None,
                           night_runs=[[segs[1], segs[2]], [segs[4]]])
    sections = night_sections(plan)
    assert [(s["from_km"], s["to_km"]) for s in sections] == [("10", "30"), ("40", "90")]


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
    # la ligne « Vitesse critique » de la page profil dit le masquage et pourquoi
    ligne = next(l for l in ctx["profil_lignes"] if "Vitesse" in l["label"])
    assert ligne["value"] == "non affichée"
    assert "plafond physiologique plausible" in ligne["texte"] and ligne["texte"] in tex
    assert "min/km" not in tex or "\\VC =" not in tex  # pas d'encadré VC rendu


def test_honesty_box_states_the_measured_error():
    """R5 : l'erreur mesurée est dite une fois, dans l'encadré d'honnêteté, avec ses deux
    lectures (brute et interpolation) — le rapport v2 n'a plus de résumé de tête."""
    ctx = _context()
    # cohérence du contexte : sans plis d'interpolation, gate = brute
    if not ctx["cv_gate_is_interp"]:
        assert ctx["cv_gate_mae"] == ctx["cv_mae"]
    assert ctx["cv_mae"] in ctx["honesty"]
    assert "rejoués en aveugle" in ctx["honesty"]
    tex = render_tex(ctx)
    # l'erreur mesurée se lit à côté de la figure de validation, une seule fois
    assert tex.count(ctx["honesty"]) == 1
    assert "llabstract" not in tex                       # plus de résumé, plus de mots-clés


def test_plan_windows_and_arrival_in_clock_time():
    """La table du plan affiche la fenêtre en HEURES DE PASSAGE, et la synthèse donne
    l'arrivée centrale + ses DEUX fenêtres (fourchette de course + bornes de sécurité)."""
    ctx = _context()
    assert ctx["arrival_clock"] and "h" in ctx["arrival_clock"]
    assert ctx["arrival_window"] and "–" in ctx["arrival_window"]
    assert ctx["arrival_safety_window"] and "–" in ctx["arrival_safety_window"]
    for row in ctx["plan_rows"]:
        assert "h" in row["window"]          # fenêtre horaire, pas des heures cumulées
    tex = render_tex(ctx)
    feuille = render_template(FEUILLE_TEMPLATE, ctx)
    # chaque bande est dite là où elle sert : les trois scénarios en tuiles dans le rapport,
    # les bornes de sécurité au verso de la feuille, sous les yeux de l'assistance
    assert "Rapide" in tex and "Centrale" in tex and "Prudent" in tex
    assert ctx["plan_band_word"] in tex
    assert ctx["safety_word"] in feuille and ctx["arrival_safety_lo_clock"] in feuille


def test_context_interval_labels_from_config():
    """R6 : les bandes sont dérivées de la config, et le rapport v2 les DIT en courses
    (« une course sur deux »), jamais en pourcentage sec."""
    ctx = _context()
    assert ctx["interval_pct"] == "80"
    assert ctx["plan_band_pct"] == "50"
    assert ctx["interval_tail_low"] == "10" and ctx["interval_tail_high"] == "10"
    assert ctx["plan_band_word"] == "une course sur deux"
    assert ctx["safety_word"] == "quatre courses sur cinq"
    tex = render_tex(ctx)
    assert "une course sur deux" in tex
    assert "quatre courses sur cinq" in render_template(FEUILLE_TEMPLATE, ctx)
    # Une bande ne se dit JAMAIS en pourcentage seul : le pour cent n'arrive qu'après le
    # nombre de courses, au bloc « Les fourchettes », qui donne les deux lectures côte à côte.
    from dataclasses import replace

    decale = replace(
        CFG,
        prediction=replace(CFG.prediction, interval_low_pct=3, interval_high_pct=96),
        pacing=replace(CFG.pacing, plan_window_low_pct=31, plan_window_high_pct=68),
    )
    autre = _context(decale)
    assert autre["interval_pct"] == "93" and autre["plan_band_pct"] == "37"
    phrases = [f["phrase"] for f in autre["recit"]["fourchettes"]]
    assert any("37\\,\\%" in p and "y tombe" in p for p in phrases)
    pages = render_tex(autre) + render_template(FEUILLE_TEMPLATE, autre)
    for sec in ("93\\,\\%", "37\\,\\%"):
        for morceau in pages.split(sec)[:-1]:
            assert morceau.rstrip().endswith("intervalle à"), "bande dite en pourcentage seul"

    cfg = replace(CFG, prediction=replace(CFG.prediction, interval_low_pct=5, interval_high_pct=95))
    assert _context(cfg)["safety_word"] == "neuf courses sur dix"


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


def test_three_scenarios_are_always_columns_of_the_plan():
    """Le plan v2 décline TOUJOURS rapide / central / prudent par segment : plus de table
    conditionnelle, la dispersion est un outil de pilotage dans tous les cas."""
    ctx = _context()
    for row in ctx["plan_rows"]:
        assert row["fast"] and row["central"] and row["cautious"]
        assert row["fast"] != row["cautious"]
    tex = render_tex(ctx)
    # les colonnes sont titrées par LEUR heure d'arrivée (v3), plus par « rapide / prudent »
    for key in ("fast", "central", "cautious"):
        assert ctx["clock_titles"][key] in tex
    assert "repère tôt celle qui te correspond" in tex


def test_wide_interval_is_owned_in_one_sentence():
    """Bornes larges : le rapport l'assume en une phrase (pacing.wide_interval_rel_width)."""
    from dataclasses import replace

    ctx_wide = _context(replace(CFG, pacing=replace(CFG.pacing, wide_interval_rel_width=0.0)))
    assert ctx_wide["width_prescription"] is not None
    assert ctx_wide["width_prescription"] in render_tex(ctx_wide)
    ctx_narrow = _context(replace(CFG, pacing=replace(CFG.pacing, wide_interval_rel_width=99.0)))
    assert ctx_narrow["width_prescription"] is None


def test_figures_generated(tmp_path):
    course, twin, cal, pred, plan, race, _ = _scenario()
    figs = generate_figures(course, twin, cal, pred, plan, race, tmp_path)
    for name in ("profil", "record", "cumul", "validation"):
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


# --------------------------------------------------------------------------- #
# Mode OBJECTIF (ADR 0002) : le rapport change de VOCABULAIRE, pas seulement de chiffres.
def _target_context(target_hours, cfg=None):
    """Contexte rendu comme le fait le pipeline : verdict d'abord, ancre seulement si permis.

    Le parcours de test fait 10 km : toute cible y est sous le domaine de calibration et le
    garde-fou §9.9 primerait sur tout le reste. On le désactive ici pour tester ce que ces
    tests testent — le VOCABULAIRE du rapport ; le garde-fou lui-même est couvert par
    test_feasibility."""
    from dataclasses import replace

    from twin_engine.feasibility import assess_target

    cfg = cfg or replace(CFG, sufficiency=replace(CFG.sufficiency, domain_gate="off"))
    course, twin, cal, pred, _plan, race, suf = _scenario(cfg)
    race = RaceSpec(
        race.name, race.aid_km, race.aid_names, start_time=race.start_time, lat=race.lat,
        lon=race.lon, tz_offset_h=race.tz_offset_h, major_base_indices=race.major_base_indices,
        target_hours=target_hours,
    )
    target = assess_target(target_hours, course, twin, pred, cfg)
    plan = build_pacing(course, pred, race, cfg, durability_pct=twin.durability_pct,
                        anchor_hours=target_hours if target.plan_ok else None)
    ctx = build_report_context(course=course, twin=twin, calibration=cal, prediction=pred,
                               plan=plan, race=race, sufficiency=suf, cfg=cfg,
                               athlete="Thomas", target=target)
    return ctx, target, pred, plan


def _nominal_target(pred):
    """Cible DANS la fourchette de course, dérivée des bandes réelles (elles sont très
    serrées sur ce scénario synthétique : un facteur en dur tomberait hors sécurité)."""
    return 0.5 * (pred.plan_low_h + pred.finish_hours)


def test_target_mode_switches_the_vocabulary_and_never_hides_the_prediction():
    course, twin, cal, pred, _p, _r, _s = _scenario()
    ctx, target, _pred, plan = _target_context(_nominal_target(pred))
    tex = render_tex(ctx)

    assert ctx["target_mode"] and ctx["target_plan_ok"]
    assert plan.anchor == "target"
    for token in ("<<", ">>", "<%", "%>"):
        assert token not in tex
    # le mot juste : tolérance d'exécution, jamais une probabilité
    assert "fenêtre de passage" in tex
    assert "tolérance d'exécution" in tex
    assert "Au plus tôt" in tex and "Au plus tard" in tex     # les tuiles changent de nom
    # la PRÉDICTION reste affichée — c'est le garde-fou central de l'ADR
    assert ctx["pred_central"] in tex
    assert "le modèle te situe" in tex
    # et la limite obligatoire est là
    assert "il ne la rend pas tenable" in tex


def test_refused_target_serves_the_gap_not_a_plan():
    """Cible hors bornes de sécurité : section objectif servie, plan ancré sur la prédiction."""
    course, twin, cal, pred, _p, _r, _s = _scenario()
    ctx, target, _pred, plan = _target_context(pred.interval_low_h * 0.80)
    tex = render_tex(ctx)

    assert target.regime == "hors_portee" and not target.plan_ok
    assert ctx["target_requested"] and not ctx["target_mode"]
    assert plan.anchor == "prediction"          # le plan reste celui du moteur
    assert "Pas de plan sur cet objectif" in tex
    assert "objectif d'entraînement" in tex
    # le vocabulaire du plan n'a PAS basculé : c'est bien la fourchette de course qui pilote
    assert "fenêtre de passage" not in tex
    assert "une course sur deux" in tex


def test_target_mode_renames_the_scenario_columns():
    """Les trois colonnes restent, mais autour d'une cible elles cessent d'être une
    probabilité : ce sont les bornes d'une tolérance d'exécution."""
    course, twin, cal, pred, _p, _r, _s = _scenario()
    ctx, _t, _pred, _plan = _target_context(_nominal_target(pred))
    tex = render_tex(ctx)
    assert ctx["target_mode"]
    # aucune tuile ne parle de « rapide » ou « prudent » : ce sont les bornes d'une tolérance
    assert "Au plus tôt" in tex and "Au plus tard" in tex
    assert "\\LLtuile{Rapide}" not in tex and "\\LLtuile{Prudent}" not in tex
    assert "tolérance d'exécution" in tex and "pas une probabilité" in tex


def test_no_target_renders_exactly_as_before():
    """Sans cible, le rapport est celui d'avant : aucune section, aucun mot en plus."""
    tex = render_tex(_context())
    assert "Ton objectif" not in tex
    assert "fen\\^etre de passage" not in tex
    assert "il ne le rend pas tenable" not in tex


def test_cumul_figure_caption_follows_the_anchor():
    """La figure a la même géométrie dans les deux modes : sa légende doit trancher."""
    ctx_pred = _context()
    ctx_target, _t, pred, _plan = _target_context(_nominal_target(_scenario()[3]))
    assert "fourchette de course" in ctx_pred["caption_cumul"]
    assert "fen\\^etre de passage" in ctx_target["caption_cumul"]
    assert "pr\\'ediction du moteur" in ctx_target["caption_cumul"]


def test_latex_environments_balanced_in_both_modes():
    """Filet anti-régression du mode objectif : la compilation PDF réelle n'est validée que
    dans l'image Docker (XeLaTeX absent en CI), donc on vérifie ici, sans LaTeX, que les
    branches conditionnelles n'ont pas déséquilibré un \\begin/\\end ou une accolade."""
    import re
    from collections import Counter

    def _audit(tex):
        begins = Counter(re.findall(r"\\begin\{([^}]+)\}", tex))
        ends = Counter(re.findall(r"\\end\{([^}]+)\}", tex))
        assert begins == ends, f"environnements déséquilibrés : {begins - ends} / {ends - begins}"
        # Le solde d'accolades du template n'est pas nul (commentaires LaTeX, macros) : on le
        # compare donc au mode PRÉDICTION, qui compile en production. Tout écart = un bloc
        # conditionnel du mode objectif qui a ouvert sans refermer.
        naked = re.sub(r"\\[{}]", "", tex)
        return begins, naked.count("{") - naked.count("}")

    course, twin, cal, pred, _p, _r, _s = _scenario()
    ref_envs, ref_delta = _audit(render_tex(_context()))
    on_target, _t, _pred, _plan = _target_context(_nominal_target(pred))
    refused, _t2, _pred2, _plan2 = _target_context(pred.interval_low_h * 0.80)
    for label, ctx in (("ancré sur la cible", on_target), ("cible refusée", refused)):
        envs, delta = _audit(render_tex(ctx))
        assert delta == ref_delta, f"solde d'accolades modifié ({label})"
        # le mode objectif AJOUTE des blocs, il n'en retire aucun du squelette
        for env in ("document", "llnote"):
            assert envs[env] >= ref_envs[env], f"environnement {env} perdu ({label})"


@pytest.mark.skipif(shutil.which("xelatex") is None or shutil.which("biber") is None,
                    reason="XeLaTeX/biber absents (validés dans l'image Docker)")
@pytest.mark.parametrize("cas", ["ancre", "refuse"])
def test_pdf_compiles_in_target_mode(tmp_path, cas):
    """Le mode objectif ajoute une section, une table et un encadré au template : tant que
    ce PDF-là n'a pas été compilé, la mise en page n'est pas vérifiée (le rendu Jinja passe
    sur du LaTeX qui ne compile pas)."""
    from twin_engine.report import build_pdf

    course, twin, cal, pred, _p, _r, _s = _scenario()
    hours = _nominal_target(pred) if cas == "ancre" else pred.interval_low_h * 0.80
    ctx, target, _pred, plan = _target_context(hours)
    assert (target.plan_ok, plan.anchor == "target") == (cas == "ancre",) * 2

    fig_dir = tmp_path / "figures"
    generate_figures(course, twin, cal, pred, plan, _r, fig_dir)
    pdf = build_pdf(ctx, fig_dir, tmp_path / "tex")
    assert pdf.exists() and pdf.stat().st_size > 20_000


def test_declared_technicity_is_disclosed_in_the_report():
    """Un Deq majoré sans explication ferait passer une hypothèse d'entrée pour une mesure."""
    from dataclasses import replace as dc_replace

    course, twin, cal, pred, plan, race, suf = _scenario()
    race_t = dc_replace(race, technicity_pct=13.0)
    course_t = build_course(_triangle_gpx(), race_t, CFG)
    pred_t = predict_finish(course_t.deq_km, course_t.dplus_per_km, twin, cal, CFG)
    plan_t = build_pacing(course_t, pred_t, race_t, CFG)
    ctx = build_report_context(course=course_t, twin=twin, calibration=cal, prediction=pred_t,
                               plan=plan_t, race=race_t, sufficiency=suf, cfg=CFG, athlete="A")
    tex = render_tex(ctx)
    assert ctx["technicity_pct"] == "13"
    assert any("13" in a and "technicité" in a for a in ctx["assumptions"])  # dans les hypothèses
    assert "pas mesurés" in tex                          # ... et dans les quatre limites
    assert any("technicité déclarés" in a for a in ctx["assumptions"])

    # sans déclaration : la limite devient l'avertissement inverse
    ctx0 = _context()
    tex0 = render_tex(ctx0)
    assert "Technicité déclarée" not in tex0
    assert "piste roulante et arête sont traitées pareil" in tex0
    assert any("aucune technicité déclarée" in a for a in ctx0["assumptions"])
