"""Narrative V2 : la pédagogie est GÉNÉRÉE depuis les valeurs (changer un param → le texte suit).

Aucune prose codée en dur spécifique à un athlète/une course : on le prouve en faisant
varier les entrées et en vérifiant que la sortie change.
"""

from __future__ import annotations

from types import SimpleNamespace

from twin_engine.config import load_config
from twin_engine.minetti import grade_factor
from twin_engine.report import narrative as N

CFG = load_config()


def _twin(*, E=1.22, durab=21.0, vc_kmh=10.5, vc_plausible=True):
    cs = SimpleNamespace(vc_kmh=vc_kmh, vc_ms=vc_kmh / 3.6, vc_sd=0.1, dprime_m=1500,
                         plausible=vc_plausible)
    return SimpleNamespace(endurance_E=E, durability_pct=durab, critical_speed=cs)


def _pred(*, finish=30.0, vc_frac=0.63, mae=2.8):
    cv = SimpleNamespace(mae_pct=mae) if mae is not None else None
    return SimpleNamespace(finish_hours=finish, vc_fraction=vc_frac, cross_validation=cv)


# --------------------------------------------------------------------------- #
def test_profile_word_follows_endurance_exponent():
    # exposant de Riegel = déclin : BAS → diesel, ÉLEVÉ → décline plus (jamais « vitesse »)
    assert N._profile_word(_twin(E=1.05)) == "diesel"
    assert N._profile_word(_twin(E=1.22)) == "équilibré"   # cas de référence : au milieu
    assert N._profile_word(_twin(E=1.35)) == "fade"
    assert N._profile_word(_twin(E=None)) is None


def test_durability_word_follows_decoupling():
    assert N._durability_word(_twin(durab=10)) == "excellente"
    assert N._durability_word(_twin(durab=20)) == "bonne"
    assert N._durability_word(_twin(durab=30)) == "à surveiller"
    assert N._durability_word(_twin(durab=None)) is None


def test_opening_narrative_changes_with_profile():
    a = N.opening_narrative(_twin(E=1.05), None, _pred())   # diesel (décline peu)
    b = N.opening_narrative(_twin(E=1.35), None, _pred())   # décline plus nettement
    assert "moteur d'endurance" in a    # explication « diesel »
    assert "rationner l'effort" in b    # explication « fade » (axe déclin, jamais vitesse)
    assert a != b                       # le texte suit la valeur


def test_opening_narrative_degrades_without_prediction():
    txt = N.opening_narrative(_twin(), None, None)
    assert "ordre de grandeur" in txt   # pas de prédiction → cadrage prudent


def test_opening_avoids_jargon_and_gender():
    # NB : la prose porte les accents en LaTeX (« d\'ecouplage ») → on teste le radical.
    txt = N.opening_narrative(_twin(), None, _pred())
    assert "ecouplage" not in txt       # jargon réservé à la section où il est défini
    assert "coureur" not in txt         # tournure non genrée (s'accorde avec « profil »)


def test_opening_flags_reduced_confidence_when_no_cv():
    confident = N.opening_narrative(_twin(), None, _pred(mae=2.8))      # cv présent
    cautious = N.opening_narrative(_twin(), None, _pred(mae=None))      # cv None (régime faible)
    assert "confirmer" not in confident
    assert "confirmer" in cautious


def test_glossary_covers_six_concepts():
    terms = " ".join(t for t, _ in N.GLOSSARY).lower()
    for concept in ("vitesse critique", "distance", "endurance", "durabilit", "validation crois", "point fixe"):
        assert concept in terms


def test_minetti_example_is_computed_not_hardcoded():
    txt = N.minetti_example(CFG)
    f_up = grade_factor(0.15, CFG.course.cr0)
    expected = f"{f_up:.2f}".replace(".", ",")   # ex. « 2,06 »
    assert expected in txt
    assert "+15" in txt and "15" in txt


def test_vc_pourtoi_reflects_intensity():
    low = N.vc_pourtoi(_twin(), _pred(vc_frac=0.55))
    high = N.vc_pourtoi(_twin(), _pred(vc_frac=0.90))
    assert "loin du plafond" in low
    assert "soutenue" in high and low != high


