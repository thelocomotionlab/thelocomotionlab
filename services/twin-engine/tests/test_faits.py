"""Les six faits du rapport v4 : chacun est un calcul sur des données existantes.

Ce que ces tests tiennent, c'est la règle du chantier : **rien ne s'imprime qui ne se
calcule**. Une mesure absente des fichiers de l'athlète ne produit pas de ligne, et aucun
repli de population ne vient combler le trou.
"""

from __future__ import annotations

import sys
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
    """Une mesure absente des agrégats ne produit pas de ligne : personne n'invente une valeur
    de population à la place. On efface la plus longue descente et les nuits de ses ultras —
    les deux lignes disparaissent, les deux autres restent."""
    from dataclasses import replace

    course, twin, cal, pred, plan, race, _ = cas
    complet = {x["cle"] for x in faits.contre_son_passe(pred, course, plan, cal)}
    assert complet == {"duree", "dplus", "descente", "nuits"}

    sans = type("Cal", (), {"genuine": [replace(u, longest_descent_m=None, n_nights=None)
                                        for u in cal.genuine]})()
    cles = {x["cle"] for x in faits.contre_son_passe(pred, course, plan, sans)}
    assert cles == {"duree", "dplus"}


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


def test_the_two_form_scenarios_are_two_real_predictions(cas):
    """Les deux scénarios rejouent le point fixe avec toutes les vitesses décalées — ce sont
    deux vraies prédictions, pas deux règles de trois, donc l'écart n'est pas symétrique :
    dix pour cent de forme en moins coûtent plus que dix pour cent de plus ne rapportent."""
    course, twin, cal, pred, plan, race, _ = cas
    s = faits.deux_scenarios(pred, course, twin, cal, CFG)
    assert s["forme_pct"] == 10.0
    assert s["moins"]["heures"] > pred.finish_hours > s["plus"]["heures"]
    for cle in ("moins", "plus"):
        assert s[cle]["ecart_h"] == pytest.approx(s[cle]["heures"] - pred.finish_hours)
    assert abs(s["moins"]["ecart_h"]) > abs(s["plus"]["ecart_h"])

    # un décalage plus grand coûte plus cher : le bloc suit bien la forme qu'on lui donne
    large = faits.deux_scenarios(pred, course, twin, cal, CFG, forme_pct=20.0)
    assert large["moins"]["heures"] > s["moins"]["heures"]


def test_the_stops_risk_needs_his_own_measured_stops(cas):
    """Le plus gros écart évitable d'un plan se chiffre — mais seulement sur SES arrêts à lui.

    Sans plateau mesuré dans ses fichiers, ``stops_statistics`` se replie sur une valeur de
    population : le bloc ne s'imprime alors pas du tout, plutôt que de comparer le plan à la
    moyenne de gens qu'il ne connaît pas."""
    from dataclasses import replace

    course, twin, cal, pred, plan, race, _ = cas
    assert faits.risque_des_arrets(plan, cal, CFG) is None      # aucun arrêt mesuré au doré

    # le même athlète, avec 7 min d'arrêt par heure de mouvement dans ses fichiers
    taux = 7.0 / 60.0
    mesures = [replace(u, stops_h=u.hours * taux / (1.0 + taux)) for u in cal.genuine]
    mesure = type("Cal", (), {"genuine": mesures, "weights": cal.weights})()

    a = faits.risque_des_arrets(plan, mesure, CFG)
    assert a["n_ultras"] == len(mesures)
    assert a["mesure_min_par_h"] == pytest.approx(7.0, abs=0.01)
    assert a["plan_h"] == pytest.approx(plan.t_stops_h)
    assert a["plan_n"] == sum(1 for s in plan.segments if s.stop_min > 0)
    assert a["mesure_h"] == pytest.approx(taux * plan.t_move_h)
    assert a["ecart_h"] == pytest.approx(a["mesure_h"] - a["plan_h"])
    assert a["ecart_h"] > 0                                      # le plan retranche trop peu


def test_the_start_is_given_as_a_watch_pace(cas):
    """« Ça va te paraître trop facile » ne dit rien sans le chiffre de la montre. On donne
    l'allure terrain du premier segment, et l'écart se mesure en allure AJUSTÉE — la seule
    comparable entre un départ en montée et la moyenne de ses ultras."""
    course, twin, cal, pred, plan, race, _ = cas
    d = faits.depart_concret(plan, cal)
    seg = plan.segments[0]
    assert d["km"] == pytest.approx(seg.off1) and d["vers"] == seg.to
    assert d["pace_terrain_min_km"] == pytest.approx(seg.pace_min_km)
    assert d["pace_ajustee_min_km"] == pytest.approx(60.0 / seg.v_ga_kmh)
    moyenne = sum(u.vga_kmh for u in cal.genuine) / len(cal.genuine)
    assert d["ultras_ajustee_min_km"] == pytest.approx(60.0 / moyenne)
    assert d["ecart_min_km"] == pytest.approx(d["pace_ajustee_min_km"] - d["ultras_ajustee_min_km"])
    assert d["n_ultras"] == len(cal.genuine)
    # l'allure terrain d'un départ en montée est plus lente que son équivalent plat
    assert d["pace_terrain_min_km"] > d["pace_ajustee_min_km"]

    vide = type("Cal", (), {"genuine": []})()
    assert faits.depart_concret(plan, vide) is None


