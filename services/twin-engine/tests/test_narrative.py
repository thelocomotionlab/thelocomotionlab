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


def _twin(*, E=1.22, durab=21.0, vc_kmh=10.5):
    cs = SimpleNamespace(vc_kmh=vc_kmh, vc_ms=vc_kmh / 3.6, vc_sd=0.1, dprime_m=1500)
    return SimpleNamespace(endurance_E=E, durability_pct=durab, critical_speed=cs)


def _pred(*, finish=30.0, vc_frac=0.63, mae=2.8):
    cv = SimpleNamespace(mae_pct=mae) if mae is not None else None
    return SimpleNamespace(finish_hours=finish, vc_fraction=vc_frac, cross_validation=cv)


# --------------------------------------------------------------------------- #
def test_profile_word_follows_endurance_exponent():
    assert N._profile_word(_twin(E=1.25)) == "endurant"
    assert N._profile_word(_twin(E=1.00)) == "rapide"
    assert N._profile_word(_twin(E=1.10)) == "équilibré"
    assert N._profile_word(_twin(E=None)) is None


def test_durability_word_follows_decoupling():
    assert N._durability_word(_twin(durab=10)) == "excellente"
    assert N._durability_word(_twin(durab=20)) == "bonne"
    assert N._durability_word(_twin(durab=30)) == "à surveiller"
    assert N._durability_word(_twin(durab=None)) is None


def test_opening_narrative_changes_with_profile():
    a = N.opening_narrative(_twin(E=1.25), None, _pred())
    b = N.opening_narrative(_twin(E=1.00), None, _pred())
    assert "endurant" in a and "rapide" in b
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
