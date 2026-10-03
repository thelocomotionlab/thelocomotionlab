"""Score de la FORME du plan contre les passages réels — du registre seul, sans archive.

Le banc juge l'arrivée ; ici on juge la répartition : pour chaque course du registre qui
porte des passages réels (``tools/passages``), le plan est reconstruit COMME AU RAPPORT
(parcours de la spec ou découpage 10 km, fade, arrêts, horloge) mais ANCRÉ SUR LE TEMPS
OFFICIEL — l'erreur de total est ainsi retirée, il ne reste que la forme : où le plan
place l'athlète à chaque point de passage, contre où il était vraiment.

Variantes rejouées sur chaque course, sans re-décodage (les agrégats de l'athlète sont
dans le registre : durabilité, Δ des moitiés, taux d'arrêt personnel) :

  * source du fade : ``config`` (Δ fixe), ``durability`` (découplage), ``splits`` (moitiés) ;
  * arrêts : ``carved`` (politique du plan retranchée) ou ``personal`` (taux de l'athlète
    réparti sur les ravitos au prorata de la politique).

Mesures par course : MAE des passages (minutes et % du temps officiel, arrivée exclue), et
biais signé à mi-course (plan − réel, en minutes : > 0 = l'athlète était EN AVANCE sur le
plan à mi-parcours, donc le plan le faisait partir trop lentement / finir trop vite).
Agrégées par athlète × variante, cas de développement et cas frais séparés.

**Hors ravito** (quand les passages portent le temps au ravitaillement) : le plan, ramené au
temps réellement passé hors des ravitos, contre ce temps tronçon par tronçon — la
répartition seule, sans les arrêts au ravito, prévisibles ou non ; erreur moyenne par
tronçon, pire cumul, et somme signée plan − réel sur les montées et les descentes (> 0 : le
plan y prévoyait plus long que le réel). C'est la mesure qui départage les lois de pente.

``--variant NOM:bloc.clé=valeur,…`` (répétable) rejoue tout sous chaque loi, en plus de la
configuration de base, et ouvre la sortie par une table qui les compare. Les courses mises à
part (``a_part.json``) ne comptent dans aucun groupe : elles se lisent sur leurs lignes.

``--residus`` ajoute ce qui reste sous la configuration de base : l'écart hors ravito des
tronçons, pondéré par leur temps réel (Σ(plan − réel) ÷ Σ réel) et en minutes, par type de
tronçon (montée, descente, mixte), position (premier, dernier, les autres), tiers de course,
jour ou nuit, dénivelé au km et durée ; puis montées et descentes croisées avec la position,
le tiers, la nuit et le dénivelé (mêlées, elles s'annulent) ; et par athlète pour le type, la
position, le tiers et la nuit, l'athlète sans mesure de pente signalé. C'est là que se lit le
levier suivant.

    PYTHONPATH=src python -m tools.score_plan <manifestes…> [--run ID] [--depot <dossier>]
        [--out score.md] [--set bloc.clé=valeur …] [--variant NOM:bloc.clé=valeur,… …]
        [--residus [LOI]]

Les entrées sont celles d'un run du livre banc (le dernier par défaut), annotées de leurs
passages (``docs/twin-registre/passages.json``) et du statut de leur athlète.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np

from twin_engine.config import load_config, override_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.pacing import build_pacing
from twin_engine.predict import Prediction
from twin_engine.twin.pente import detail_du_registre, fatigue_servie, repartir
from twin_engine.twin.terrain import facteur_declare

from twin_engine.registre import DEFAULT_RACINE, Depot
from twin_engine.registre.forme import hors_ravito_impose, type_de_troncon

from tools.backtest import race_spec_from_meta
from tools.registre import charger, statut

FADE_SOURCES = ("config", "durability", "splits")
STOPS_MODELS = ("carved", "personal")


def _stand_in(hours: float, deq_km: float, dpk: float, *, stops_model: str,
              stops_rate: float | None) -> Prediction:
    """Prédiction factice ancrée sur ``hours`` : seule la forme du plan est en jeu."""
    moving = hours if stops_model == "carved" or not stops_rate else hours / (1.0 + stops_rate)
    return Prediction(
        finish_hours=float(hours), v_kmh=deq_km / hours, deq_km=deq_km, dplus_per_km=dpk,
        interval_low_h=float(hours), interval_high_h=float(hours), mc_samples=np.array([float(hours)]),
        regime="regression", sigma_kmh=0.0, vc_fraction=None, cross_validation=None,
        plan_low_h=float(hours), plan_high_h=float(hours), moving_hours=float(moving),
        stops_hours=float(hours - moving), stops_model=stops_model,
        stops_rate=(None if stops_model == "carved" else stops_rate),
    )


def score_course(course, race: RaceSpec, official_h: float, passages: dict, cfg,
                 *, durability_pct: float | None, splits_delta: float | None,
                 stops_rate: float | None) -> dict:
    """Toutes les variantes sur UNE course : {(fade, stops): {mae_min, mae_pct, mid_bias_min, n}}."""
    cps = passages.get("checkpoints") or []
    # passages aux bornes de segments : checkpoint i = fin du segment i−1 ; l'arrivée est
    # exclue (le plan y vaut le temps ancré par construction)
    real = [c.get("t_h") for c in cps]
    n_seg = len(course.segments)
    if len(real) != n_seg + 1:
        return {}
    idx = [i for i in range(1, n_seg) if real[i] is not None]
    if len(idx) < 2:
        return {}
    cum_km = np.array([s.off1 for s in course.segments])
    mid_i = idx[int(np.argmin([abs(cum_km[i - 1] - course.length_km / 2.0) for i in idx]))]
    out: dict = {}
    for fade in FADE_SOURCES:
        cfg_v = replace(cfg, pacing=replace(cfg.pacing, fade_source=fade))
        for stops in STOPS_MODELS:
            if stops == "personal" and stops_rate is None:
                continue
            pred = _stand_in(official_h, course.deq_km, course.dplus_per_km,
                             stops_model=stops, stops_rate=stops_rate)
            plan = build_pacing(course, pred, race, cfg_v, durability_pct=durability_pct,
                                splits_delta=splits_delta)
            cum = [s.cum_clock_exact_h if s.cum_clock_exact_h is not None else s.cum_clock_h
                   for s in plan.segments]
            err_min = [60.0 * (cum[i - 1] - real[i]) for i in idx]
            mae_min = float(np.mean(np.abs(err_min)))
            mid = 60.0 * (cum[mid_i - 1] - real[mid_i])
            out[(fade, stops)] = {"mae_min": mae_min, "mae_pct": 100.0 * mae_min / 60.0 / official_h,
                                  "mid_bias_min": float(mid), "n": len(idx),
                                  "fade_used": plan.fade_source_used,
                                  "fade_delta": plan.fade_delta_used}
    return out


def score_hors_ravito(course, race: RaceSpec, official_h: float, passages: dict, cfg,
                      *, durability_pct: float | None, splits_delta: float | None) -> dict | None:
    """La répartition jugée hors ravito, sous la source de fade servie (``pacing.fade_source``)
    : le modèle d'arrêts ne compte pas, le plan étant ramené au temps réel hors ravito."""
    segs = passages.get("segments")
    if not segs or len(segs) != len(course.segments):
        return None
    pred = _stand_in(official_h, course.deq_km, course.dplus_per_km, stops_model="carved",
                     stops_rate=None)
    plan = build_pacing(course, pred, race, cfg, durability_pct=durability_pct,
                        splits_delta=splits_delta)
    h = hors_ravito_impose(course, plan, segs)
    if h is None:
        return None
    reel = [t["reel_min"] for t in h["troncons"]]
    total, cumul, troncons = float(sum(reel)), 0.0, []
    for t in h["troncons"]:
        cs, ps = course.segments[t["i"]], plan.segments[t["i"]]
        km = max(float(cs.off1 - cs.off0), 1e-6)
        troncons.append({
            "plan_min": t["plan_min"], "reel_min": t["reel_min"],
            "type": type_de_troncon(cs),
            "position": ("premier tronçon" if t["i"] == 0 else
                         "dernier tronçon" if t["i"] == len(course.segments) - 1 else "les autres"),
            "phase": (cumul + t["reel_min"] / 2.0) / total if total > 0 else None,
            "nuit": bool(ps.night) if race.start_time is not None else None,
            "denivele_m_km": (cs.dplus_m + cs.dminus_m) / km})
        cumul += t["reel_min"]
    return {"n": h["n"], "mae_min": h["erreur_moyenne_min"], "troncons": troncons,
            "mae_pct": 100.0 * h["erreur_moyenne_min"] / float(np.mean(reel)) if np.mean(reel) > 0 else None,
            "cumul_min": h["pire_cumul_min"], "montees_min": h["biais_montees_min"],
            "descentes_min": h["biais_descentes_min"]}


