"""Le terrain dans le plan, le total et la calibration (``twin.terrain``).

Sur un parcours en dent de scie (montée de 8 km à +10 %, descente de 8 km à −10 %) : un profil
de carte fabriqué rend la dernière descente technique ; la répartition, le total et la
calibration réagissent chacun sous son drapeau, et seulement sous lui. La marche prévue en
descente se juge contre celle des passages. Les outils fabriquent le terrain d'une course
depuis une archive de sorties synthétiques dont les descentes hachées tombent là où la carte
l'annonce — dans un sens comme dans l'autre, pour que le D− n'en dise rien.
"""

from __future__ import annotations

import json
import math
import sys
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_phase5_pente import _sawtooth_gpx, _twin, _ultra  # noqa: E402

from twin_engine.calibration import build_calibration, prior_dplus  # noqa: E402
from twin_engine.carte import tranches_du_parcours  # noqa: E402
from twin_engine.config import load_config, override_config  # noqa: E402
from twin_engine.course import RaceSpec, build_course  # noqa: E402
from twin_engine.ingest.canonical import CanonicalActivity  # noqa: E402
from twin_engine.pacing import build_pacing  # noqa: E402
from twin_engine.pipeline import analyze_preview_from_twin  # noqa: E402
from twin_engine.registre.forme import bloc_forme  # noqa: E402
from twin_engine.twin.descentes import secondes_en_descente  # noqa: E402
from twin_engine.twin.mouvement import bilan_par_troncon  # noqa: E402
from twin_engine.twin.terrain import (consignes_de_marche, facteur_carte, facteur_de_marche,  # noqa: E402
                                      facteur_declare, marche_prevue, penalites, profil_compatible,
                                      segments_techniques, surcout_km, surcouts_des_ultras)

CFG = load_config()
RACE = RaceSpec("Dent", (0.0, 4.0, 8.0, 12.0, 16.0), ("d", "m", "s", "m2", "a"))
TRAITS = {
    "penalite_marche": {"frais": {"valeur": 0.2}, "fatigue": {"valeur": 0.3}},
    "marche": {"intercepts": [-0.5, -1.0, -1.5, -2.0], "dminus_par_km": 0.8, "nuit": 0.5},
    "vitesses": [{"pente": [-0.25, -0.18]}, {"pente": [-0.18, -0.13]},
                 {"pente": [-0.13, -0.08], "frais_hache_marche": 0.5, "frais_courable_marche": 0.05,
                  "fatigue_hache_marche": 0.6, "fatigue_courable_marche": 0.1}],
}


def _course(technicite: float = 0.0):
    race = RACE if not technicite else RaceSpec("Dent", RACE.aid_km, RACE.aid_names,
                                                technicity_pct=technicite)
    return build_course(_sawtooth_gpx(), race, CFG)


def _profil(course, *, technique_de=12.0, p_tech=0.7, p_ref=0.2, signal=True):
    """Un profil de carte du parcours : les descentes au-delà du km ``technique_de`` hachées
    à ``p_tech``, le reste comme le terrain habituel (``p_ref``)."""
    t = tranches_du_parcours(course, CFG)
    desc = t.pente <= CFG.twin.terrain_descent_grade
    pc = np.where(desc, np.where(t.km >= technique_de, p_tech, p_ref), np.nan)
    pr = np.where(desc, p_ref, np.nan)
    return {"version": 1, "course": course.name, "longueur_km": course.length_km, "pas_m": t.pas_m,
            "km": t.km.tolist(), "descente": desc.tolist(),
            "p_carte": [None if np.isnan(x) else float(x) for x in pc],
            "p_ref": [None if np.isnan(x) else float(x) for x in pr],
            "modele": {"signal": signal}}


def _jumeau(ultras=None):
    twin = _twin(ultras or [_ultra(12, 70.0, 20.0, -6.0), _ultra(20, 110.0, 35.0, -10.0),
                            _ultra(16, 90.0, 26.0, -8.0), _ultra(24, 130.0, 42.0, -12.0),
                            _ultra(18, 100.0, 30.0, -9.0)])
    twin.terrain = TRAITS
    return twin


def _par_segment(course, valeurs) -> list[float]:
    off = np.asarray(course.off_km_grid)
    return [float(np.mean(np.asarray(valeurs)[(off >= s.off0) & (off < s.off1)])) for s in course.segments]


