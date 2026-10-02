"""La loi de pente personnelle servie à la seule répartition du plan.

``calibration.slope_cost=personal_pacing`` répartit le temps sous la loi mesurée sans toucher
au total ; ``slope_kappa_down_min`` laisse la descente perdre toute remise ; ``slope_curve=bins``
sert le facteur mesuré par tranche, rétréci vers la loi de Minetti.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_phase5_pente import _sawtooth_gpx, _summary_with_bins, _twin, _ultra  # noqa: E402

from twin_engine.config import load_config, override_config  # noqa: E402
from twin_engine.course import RaceSpec, build_course  # noqa: E402
from twin_engine.minetti import grade_factor  # noqa: E402
from twin_engine.pacing import build_pacing  # noqa: E402
from twin_engine.pipeline import analyze_preview_from_twin  # noqa: E402
from twin_engine.registre import bloc_course, bloc_modele  # noqa: E402
from twin_engine.twin.model import fit_slope_cost  # noqa: E402
from twin_engine.twin.pente import (detail_du_registre, facteur_de_minetti,  # noqa: E402
                                    facteur_sur_la_grille, kappas_servis, loi_de_repartition,
                                    rapports_par_tranche, repartir, servir_parcours)
from twin_engine.twin.record import slope_bin_centers  # noqa: E402

CFG = load_config()
PACING = override_config(CFG, "calibration.slope_cost=personal_pacing,calibration.slope_kappa_down_min=0")
RACE = RaceSpec("Dent", (0.0, 4.0, 8.0, 12.0, 16.0), ("d", "m", "s", "m2", "a"))


def _f_m(grade_pct: float) -> float:
    return float(grade_factor(grade_pct / 100.0, CFG.course.cr0, cap=CFG.twin.f_cap))


def _bins(ku: float, kd: float, n: int = 3600, v0: float = 3.0, hr: float = 150.0) -> dict:
    """Sommes par tranche exactes d'un athlète qui suit 1 + κ(f_Minetti − 1) par côté."""
    sums = {"n": [], "sum_lnv": [], "sum_lnh": [], "sum_invh": []}
    for c in slope_bin_centers(CFG):
        k = ku if c > 0 else kd if c < 0 else 1.0
        f = 1.0 + k * (_f_m(c) - 1.0)
        sums["n"].append(n)
        sums["sum_lnv"].append(n * math.log(v0 / f))
        sums["sum_lnh"].append(n * math.log(hr - 60.0))
        sums["sum_invh"].append(n / (hr - 60.0))
    return sums


def _detail(ku_raw, kd_raw, *, hours=(40.0, 30.0), bins=None):
    return {"hours_up": hours[0], "hours_down": hours[1], "kappa_up_raw": ku_raw,
            "kappa_down_raw": kd_raw, "bins": bins or []}


def _ultras():
    return [_ultra(12, 70.0, 20.0, -6.0), _ultra(20, 110.0, 35.0, -10.0),
            _ultra(16, 90.0, 26.0, -8.0), _ultra(24, 130.0, 42.0, -12.0),
            _ultra(18, 100.0, 30.0, -9.0)]


def test_the_descent_floor_lets_the_descent_lose_its_discount():
    cfg = override_config(CFG, "calibration.slope_cost_min_hours=1")
    s = [_summary_with_bins(_bins(0.6, 0.2))]
    ku, kd, det = fit_slope_cost(s, cfg, None)
    assert ku == pytest.approx(0.6, abs=1e-9)
    assert kd == 0.5 and det["kappa_down_raw"] == pytest.approx(0.2, abs=1e-6)  # borne historique
    ku0, kd0, _ = fit_slope_cost(s, override_config(cfg, "calibration.slope_kappa_down_min=0"), None)
    assert ku0 == pytest.approx(0.6, abs=1e-9) and kd0 == pytest.approx(0.2, abs=1e-6)
    # la borne de montée ne bouge pas avec celle de descente
    assert fit_slope_cost([_summary_with_bins(_bins(0.3, 0.2))],
                          override_config(cfg, "calibration.slope_kappa_down_min=0"), None)[0] == 0.5
    # une descente plus lente que le plat s'arrête à « aucune remise »
    assert kappas_servis(_detail(0.6, -0.3), PACING) == (0.6, 0.0)
    assert kappas_servis(_detail(0.6, -0.3), CFG) == (0.6, 0.5)
    assert kappas_servis(_detail(None, 0.8), PACING) == (1.0, 0.8)
    assert kappas_servis(_detail(None, None), PACING) is None and kappas_servis(None, PACING) is None