def test_a_stretch_is_never_named_after_a_point_it_does_not_reach(cas):
    """Nommer le ravitaillement SUIVANT ferait croire que la montée y monte encore. Un
    morceau ne prend le nom d'un point que s'il y finit vraiment ; sinon il se situe par
    rapport au dernier point FRANCHI."""
    course, twin, cal, pred, plan, race, _ = cas
    segs = plan.segments

    pile = faits._ou(plan, segs[3].off1)
    assert pile["vers"] == segs[3].to and pile["apres"] is None

    milieu = (segs[3].off1 + segs[4].off1) / 2.0
    entre = faits._ou(plan, milieu)
    assert entre["vers"] is None
    assert entre["apres"] == segs[3].to                          # celui d'avant, pas celui d'après
    assert entre["km_apres"] == pytest.approx(milieu - segs[3].off1)

    avant_le_premier = faits._ou(plan, segs[0].off1 / 2.0)
    assert avant_le_premier["vers"] is None and avant_le_premier["apres"] is None


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


def test_nothing_is_computed_without_a_start_time():
    """Sans heure de départ, aucun moment ne porte d'horloge — mais les moments restent :
    leurs kilomètres et leurs dénivelés, eux, ne dépendent pas de l'heure."""
    course, twin, cal, pred, plan, race, _ = scenario(race=race_spec(start_time=None))
    moments = faits.trois_moments(plan, course)
    assert moments
    assert all(m["debut_clock"] is None and m["fin_clock"] is None for m in moments)
    assert all(m["denivele_m"] and m["to_km"] > m["from_km"] for m in moments)


def test_the_rank_is_counted_from_the_side_the_race_falls_on(cas):
    """« Plus fort qu'un seul de tes douze ultras » dit l'inverse de ce qui compte quand la
    course tombe tout en bas de l'échelle. Le rang se compte du côté où elle tombe."""
    from dataclasses import replace

    course, twin, cal, pred, plan, race, _ = cas

    def _rang(fraction):
        p = replace(pred, vc_fraction=fraction)
        return faits.deux_intensites(p, twin, cal)

    parts = sorted(u.vga_kmh / twin.critical_speed.vc_kmh for u in cal.genuine)

    # au-dessus de tous : la plus forte, comptée par le haut
    haut = _rang(parts[-1] + 0.02)
    assert haut["plus_forts"] == 0 and haut["rang"] == 1 and haut["par_le_bas"] is False

    # sous tous sauf un : la deuxième plus BASSE, comptée par le bas
    bas = _rang((parts[0] + parts[1]) / 2.0)
    assert bas["plus_bas"] == 1 and bas["rang"] == 2 and bas["par_le_bas"] is True
    assert bas["plus_forts"] == len(parts) - 1

    # tout en bas : la plus basse
    fond = _rang(parts[0] - 0.02)
    assert fond["plus_bas"] == 0 and fond["rang"] == 1 and fond["par_le_bas"] is True


def test_the_sheet_and_page_two_print_the_same_numbers():
    """La garde anti-contradiction : la feuille à emporter et la page 2 lisent les MÊMES
    objets. Que la feuille recalcule de son côté — le D+ du segment là où la page 2 donne la
    montée continue, le temps de mouvement là où la page 2 donne l'horloge — et le document
    annonce deux « plus grosse montée » qui ne se ressemblent pas."""
    from test_report_v3 import context

    from twin_engine.report.feuille import consignes

    ctx, (course, twin, cal, pred, plan, race, _) = context()
    moments = faits.trois_moments(plan, course)
    par_cle = {m["cle"]: m for m in moments}
    page2 = {m["quoi"]: m for m in ctx["faits"]["moments"]}
    textes = " | ".join(consignes(plan, race, CFG, moments=moments))

    def _brut(tex: str) -> str:
        """Le même nombre, sans les espaces fines de LaTeX : la feuille est du texte brut."""
        return tex.replace("\\,", " ")

    for cle, quoi, mot in (("montee", "La plus grosse montée", "montée"),
                           ("descente", "La plus grosse descente", "descente")):
        m = par_cle[cle]
        assert (f"{mot} de {_brut(page2[quoi]['detail']).split(' m ')[0]} m jusqu'au km "
                f"{int(round(m['to_km']))}") in textes

    # la durée du plus long segment : la même horloge des deux côtés. Sa consigne tombe ici
    # sur une case déjà prise par la descente — on la pose seule pour lire ce qu'elle écrit.
    seul = " | ".join(consignes(plan, race, CFG, moments=[par_cle["segment"]]))
    assert f"le plus long : {_brut(page2['Le plus long segment']['duree'])}" in seul
