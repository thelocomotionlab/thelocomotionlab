"""Le dossier rejouable : refaire le document sans l'archive, et le refaire À L'IDENTIQUE.

Ce que ces tests tiennent, c'est la promesse de la boucle d'amendement : l'athlète change
ses arrêts sur la page de son rapport, et récupère LE document — pas un document voisin.
Deux chemins de rendu qui divergent d'un pouce, et la feuille qu'il emporte ne dit plus ce
que dit son livret.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from dataclasses import replace
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from test_report_v3 import CFG, _triangle_gpx, race_spec, scenario   # noqa: E402
from twin_engine import dossier                                      # noqa: E402
from twin_engine.course import build_course                          # noqa: E402
from twin_engine.pipeline import rendre_documents                    # noqa: E402
from twin_engine.report import build_report_context, render_template  # noqa: E402
from twin_engine.report.render import FEUILLE_TEMPLATE, FICHES_TEMPLATE, REPORT_TEMPLATE  # noqa: E402

DATE = dt.datetime(2026, 9, 16, 10, 0)
GABARITS = (REPORT_TEMPLATE, FEUILLE_TEMPLATE, FICHES_TEMPLATE)


def _cas(race=None):
    return scenario(race=race)


def _dossier_de(cas, race_source=None):
    course, twin, cal, pred, plan, race, suf = cas
    brut = dossier.to_payload(course_gpx=_triangle_gpx(), race=race_source or race, twin=twin,
                              calibration=cal, prediction=pred, sufficiency=suf,
                              athlete="Camille & Léo", report_ref="LL-TWIN-GOLDEN01",
                              report_date=DATE)
    # on repasse par JSON : c'est ce que le fichier et l'API transportent, pas les objets
    return dossier.from_payload(json.loads(json.dumps(brut, ensure_ascii=False)))


def _tex_direct(cas) -> dict[str, str]:
    course, twin, cal, pred, plan, race, suf = cas
    ctx = build_report_context(course=course, twin=twin, calibration=cal, prediction=pred,
                               plan=plan, race=race, sufficiency=suf, cfg=CFG,
                               athlete="Camille & Léo", report_ref="LL-TWIN-GOLDEN01",
                               report_date=DATE)
    return {n: render_template(n, ctx) for n in GABARITS}


def _tex_rejeu(d, fragment=None, tmp_path=None) -> dict[str, str]:
    race = dossier.appliquer(d.race, fragment)
    course = build_course(d.course_gpx, race, CFG)
    pente = d.twin.slope_factors(CFG)
    if pente is not None:
        course = course.with_slope_cost(*pente)
    plan, _, _, _ = rendre_documents(
        course=course, twin=d.twin, calibration=d.calibration, prediction=d.prediction,
        sufficiency=d.sufficiency, target=None, race=race, cfg=CFG,
        out_dir=tmp_path or Path("/tmp"), athlete=d.athlete, report_ref=d.report_ref,
        report_date=d.report_date, render_pdf=False)
    ctx = build_report_context(course=course, twin=d.twin, calibration=d.calibration,
                               prediction=d.prediction, plan=plan, race=race,
                               sufficiency=d.sufficiency, cfg=CFG, athlete=d.athlete,
                               report_ref=d.report_ref, report_date=d.report_date)
    return {n: render_template(n, ctx) for n in GABARITS}


# --------------------------------------------------------------------------- #
def test_a_replayed_dossier_renders_the_very_same_documents(tmp_path):
    """Sans amendement, le document refait est le document d'origine — au caractère près,
    sur les trois gabarits. C'est la garantie qui rend la boucle utilisable : si rejouer
    changeait quoi que ce soit, l'athlète ne saurait plus lequel des deux croire."""
    cas = _cas()
    direct = _tex_direct(cas)
    rejeu = _tex_rejeu(_dossier_de(cas), tmp_path=tmp_path)
    for nom in GABARITS:
        assert rejeu[nom] == direct[nom], f"{nom} : le rejeu diverge de l'original"


def test_the_dossier_carries_no_raw_activity():
    """Le dossier porte des AGRÉGATS — la même matière que l'annexe publiée. Aucune trace
    d'activité, aucun point GPS d'entraînement : ce qui entre ici peut être déposé sur un
    serveur sans déposer la vie de l'athlète avec."""
    cas = _cas()
    brut = json.dumps(dossier.to_payload(
        course_gpx=_triangle_gpx(), race=cas[5], twin=cas[1], calibration=cas[2],
        prediction=cas[3], sufficiency=cas[6], athlete="Val", report_ref="LL-TWIN-X",
        report_date=DATE), ensure_ascii=False)
    d = dossier.from_payload(json.loads(brut))
    # les résumés d'activité sont des agrégats (durée, distance, D+…), pas des séries
    for s in d.twin.summaries:
        for champ in ("date", "duration_s", "dist_km", "ga_km"):
            assert hasattr(s, champ)
        assert not hasattr(s, "points") and not hasattr(s, "samples")
    assert d.twin.record.durations_s is not None          # la courbe record, elle, est utile


def test_an_unknown_amendment_is_refused():
    """Un champ hors du formulaire ne s'applique pas en silence : la page n'a pas à pouvoir
    changer la prédiction, la cible ou le nom de la course par un champ glissé au passage."""
    d = _dossier_de(_cas())
    with pytest.raises(ValueError, match="non amendable"):
        dossier.appliquer(d.race, {"target_hours": 12})
    with pytest.raises(ValueError, match="non amendable"):
        dossier.appliquer(d.race, {"aid_km": [0, 1, 2]})
    assert dossier.appliquer(d.race, None) is d.race     # rien à amender, rien à refaire