def test_the_law_itself_leaves_the_plan_untouched():
    course = build_course(_sawtooth_gpx(), RACE, CFG)
    f = facteur_de_minetti(course)
    assert f == pytest.approx(course.grade_factor, abs=1e-9)
    meme = course.with_repartition(f, {"curve": "minetti"})
    assert meme.deq_km == course.deq_km and meme.repartition == {"curve": "minetti"}
    assert meme.repartition_km == pytest.approx([s.deq_km for s in course.segments], abs=1e-9)
    twin = _twin(_ultras())
    pred = analyze_preview_from_twin(twin, course, CFG, n_ingested=5).prediction
    a, b = build_pacing(course, pred, RACE, CFG), build_pacing(meme, pred, RACE, CFG)
    assert [s.t_move_min for s in a.segments] == [s.t_move_min for s in b.segments]
    assert [s.v_ga_kmh for s in a.segments] == [s.v_ga_kmh for s in b.segments]
    # la loi se relit aussi sous un coût personnel déjà servi au total
    assert facteur_de_minetti(course.with_slope_cost(1.4, 0.6)) == pytest.approx(f, abs=1e-9)
    tech = build_course(_sawtooth_gpx(), RaceSpec("Dent", RACE.aid_km, RACE.aid_names,
                                                  technicity_pct=10.0), CFG)
    assert (tech.with_repartition(facteur_de_minetti(tech), {}).repartition_km
            == pytest.approx([s.deq_km for s in tech.segments], abs=1e-9))
    bare = course.__class__(**{**course.__dict__, "excess_up_grid_m": None})
    assert facteur_de_minetti(bare) is None and repartir(bare, _detail(0.6, 0.0), PACING) is bare


def test_personal_pacing_moves_the_distribution_and_nothing_else():
    course = build_course(_sawtooth_gpx(), RACE, CFG)
    twin = _twin(_ultras(), ku=0.6, kd=0.5)
    twin.slope_detail = _detail(0.6, 0.0)
    res_m = analyze_preview_from_twin(twin, course, CFG, n_ingested=5)
    res_p = analyze_preview_from_twin(twin, course, PACING, n_ingested=5)
    # le total : même calibration, même parcours, même prédiction
    assert res_p.calibration.slope_kappa is None and res_p.course.slope_kappa is None
    assert res_p.prediction.finish_hours == res_m.prediction.finish_hours
    assert res_p.course.deq_km == course.deq_km
    assert [s.deq_km for s in res_p.course.segments] == [s.deq_km for s in course.segments]
    assert res_p.course.repartition == {"curve": "kappa", "kappa": [0.6, 0.0]}
    assert bloc_course(res_p.course)["repartition"] == {"curve": "kappa", "kappa": [0.6, 0.0]}
    plan_m = build_pacing(res_m.course, res_m.prediction, RACE, CFG)
    plan_p = build_pacing(res_p.course, res_p.prediction, RACE, PACING)
    assert plan_p.t_move_h == pytest.approx(plan_m.t_move_h, abs=1e-9)
    assert plan_p.t_clock_h == pytest.approx(plan_m.t_clock_h, abs=1e-9)
    montee = sum(s.t_move_min for s in plan_p.segments[:2]) - sum(s.t_move_min for s in plan_m.segments[:2])
    descente = sum(s.t_move_min for s in plan_p.segments[2:]) - sum(s.t_move_min for s in plan_m.segments[2:])
    # montée moins chère que la loi, descente sans remise : le temps passe des côtes aux descentes
    assert montee < -5 and descente > 5 and montee + descente == pytest.approx(0.0, abs=0.2)
    # la vitesse ajustée affichée reste rapportée au Deq de la loi
    for s in plan_p.segments:
        assert s.v_ga_kmh == pytest.approx(s.deq_km / (s.t_move_min / 60.0), rel=0.01)