def score_registre(registre: dict, manifests: list[Path], cfg) -> list[dict]:
    """Une ligne par course scorée : athlète, course, dev_set, officiel, variantes."""
    paths: dict[tuple[str, str, str], tuple[Path, dict]] = {}
    for mp in manifests:
        man = json.loads(mp.read_text(encoding="utf-8"))
        base = mp.resolve().parent
        for r in man["races"]:
            paths[(man["athlete"], r["name"], r["date"])] = (base, r)
    rows: list[dict] = []
    for e in registre.get("entries", []):
        key = (e.get("athlete"), e.get("race"), e.get("date"))
        pas = e.get("passages")
        official = e.get("official_time_h")
        if key not in paths or not pas or official is None or e.get("dnf") or e.get("quarantine"):
            continue
        base, r = paths[key]
        gpx = (base / r["gpx"]).resolve()
        if not gpx.exists():
            print(f"  {key[0]} · {key[1]} : trace introuvable ({gpx})", file=sys.stderr)
            continue
        if r.get("race_json"):
            race = RaceSpec.from_json((base / r["race_json"]).resolve())
        else:
            meta = e.get("race_meta")
            race = RaceSpec(name=r["name"]) if not meta else race_spec_from_meta(
                r["name"], {"start_local": __import__("datetime").datetime.fromisoformat(meta["start_local"]),
                            "lat": meta["lat"], "lon": meta["lon"], "tz": meta["tz"]})
        course = build_course(gpx.read_bytes(), race, cfg)
        m = e.get("model") or {}
        # coût de pente personnel et fatigue de descente : les mesures de la coupure,
        # consignées au registre, répartissent le plan sous la configuration du scoreur (le
        # total est ancré, seule la répartition compte ici)
        detail = (detail_du_registre(m, cfg) or {}
                  if cfg.calibration.slope_cost in ("personal", "personal_pacing") else None)
        # technicité déclarée (pacing.terrain=declared) reportée sur les descentes, au
        # prorata du modèle de marche consigné au registre
        terrain = (facteur_declare(course, m.get("terrain"), cfg)
                   if cfg.pacing.terrain == "declared" else None)
        course = repartir(course, detail, cfg, phi=fatigue_servie(m.get("terrain"), cfg),
                          terrain=terrain)
        scores = score_course(course, race, float(official), pas, cfg,
                              durability_pct=m.get("durability_pct"),
                              splits_delta=m.get("fade_delta_splits"),
                              stops_rate=m.get("stops_rate_personal"))
        if not scores:
            continue
        hors = score_hors_ravito(course, race, float(official), pas, cfg,
                                 durability_pct=m.get("durability_pct"),
                                 splits_delta=m.get("fade_delta_splits"))
        rows.append({"athlete": key[0], "race": key[1], "date": key[2],
                     "dev_set": statut(e) == "dev", "a_part": e.get("a_part"),
                     "pente_mesuree": detail_du_registre(m, cfg) is not None,
                     "hors": hors, "official_h": float(official),
                     "splits_delta": m.get("fade_delta_splits"),
                     "durability_pct": m.get("durability_pct"),
                     "stops_rate": m.get("stops_rate_personal"),
                     "scores": scores, "servi": scores.get((cfg.pacing.fade_source, "carved"))})
    return rows