# --------------------------------------------------------------------------- facteurs
def test_the_map_factor_is_the_walking_time_beyond_the_usual_terrain():
    assert facteur_de_marche([0.2], [0.2], [0.0], (0.2, 0.3), CFG) == pytest.approx([1.0])
    # r = p ÷ (1 − p) : 0,25 frais, 0,4286 fatigué
    f = facteur_de_marche([0.7, 0.7], [0.2, 0.2], [0.0, 5000.0], (0.2, 0.3), CFG)
    assert f[0] == pytest.approx((1 + 0.7 * 0.25) / (1 + 0.2 * 0.25))
    assert f[1] == pytest.approx((1 + 0.7 * 3 / 7) / (1 + 0.2 * 3 / 7)) and f[1] > f[0]
    assert penalites({"penalite_marche": {"frais": {"valeur": 0.1}, "fatigue": {"valeur": None}}}) == (0.1, 0.1)
    assert penalites({}) is None and penalites(None) is None

    course = _course()
    fc = facteur_carte(course, _profil(course), TRAITS, CFG)
    par_seg = _par_segment(course, fc)
    assert par_seg[:3] == pytest.approx([1.0, 1.0, 1.0]) and par_seg[3] > 1.05
    assert surcout_km(course, fc) > 0
    # sans signal, sur une autre trace, sans pénalité : rien
    assert facteur_carte(course, _profil(course, signal=False), TRAITS, CFG) is None
    assert "signal" in profil_compatible(_profil(course, signal=False), course)
    autre = {**_profil(course), "km": [x * 2 for x in _profil(course)["km"]]}
    assert "autre trace" in profil_compatible(autre, course)
    assert facteur_carte(course, _profil(course), {}, CFG) is None


def test_the_declared_technicity_goes_to_the_descents_where_the_athlete_walks():
    course = _course(10.0)
    f = facteur_declare(course, TRAITS, CFG)
    par_seg = _par_segment(course, f)
    assert par_seg[:2] == pytest.approx([1.0, 1.0])
    assert par_seg[3] > par_seg[2] > 1.0           # la probabilité de marcher grandit avec le D−
    # la même surcharge que la majoration uniforme, déplacée
    poids = np.asarray(course.grade_factor)
    assert float(np.sum(poids * (f - 1.0))) == pytest.approx(0.10 * float(np.sum(poids)), rel=1e-9)
    # sans modèle de marche : uniforme sur les descentes ; sans technicité : rien
    g = facteur_declare(course, {}, CFG)
    assert _par_segment(course, g)[2] == pytest.approx(_par_segment(course, g)[3], rel=0.01)
    assert facteur_declare(_course(), TRAITS, CFG) is None


# --------------------------------------------------------------------------- plan et total
def test_the_map_in_the_distribution_moves_time_to_the_technical_descent_only():
    course, twin = _course(), _jumeau()
    base = analyze_preview_from_twin(twin, course, CFG, n_ingested=5)
    cfg = override_config(CFG, "pacing.terrain=map")
    carte = analyze_preview_from_twin(twin, course, cfg, n_ingested=5, terrain={"parcours": _profil(course)})
    assert carte.prediction.finish_hours == base.prediction.finish_hours
    assert carte.course.deq_km == base.course.deq_km and carte.course.repartition["terrain"] == "map"
    assert carte.course.terrain["repartition"] is True and carte.course.terrain["total"] is None
    assert carte.course.terrain["attributions"]
    p0 = build_pacing(base.course, base.prediction, RACE, CFG)
    p1 = build_pacing(carte.course, carte.prediction, RACE, cfg)
    assert p1.t_move_h == pytest.approx(p0.t_move_h, abs=1e-9)
    gain = [b.t_move_min - a.t_move_min for a, b in zip(p0.segments, p1.segments)]
    assert gain[3] > 1.0 and all(g < 0 for g in gain[:3])
    # sans profil : la répartition ne change pas
    seul = analyze_preview_from_twin(twin, course, cfg, n_ingested=5)
    assert seul.course.repartition is None