def test_the_bins_law_is_shrunk_toward_minetti():
    centres = [c for c in slope_bin_centers(CFG) if c != 0]
    personnel = {c: _f_m(c) * (0.8 if c > 0 else 1.6) for c in centres}
    bins = [{"grade_pct": c, "f_personal": personnel[c], "f_minetti": _f_m(c), "hours": 5.0}
            for c in centres]
    detail = _detail(0.6, 0.0, bins=bins)
    brut = override_config(CFG, "calibration.slope_curve=bins,calibration.slope_bins_shrink_hours=0")
    g, r = rapports_par_tranche(detail, brut)
    assert g[np.argmin(np.abs(g))] == 0.0 and r[np.argmin(np.abs(g))] == 1.0
    assert r[g > 0] == pytest.approx(0.8) and r[g < 0] == pytest.approx(1.6)
    moitie = override_config(brut, "calibration.slope_bins_shrink_hours=5")
    _, r5 = rapports_par_tranche(detail, moitie)
    assert r5[g > 0] == pytest.approx(0.9) and r5[g < 0] == pytest.approx(1.3)
    _, r_inf = rapports_par_tranche(detail, override_config(brut, "calibration.slope_bins_shrink_hours=1e9"))
    assert r_inf == pytest.approx(1.0, abs=1e-7)
    # un côté sous le minimum d'heures garde la loi
    _, r_peu = rapports_par_tranche(_detail(0.6, 0.0, hours=(40.0, 3.0), bins=bins), brut)
    g_peu, _ = rapports_par_tranche(_detail(0.6, 0.0, hours=(40.0, 3.0), bins=bins), brut)
    assert (g_peu >= 0).all() and r_peu[g_peu > 0] == pytest.approx(0.8)
    assert rapports_par_tranche(_detail(0.6, 0.0), brut) is None
    # sur le parcours : le coût de la loi × le rapport de la tranche (bords prolongés) ;
    # entre le plat et la première tranche, le rapport s'interpole
    course = build_course(_sawtooth_gpx(), RACE, CFG)
    loi = loi_de_repartition(detail, brut)
    assert loi["curve"] == "bins" and loi["shrink_hours"] == 0.0
    f = facteur_sur_la_grille(course, loi)
    montee, descente = course.grade >= 0.025, course.grade <= -0.025
    assert f[montee] == pytest.approx(0.8 * course.grade_factor[montee], rel=1e-6)
    assert f[descente] == pytest.approx(1.6 * course.grade_factor[descente], rel=1e-6)
    servi = servir_parcours(course, SimpleNamespace(slope_detail=detail),
                            override_config(brut, "calibration.slope_cost=personal_pacing"))
    assert servi.repartition["curve"] == "bins" and servi.deq_km == course.deq_km