def _agg(rows: list[dict]) -> dict:
    """Moyennes par variante sur un groupe de courses."""
    out: dict = {}
    for fade in FADE_SOURCES:
        for stops in STOPS_MODELS:
            vals = [r["scores"][(fade, stops)] for r in rows if (fade, stops) in r["scores"]]
            if not vals:
                continue
            out[(fade, stops)] = {
                "n": len(vals),
                "mae_pct": float(np.mean([v["mae_pct"] for v in vals])),
                "mae_min": float(np.mean([v["mae_min"] for v in vals])),
                "mid_bias_min": float(np.mean([v["mid_bias_min"] for v in vals])),
                "mid_bias_pct": float(np.mean([100.0 * v["mid_bias_min"] / 60.0 / r["official_h"]
                                               for r, v in zip([r for r in rows if (fade, stops) in r["scores"]], vals)])),
            }
    return out


def _f(v, nd=1) -> str:
    return "—" if v is None else f"{v:.{nd}f}"


def _moy(vals) -> float | None:
    vals = [v for v in vals if v is not None]
    return float(np.mean(vals)) if vals else None


def groupes(rows: list[dict]) -> list[tuple[str, list[dict]]]:
    """Cas frais, cas de développement, tous les cas — les courses mises à part n'y comptent pas."""
    compte = [r for r in rows if not r.get("a_part")]
    return [("cas frais (décisionnels)", [r for r in compte if not r["dev_set"]]),
            ("cas de développement (indicatifs)", [r for r in compte if r["dev_set"]]),
            ("tous les cas", compte)]