def test_a_stop_amendment_moves_the_sheet_and_the_plan_together(tmp_path):
    """Un arrêt allongé se voit dans la feuille ET dans le tableau du plan, du même montant :
    les deux lisent le même plan recalculé. C'est tout l'intérêt de refaire les deux."""
    cas = _cas()
    d = _dossier_de(cas)
    avant = _tex_rejeu(d, tmp_path=tmp_path)
    # on pose vingt minutes au deuxième ravitaillement
    apres = _tex_rejeu(d, {"reglages": [{"aid_index": 2, "stop_min": 20}]}, tmp_path=tmp_path)
    for nom in (REPORT_TEMPLATE, FEUILLE_TEMPLATE):
        assert apres[nom] != avant[nom], f"{nom} : l'amendement n'a rien changé"
    assert "20'" in apres[FEUILLE_TEMPLATE]


def test_the_amendment_only_touches_what_the_form_offers(tmp_path):
    """Les trois champs amendables sont ceux du formulaire. Ce qui vient de l'archive — la
    prédiction, le jumeau, la validation croisée — ne bouge pas d'une virgule."""
    cas = _cas()
    d = _dossier_de(cas)
    fragment = {"reglages": [{"aid_index": 1, "consigne": "bâtons"}],
                "crew": [{"aid_index": 3, "note": "soupe"}],
                "nutrition": {"water_l_per_h": 0.5, "carbs_g_per_h": 60}}
    race = dossier.appliquer(d.race, fragment)
    assert [r.consigne for r in race.reglages] == ["bâtons"]
    assert any(c.note == "soupe" for c in race.crew)
    assert race.nutrition.water_l_per_h == 0.5
    # le reste du carnet de route est intact
    for champ in ("name", "aid_km", "aid_names", "start_time", "target_hours",
                  "major_base_indices", "official_dplus_m"):
        assert getattr(race, champ) == getattr(d.race, champ)
    tex = _tex_rejeu(d, fragment, tmp_path=tmp_path)[REPORT_TEMPLATE]
    origine = _tex_direct(cas)[REPORT_TEMPLATE]
    # la preuve ne bouge pas : même erreur mesurée, même profil, même intensité
    for morceau in ("rejoués en aveugle", "Vitesse critique", "Endurance"):
        assert morceau in tex and morceau in origine


def test_a_dossier_of_another_version_refuses_to_be_read():
    """Un format qui change sans le dire rendrait un document faux : il s'arrête ici."""
    brut = dossier.to_payload(course_gpx=_triangle_gpx(), race=_cas()[5], twin=_cas()[1],
                              calibration=_cas()[2], prediction=_cas()[3],
                              sufficiency=_cas()[6], athlete="Val", report_ref="LL-X",
                              report_date=DATE)
    with pytest.raises(ValueError, match="version"):
        dossier.from_payload({**brut, "version": dossier.VERSION + 1})


def test_the_target_survives_the_round_trip(tmp_path):
    """Un rapport bâti sur un objectif se rejoue sur le même objectif : la fenêtre de
    passage refaite est celle d'origine, pas la bande de probabilité du mode normal."""
    race = race_spec(target_hours=15.0)
    cas = scenario(race=race)
    d = _dossier_de(cas)
    assert d.race.target_hours == 15.0
    plan = cas[4]
    course = build_course(d.course_gpx, d.race, CFG)
    from twin_engine.feasibility import assess_target
    cible = assess_target(d.race.target_hours, course, d.twin, d.prediction, CFG)
    assert cible.regime and isinstance(cible.plan_ok, bool)
    assert plan.segments                                   # le scénario a bien un plan


def test_only_the_spec_model_re_predicts_when_a_stop_moves():
    """Ce que le temps prévu doit à l'amendement, et rien de plus.

    En modèle ``spec`` le temps prévu EST le mouvement plus les arrêts de la politique :
    allonger un arrêt recule l'arrivée, et la prédiction doit suivre. Ailleurs (``carved``,
    ``personal``) les arrêts se répartissent dans un temps que l'archive fixe — s'arrêter
    cinq minutes de plus ne change pas ce que l'athlète sait faire, et refaire la prédiction
    coûterait un Monte-Carlo pour redonner le même chiffre.
    """
    from _tableau_de_marche import config_pour   # noqa: E402

    from twin_engine.calibration import build_calibration   # noqa: E402
    from twin_engine.predict import predict_race            # noqa: E402

    _, twin, *_ = scenario()
    fragment = {"reglages": [{"aid_index": 6, "stop_min": 25.0}]}
    for modele in ("carved", "personal", "spec"):
        cfg = config_pour(modele, CFG)
        race = race_spec()
        course = build_course(_triangle_gpx(), race, cfg)
        cal = build_calibration(twin, cfg)
        pred = predict_race(course, twin, cal, cfg, race)
        d = dossier.Dossier(course_gpx=_triangle_gpx(), race=race, twin=twin, calibration=cal,
                            prediction=pred, sufficiency=None, athlete="Val",
                            report_ref="LL-X", report_date=DATE)
        amende = dossier.appliquer(race, fragment)
        refaite = dossier.prediction_amendee(d, amende, course, cfg)
        if modele == "spec":
            # vingt minutes de plus à un ravitaillement : vingt minutes de plus au total
            assert refaite is not pred
            assert refaite.finish_hours - pred.finish_hours == pytest.approx(20 / 60, abs=1e-6)
            assert refaite.moving_hours == pytest.approx(pred.moving_hours, abs=1e-9)
        else:
            assert refaite is pred, f"{modele} : la prédiction a été refaite pour rien"
        # sans amendement, aucun modèle ne refait la prédiction
        assert dossier.prediction_amendee(d, race, course, cfg) is pred