def test_each_mode_serves_what_it_says():
    course = build_course(_sawtooth_gpx(), RACE, CFG)
    twin = _twin(_ultras(), ku=0.6, kd=0.5)
    centres = [c for c in slope_bin_centers(CFG) if c != 0]
    twin.slope_detail = _detail(0.6, 0.3, bins=[{"grade_pct": c, "f_personal": _f_m(c),
                                                 "f_minetti": _f_m(c), "hours": 4.0}
                                                for c in centres])
    assert servir_parcours(course, twin, CFG) is course
    perso = servir_parcours(course, twin, override_config(CFG, "calibration.slope_cost=personal"))
    assert perso.slope_kappa == (0.6, 0.5) and perso.repartition is None
    perso_bins = servir_parcours(course, twin, override_config(
        CFG, "calibration.slope_cost=personal,calibration.slope_curve=bins"))
    assert perso_bins.slope_kappa == (0.6, 0.5) and perso_bins.repartition["curve"] == "bins"
    # des tranches qui suivent la loi répartissent comme la loi, même sous un total personnel
    assert perso_bins.repartition_km == pytest.approx([s.deq_km for s in course.segments], abs=1e-6)
    rep = servir_parcours(course, twin, override_config(CFG, "calibration.slope_cost=personal_pacing"))
    assert rep.slope_kappa is None and rep.repartition == {"curve": "kappa", "kappa": [0.6, 0.5]}
    twin.slope_detail = None
    assert servir_parcours(course, twin, PACING) is course


def test_the_registre_keeps_the_whole_measure_and_replays_it():
    twin = _twin(_ultras(), ku=0.6, kd=0.5)
    centres = [c for c in slope_bin_centers(CFG) if c != 0]
    twin.slope_detail = _detail(0.6, 0.2, bins=[{"grade_pct": c, "f_personal": round(_f_m(c), 4),
                                                 "f_minetti": _f_m(c), "hours": 4.0}
                                                for c in centres])
    from twin_engine.calibration import build_calibration
    from twin_engine.sufficiency import assess_sufficiency

    cal = build_calibration(twin, CFG)
    course = build_course(_sawtooth_gpx(), RACE, CFG)
    pred = analyze_preview_from_twin(twin, course, CFG, n_ingested=5).prediction
    suf = assess_sufficiency(twin, cal, pred, CFG)
    m = bloc_modele(twin=twin, calibration=cal, sufficiency=suf, cfg=CFG, n_activities_used=5)
    assert m["slope_kappa_down_raw"] == 0.2 and len(m["slope_bins"]) == len(centres)
    detail = detail_du_registre(m, CFG)
    assert detail["kappa_down_raw"] == 0.2 and detail["hours_up"] == 40.0
    assert detail["bins"][0]["f_minetti"] == pytest.approx(_f_m(centres[0]))
    assert kappas_servis(detail, PACING) == (0.6, 0.2)
    # une entrée d'avant les tranches : les κ servis tiennent lieu de valeurs brutes
    vieux = {"slope_kappa_up": 0.63, "slope_kappa_down": 0.5, "slope_hours_up": 196.0,
             "slope_hours_down": 149.0}
    assert kappas_servis(detail_du_registre(vieux, CFG), PACING) == (0.63, 0.5)
    assert detail_du_registre({"verdict": "🟢"}, CFG) is None
    assert repartir(course, detail_du_registre(vieux, CFG), PACING).repartition["kappa"] == [0.63, 0.5]