def agg_hors_ravito(rows: list[dict]) -> dict | None:
    """Moyennes par course de la répartition jugée hors ravito, et de l'erreur des passages
    sous la source de fade servie (``servi``)."""
    h = [r["hors"] for r in rows if r.get("hors")]
    if not h:
        return None
    return {"n": len(h), "mae_min": _moy([x["mae_min"] for x in h]),
            "mae_pct": _moy([x["mae_pct"] for x in h]), "cumul_min": _moy([x["cumul_min"] for x in h]),
            "montees_min": _moy([x["montees_min"] for x in h]),
            "descentes_min": _moy([x["descentes_min"] for x in h]),
            "passages_pct": _moy([(r.get("servi") or {}).get("mae_pct") for r in rows if r.get("hors")])}


def _ligne_hors(debut: str, a: dict) -> str:
    return (f"{debut} | {a['n']} | {_f(a['mae_min'])} | {_f(a['mae_pct'], 1)} | {_f(a['cumul_min'])} "
            f"| {_f(a['montees_min'])} | {_f(a['descentes_min'])} | {_f(a['passages_pct'], 2)} |")


_TETE_HORS = ("courses | erreur moy. par tronçon, min | % d'un tronçon | pire cumul, min "
              "| montées, plan − réel min | descentes, plan − réel min | passages : MAE % du temps |")


def _md_hors_ravito(rows: list[dict]) -> list[str]:
    """La répartition jugée hors ravito, par groupe et par athlète, puis les courses à part."""
    out: list[str] = []
    for title, grp in groupes(rows):
        a = agg_hors_ravito(grp)
        if a is None:
            continue
        out.append(f"\n**{title} — répartition jugée hors ravito** (plan ramené au temps réel hors "
                   "ravito ; montées / descentes : > 0, le plan y prévoyait plus long que le réel)\n")
        out.append("| athlète | " + _TETE_HORS)
        out.append("|---|---|---|---|---|---|---|---|")
        for ath in sorted({r["athlete"] for r in grp}):
            b = agg_hors_ravito([r for r in grp if r["athlete"] == ath])
            if b is not None:
                out.append(_ligne_hors(f"| {ath}", b))
        out.append(_ligne_hors("| TOTAL", a))
    a_part = [r for r in rows if r.get("a_part") and r.get("hors")]
    if a_part:
        out.append("\n**Rapportées à part — répartition hors ravito** (hors de tous les groupes)\n")
        out.append("| athlète | course | motif | " + _TETE_HORS)
        out.append("|---|---|---|---|---|---|---|---|---|---|")
        for r in a_part:
            out.append(_ligne_hors(f"| {r['athlete']} | {r['race']} | {r['a_part']}",
                                   agg_hors_ravito([r])))
    return out


_TYPE = ("type de tronçon", lambda t: t["type"], ("montée", "descente", "mixte"))
_POSITION = ("position", lambda t: t.get("position"), ("premier tronçon", "dernier tronçon", "les autres"))
_TIERS = ("tiers de course", lambda t: (None if t["phase"] is None else
                                        "1er tiers" if t["phase"] < 1 / 3 else
                                        "2e tiers" if t["phase"] < 2 / 3 else "dernier tiers"),
          ("1er tiers", "2e tiers", "dernier tiers"))
_NUIT = ("jour ou nuit", lambda t: None if t["nuit"] is None else ("nuit" if t["nuit"] else "jour"),
         ("jour", "nuit"))
_DENIVELE = ("dénivelé (D+ + D−) au km", lambda t: ("moins de 40 m/km" if t["denivele_m_km"] < 40 else
                                                   "40 à 80 m/km" if t["denivele_m_km"] < 80 else
                                                   "80 m/km et plus"),
             ("moins de 40 m/km", "40 à 80 m/km", "80 m/km et plus"))