def test_the_map_in_the_total_lengthens_the_target_and_leaves_the_calibration_alone():
    course, twin = _course(), _jumeau()
    base = analyze_preview_from_twin(twin, course, CFG, n_ingested=5)
    cfg = override_config(CFG, "prediction.terrain_total=differential")
    tot = analyze_preview_from_twin(twin, course, cfg, n_ingested=5, terrain={"parcours": _profil(course)})
    ajout = surcout_km(course, facteur_carte(course, _profil(course), TRAITS, CFG))
    assert tot.course.deq_km == pytest.approx(base.course.deq_km + ajout, abs=1e-6)
    assert {k: tot.course.terrain[k] for k in ("source", "total", "repartition", "deq_ajoute_km")} == {
        "source": "carte", "total": "differential", "repartition": False, "deq_ajoute_km": round(ajout, 3)}
    assert tot.course.terrain["segments_techniques"] == [False, False, False, True]
    assert "ODbL" in tot.course.terrain["attributions"][0]
    assert tot.course.segments[3].deq_km > base.course.segments[3].deq_km
    assert tot.course.segments[0].deq_km == pytest.approx(base.course.segments[0].deq_km)
    assert tot.prediction.finish_hours > base.prediction.finish_hours
    assert [g.vga_kmh for g in tot.calibration.genuine] == [g.vga_kmh for g in base.calibration.genuine]
    # demandé sans profil applicable : dit, et rien ne change
    sans = analyze_preview_from_twin(twin, course, cfg, n_ingested=5,
                                     terrain={"parcours": _profil(course, signal=False)})
    assert sans.course.terrain["servi"] is False and "signal" in sans.course.terrain["raison"]
    assert sans.prediction.finish_hours == base.prediction.finish_hours
    # une loi de répartition garde le terrain du total
    rep = analyze_preview_from_twin(twin, course, override_config(cfg, "pacing.terrain=declared"),
                                    n_ingested=5, terrain={"parcours": _profil(course)})
    assert rep.course.repartition is None              # aucune technicité déclarée : rien à reporter
    twin.terrain = {**TRAITS, "fatigue_descente": {"relative": {"valeur": -0.05}}}
    fatigue = override_config(CFG, "pacing.descent_fatigue=dminus")
    sans_total = analyze_preview_from_twin(twin, course, fatigue, n_ingested=5,
                                           terrain={"parcours": _profil(course)})
    avec_total = analyze_preview_from_twin(
        twin, course, override_config(fatigue, "prediction.terrain_total=differential"), n_ingested=5,
        terrain={"parcours": _profil(course)})
    assert avec_total.course.repartition == {"curve": "total", "descent_fatigue": -0.05}
    ratio = np.asarray(avec_total.course.repartition_km) / np.asarray(sans_total.course.repartition_km)
    assert ratio[:3] == pytest.approx([1.0, 1.0, 1.0]) and ratio[3] > 1.05


# --------------------------------------------------------------------------- calibration
def _ultras_et_terrain():
    """Cinq ultras courus à la même vitesse ajustée une fois le terrain compté : sans lui, leur
    vitesse varie avec un surcoût qui ne suit ni la durée ni le D+."""
    heures = [12.0, 20.0, 16.0, 24.0, 18.0]
    extras = [6.0, 0.0, 8.0, 2.0, 4.0]
    v = 6.5
    ultras, magasin = [], {}
    for k, (h, x) in enumerate(zip(heures, extras)):
        ga = v * h - x
        u = replace(_ultra(h, ga * 0.8, ga * 0.25, -ga * 0.05),
                    start_time=f"2025-0{k + 1}-01T06:00:00+00:00")
        ultras.append(u)
        magasin[u.start_time] = {"deq_m": [x * 1000.0], "p_carte": [1.0], "p_ref": [0.0], "dminus_m": [0.0]}
    traits = {**TRAITS, "penalite_marche": {"frais": {"valeur": 0.5}, "fatigue": {"valeur": 0.5}}}
    return ultras, {"version": 1, "modele": {"signal": True}, "activites": magasin}, extras, traits


def test_the_terrain_in_the_calibration_judges_every_ultra_by_the_same_rule():
    ultras, magasin, extras, traits = _ultras_et_terrain()
    twin = _jumeau(ultras)
    twin.terrain = traits
    assert surcouts_des_ultras(magasin, traits, CFG) == pytest.approx(
        {u.start_time: x for u, x in zip(ultras, extras)})
    off = build_calibration(twin, CFG, terrain=magasin)
    deq = build_calibration(twin, override_config(CFG, "calibration.terrain_adjust=deq"), terrain=magasin)
    assert off.terrain_adjust == "off" and all(g.terrain_km is None for g in off.genuine)
    assert deq.terrain_n == 5 and deq.terrain_km_mean == pytest.approx(np.mean(extras))
    for g0, g1, x in zip(off.genuine, deq.genuine, extras):
        assert g1.vga_kmh == pytest.approx(g0.vga_kmh + x / g0.hours)
        assert g1.terrain_km == pytest.approx(x)
    # la part des écarts qui venait du sol sort de σ
    assert deq.sigma_log < off.sigma_log
    assert any("Terrain de la carte : 5 vrai(s) ultra(s)" in n for n in deq.notes)
    assert deq.to_dict()["terrain"] == {"adjust": "deq", "n_ultras": 5, "km_mean": 4.0}
    # sans magasin applicable : dit, Deq inchangés
    sans = build_calibration(twin, override_config(CFG, "calibration.terrain_adjust=deq"),
                             terrain={**magasin, "modele": {"signal": False}})
    assert [g.vga_kmh for g in sans.genuine] == [g.vga_kmh for g in off.genuine]
    assert any("sans magasin de profils applicable" in n for n in sans.notes)