def test_intensity_feeling_thresholds():
    assert "trop facile" in N.intensity_feeling(_pred(vc_frac=0.55))
    assert "confortable" in N.intensity_feeling(_pred(vc_frac=0.80))
    assert "engag" in N.intensity_feeling(_pred(vc_frac=0.95))


def test_key_segments_picks_real_extremes():
    segs = [
        SimpleNamespace(index=1, to="A", dplus_m=200, dminus_m=50, mean_grade_pct=5),
        SimpleNamespace(index=2, to="B", dplus_m=900, dminus_m=100, mean_grade_pct=15),   # max climb
        SimpleNamespace(index=3, to="C", dplus_m=100, dminus_m=800, mean_grade_pct=-18),  # max descent
    ]
    course = SimpleNamespace(segments=segs)
    k = N.key_segments(course)
    assert k["climb"].to == "B" and k["descent"].to == "C"


def test_race_strategy_uses_computed_night_and_segments():
    segs_course = [
        SimpleNamespace(index=1, to="Col", dplus_m=900, dminus_m=100, mean_grade_pct=12),
        SimpleNamespace(index=2, to="Vallée", dplus_m=100, dminus_m=900, mean_grade_pct=-12),
    ]
    course = SimpleNamespace(segments=segs_course)
    plan_segs = [
        SimpleNamespace(off1=10, night=False, arr_clock="ven. 18:00"),
        SimpleNamespace(off1=40, night=True, arr_clock="ven. 21:00"),
        SimpleNamespace(off1=70, night=True, arr_clock="sam. 05:00"),
    ]
    plan = SimpleNamespace(segments=plan_segs)
    items = N.race_strategy(course, plan)
    blob = " ".join(i["body"] for i in items)
    assert "Col" in blob and "Vall" in blob          # segments-clés réels
    assert "21:00" in blob and "05:00" in blob        # heures de nuit calculées


def test_durability_pourtoi_handles_missing_hr():
    txt = N.durability_pourtoi(_twin(durab=None))
    assert "inconnue" in txt


def test_caption_record_qualitative_follows_fraction():
    """L'affirmation « loin sous le plafond » ne doit apparaître que si la fraction est basse."""
    twin = _twin(vc_kmh=10.0)
    low = N.caption_record(twin, SimpleNamespace(genuine=[SimpleNamespace(vga_kmh=6.0)]))   # 60 %
    high = N.caption_record(twin, SimpleNamespace(genuine=[SimpleNamespace(vga_kmh=9.5)]))   # 95 %
    assert "loin sous le plafond" in low
    assert "proche de ton seuil" in high and "loin sous le plafond" not in high


def test_caption_record_suppresses_vc_fraction_when_implausible():
    """VC non plausible → aucune « % de ta VC » (cohérent avec predict.vc_fraction=None)."""
    twin = _twin(vc_kmh=27.0, vc_plausible=False)   # VC absurde (27 km/h)
    txt = N.caption_record(twin, SimpleNamespace(genuine=[SimpleNamespace(vga_kmh=12.0)]))
    assert "de ta VC" not in txt         # pas de ratio d'intensité trompeur
    assert "plafond" not in txt          # ni d'affirmation « loin sous le plafond »


def test_vc_pourtoi_hidden_when_implausible():
    """R2 : une VC jugée non plausible n'est jamais présentée comme « ton seuil »."""
    assert N.vc_pourtoi(_twin(vc_plausible=False), _pred()) is None
    assert N.vc_pourtoi(_twin(vc_plausible=True), _pred()) is not None


def test_cv_pourtoi_mentions_interpolation_when_folds_extrapolate():
    """R5 : quand des plis extrapolent, le texte donne aussi l'erreur d'interpolation (celle du gate)."""
    cv = SimpleNamespace(mae_pct=25.3, mae_interpolation_pct=17.0, n_extrapolation=3)
    txt = N.cv_pourtoi(SimpleNamespace(cross_validation=cv))
    assert "25,3" in txt and "17" in txt and "encadrent" in txt
    # sans info d'extrapolation (vieux objets/tests) → texte simple, pas d'erreur
    plain = N.cv_pourtoi(SimpleNamespace(cross_validation=SimpleNamespace(mae_pct=2.8)))
    assert "2,8" in plain and "encadrent" not in plain