_DUREE = ("durée réelle du tronçon", lambda t: ("moins de 45 min" if t["reel_min"] < 45 else
                                               "45 à 90 min" if t["reel_min"] < 90 else "90 min et plus"),
          ("moins de 45 min", "45 à 90 min", "90 min et plus"))
_CARACTERISTIQUES = (_TYPE, _POSITION, _TIERS, _NUIT, _DENIVELE, _DUREE)


def _ecarts(troncons: list[dict]) -> tuple[int, float | None, float | None]:
    """Nombre de tronçons, écart pondéré par le temps (Σ(plan − réel) ÷ Σ réel, %) et écart
    absolu moyen (min) : un tronçon de quelques minutes ne pèse que son temps."""
    t = [x for x in troncons if x["reel_min"]]
    if not t:
        return 0, None, None
    e = np.array([x["plan_min"] - x["reel_min"] for x in t])
    return len(t), 100.0 * float(e.sum()) / float(sum(x["reel_min"] for x in t)), float(np.mean(np.abs(e)))


def _cellules(troncons: list[dict], cle, cats) -> list[str]:
    """Écart pondéré % et nombre de tronçons de chaque catégorie, « — » sans tronçon."""
    cells = []
    for cat in cats:
        n, moy, _ = _ecarts([t for t in troncons if cle(t) == cat])
        cells.append("—" if not n else f"{_f(moy)} ({n})")
    return cells


def residus_markdown(rows: list[dict], loi: str | None = None) -> str:
    """Ce qui reste, tronçon par tronçon, sous la configuration du scoreur (courses à part
    exclues) : écart pondéré par le temps réel hors ravito (%) et écart absolu moyen (min). Les
    tables croisées gardent les montées et les descentes séparées : un plan trop long en montée
    et trop court en descente s'annulent dans une moyenne qui les mêle."""
    compte = [r for r in rows if not r.get("a_part") and r.get("hors")]
    tous = [t for r in compte for t in r["hors"].get("troncons", [])]
    out = [f"**Ce qui reste — écart hors ravito des tronçons{f', sous {loi}' if loi else ''}** "
           "(écart pondéré : Σ(plan − réel) ÷ "
           "Σ réel ; > 0 : le plan prévoyait plus long que le réel ; écart absolu moyen par tronçon, "
           f"min ; {len(tous)} tronçons, {len(compte)} course{'s' if len(compte) > 1 else ''}, "
           "courses à part exclues)", "",
           "| caractéristique | catégorie | tronçons | écart pondéré % | écart absolu moyen, min |",
           "|---|---|---|---|---|"]
    for nom, cle, cats in _CARACTERISTIQUES:
        for cat in cats:
            n, moy, absm = _ecarts([t for t in tous if cle(t) == cat])
            if n:
                out.append(f"| {nom} | {cat} | {n} | {_f(moy)} | {_f(absm)} |")
    _, type_de, types = _TYPE
    for nom, cle, cats in (_POSITION, _TIERS, _NUIT, _DENIVELE):
        if not any(cle(t) is not None for t in tous):
            continue
        out += ["", f"*Type de tronçon × {nom}* (écart pondéré %, tronçons)", "",
                "| type | " + " | ".join(cats) + " |", "|---|" + "---|" * len(cats)]
        for typ in types:
            out.append(f"| {typ} | "
                       + " | ".join(_cellules([t for t in tous if type_de(t) == typ], cle, cats)) + " |")
    athletes = sorted({r["athlete"] for r in compte})
    # sans mesure de pente à l'entraînement (pas de fréquence cardiaque), la loi personnelle
    # retombe sur Minetti : ses tronçons ne disent rien de la loi servie
    sans_pente = {a for a in athletes
                  if not any(r.get("pente_mesuree", True) for r in compte if r["athlete"] == a)}
    for nom, cle, cats in (_TYPE, _POSITION, _TIERS, _NUIT):
        if not any(cle(t) is not None for t in tous):
            continue
        out += ["", f"*Par athlète — {nom}* (écart pondéré %, tronçons)", "",
                "| athlète | " + " | ".join(cats) + " |", "|---|" + "---|" * len(cats)]
        for ath in athletes:
            mes = [t for r in compte if r["athlete"] == ath for t in r["hors"].get("troncons", [])]
            nom_ath = f"{ath} (pente non mesurée : loi standard)" if ath in sans_pente else ath
            out.append(f"| {nom_ath} | " + " | ".join(_cellules(mes, cle, cats)) + " |")
    return "\n".join(out)