def test_the_dplus_prior_is_scaled_only_with_the_terrain_in_the_calibration():
    assert prior_dplus(CFG, "log") == CFG.calibration.default_dplus_penalty_log_per_dpkm
    moitie = override_config(CFG, "calibration.terrain_dplus_prior_scale=0.5")
    assert prior_dplus(moitie, "log") == CFG.calibration.default_dplus_penalty_log_per_dpkm
    deq = override_config(moitie, "calibration.terrain_adjust=deq")
    assert prior_dplus(deq, "log") == pytest.approx(0.5 * CFG.calibration.default_dplus_penalty_log_per_dpkm)
    assert prior_dplus(deq, "linear") == pytest.approx(0.5 * CFG.calibration.default_dplus_penalty_kmh_per_dpkm)


# --------------------------------------------------------------------------- marche prévue
def test_the_walking_planned_in_descents_follows_the_walk_model_and_the_map():
    course, twin = _course(), _jumeau()
    res = analyze_preview_from_twin(twin, course, CFG, n_ingested=5)
    plan = build_pacing(res.course, res.prediction, RACE, CFG)
    m = marche_prevue(res.course, plan, TRAITS, CFG)
    assert m[0] == m[1] == 0.0
    # même pente, D− plus grand : on marche plus à la minute de descente
    assert m[3] / plan.segments[3].t_move_min > m[2] / plan.segments[2].t_move_min > 0
    carte = marche_prevue(res.course, plan, TRAITS, CFG, profil=_profil(course))
    plat = marche_prevue(res.course, plan, TRAITS, CFG, profil=_profil(course, p_tech=0.2))
    assert carte[3] > plat[3] and carte[2] == pytest.approx(plat[2])
    assert marche_prevue(res.course, plan, {}, CFG) is None
    # la consigne « Sur ce segment » : rien sous une minute, « descente technique » où la carte le dit
    techniques = segments_techniques(res.course, _profil(course))
    assert techniques == [False, False, False, True]
    consignes = consignes_de_marche(carte, techniques)
    assert consignes[0] is None and consignes[2].startswith("descentes : environ ")
    assert consignes[3].startswith("descente technique : environ ") and consignes[3].endswith(
        " min prévues à la marche")
    assert consignes_de_marche([0.4, 7.4, 12.6]) == [
        None, "descentes : environ 7 min prévues à la marche", "descentes : environ 15 min prévues à la marche"]
    assert segments_techniques(res.course, None) is None


def test_the_plan_shape_sets_planned_against_measured_walking_in_descents():
    course, twin = _course(), _jumeau()
    res = analyze_preview_from_twin(twin, course, CFG, n_ingested=5)
    plan = build_pacing(res.course, res.prediction, RACE, CFG)
    cps = [{"km": s, "name": n, "t_h": None if i == 0 else float(plan.segments[i - 1].cum_clock_h)}
           for i, (s, n) in enumerate(zip(RACE.aid_km, RACE.aid_names))]
    cps[0]["t_h"] = 0.0
    segs = [{"mouvement_h": s.t_move_min / 60.0, "arrets_h": 0.0, "marche_h": 0.5,
             "marche_descente_h": 0.0 if i < 2 else 0.2} for i, s in enumerate(plan.segments)]
    forme = bloc_forme(res.course, RACE, res.prediction, CFG,
                       {"checkpoints": cps, "segments": segs}, terrain=TRAITS)
    tr = forme["mouvement_impose"]["troncons"]
    assert [t["marche_descente_reelle_min"] for t in tr] == [0.0, 0.0, 12.0, 12.0]
    assert tr[0]["marche_descente_prevue_min"] == 0.0 and tr[3]["marche_descente_prevue_min"] > 0
    md = forme["marche_descente"]
    assert md["n"] == 4 and md["reelle_min"] == 24.0 and md["profil_de_carte"] is False
    assert bloc_forme(res.course, RACE, res.prediction, CFG,
                      {"checkpoints": cps, "segments": segs})["mouvement_impose"]["troncons"][3][
        "marche_descente_prevue_min"] is None