def test_caption_cumul_describes_scaling_not_accumulation():
    """R3 : la légende décrit le scaling global réellement calculé, pas une accumulation."""
    txt = N.caption_cumul()
    assert "additionnent" not in txt
    assert "sc\\'enario" in txt


def test_caption_record_mentions_terracotta_only_with_flat_points():
    """R : la légende ne décrit les points terracotta que si la figure en trace."""
    cal = SimpleNamespace(genuine=[])
    twin_with = _twin()
    twin_with.record = SimpleNamespace(flat_points=[object()])
    twin_without = _twin()   # pas d'attribut record → pas de points plats
    assert "terracotta" in N.caption_record(twin_with, cal)
    assert "terracotta" not in N.caption_record(twin_without, cal)


def test_caption_record_labels_past_ultras_distinctly():
    """R4 : le « % de ta VC » des ultras PASSÉS est étiqueté comme tel (≠ intensité cible)."""
    txt = N.caption_record(_twin(vc_kmh=10.0),
                           SimpleNamespace(genuine=[SimpleNamespace(vga_kmh=6.0)]))
    assert "pass\\'es" in txt and "distinguer" in txt


def test_presentation_thresholds_come_from_config():
    """R6 : les seuils de présentation vivent en config — les déplacer change les mots ;
    sans cfg, les défauts (identiques aux valeurs historiques) s'appliquent."""
    from dataclasses import replace

    from twin_engine.config import load_config

    base = load_config()
    cfg = replace(base, narrative=replace(base.narrative, e_diesel=1.25,
                                          durability_excellent_pct=22.0))
    assert N._profile_word(_twin(E=1.22)) == "équilibré"          # défauts inchangés
    assert N._profile_word(_twin(E=1.22), cfg) == "diesel"        # seuil déplacé → mot suit
    assert N._durability_word(_twin(durab=20)) == "bonne"
    assert N._durability_word(_twin(durab=20), cfg) == "excellente"


def test_vc_band_compares_on_displayed_percent():
    """R6 : le conseil suit le POURCENTAGE AFFICHÉ — deux athlètes qui lisent « 70 % »
    reçoivent la même formulation, quelle que soit la 3ᵉ décimale."""
    assert N.vc_frac_band(0.699) == N.vc_frac_band(0.702)   # tous deux affichés « 70 % »
    assert N.vc_frac_band(0.694) == "low"                    # affiché « 69 % » → sous le seuil
    assert N.vc_frac_band(None) is None


def test_caption_validation_band_follows_config():
    """R6 : la bande ±X % de la légende = le seuil 🟢 de la CV (config), plus de doublon en dur."""
    from dataclasses import replace

    from twin_engine.config import load_config

    base = load_config()
    cfg = replace(base, sufficiency=replace(base.sufficiency, cv_error_green_pct=7.0))
    txt = N.caption_validation(SimpleNamespace(cross_validation=SimpleNamespace(mae_pct=3.0)), cfg)
    assert "$\\pm$7" in txt


def test_interval_label_derived_from_percentiles():
    """R6 : le « 50 % » de la légende du cumul est dérivé des percentiles de PACING
    (la bande tracée est la fourchette de course des segments, plus l'intervalle de
    la prédiction depuis la double bande)."""
    from dataclasses import replace

    from twin_engine.config import load_config

    base = load_config()
    cfg = replace(base, pacing=replace(base.pacing, plan_window_low_pct=10,
                                       plan_window_high_pct=90))
    assert "80" in N.caption_cumul(cfg)
    assert "50" in N.caption_cumul(base)
    assert "fourchette de course" in N.caption_cumul(base)


def test_aid_station_names_are_latex_escaped():
    """Garde-fou audit : un nom de ravito avec & / _ ne doit pas casser XeLaTeX."""
    segs = [
        SimpleNamespace(index=1, to="Bar & Tabac", dplus_m=900, dminus_m=100, mean_grade_pct=12),
        SimpleNamespace(index=2, to="Refuge_Nord", dplus_m=100, dminus_m=900, mean_grade_pct=-12),
    ]
    course = SimpleNamespace(segments=segs, length_km=80, deq_km=93, dplus_m=3889)
    txt = N.demande_key_sentence(course)
    assert "Bar \\& Tabac" in txt          # & échappé (montée)
    assert "Refuge\\_Nord" in txt          # _ échappé (descente)
    assert "Bar \\& Tabac" in N.caption_profil(course)
