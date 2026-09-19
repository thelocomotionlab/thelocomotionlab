"""Les six faits du rapport v4 : chacun est un calcul sur des données existantes.

Ce que ces tests tiennent, c'est la règle du chantier : **rien ne s'imprime qui ne se
calcule**. Une mesure absente des fichiers de l'athlète ne produit pas de ligne, et aucun
repli de population ne vient combler le trou.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from test_report_v3 import CFG, race_spec, scenario          # noqa: E402
from twin_engine.report import faits                          # noqa: E402


@pytest.fixture(scope="module")
def cas():
    return scenario()


# --------------------------------------------------------------------------- #
def test_the_race_is_compared_to_his_own_ultras(cas):
    course, twin, cal, pred, plan, race, _ = cas
    lignes = faits.contre_son_passe(pred, course, plan, cal)
    par_cle = {x["cle"]: x for x in lignes}
    assert "duree" in par_cle and "dplus" in par_cle
    duree = par_cle["duree"]
    assert duree["record"] == max(u.elapsed_hours or u.hours for u in cal.genuine)
    assert duree["valeur"] == pytest.approx(pred.finish_hours)
    assert duree["ratio"] == pytest.approx(duree["valeur"] / duree["record"])
    assert par_cle["dplus"]["record"] == max(u.dplus_m for u in cal.genuine)


def test_a_missing_measure_gives_no_line(cas):
    """Les agrégats du scénario doré n'ont ni plus longue descente ni nombre de nuits : ces
    deux lignes n'existent pas. Personne n'invente une valeur de population à la place."""
    course, twin, cal, pred, plan, race, _ = cas
    cles = {x["cle"] for x in faits.contre_son_passe(pred, course, plan, cal)}
    assert "descente" not in cles and "nuits" not in cles
    assert all(getattr(u, "longest_descent_m", None) is None for u in cal.genuine)


def test_without_any_ultra_nothing_is_compared(cas):
    course, twin, cal, pred, plan, race, _ = cas
    vide = type("Cal", (), {"genuine": []})()
    assert faits.contre_son_passe(pred, course, plan, vide) == []
    assert faits.deux_intensites(pred, twin, vide) is None


def test_the_two_intensities_share_one_scale(cas):
    course, twin, cal, pred, plan, race, _ = cas
    i = faits.deux_intensites(pred, twin, cal)
    assert i["course_pct"] == pytest.approx(100 * pred.vc_fraction)
    parts = [100 * u.vga_kmh / twin.critical_speed.vc_kmh for u in cal.genuine]
    assert i["mini_pct"] == pytest.approx(min(parts))
    assert i["maxi_pct"] == pytest.approx(max(parts))
    assert i["plus_forts"] == sum(1 for p in parts if p > i["course_pct"])
    assert i["n"] == len(cal.genuine)


def test_the_time_breakdown_adds_up_to_the_plan(cas):
    """La ventilation répartit le temps du plan : sa somme EST l'horloge, au centième près.
    Sans quoi la barre dirait autre chose que le tableau de marche."""
    course, twin, cal, pred, plan, race, _ = cas
    v = faits.ventilation(plan, course, CFG)
    total = sum(p["heures"] for p in v["parts"])
    assert total == pytest.approx(plan.t_move_h + plan.t_stops_h, abs=0.02)
    assert v["total_h"] == pytest.approx(total, abs=1e-9)
    assert sum(p["part_pct"] for p in v["parts"]) == pytest.approx(100.0, abs=0.01)
    assert v["seuil_pct"] == CFG.course.flat_grade_pct
    arrets = next(p for p in v["parts"] if p["cle"] == "arrets")
    assert arrets["heures"] == pytest.approx(plan.t_stops_h)


def test_the_flat_threshold_moves_the_breakdown(cas):
    """Le seuil est un choix déclaré : le desserrer déplace du temps vers le roulant."""
    from dataclasses import replace

    course, twin, cal, pred, plan, race, _ = cas
    serre = faits.ventilation(plan, course, replace(CFG, course=replace(CFG.course, flat_grade_pct=1.0)))
    large = faits.ventilation(plan, course, replace(CFG, course=replace(CFG.course, flat_grade_pct=9.0)))
    roulant = lambda v: next(p["heures"] for p in v["parts"] if p["cle"] == "roulant")  # noqa: E731
    assert roulant(large) > roulant(serre)


def test_a_bad_day_is_a_prediction_and_a_fast_start_is_arithmetic(cas):
    """Deux natures, dites comme telles : la forme rejoue le point fixe (``modele`` vrai),
    le départ trop rapide n'est qu'une arithmétique (``modele`` faux) — le moteur ne
    modélise pas ce que coûte une explosion, et le rapport ne fait pas semblant."""
    course, twin, cal, pred, plan, race, _ = cas
    c = faits.cout_dune_erreur(pred, plan, course, twin, cal, CFG)
    assert c["forme"]["modele"] is True and c["depart"]["modele"] is False
    assert c["forme"]["heures"] > pred.finish_hours
    assert c["forme"]["ecart_h"] == pytest.approx(c["forme"]["heures"] - pred.finish_hours)
    # 4 h à +10 % : le temps gagné, puis le ralentissement qui le rend sur le reste
    assert 0 < c["depart"]["gagne_min"] < 4 * 60
    assert c["depart"]["ralentir_pct"] == pytest.approx(
        100 * (c["depart"]["gagne_min"] / 60) / c["depart"]["reste_h"], rel=1e-6)


def test_three_moments_chosen_by_three_explicit_criteria(cas):
    """Le plus gros D+ continu, la plus grosse D− continue, le plus long segment prévu — et
    jamais deux fois le même morceau."""
    from twin_engine.course.montees import descentes, montees

    course, twin, cal, pred, plan, race, _ = cas
    m = faits.trois_moments(plan, course)
    assert [x["cle"] for x in m] == ["montee", "descente", "segment"]
    assert m[0]["denivele_m"] == pytest.approx(max(x.denivele_m for x in montees(course)))
    assert m[1]["denivele_m"] == pytest.approx(max(x.denivele_m for x in descentes(course)))
    for x in m:
        assert x["to_km"] > x["from_km"] and x["heures"] > 0
        assert x["debut_clock"] and x["fin_clock"]
    assert len({(x["from_km"], x["to_km"]) for x in m}) == 3


def test_sunrise_is_where_the_plan_says_he_will_be():
    """Le lever du jour : l'heure vient du soleil, la position du cumul du plan. Aucune
    course ne traverse le lever ? Alors rien ne s'imprime."""
    tot = timezone(timedelta(hours=2))
    matin = scenario(race=race_spec(start_time=datetime(2026, 9, 25, 4, 0, tzinfo=tot)))
    lv = faits.lever_du_jour(matin[4], matin[5])
    assert lv and 0 < lv["depuis_h"] < matin[4].segments[-1].cum_clock_h
    assert 0 < lv["km"] < matin[0].length_km
    assert lv["vers"] in [s.to for s in matin[4].segments]
    assert lv["heure"].endswith(tuple("0123456789")) and "h" in lv["heure"]

    # une course qui finit avant le lever n'en parle pas
    course, twin, cal, pred, plan, race, _ = scenario()
    assert faits.lever_du_jour(plan, race) is None


def test_nothing_is_computed_without_a_start_time():
    course, twin, cal, pred, plan, race, _ = scenario(race=race_spec(start_time=None))
    assert faits.lever_du_jour(plan, race) is None
    assert faits.trois_moments(plan, course)          # les moments restent, sans horloge