def comparer_lois(par_loi: dict[str, list[dict]], reglages: dict[str, str]) -> str:
    """Une table par groupe : chaque loi sur les mêmes courses, puis la table course par course."""
    out = ["**Lois comparées — répartition jugée hors ravito** (moyennes par course ; montées / "
           "descentes : plan − réel, > 0 = le plan y prévoyait plus long que le réel)", ""]
    noms = list(par_loi)
    for i, (title, _) in enumerate(groupes(next(iter(par_loi.values()), []))):
        lignes = []
        for nom in noms:
            a = agg_hors_ravito(groupes(par_loi[nom])[i][1])
            if a is not None:
                lignes.append(_ligne_hors(f"| {nom} | {reglages.get(nom) or 'configuration de base'}", a))
        if lignes:
            out += [f"\n*{title}*\n", "| loi | réglages | " + _TETE_HORS,
                    "|---|---|---|---|---|---|---|---|---|", *lignes]
    cles = []
    for rows in par_loi.values():
        for r in rows:
            k = (r["athlete"], r["race"], r["date"])
            if r.get("hors") and k not in cles:
                cles.append(k)
    if cles:
        out += ["", "*Course par course — erreur moyenne par tronçon hors ravito, min (montées / "
                "descentes)*", "", "| athlète | course | " + " | ".join(noms) + " |",
                "|---|---|" + "---|" * len(noms)]
        for k in cles:
            cells = []
            for nom in noms:
                r = next((x for x in par_loi[nom] if (x["athlete"], x["race"], x["date"]) == k), None)
                h = (r or {}).get("hors")
                cells.append("—" if not h else f"{_f(h['mae_min'])} ({_f(h['montees_min'], 0)} / "
                                               f"{_f(h['descentes_min'], 0)})")
            a_part = next((x.get("a_part") for x in par_loi[noms[0]]
                           if (x["athlete"], x["race"], x["date"]) == k), None)
            out.append(f"| {k[0]} | {k[1]}{' (à part)' if a_part else ''} | " + " | ".join(cells) + " |")
    return "\n".join(out)