def test_score_plan_replays_the_personal_distribution_from_the_registre(tmp_path):
    """Des passages produits par un plan réparti sous κ = (0,6 ; 0) : le scoreur les retrouve
    sous ``personal_pacing`` depuis la mesure consignée au registre, pas sous la loi."""
    import json

    from tools.score_plan import _stand_in, score_registre

    course = build_course(_sawtooth_gpx(), RACE, CFG)
    official = 2.0
    modele = {"slope_kappa_up": 0.6, "slope_kappa_down": 0.5, "slope_kappa_up_raw": 0.6,
              "slope_kappa_down_raw": -0.2, "slope_hours_up": 40.0, "slope_hours_down": 30.0,
              "slope_bins": []}
    vrai = repartir(course, detail_du_registre(modele, PACING), PACING)
    ref = build_pacing(vrai, _stand_in(official, course.deq_km, course.dplus_per_km,
                                       stops_model="carved", stops_rate=None), RACE, PACING)
    cps = [{"km": 0.0, "name": "d", "t_h": 0.0}] + [
        {"km": s.off1, "name": s.to, "t_h": s.cum_clock_exact_h} for s in ref.segments]
    (tmp_path / "course.gpx").write_bytes(_sawtooth_gpx())
    (tmp_path / "race.json").write_text(json.dumps(
        {"name": "Dent", "aid_km": list(RACE.aid_km), "aid_names": list(RACE.aid_names)}),
        encoding="utf-8")
    mp = tmp_path / "m.json"
    mp.write_text(json.dumps({"athlete": "T", "archive": "a", "races": [
        {"name": "Dent", "date": "2026-06-01", "official_time": "2:00:00", "gpx": "course.gpx",
         "race_json": "race.json"}]}), encoding="utf-8")
    registre = {"entries": [{"athlete": "T", "race": "Dent", "date": "2026-06-01",
                             "official_time_h": official, "dnf": False, "model": modele,
                             "passages": {"checkpoints": cps}}]}
    loi = score_registre(registre, [mp], CFG)[0]["scores"][("config", "carved")]
    perso = score_registre(registre, [mp], PACING)[0]["scores"][("config", "carved")]
    assert perso["mae_min"] < 1e-6 < 0.5 < loi["mae_min"]


def test_score_plan_judges_the_laws_out_of_the_aid_stations(tmp_path):
    """Un arrêt imprévu de 30 min au sommet pèse sur les passages, pas sur la répartition
    jugée hors ravito : celle-ci rend zéro sous la loi de l'athlète, et sous Minetti un plan
    trop long dans les montées, trop court dans les descentes. ``--variant`` compare les lois
    en une passe ; une course mise à part ne compte dans aucun groupe."""
    import json

    from tools.score_plan import _stand_in, main, score_registre
    from twin_engine.registre import Depot, entete_de_run

    course = build_course(_sawtooth_gpx(), RACE, CFG)
    modele = {"slope_kappa_up": 0.6, "slope_kappa_down": 0.5, "slope_kappa_up_raw": 0.6,
              "slope_kappa_down_raw": -0.2, "slope_hours_up": 40.0, "slope_hours_down": 30.0,
              "slope_bins": []}
    vrai = repartir(course, detail_du_registre(modele, PACING), PACING)
    ref = build_pacing(vrai, _stand_in(2.0, course.deq_km, course.dplus_per_km,
                                       stops_model="carved", stops_rate=None), RACE, PACING)
    hors = [s.t_move_min / 60.0 for s in ref.segments]
    ravito = [0.0, 0.0, 0.5, 0.0]                      # 30 min au départ du sommet « s »
    ecoule = [h + r for h, r in zip(hors, ravito)]
    cumul = np.concatenate([[0.0], np.cumsum(ecoule)])
    noms = ["d", "m", "s", "m2", "a"]
    pas = {"checkpoints": [{"km": float(km), "name": n, "t_h": float(t), "method": "radius"}
                           for km, n, t in zip(RACE.aid_km, noms, cumul)],
           "segments": [{"de": noms[i], "a": noms[i + 1], "ecoule_h": ecoule[i], "ravito_h": ravito[i],
                         "hors_ravito_h": hors[i], "ravito_lu": True} for i in range(4)]}
    official = float(cumul[-1])
    (tmp_path / "course.gpx").write_bytes(_sawtooth_gpx())
    (tmp_path / "race.json").write_text(json.dumps(
        {"name": "Dent", "aid_km": list(RACE.aid_km), "aid_names": list(RACE.aid_names)}),
        encoding="utf-8")
    mp = tmp_path / "m.json"
    mp.write_text(json.dumps({"athlete": "T", "archive": "a", "races": [
        {"name": "Dent", "date": "2026-06-01", "official_time": "2:15:00", "gpx": "course.gpx",
         "race_json": "race.json"}]}), encoding="utf-8")
    entree = {"athlete": "T", "race": "Dent", "date": "2026-06-01", "official_time_h": official,
              "dnf": False, "model": modele}

    loi = score_registre({"entries": [{**entree, "passages": pas}]}, [mp], CFG)[0]
    perso = score_registre({"entries": [{**entree, "passages": pas}]}, [mp], PACING)[0]
    assert perso["hors"]["mae_min"] < 1e-6 < 1.0 < perso["servi"]["mae_min"]
    assert loi["hors"]["mae_min"] > 0.5 and loi["hors"]["montees_min"] > 0 > loi["hors"]["descentes_min"]

    depot = Depot(tmp_path / "registre")
    depot.ecrire_run(entete_de_run(CFG, livre="banc"), [entree])
    depot.ecrire_passages([("T", "Dent", "2026-06-01", pas)])
    sortie = tmp_path / "score.md"
    variante = "PP0:calibration.slope_cost=personal_pacing,calibration.slope_kappa_down_min=0"
    assert main([str(mp), "--depot", str(depot.racine), "--variant", variante, "--out", str(sortie)]) == 0
    md = sortie.read_text(encoding="utf-8")
    assert md.startswith("**Lois comparées")
    assert "| base | configuration de base | 1 |" in md
    assert "| PP0 | calibration.slope_cost=personal_pacing,calibration.slope_kappa_down_min=0 | 1 | 0.0 |" in md
    assert "Configuration de base, en détail" in md and "répartition jugée hors ravito" in md

    # ce qui reste sous Minetti : le plan trop long en montée, trop court en descente
    assert main([str(mp), "--depot", str(depot.racine), "--residus", "--out", str(sortie)]) == 0
    md = sortie.read_text(encoding="utf-8")
    assert md.startswith("**Ce qui reste")
    lignes = {l.split("|")[2].strip(): l for l in md.splitlines() if l.startswith("| type de tronçon")}
    assert float(lignes["montée"].split("|")[4]) > 0 > float(lignes["descente"].split("|")[4])
    assert "| tiers de course | 1er tiers |" in md and "*Par athlète — tiers de course*" in md
    assert "| jour ou nuit |" not in md                 # course sans heure de départ
    assert "*Type de tronçon × tiers de course*" in md and "*Type de tronçon × jour ou nuit*" not in md
    assert "*Par athlète — type de tronçon*" in md and "| T | " in md

    depot.mettre_a_part("T", "Dent", "2026-06-01", "mise au point", "2026-10-02")
    assert main([str(mp), "--depot", str(depot.racine), "--variant", variante, "--out", str(sortie)]) == 0
    md = sortie.read_text(encoding="utf-8")
    assert "| T | Dent (à part) |" in md and "Rapportées à part — répartition hors ravito" in md
    assert "| base | configuration de base | 1 |" not in md