def test_the_seconds_in_descent_are_those_of_the_detector_windows():
    t = np.arange(4001.0)
    d = t * 2.0
    alt = np.where(d < 4000.0, 1000.0 + 0.1 * d, 1400.0 - 0.1 * (d - 4000.0))
    m = secondes_en_descente(d, alt, None, CFG)
    assert not m[:1500].any() and m[2300:3900].all()
    cad = np.where(d >= 6000.0, 110.0, 170.0)
    b = bilan_par_troncon(d, None, cad, [0, 2000, 4000], CFG, descente=m)
    assert b[0]["descente_h"] < 0.1 and b[1]["descente_h"] > 0.4
    assert b[1]["marche_descente_h"] == pytest.approx(
        np.count_nonzero(m[3000:4000]) / 3600.0, abs=0.01)
    assert "descente_h" not in bilan_par_troncon(d, None, cad, [0, 4000], CFG)[0]
    assert secondes_en_descente(d, np.full(t.size, np.nan), None, CFG) is None


# --------------------------------------------------------------------------- outils
LAT_S, LON_S = 44.0, 7.0


def _lon(m):
    return LON_S + m / (111_320.0 * math.cos(math.radians(LAT_S)))


def _aller(sens: int, jour: datetime) -> CanonicalActivity:
    """Huit dents de scie (750 m à +20 % marchés, 750 m à −20 %) le long d'une ligne vers
    l'est (``sens`` 1) ou vers l'ouest (−1) ; une descente est hachée au-delà de 6 km de la
    ligne, quel que soit le sens — donc à faible D− dans un sens, à fort D− dans l'autre."""
    t, d, z, cad, x = [0.0], [0.0], [1000.0], [110.0], [0.0 if sens > 0 else 12000.0]

    def pas(v, pente, c):
        t.append(t[-1] + 1.0)
        d.append(d[-1] + v)
        z.append(z[-1] + v * pente)
        cad.append(c)
        x.append(x[-1] + sens * v)

    for _ in range(8):
        depart = d[-1]
        while d[-1] - depart < 750.0:
            pas(1.0, 0.20, 110.0)
        depart, k = d[-1], 0
        while d[-1] - depart < 750.0:
            if x[-1] >= 6000.0 and (k // 40) % 2 == 0:
                pas(1.3, -0.20, 110.0)
            else:
                pas(3.0, -0.20, 170.0)
            k += 1
    return CanonicalActivity.from_samples(
        timestamps=t, dist_m=d, alt_m=z, hr=[150.0] * len(t), lat=[LAT_S] * len(t),
        lon=[_lon(v) for v in x], sport="running", source_format="fit", source_name="aller",
        start_time=jour, cadence=cad, cadence_per_foot=False)


def _osm(chemin: Path) -> None:
    def voie(i, de, a, sac):
        return {"type": "way", "id": i, "tags": {"highway": "path", "sac_scale": sac},
                "geometry": [{"lat": LAT_S, "lon": _lon(m)} for m in np.arange(de, a + 1.0, 100.0)]}

    chemin.write_text(json.dumps({"elements": [voie(1, -200.0, 6000.0, "hiking"),
                                               voie(2, 6000.0, 12300.0, "demanding_mountain_hiking")]}))


def test_the_tools_make_the_terrain_of_a_race_and_the_bench_serves_it(tmp_path, monkeypatch, capsys):
    from test_descentes import _gpx

    from tools.banc import main as banc_main
    from tools.carte import main as carte_main
    from twin_engine.registre import Depot, lire_entrees

    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    archive = tmp_path / "archive"
    archive.mkdir()
    for j in range(8):
        jour = datetime(2026, 5, 1, 7, tzinfo=timezone.utc) + timedelta(days=2 * j)
        (archive / f"s{j}.gpx").write_bytes(_gpx(_aller(1 if j % 2 == 0 else -1, jour)))
    course = _aller(1, datetime(2026, 6, 1, 7, tzinfo=timezone.utc))
    (tmp_path / "course.gpx").write_bytes(_gpx(course))
    _osm(tmp_path / "osm.json")
    sources = ["--osm", str(tmp_path / "osm.json"), "--cache", str(tmp_path / "cache"),
               "--set", "carte.modele_min_fenetres=5", "--set", "carte.modalite_min_fenetres=5"]

    # le terrain d'une course : un modèle avec signal, un profil, un magasin (vide : pas d'ultra)
    assert carte_main(["terrain", "--archive", str(archive), "--until", "2026-05-31",
                       "--course", str(tmp_path / "course.gpx"), "--out", str(tmp_path / "t.json"),
                       *sources]) == 0
    bundle = json.loads((tmp_path / "t.json").read_text())
    assert bundle["modele"]["signal"] is True and bundle["modele"]["until"] == "2026-05-31"
    prof = bundle["parcours"]
    assert prof["modele"]["signal"] and len(prof["km"]) == len(prof["p_carte"])
    km = np.array(prof["km"])
    pc = np.array([np.nan if v is None else v for v in prof["p_carte"]])
    pr = np.array([np.nan if v is None else v for v in prof["p_ref"]])
    assert np.nanmean(pc[km > 7.0]) > np.nanmean(pr[km > 7.0]) > np.nanmean(pc[km < 5.0])
    assert bundle["ultras"]["activites"] == {}
    assert '"lat' not in json.dumps(bundle)

    # la demande de la course contre le vécu des dernières semaines, par tranche de D−
    assert carte_main(["modele", "--archive", str(archive), "--until", "2026-05-31",
                       "--out", str(tmp_path / "m.json"), *sources]) == 0
    capsys.readouterr()
    assert carte_main(["parcours", "--course", str(tmp_path / "course.gpx"), "--modele", str(tmp_path / "m.json"),
                       "--vecu", str(tmp_path / "cache" / "exemples.json"), "--json", *sources]) == 0
    dv = json.loads(capsys.readouterr().out)["demande_contre_vecu"]
    assert dv["jusqua"] == "2026-05-15" and dv["activites"] == 8 and dv["jours"] == 183
    assert dv["tranches"][0]["dminus_m"] == [0.0, 1000.0]
    assert sum(b["course_km"] for b in dv["tranches"]) > 2.0
    assert sum(b["vecu_haches_km"] for b in dv["tranches"]) > 0.0
    assert all(b["course_haches_km"] <= b["course_km"] for b in dv["tranches"])

    # le moteur le sert sous le drapeau, et le dit
    from twin_engine.cli import main as cli_main

    assert cli_main(["preview", "--training", str(archive), "--course", str(tmp_path / "course.gpx"),
                     "--terrain", str(tmp_path / "t.json"), "--until", "2026-05-31",
                     "--set", "prediction.terrain_total=differential"]) == 0
    sortie = capsys.readouterr()
    servi = json.loads(sortie.out[: sortie.out.rindex("}") + 1])["course"]["terrain"]
    assert servi["total"] == "differential" and "Terrain de la carte" in sortie.err

    # le banc : un terrain par course, lu par tools/banc --terrain et servi sous le drapeau
    manifeste = {"athlete": "Testeur", "archive": "archive",
                 "races": [{"name": "Aller", "date": "2026-06-01", "official_time": "2:30:00",
                            "gpx": "course.gpx"}]}
    (tmp_path / "m.json").write_text(json.dumps(manifeste))
    assert carte_main(["banc", str(tmp_path / "m.json"), "--out", str(tmp_path / "terrains"), *sources]) == 0
    assert "| Testeur | Aller | 2026-05-31 |" in capsys.readouterr().out
    assert (tmp_path / "terrains" / "testeur" / "2026-06-01.json").exists()
    depot = Depot(tmp_path / "registre")
    rc = banc_main([str(tmp_path / "m.json"), "--depot", str(depot.racine), "--out", str(tmp_path / "out"),
                    "--no-diag", "--no-passages", "--terrain", str(tmp_path / "terrains"),
                    "--variant", "TT:prediction.terrain_total=differential"])
    capsys.readouterr()
    assert rc == 0
    runs = {r["label"]: r for r in depot.runs()}
    base = lire_entrees(depot.chemin_du_run(runs["defauts"]["id"]))[1][0]
    tt = lire_entrees(depot.chemin_du_run(runs["TT"]["id"]))[1][0]
    assert base["course"]["terrain"] is None
    assert tt["course"]["terrain"]["total"] == "differential"