def render_markdown(rows: list[dict]) -> str:
    out: list[str] = []
    if not rows:
        return "Aucune course scorable (passages, temps officiel et trace requis)."
    # ce que les athlètes apportent au fade et aux arrêts (médianes des coupures scorées)
    out.append("**Mesures par athlète (médianes des coupures scorées)** : Δ des moitiés NON borné, "
               "durabilité, taux d'arrêt personnel\n")
    out.append("| athlète | n | Δ moitiés | Δ servi par `splits` (borné) | durabilité % | arrêts, min par h de mouvement |")
    out.append("|---|---|---|---|---|---|")
    for ath in sorted({r["athlete"] for r in rows}):
        sub = [r for r in rows if r["athlete"] == ath]
        fd = [r["splits_delta"] for r in sub if r.get("splits_delta") is not None]
        du = [r["durability_pct"] for r in sub if r.get("durability_pct") is not None]
        sr = [60.0 * r["stops_rate"] for r in sub if r.get("stops_rate") is not None]
        served = [r["scores"][("splits", "carved")]["fade_delta"] for r in sub
                  if ("splits", "carved") in r["scores"]]
        out.append(f"| {ath} | {len(sub)} | {_f(float(np.median(fd)), 3) if fd else '—'} "
                   f"| {_f(float(np.median(served)), 3) if served else '—'} "
                   f"| {_f(float(np.median(du))) if du else '—'} | {_f(float(np.median(sr))) if sr else '—'} |")
    out += _md_hors_ravito(rows)
    for title, grp in groupes(rows):
        if not grp:
            continue
        out.append(f"\n**{title} — forme du plan ancré sur le temps officiel** (n = {len(grp)} courses)\n")
        out.append("| fade | arrêts | n | MAE passages, % du temps | MAE, min | biais mi-course, min (> 0 : athlète en avance sur le plan) | biais mi-course, % |")
        out.append("|---|---|---|---|---|---|---|")
        agg = _agg(grp)
        for (fade, stops), a in agg.items():
            out.append(f"| {fade} | {stops} | {a['n']} | {_f(a['mae_pct'], 2)} | {_f(a['mae_min'])} "
                       f"| {_f(a['mid_bias_min'])} | {_f(a['mid_bias_pct'], 2)} |")
        # par athlète
        athletes = sorted({r["athlete"] for r in grp})
        if len(athletes) > 1:
            out.append("\n| athlète | fade | arrêts | n | MAE % | biais mi-course, min |")
            out.append("|---|---|---|---|---|---|")
            for ath in athletes:
                sub = [r for r in grp if r["athlete"] == ath]
                for (fade, stops), a in _agg(sub).items():
                    out.append(f"| {ath} | {fade} | {stops} | {a['n']} | {_f(a['mae_pct'], 2)} "
                               f"| {_f(a['mid_bias_min'])} |")
    out.append("\n**Par course** (MAE des passages en % du temps officiel ; biais mi-course en min)\n")
    heads = [f"{f}/{s}" for f in FADE_SOURCES for s in STOPS_MODELS]
    out.append("| athlète | course | officiel h | " + " | ".join(heads) + " |")
    out.append("|---|---|---|" + "---|" * len(heads))
    for r in rows:
        cells = []
        for f in FADE_SOURCES:
            for s in STOPS_MODELS:
                v = r["scores"].get((f, s))
                cells.append("—" if v is None else f"{v['mae_pct']:.2f} ({v['mid_bias_min']:+.0f})")
        out.append(f"| {r['athlete']} | {r['race']} | {r['official_h']:.2f} | " + " | ".join(cells) + " |")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="score_plan", description=__doc__.split("\n")[0])
    ap.add_argument("manifests", nargs="+", help="manifeste(s) JSON (chemins des traces et specs)")
    ap.add_argument("--depot", default=str(DEFAULT_RACINE))
    ap.add_argument("--run", help="run du livre banc (défaut : le dernier)")
    ap.add_argument("--out", help="écrit le markdown à ce chemin (sinon stdout)")
    ap.add_argument("--set", action="append", default=[], metavar="BLOC.CLÉ=VALEUR",
                    help="surcharge de config appliquée à TOUTES les variantes du scoreur "
                         "(répétable) — ex. --set pacing.fade_delta=0.2 ou "
                         "--set pacing.fade_delta_max=0.3 pour tester une dérive plus forte "
                         "en quelques secondes, sans archive")
    ap.add_argument("--variant", action="append", default=[], metavar="NOM:BLOC.CLÉ=VALEUR,…",
                    help="une loi de plus à comparer à la configuration de base (répétable) : "
                         "la sortie s'ouvre sur la table qui les compare")
    ap.add_argument("--residus", nargs="?", const="base", metavar="LOI",
                    help="ce qui reste sous la configuration de base, ou sous la variante LOI : "
                         "écart hors ravito par type de tronçon, position, tiers de course, "
                         "jour ou nuit, dénivelé et durée")
    args = ap.parse_args(argv)
    from tools.banc import parse_variants

    cfg = load_config()
    try:
        for spec in args.set:
            cfg = override_config(cfg, spec)
        variantes = parse_variants(args.variant, cfg)
    except ValueError as exc:
        print(f"--set / --variant : {exc}", file=sys.stderr)
        return 2
    try:
        entries, _ = charger(Depot(args.depot), livre_="banc", run=args.run)
    except LookupError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if args.residus and args.residus != "base" and args.residus not in variantes:
        print(f"--residus {args.residus} : aucune variante de ce nom", file=sys.stderr)
        return 2
    manifestes = [Path(m) for m in args.manifests]
    rows = score_registre({"entries": entries}, manifestes, cfg)
    par_loi = {"base": rows}
    for nom, cfg_v in variantes.items():
        par_loi[nom] = score_registre({"entries": entries}, manifestes, cfg_v)
    md = render_markdown(rows)
    if args.residus:
        md = (residus_markdown(par_loi[args.residus], None if args.residus == "base" else args.residus)
              + "\n\n---\n\n" + md)
    if variantes:
        reglages = {nom: spec.split(":", 1)[1] for nom, spec in
                    ((spec.split(":", 1)[0].strip(), spec) for spec in args.variant)}
        md = (comparer_lois(par_loi, reglages)
              + "\n\n---\n\n**Configuration de base, en détail**\n\n" + md)
    if args.out:
        Path(args.out).write_text(md + "\n", encoding="utf-8")
        print(f"Score écrit : {args.out} ({len(rows)} courses)", file=sys.stderr)
    else:
        print(md)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