def test_the_residuals_keep_climbs_and_descents_apart():
    """Un plan trop long de 10 % en montée et trop court de 10 % en descente se lit nul sur le
    tiers de course, et ±10 % une fois croisé par type ; un athlète sans mesure de pente est
    signalé."""
    from tools.score_plan import residus_markdown

    def troncon(typ, phase, ecart):
        return {"plan_min": 60.0 * (1 + ecart), "reel_min": 60.0, "type": typ, "phase": phase,
                "nuit": None, "denivele_m_km": 100.0}

    rows = [{"athlete": "T", "pente_mesuree": True,
             "hors": {"troncons": [troncon("montée", 0.1, 0.1), troncon("descente", 0.2, -0.1)]}},
            {"athlete": "R", "pente_mesuree": False,
             "hors": {"troncons": [troncon("mixte", 0.9, 0.0)]}}]
    md = residus_markdown(rows)
    assert "| tiers de course | 1er tiers | 2 | 0.0 | 10.0 |" in md
    assert "| montée | 10.0 (1) | — | — |" in md and "| descente | -10.0 (1) | — | — |" in md
    assert "*Type de tronçon × jour ou nuit*" not in md
    assert "| R (pente non mesurée : loi standard) |" in md and "| T | 10.0 (1) | -10.0 (1) | — |" in md
