"""La carte de technicité d'une trace, et ce qu'elle dit une fois apprise sur un athlète
(``twin_engine.carte``).

    # un parcours : couverture des sources, deux parties comparées (avant / après un km
    # officiel), et P(hachée) par partie et par segment avec un modèle d'athlète
    PYTHONPATH=src python -m tools.carte parcours --course trace.gpx --race course.json \\
        --osm <extrait.osm.pbf | réponse Overpass .json | dossier de réponses> \\
        --mnt copernicus [--sol worldcover] [--coupure-km 100] [--modele modele.json]
    # le fichier de la montre d'une course : ses tronçons hachés face à la carte
    PYTHONPATH=src python -m tools.carte activite --activite course.gpx --osm … --mnt copernicus \\
        [--distance-officielle 167.2] [--coupure-km 100]
    # le modèle d'un athlète : ses activités avec cadence jusqu'à --until, une carte chacune
    PYTHONPATH=src python -m tools.carte modele --archive <archive> --until 2026-09-24 \\
        --osm <extrait.osm.pbf> --mnt copernicus --out modele.json
    # le terrain d'une course pour le moteur (--terrain de preview/full) : modèle arrêté au
    # --until, profil du parcours, magasin des ultras de l'archive
    PYTHONPATH=src python -m tools.carte terrain --archive <archive> --until 2026-09-24 \\
        --course trace.gpx --race course.json --osm … --mnt copernicus --out terrain.json
    # le terrain de chaque course de manifestes, à sa coupure, pour tools/banc --terrain
    PYTHONPATH=src python -m tools.carte banc manifest-a.json … --out <dossier> --osm … --mnt copernicus
    PYTHONPATH=src python -m tools.carte extraits manifest-a.json … --dossier local-data/osm [--telecharger]

``--mnt`` : ``copernicus`` (tuiles GLO-30 lues à distance), un fichier (GeoTIFF, mosaïque
VRT de dalles RGE ALTI), ou un dossier de dalles (``--mnt-crs EPSG:2154`` pour des ``.asc``
sans système de coordonnées). ``--sol`` : ``worldcover``, un fichier ou un dossier.
``--geologie couche.geojson --propriete NOM`` : une couche de polygones en WGS 84.

Les cartes se gardent dans ``--cache`` (``local-data/carte`` du moteur par défaut, hors
git), une par trace et jeu de sources. Le modèle ne contient aucune position ; les fenêtres
d'apprentissage, qui en contiennent, restent dans le cache.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from twin_engine.carte import (Carte, cle_de_cache, dresser, ecrire_le_cache, hors_des_extraits, lire_le_cache,
                               par_partie, sans_voie_osm, tranches_de, tranches_du_parcours)
from twin_engine.carte import osm as _osm
from twin_engine.carte import raster as _raster
from twin_engine.carte.modele import Exemples, apprendre, probabilites, sources_compatibles
from twin_engine.config import Config, load_config, override_config

CACHE_DEFAUT = Path(__file__).resolve().parents[1] / "local-data" / "carte"


# --------------------------------------------------------------------------- sources
def _elements_overpass(chemin: Path) -> list[dict]:
    fichiers = sorted(chemin.glob("*.json")) if chemin.is_dir() else [chemin]
    vus: dict = {}
    for f in fichiers:
        brut = json.loads(f.read_text(encoding="utf-8"))
        for e in brut.get("elements", []) if isinstance(brut, dict) else brut:
            vus[(e.get("type", "way"), e.get("id", id(e)))] = e
    return list(vus.values())


def lire_voies(specs: list[str], traces) -> tuple[_osm.Voies, str]:
    """Les voies OpenStreetMap près des ``traces``, de toutes les sources données (extraits,
    réponses Overpass) ; et l'empreinte de ces sources."""
    voies, empreintes = _osm.Voies(), []
    garder = None
    for spec in specs:
        chemin = Path(spec)
        if not chemin.exists():
            raise FileNotFoundError(f"--osm : {spec} introuvable")
        taille = chemin.stat().st_size if chemin.is_file() else len(list(chemin.glob("*.json")))
        empreintes.append(f"osm:{chemin.name}:{taille}")
        if chemin.is_file() and chemin.name.endswith((".pbf", ".osm", ".osm.bz2")):
            garder = garder or _osm.pres_des_traces(traces)
            lues = _osm.voies_extrait(chemin, garder=garder)
        else:
            lues = _osm.voies_overpass(_elements_overpass(chemin))
        for tags, geom in zip(lues.tags, lues.geometries):
            voies.ajouter(tags, geom)
    # triée : l'ordre des --osm ne change ni les voies lues ni, donc, les cartes gardées
    return voies, "+".join(sorted(empreintes))


def _sources_raster(spec: str | None, url, crs: str | None) -> tuple[_raster.Sources | None, str | None]:
    if not spec:
        return None, None
    if spec in ("copernicus", "worldcover"):
        return _raster.Sources(url), spec
    chemin = Path(spec)
    if chemin.is_dir():
        return _raster.Sources(_raster.dalles_locales(chemin, crs), crs), f"dalles:{chemin.name}"
    if chemin.is_file():
        return _raster.Sources(_raster.un_fichier(chemin), crs), f"fichier:{chemin.name}"
    raise FileNotFoundError(f"{spec} introuvable")


class Lecteur:
    """Les sources ouvertes une fois, et la carte de toute trace (lue au cache si elle y est)."""

    def __init__(self, args, cfg: Config, traces):
        self.cfg = cfg
        self.voies, self.empreinte_osm = (None, None)
        if args.osm:
            self.voies, self.empreinte_osm = lire_voies(args.osm, traces)
        self.mnt, self.nom_mnt = _sources_raster(args.mnt, _raster.url_copernicus, args.mnt_crs)
        self.sol, self.nom_sol = _sources_raster(args.sol, _raster.url_worldcover, None)
        if args.geologie and not args.propriete:
            raise FileNotFoundError("--geologie demande --propriete (la propriété des polygones lue)")
        self.geologie = (args.geologie, args.propriete) if args.geologie else None
        self.cache = Path(args.cache)
        attribution_mnt = _raster.ATTRIBUTION_COPERNICUS
        if self.nom_mnt and self.nom_mnt != "copernicus":
            attribution_mnt = args.attribution_mnt or _raster.ATTRIBUTION_RGEALTI
        self.attribution_mnt = attribution_mnt

    def noms(self) -> list[str]:
        out = [f"mnt:{self.nom_mnt}" if self.nom_mnt else "", f"sol:{self.nom_sol}" if self.nom_sol else "",
               self.empreinte_osm or "", f"geologie:{Path(self.geologie[0]).name}:{self.geologie[1]}"
               if self.geologie else ""]
        return [n for n in out if n]

    def carte(self, t) -> Carte:
        cle = cle_de_cache(t, self.cfg, self.noms())
        c = lire_le_cache(self.cache, cle)
        if c is None:
            c = dresser(t, self.cfg, voies=self.voies, mnt=self.mnt, sol=self.sol,
                        geologie=self.geologie, nom_mnt=self.nom_mnt or "copernicus",
                        attribution_mnt=self.attribution_mnt)
            ecrire_le_cache(self.cache, cle, c)
        return c

    def fermer(self) -> None:
        for s in (self.mnt, self.sol):
            if s is not None:
                s.fermer()


# --------------------------------------------------------------------------- impressions
def _f(v, nd=2) -> str:
    return "—" if v is None else f"{v:.{nd}f}"


def _couverture(c: Carte) -> list[str]:
    out = ["| variable | toute la trace | descentes |", "|---|---|---|"]
    for nom, v in c.couverture().items():
        out.append(f"| {nom} | {_f(None if v['toute'] is None else 100 * v['toute'], 0)} % "
                   f"| {_f(None if v['descentes'] is None else 100 * v['descentes'], 0)} % |")
    return out


def couverture_des_sorties(cartes: dict[str, Carte]) -> tuple[dict[str, dict], int]:
    """La couverture de toutes les sorties ensemble, chaque tranche comptant pour une, et le
    nombre de sorties qu'aucune voie des extraits OSM donnés ne recale (hors des extraits)."""
    sommes: dict[str, list[float]] = {}
    sans_voie = 0
    for c in cartes.values():
        n, nd = c.tranches.n, int((c.tranches.pente <= -0.08).sum())
        for nom, v in c.couverture().items():
            s = sommes.setdefault(nom, [0.0, 0, 0.0, 0])
            if v["toute"] is not None:
                s[0], s[1] = s[0] + v["toute"] * n, s[1] + n
            if v["descentes"] is not None:
                s[2], s[3] = s[2] + v["descentes"] * nd, s[3] + nd
        if sans_voie_osm(c):
            sans_voie += 1
    cov = {nom: {"toute": round(a / na, 3) if na else None, "descentes": round(d / nd, 3) if nd else None}
           for nom, (a, na, d, nd) in sommes.items()}
    return cov, sans_voie


def _couverture_des_sorties(cartes: dict[str, Carte]) -> list[str]:
    cov, sans_voie = couverture_des_sorties(cartes)
    out = ["| variable | toutes les sorties | descentes |", "|---|---|---|"]
    for nom, v in cov.items():
        out.append(f"| {nom} | {_f(None if v['toute'] is None else 100 * v['toute'], 0)} % "
                   f"| {_f(None if v['descentes'] is None else 100 * v['descentes'], 0)} % |")
    if any(c.sources.get("osm") for c in cartes.values()):
        out += ["", f"Sorties sans aucune voie OSM recalée : {sans_voie} sur {len(cartes)} "
                    "(hors des extraits donnés : elles n'entrent pas dans l'apprentissage)."]
    return out


def _parties(p: dict, coupure_km: float, modalites: int = 4) -> list[str]:
    out = []
    for zone, titre in (("toute", "toute la trace"), ("descentes", "descentes (≤ −8 %)")):
        av, ap = p[zone]["avant"], p[zone]["apres"]
        out += ["", f"**{titre}** — avant / après le km {coupure_km:g}", "",
                "| | avant | après |", "|---|---|---|", f"| km | {av['km']} | {ap['km']} |"]
        for nom in av:
            if nom == "km":
                continue
            a, b = av.get(nom), ap.get(nom)
            if isinstance(a, dict) or isinstance(b, dict):
                a, b = a or {}, b or {}
                cles = sorted(set(a) | set(b), key=lambda k: -max(a.get(k, 0), b.get(k, 0)))[:modalites]
                for k in cles:
                    out.append(f"| {nom} = {k} | {_f(100 * a.get(k, 0), 0)} % | {_f(100 * b.get(k, 0), 0)} % |")
            else:
                out.append(f"| {nom} | {_f(a, 3)} | {_f(b, 3)} |")
    return out


# --------------------------------------------------------------------------- parcours
def _parcours(args, cfg: Config) -> int:
    from twin_engine.course.profile import build_course
    from twin_engine.course.spec import RaceSpec

    race = RaceSpec.from_json(args.race) if args.race else RaceSpec(name=Path(args.course).stem)
    course = build_course(Path(args.course).read_bytes(), race, cfg)
    t = tranches_du_parcours(course, cfg)
    lecteur = Lecteur(args, cfg, [(t.lat, t.lon)])
    try:
        c = lecteur.carte(t)
    finally:
        lecteur.fermer()
    sortie: dict = {"course": course.name, "tranches": t.n, "couverture": c.couverture(),
                    "sources": c.sources, "attributions": c.attributions}
    if args.coupure_km is not None:
        sortie["parties"] = par_partie(c, args.coupure_km)
    if args.modele:
        modele = json.loads(Path(args.modele).read_text(encoding="utf-8"))
        if not modele.get("coefficients"):
            print(f"--modele : pas de modèle ({modele.get('raison', 'sans coefficients')})", file=sys.stderr)
            return 2
        ecarts = sources_compatibles(modele, c)
        if ecarts:
            print(f"--modele : sources différentes de la carte ({', '.join(ecarts)}) : "
                  "le modèle ne s'applique pas", file=sys.stderr)
            return 2
        refus = hors_des_extraits(c, cfg)
        if refus:
            print(f"--modele : {refus} — le modèle ne s'applique pas", file=sys.stderr)
            return 2
        sortie["technicite"] = _technicite(c, modele, cfg, course, args.coupure_km)
        if args.vecu:
            ex = Exemples.depuis_json(json.loads(Path(args.vecu).read_text(encoding="utf-8")))
            fin = date.fromisoformat(args.vecu_jusqua) if args.vecu_jusqua else None
            sortie["demande_contre_vecu"] = demande_contre_vecu(c, modele, cfg, ex, fin,
                                                                int(args.vecu_jours))
    if args.json:
        print(json.dumps(sortie, ensure_ascii=False, indent=2))
        return 0
    lignes = [f"# Carte de {course.name} — {t.n} tranches de {t.pas_m:g} m", "", *_couverture(c)]
    if "parties" in sortie:
        lignes += _parties(sortie["parties"], args.coupure_km)
    if "technicite" in sortie:
        tech = sortie["technicite"]
        lignes += ["", "**P(hachée) en descente** (modèle de l'athlète ; « frais » : D− et nuit à zéro)", "",
                   "| | km de descente | P frais | P au D− du parcours |", "|---|---|---|---|"]
        for nom, v in tech["parties"].items():
            lignes.append(f"| {nom} | {v['km']} | {_f(v['p_frais'], 3)} | {_f(v['p_course'], 3)} |")
        for s in tech["segments"]:
            lignes.append(f"| {s['segment']} | {s['km']} | {_f(s['p_frais'], 3)} | {_f(s['p_course'], 3)} |")
    if "demande_contre_vecu" in sortie:
        dv = sortie["demande_contre_vecu"]
        lignes += ["", f"**Demande contre vécu** — descentes par D− déjà descendu ; vécu : "
                       f"{dv['jours']} jours jusqu'au {dv['jusqua']} ({dv['activites']} activités)", "",
                   "| D− déjà descendu | km de descente (course) | km hachés prévus | "
                   "km de descente (vécu) | km hachés vécus |", "|---|---|---|---|---|"]
        for b in dv["tranches"]:
            lignes.append(f"| {b['dminus_m'][0]:.0f}–{b['dminus_m'][1]:.0f} m | {b['course_km']} | "
                          f"{b['course_haches_km']} | {b['vecu_km']} | {b['vecu_haches_km']} |")
    lignes += ["", "Sources : " + " · ".join(c.attributions)]
    print("\n".join(lignes))
    return 0


def demande_contre_vecu(c: Carte, modele: dict, cfg: Config, ex: Exemples, jusqua: date | None,
                        jours: int) -> dict:
    """La course contre les dernières semaines de l'athlète, par tranche de D− déjà descendu
    (``twin.terrain_dminus_step_m``) : km de descente et km hachés — prévus sur la course
    (Σ P(hachée) × longueur, au D− du parcours), mesurés dans les fenêtres du vécu."""
    pas = float(cfg.twin.terrain_dminus_step_m)
    pr = probabilites(c, modele, cfg)
    t = c.tranches
    desc = pr["descente"]
    if jusqua is None:
        jusqua = max((date.fromisoformat(j) for j in ex.jour.values()), default=date.today())
    debut = jusqua - timedelta(days=jours)
    vecu = {a for a, j in ex.jour.items() if debut < date.fromisoformat(j) <= jusqua}
    sel = [i for i, a in enumerate(ex.activite) if a in vecu]
    n_bins = int(max(float(t.dminus_m.max()) if t.n else 0.0,
                     max((ex.dminus_km[i] * 1000.0 for i in sel), default=0.0)) // pas) + 1
    tranches = []
    for b in range(n_bins):
        dans = desc & (t.dminus_m >= b * pas) & (t.dminus_m < (b + 1) * pas)
        v = [i for i in sel if b * pas <= ex.dminus_km[i] * 1000.0 < (b + 1) * pas]
        longueurs = [ex.longueur_m[i] if i < len(ex.longueur_m) else 0.0 for i in v]
        tranches.append({
            "dminus_m": [b * pas, (b + 1) * pas],
            "course_km": round(float(dans.sum() * t.pas_m / 1000.0), 2),
            "course_haches_km": round(float(np.nansum(pr["p"][dans]) * t.pas_m / 1000.0), 2),
            "vecu_km": round(float(sum(longueurs)) / 1000.0, 2),
            "vecu_haches_km": round(float(sum(lg for lg, i in zip(longueurs, v) if ex.hache[i])) / 1000.0, 2)})
    return {"jusqua": jusqua.isoformat(), "jours": jours, "activites": len(vecu), "tranches": tranches}


def _technicite(c: Carte, modele: dict, cfg: Config, course, coupure_km) -> dict:
    from twin_engine.carte.modele import fenetres_du_parcours

    f = fenetres_du_parcours(c, cfg)
    frais = probabilites(c, modele, cfg, frais=True, fenetres=f)
    vecu = probabilites(c, modele, cfg, fenetres=f)
    t = c.tranches

    def bloc(sel) -> dict:
        d = sel & frais["descente"]
        return {"km": round(float(d.sum() * t.pas_m / 1000.0), 2),
                "p_frais": None if not d.any() else round(float(np.mean(frais["p"][d])), 4),
                "p_course": None if not d.any() else round(float(np.mean(vecu["p"][d])), 4)}

    parties = {"toute la trace": bloc(np.ones(t.n, dtype=bool))}
    if coupure_km is not None:
        parties[f"avant le km {coupure_km:g}"] = bloc(t.km < coupure_km)
        parties[f"après le km {coupure_km:g}"] = bloc(t.km >= coupure_km)
    segments = [{"segment": f"{s.index}. {s.frm} → {s.to}", **bloc((t.km >= s.off0) & (t.km < s.off1))}
                for s in course.segments]
    return {"parties": parties, "segments": segments}


# --------------------------------------------------------------------------- activité
def _troncons(fen: list[dict], window_m: float) -> list[list[int]]:
    """Les tronçons hachés : suites de fenêtres hachées qui se suivent sur la distance."""
    out: list[list[int]] = []
    for i, f in enumerate(fen):
        if not f["hache"]:
            continue
        if out and out[-1][-1] == i - 1 and f["debut_m"] - fen[i - 1]["fin_m"] <= window_m:
            out[-1].append(i)
        else:
            out.append([i])
    return out


def _decoder(chemin: Path, cfg: Config):
    from twin_engine.ingest import iter_activities
    from twin_engine.twin.record import activity_distance, process_activity_full

    acts = [a for a in iter_activities(chemin) if a.n > 1]
    if not acts:
        return None, None
    act = max(acts, key=lambda a: a.duration_s)
    if process_activity_full(act, cfg)[0].descente is None:
        return act, None
    return act, activity_distance(act, cfg)


def _activite(args, cfg: Config) -> int:
    from twin_engine.carte.modele import variables_de_fenetre
    from twin_engine.twin.descentes import fenetres_de_descente

    _, a = _decoder(Path(args.activite), cfg)
    if a is None:
        print(f"{args.activite} : aucune activité lisible avec cadence, altitude et pente exploitable",
              file=sys.stderr)
        return 1
    d = np.maximum.accumulate(np.nan_to_num(np.asarray(a.dist_m, dtype=float)))
    echelle = (args.distance_officielle * 1000.0 / d[-1]) if args.distance_officielle and d[-1] > 0 else 1.0
    t = tranches_de(a.lat, a.lon, a.alt_m, cfg, x_m=d, km=d * echelle / 1000.0)
    if t.n == 0:
        print(f"{args.activite} : aucune position", file=sys.stderr)
        return 1
    fen = fenetres_de_descente(a, cfg)
    lecteur = Lecteur(args, cfg, [(t.lat, t.lon)])
    try:
        c = lecteur.carte(t)
    finally:
        lecteur.fermer()
    def km(m: float) -> float:
        return round(float(m) * echelle / 1000.0, 2)

    troncons = []
    for tr in _troncons(fen, float(cfg.twin.terrain_window_m)):
        f0, f1 = fen[tr[0]], fen[tr[-1]]
        v = variables_de_fenetre(c, f0["debut_m"], f1["fin_m"])
        troncons.append({"km": [km(f0["debut_m"]), km(f1["fin_m"])],
                         "minutes": round(sum(fen[i]["s"] for i in tr) / 60.0, 1),
                         "pente": round(float(np.mean([fen[i]["pente"] for i in tr])), 3),
                         "carte": {k: (round(x, 3) if isinstance(x, float) else x) for k, x in v.items()}})
    lignes_fen = [(f, variables_de_fenetre(c, f["debut_m"], f["fin_m"])) for f in fen]
    sortie = {"tranches": t.n, "fenetres": len(fen), "hachees": int(sum(f["hache"] for f in fen)),
              "troncons_haches": troncons, "couverture": c.couverture(), "sources": c.sources,
              "attributions": c.attributions,
              "hachees_contre_courables": _contraste(lignes_fen, args.coupure_km, echelle)}
    if args.coupure_km is not None:
        sortie["parties"] = par_partie(c, args.coupure_km)
    if args.json:
        print(json.dumps(sortie, ensure_ascii=False, indent=2))
        return 0
    lignes = [f"# Carte de l'activité — {t.n} tranches, {len(fen)} fenêtres de descente, "
              f"{sortie['hachees']} hachées, {len(troncons)} tronçons hachés", "", *_couverture(c), "",
              "**Tronçons hachés**", "", "| km | min | pente | carte |", "|---|---|---|---|"]
    for tr in troncons:
        resume = ", ".join(f"{k} {v}" for k, v in tr["carte"].items() if v not in (None, "absente"))
        lignes.append(f"| {tr['km'][0]}–{tr['km'][1]} | {tr['minutes']} | {100 * tr['pente']:.0f} % | {resume} |")
    for zone, bloc in sortie["hachees_contre_courables"].items():
        lignes += ["", f"**Fenêtres hachées contre courables — {zone}** "
                       f"({bloc['n_hachees']} contre {bloc['n_courables']})", "",
                   "| variable | hachées | courables | AUC |", "|---|---|---|---|"]
        for nom, v in bloc["variables"].items():
            if "modalites" in v:
                for k, (h, cr) in v["modalites"].items():
                    lignes.append(f"| {nom} = {k} | {_f(100 * h, 0)} % | {_f(100 * cr, 0)} % | |")
            else:
                lignes.append(f"| {nom} | {_f(v['hachees'], 3)} | {_f(v['courables'], 3)} | {_f(v['auc'], 3)} |")
    if "parties" in sortie:
        lignes += _parties(sortie["parties"], args.coupure_km)
    lignes += ["", "Sources : " + " · ".join(c.attributions)]
    print("\n".join(lignes))
    return 0


def _contraste(lignes_fen: list[tuple[dict, dict]], coupure_km, echelle: float) -> dict:
    """Variables de la carte des fenêtres hachées contre courables : moyenne et AUC (une
    variable qui ne sépare rien vaut 0,5) des numériques, parts des modalités ; sur toutes
    les fenêtres, puis de part et d'autre de la coupure."""
    from twin_engine.carte.modele import auc

    zones = {"toutes les fenêtres": lignes_fen}
    if coupure_km is not None:
        zones[f"avant le km {coupure_km:g}"] = [x for x in lignes_fen
                                                 if x[0]["debut_m"] * echelle / 1000.0 < coupure_km]
        zones[f"après le km {coupure_km:g}"] = [x for x in lignes_fen
                                                 if x[0]["debut_m"] * echelle / 1000.0 >= coupure_km]
    out = {}
    for zone, lf in zones.items():
        y = np.array([int(f["hache"]) for f, _ in lf])
        bloc = {"n_hachees": int(y.sum()), "n_courables": int(y.size - y.sum()), "variables": {}}
        noms = sorted({k for _, v in lf for k in v})
        for nom in noms:
            vals = [v.get(nom) for _, v in lf]
            if all(x is None or isinstance(x, (int, float)) for x in vals):
                x = np.array([np.nan if v is None else float(v) for v in vals])
                ok = np.isfinite(x)
                h, c = x[ok & (y == 1)], x[ok & (y == 0)]
                bloc["variables"][nom] = {
                    "hachees": None if h.size == 0 else round(float(h.mean()), 4),
                    "courables": None if c.size == 0 else round(float(c.mean()), 4),
                    "auc": auc(y[ok], x[ok]) if ok.any() else None}
            else:
                s = np.array(["absente" if v is None else str(v) for v in vals], dtype=object)
                mods = {}
                for m in sorted(set(s.tolist())):
                    ph = float(np.mean(s[y == 1] == m)) if (y == 1).any() else 0.0
                    pc = float(np.mean(s[y == 0] == m)) if (y == 0).any() else 0.0
                    mods[m] = (round(ph, 3), round(pc, 3))
                bloc["variables"][nom] = {"modalites": mods}
        out[zone] = bloc
    return out


# --------------------------------------------------------------------------- modèle
@dataclass
class Activite:
    """Ce que la carte garde d'une activité de l'archive : sa clé (heure de départ, celle des
    résumés du jumeau), son jour, sa durée, ses tranches et ses fenêtres de descente."""

    cle: str
    jour: date
    duree_h: float
    tranches: object
    fenetres: list[dict]


def activites_de_l_archive(archive: Path, cfg: Config, until: date | None = None) -> list[Activite]:
    """Les activités de course de l'archive avec cadence, altitude exploitable, positions et
    au moins une fenêtre de descente, datées jusqu'au ``until`` inclus."""
    from twin_engine.ingest import iter_activities
    from twin_engine.twin.descentes import fenetres_de_descente
    from twin_engine.twin.record import activity_distance, process_activity_full

    out = []
    for act in iter_activities(Path(archive), running_only=True):
        if act.start_time is None or (until is not None and act.start_time.date() > until):
            continue
        if process_activity_full(act, cfg)[0].descente is None:
            continue
        a = activity_distance(act, cfg)
        fen = fenetres_de_descente(a, cfg)
        if not fen:
            continue
        d = np.maximum.accumulate(np.nan_to_num(np.asarray(a.dist_m, dtype=float)))
        t = tranches_de(a.lat, a.lon, a.alt_m, cfg, x_m=d)
        if t.n:
            out.append(Activite(act.start_time.isoformat(), act.start_time.date(),
                                act.duration_s / 3600.0, t, fen))
    return out


def cartes_des_activites(acts: list[Activite], lecteur: Lecteur) -> dict[str, Carte]:
    cartes = {}
    for k, a in enumerate(acts, start=1):
        cartes[a.cle] = lecteur.carte(a.tranches)
        if k % 25 == 0:
            print(f"  cartes : {k}/{len(acts)}", file=sys.stderr)
    return cartes


def exemples_de(acts: list[Activite], cartes: dict[str, Carte]) -> Exemples:
    """Les fenêtres étiquetées des activités, sous des identifiants anonymes ; une activité
    hors des extraits OSM donnés n'en fait pas partie (ses étiquettes seraient « absentes »)."""
    ex = Exemples()
    for k, a in enumerate(acts, start=1):
        if not sans_voie_osm(cartes[a.cle]):
            ex.ajouter(f"a{k:05d}", a.fenetres, cartes[a.cle], jour=a.jour.isoformat())
    return ex


def modele_jusqua(ex: Exemples, until: date | None, cfg: Config, sources: dict | None) -> dict:
    """Le modèle appris sur les seules activités datées jusqu'au ``until`` inclus."""
    garder = {a for a, j in ex.jour.items() if until is None or date.fromisoformat(j) <= until}
    modele = apprendre(ex.sous_ensemble(garder), cfg, sources=sources)
    modele["until"] = None if until is None else until.isoformat()
    return modele


def magasin_des_ultras(acts: list[Activite], cartes: dict[str, Carte], modele: dict, cfg: Config,
                       until: date | None = None) -> dict:
    """Le magasin des profils de terrain des activités assez longues pour être de vrais
    ultras (``calibration.genuine_min_hours``), datées jusqu'au ``until`` : par heure de
    départ, leurs tranches en descente (Deq, P sous la carte, P sur le terrain habituel, D−)."""
    from twin_engine.carte.modele import identite
    from twin_engine.twin.terrain import tranches_pour_le_magasin

    activites = {}
    if modele.get("coefficients"):
        for a in acts:
            if a.duree_h < cfg.calibration.genuine_min_hours or (until is not None and a.jour > until):
                continue
            if hors_des_extraits(cartes[a.cle], cfg):
                continue
            pr = probabilites(cartes[a.cle], modele, cfg)
            activites[a.cle] = tranches_pour_le_magasin(a.tranches, pr["p"], pr["p_ref"],
                                                        pr["descente"], cfg)
    return {"version": 1, "modele": identite(modele), "activites": activites}


def _modele(args, cfg: Config) -> int:
    until = date.fromisoformat(args.until) if args.until else None
    acts = activites_de_l_archive(Path(args.archive), cfg, until)
    if not acts:
        print("Aucune activité avec cadence, altitude, positions et descentes.", file=sys.stderr)
        return 1
    print(f"{len(acts)} activités avec des descentes ; cartes…", file=sys.stderr)
    lecteur = Lecteur(args, cfg, [(a.tranches.lat, a.tranches.lon) for a in acts])
    try:
        cartes = cartes_des_activites(acts, lecteur)
    finally:
        lecteur.fermer()
    ex = exemples_de(acts, cartes)
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "exemples.json").write_text(json.dumps(ex.to_json(), ensure_ascii=False), encoding="utf-8")
    sources = next(iter(cartes.values())).sources
    modele = modele_jusqua(ex, until, cfg, sources)
    if args.out:
        Path(args.out).write_text(json.dumps(modele, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.json:
        print(json.dumps(modele, ensure_ascii=False, indent=2))
        return 0
    print("\n".join(_resume_modele(modele) + ["", "## Couverture des sorties", "",
                                               *_couverture_des_sorties(cartes)]))
    return 0


def _parcours_de(gpx: Path, race_json: Path | None, nom: str, cfg: Config):
    from twin_engine.course.profile import build_course
    from twin_engine.course.spec import RaceSpec

    race = RaceSpec.from_json(race_json) if race_json else RaceSpec(name=nom)
    return build_course(Path(gpx).read_bytes(), race, cfg)


def terrain_d_une_course(course, acts: list[Activite], cartes: dict[str, Carte], ex: Exemples,
                         until: date | None, lecteur: Lecteur, cfg: Config) -> dict:
    """Le terrain d'une course pour le moteur (``--terrain``) : modèle arrêté au ``until``,
    profil du parcours, magasin des ultras jusqu'au ``until``."""
    from twin_engine.carte.modele import identite, profil_de_terrain

    sources = next(iter(cartes.values())).sources if cartes else None
    modele = modele_jusqua(ex, until, cfg, sources)
    bundle: dict = {"version": 1, "modele": modele, "parcours": None,
                    "ultras": magasin_des_ultras(acts, cartes, modele, cfg, until)}
    if modele.get("coefficients"):
        c = lecteur.carte(tranches_du_parcours(course, cfg))
        refus = hors_des_extraits(c, cfg)
        bundle["parcours"] = ({"version": 1, "course": course.name, "refus": refus, "modele": identite(modele)}
                              if refus else profil_de_terrain(c, modele, cfg, nom=course.name,
                                                              longueur_km=round(float(course.length_km), 3)))
    return bundle


def _terrain(args, cfg: Config) -> int:
    until = date.fromisoformat(args.until) if args.until else None
    course = _parcours_de(Path(args.course), Path(args.race) if args.race else None,
                          Path(args.course).stem, cfg)
    acts = activites_de_l_archive(Path(args.archive), cfg, until)
    if not acts:
        print("Aucune activité avec cadence, altitude, positions et descentes.", file=sys.stderr)
        return 1
    traces = [(a.tranches.lat, a.tranches.lon) for a in acts]
    t = tranches_du_parcours(course, cfg)
    lecteur = Lecteur(args, cfg, traces + [(t.lat, t.lon)])
    try:
        cartes = cartes_des_activites(acts, lecteur)
        bundle = terrain_d_une_course(course, acts, cartes, exemples_de(acts, cartes), until, lecteur, cfg)
    finally:
        lecteur.fermer()
    Path(args.out).write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    m, prof = bundle["modele"], bundle["parcours"] or {}
    print(f"{course.name} : {len(bundle['ultras']['activites'])} ultra(s) au magasin, profil "
          f"{prof.get('refus') or ('écrit' if prof else 'absent')} — "
          + ("signal" if m.get("signal") else f"pas de signal ({m.get('raison') or 'gain hors échantillon insuffisant'})"),
          file=sys.stderr)
    return 0


def _taille(url: str) -> int | None:
    """Taille annoncée d'un fichier distant (octets), None sans réponse."""
    import urllib.request

    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=20) as r:
            n = r.headers.get("Content-Length")
            return int(n) if n else None
    except (OSError, ValueError):
        return None


def _telecharger(url: str, chemin: Path) -> None:
    """Télécharge ``url`` dans ``chemin`` (``.part`` le temps du transfert)."""
    import urllib.request

    part = chemin.with_name(chemin.name + ".part")
    with urllib.request.urlopen(url, timeout=60) as r, part.open("wb") as f:
        lu = 0
        while bloc := r.read(1 << 20):
            f.write(bloc)
            lu += len(bloc)
            print(f"\r  {chemin.name} : {lu / 1e6:.0f} Mo", end="", file=sys.stderr, flush=True)
    part.replace(chemin)
    print(file=sys.stderr)


def _overpass(requete: str, chemin: Path) -> None:
    """Enregistre dans ``chemin`` la réponse Overpass de ``requete``."""
    import urllib.parse
    import urllib.request

    from twin_engine.carte.extraits import OVERPASS_URL

    corps = urllib.parse.urlencode({"data": requete}).encode()
    chemin.parent.mkdir(parents=True, exist_ok=True)
    part = chemin.with_name(chemin.name + ".part")
    with urllib.request.urlopen(urllib.request.Request(OVERPASS_URL, data=corps), timeout=1200) as r, \
            part.open("wb") as f:
        while bloc := r.read(1 << 20):
            f.write(bloc)
    part.replace(chemin)


def _extraits(args, cfg: Config) -> int:
    """Les extraits Geofabrik qui couvrent les courses et les sorties de course à pied des
    manifestes, le plus petit pour chaque maille de 0,01° ; ceux qui manquent au dossier,
    téléchargés avec ``--telecharger``. Un extrait qui ne porte aucune course et moins de
    ``--min-mailles`` mailles de sorties est laissé de côté, et dit. Une course qu'aucun extrait
    ne couvre a ses voies par Overpass, dans ``<dossier>/overpass``."""
    import urllib.request

    from tools.banc import _slug
    from twin_engine.carte.extraits import INDEX_URL, extrait_de, lire_index, mailles, requete_overpass
    from twin_engine.ingest import iter_activities

    dossier = Path(args.dossier)
    dossier.mkdir(parents=True, exist_ok=True)
    chemin_index = Path(args.index) if args.index else dossier / "index-v1.json"
    if not chemin_index.exists():
        print(f"  index des extraits : {INDEX_URL}", file=sys.stderr)
        urllib.request.urlretrieve(INDEX_URL, chemin_index)
    extraits = lire_index(json.loads(chemin_index.read_text(encoding="utf-8")))
    par_id = {e.id: e for e in extraits}

    courses: list[tuple[str, str, np.ndarray]] = []
    sorties: dict[str, np.ndarray] = {}
    for m in args.manifestes:
        mp = Path(m)
        base = mp.resolve().parent
        man = json.loads(mp.read_text(encoding="utf-8"))
        ath = man["athlete"]
        for r in man["races"]:
            gpx = base / r["gpx"]
            if not gpx.exists():
                print(f"  {ath} · {r['name']} : trace introuvable — {gpx}", file=sys.stderr)
                continue
            c = _parcours_de(gpx, (base / r["race_json"]) if r.get("race_json") else None, r["name"], cfg)
            if c.lat_grid is None or c.lon_grid is None:
                print(f"  {ath} · {r['name']} : trace sans positions", file=sys.stderr)
                continue
            courses.append((ath, r["name"], mailles(c.lat_grid, c.lon_grid)))
        if args.sans_archives:
            continue
        archive = (base / man["archive"]).resolve()
        if not archive.exists():
            print(f"  {ath} : archive introuvable — {archive}", file=sys.stderr)
            continue
        lues = []
        for k, act in enumerate(iter_activities(archive, running_only=True), start=1):
            lues.append(mailles(act.lat, act.lon))
            if k % 50 == 0:
                print(f"\r  {ath} : {k} sorties lues", end="", file=sys.stderr, flush=True)
        print(f"\r  {ath} : {len(lues)} sorties lues", file=sys.stderr)
        sorties[ath] = np.unique(np.concatenate(lues), axis=0) if lues else np.zeros((0, 2))

    tout = [m for _, _, m in courses] + list(sorties.values())
    pts = np.unique(np.concatenate(tout), axis=0) if tout else np.zeros((0, 2))
    ou = dict(zip(map(tuple, pts.tolist()), extrait_de(pts[:, 0], pts[:, 1], extraits)))

    def ids(m: np.ndarray) -> list:
        return [ou[tuple(x)] for x in m.tolist()]

    besoin: dict[str, dict] = {}
    hors: list[str] = []
    a_overpass: list[tuple[str, np.ndarray]] = []
    for ath, nom, m in courses:
        les_ids = ids(m)
        if None in les_ids:
            sans = m[[i is None for i in les_ids]]
            a_overpass.append((f"{_slug(ath)}-{_slug(nom)}", sans))
        for i in set(les_ids):
            if i is None:
                hors.append(f"{ath} · {nom}")
            else:
                besoin.setdefault(i, {"courses": [], "sorties": {}})["courses"].append(f"{ath} · {nom}")
    hors_sorties = 0
    for ath, m in sorties.items():
        for i in ids(m):
            if i is None:
                hors_sorties += 1
            else:
                s_ = besoin.setdefault(i, {"courses": [], "sorties": {}})["sorties"]
                s_[ath] = s_.get(ath, 0) + 1
    retenus = {i: b for i, b in besoin.items()
               if b["courses"] or sum(b["sorties"].values()) >= args.min_mailles}
    ecartes = {i: b for i, b in besoin.items() if i not in retenus}

    dossier_overpass = dossier / "overpass"
    overpass_manquants = [(nom, m) for nom, m in a_overpass
                          if not (dossier_overpass / f"{nom}.json").exists()]

    def present(e) -> bool:
        return (dossier / e.url.rsplit("/", 1)[-1]).exists()

    out = ["**Extraits OpenStreetMap des courses et des sorties** (Geofabrik ; pour chaque maille "
           "de 0,01°, le plus petit extrait qui la contient)", "",
           "| extrait | courses | sorties (mailles par athlète) | dans le dossier |", "|---|---|---|---|"]
    for i, b in sorted(retenus.items(), key=lambda kv: par_id[kv[0]].nom):
        e = par_id[i]
        sor = ", ".join(f"{a} {n}" for a, n in sorted(b["sorties"].items())) or "—"
        out.append(f"| {e.nom} (`{i}`) | {' ; '.join(sorted(b['courses'])) or '—'} | {sor} "
                   f"| {'oui' if present(e) else 'non'} |")
    if ecartes:
        out += ["", f"Laissés de côté (aucune course, moins de {args.min_mailles} mailles de sorties) : "
                + ", ".join(f"{par_id[i].nom} ({sum(b['sorties'].values())})" for i, b in sorted(ecartes.items()))]
    if hors or hors_sorties:
        out += ["", f"Hors de tout extrait : {hors_sorties} maille(s) de sorties"
                + (f" ; courses : {', '.join(sorted(set(hors)))}" if hors else "")]
    if a_overpass:
        out += ["", f"Voies par Overpass (`{dossier_overpass}`, à passer en `--osm {dossier_overpass}`) : "
                + ", ".join(f"{nom}{'' if nom in {n for n, _ in overpass_manquants} else ' (déjà là)'}"
                            for nom, _ in a_overpass)]
    manquants = [par_id[i] for i in sorted(retenus) if not present(par_id[i])]
    if manquants:
        tailles = [_taille(e.url) for e in manquants]
        total = sum(t for t in tailles if t)
        out += ["", f"À télécharger : {len(manquants)} extrait(s)"
                + (f", {total / 1e9:.1f} Go annoncés" if total else ""), "", "```"]
        out += [f"curl -L -o {dossier / e.url.rsplit('/', 1)[-1]} {e.url}" for e in manquants]
        out += ["```"]
    elif not overpass_manquants:
        out += ["", "Tous les extraits nécessaires sont dans le dossier."]
    print("\n".join(out))
    if args.telecharger:
        for e in manquants:
            _telecharger(e.url, dossier / e.url.rsplit("/", 1)[-1])
        for nom, m in overpass_manquants:
            print(f"  Overpass : {nom}", file=sys.stderr)
            _overpass(requete_overpass(m[:, 0], m[:, 1]), dossier_overpass / f"{nom}.json")
    return 0


def _banc(args, cfg: Config) -> int:
    """Le terrain de chaque course des manifestes, à la coupure de la course : un fichier par
    course, ``<sortie>/<athlète>/<date>.json``, que ``tools/banc --terrain`` lit."""
    from tools.banc import _slug

    sortie = Path(args.out)
    lignes = ["| athlète | course | coupure | fenêtres (hachées) | descentes sur une voie OSM "
              "| signal | z activités | z régions | carte du parcours |",
              "|---|---|---|---|---|---|---|---|---|"]
    for m in args.manifestes:
        mp = Path(m)
        base = mp.resolve().parent
        man = json.loads(mp.read_text(encoding="utf-8"))
        archive = (base / man["archive"]).resolve()
        if not archive.exists():
            print(f"  {man['athlete']} : archive introuvable — {archive}", file=sys.stderr)
            continue
        courses = []
        for r in man["races"]:
            jour = date.fromisoformat(r["date"])
            until = date.fromisoformat(r["until"]) if r.get("until") else jour - timedelta(days=1)
            course = _parcours_de(base / r["gpx"], (base / r["race_json"]) if r.get("race_json") else None,
                                  r["name"], cfg)
            courses.append((r, until, course))
        dernier = max((u for _, u, _ in courses), default=None)
        acts = activites_de_l_archive(archive, cfg, dernier)
        if not acts:
            print(f"  {man['athlete']} : aucune activité avec des descentes", file=sys.stderr)
            continue
        parcours_t = [tranches_du_parcours(c, cfg) for _, _, c in courses]
        lecteur = Lecteur(args, cfg, [(a.tranches.lat, a.tranches.lon) for a in acts]
                          + [(t.lat, t.lon) for t in parcours_t])
        try:
            cartes = cartes_des_activites(acts, lecteur)
            ex = exemples_de(acts, cartes)
            for r, until, course in courses:
                bundle = terrain_d_une_course(course, acts, cartes, ex, until, lecteur, cfg)
                dossier = sortie / _slug(man["athlete"])
                dossier.mkdir(parents=True, exist_ok=True)
                (dossier / f"{r['date']}.json").write_text(json.dumps(bundle, ensure_ascii=False),
                                                           encoding="utf-8")
                mo = bundle["modele"]
                v = mo.get("validation") or {}
                za = (v.get("activites") or {}).get("z")
                zr = (v.get("regions") or {}).get("z")
                cov, _ = couverture_des_sorties({a.cle: cartes[a.cle] for a in acts if a.jour <= until})
                osm = (cov.get("recale") or {}).get("descentes")
                prof = bundle["parcours"] or {}
                parcours = "hors des extraits OSM" if prof.get("refus") else ("oui" if prof else "—")
                lignes.append(f"| {man['athlete']} | {r['name']} | {until} | {mo['n_fenetres']} "
                              f"({mo['n_hachees']}) | {_f(None if osm is None else 100 * osm, 0)} % | "
                              f"{'oui' if mo.get('signal') else 'non'} | {_f(za, 2)} | {_f(zr, 2)} "
                              f"| {parcours} |")
        finally:
            lecteur.fermer()
    print("\n".join(lignes))
    return 0


def _resume_modele(m: dict) -> list[str]:
    out = [f"# Modèle de la carte — {m['n_activites']} activités, {m['n_fenetres']} fenêtres "
           f"de descente dont {m['n_hachees']} hachées", ""]
    if not m.get("coefficients"):
        return out + [f"Pas de modèle : {m.get('raison')}"]
    out += [f"Pénalité L2 retenue : {m['l2']} ; régions : {m['n_regions']}", "",
            "| validation hors échantillon | perte carte | perte contrôles | gain | AUC carte | AUC contrôles | mieux prédits |",
            "|---|---|---|---|---|---|---|"]
    for nom, v in (m.get("validation") or {}).items():
        if v is None:
            continue
        out.append(f"| par {nom} | {v['perte_carte']} | {v['perte_controles']} | "
                   f"{_f(100 * v['gain_relatif'] if v['gain_relatif'] is not None else None, 1)} % | "
                   f"{_f(v['auc_carte'], 3)} | {_f(v['auc_controles'], 3)} | "
                   f"{v['groupes_mieux_predits']}/{v['groupes']} |")
    out += ["", f"**Signal : {'oui' if m['signal'] else 'non'}** — "
            + ("la carte améliore la prédiction des descentes hachées hors échantillon."
               if m["signal"] else "la carte n'améliore pas la prédiction hors échantillon ; "
                                   "elle ne dit rien de la technicité pour cet athlète.")]
    n_ctrl = m["encodage"]["classes"] + 1 + (1 if m["encodage"]["avec_nuit"] else 0)
    coefs = sorted(zip(m["colonnes"][n_ctrl:], m["coefficients"][n_ctrl:]), key=lambda x: -abs(x[1]))
    out += ["", "| terme de la carte (les plus forts) | logit |", "|---|---|"]
    out += [f"| {k} | {v:+.3f} |" for k, v in coefs[:15]]
    return out


# --------------------------------------------------------------------------- main
def _sources_args(sp) -> None:
    sp.add_argument("--osm", action="append", help="extrait OpenStreetMap (.osm.pbf), réponse Overpass "
                                                   "(.json) ou dossier de réponses ; répétable")
    sp.add_argument("--mnt", help="copernicus, un fichier raster ou un dossier de dalles")
    sp.add_argument("--mnt-crs", help="système des dalles sans système de coordonnées (EPSG:2154 pour le RGE ALTI)")
    sp.add_argument("--attribution-mnt", help="attribution d'un MNT local (RGE ALTI par défaut)")
    sp.add_argument("--sol", help="worldcover, un fichier raster ou un dossier de dalles")
    sp.add_argument("--geologie", help="couche géologique GeoJSON (WGS 84)")
    sp.add_argument("--propriete", help="propriété des polygones de la couche géologique lue")
    sp.add_argument("--cache", default=str(CACHE_DEFAUT), help="dossier des cartes gardées (hors git)")
    sp.add_argument("--set", action="append", default=[], metavar="BLOC.CLÉ=VALEUR")
    sp.add_argument("--json", action="store_true")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="carte", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="commande", required=True)
    sp = sub.add_parser("parcours", help="la carte d'un parcours")
    sp.add_argument("--course", required=True, help="trace GPX du parcours")
    sp.add_argument("--race", help="spécification de la course (JSON : ravitaillements, km officiels)")
    sp.add_argument("--coupure-km", type=float, help="km officiel qui sépare les deux parties comparées")
    sp.add_argument("--modele", help="modèle d'athlète (sortie de la commande modele)")
    sp.add_argument("--vecu", help="fenêtres d'apprentissage de l'athlète (exemples.json du cache) : "
                                   "la course contre ses dernières semaines, avec --modele")
    sp.add_argument("--vecu-jusqua", help="fin de la période vécue, AAAA-MM-JJ (défaut : sa dernière activité)")
    sp.add_argument("--vecu-jours", type=int, default=183, help="longueur de la période vécue (jours)")
    _sources_args(sp)
    sa = sub.add_parser("activite", help="la carte du fichier de la montre d'une course")
    sa.add_argument("--activite", required=True)
    sa.add_argument("--distance-officielle", type=float, help="km officiels : la distance de la montre y est ramenée")
    sa.add_argument("--coupure-km", type=float)
    _sources_args(sa)
    sm = sub.add_parser("modele", help="apprendre le modèle de la carte d'un athlète")
    sm.add_argument("--archive", required=True)
    sm.add_argument("--until", help="dernière date d'activité retenue, AAAA-MM-JJ (incluse)")
    sm.add_argument("--out", help="fichier JSON du modèle")
    _sources_args(sm)
    st = sub.add_parser("terrain", help="le terrain d'une course pour le moteur (--terrain)")
    st.add_argument("--archive", required=True)
    st.add_argument("--until", help="coupure du modèle et du magasin des ultras, AAAA-MM-JJ")
    st.add_argument("--course", required=True, help="trace GPX du parcours")
    st.add_argument("--race", help="spécification de la course (JSON)")
    st.add_argument("--out", required=True, help="fichier du terrain, pour --terrain du moteur")
    _sources_args(st)
    sb = sub.add_parser("banc", help="le terrain de chaque course des manifestes, pour tools/banc --terrain")
    sb.add_argument("manifestes", nargs="+")
    sb.add_argument("--out", required=True, help="dossier des terrains (<athlète>/<date>.json)")
    _sources_args(sb)
    se = sub.add_parser("extraits", help="les extraits OpenStreetMap (Geofabrik) des courses et des "
                                         "sorties des manifestes, téléchargés au besoin")
    se.add_argument("manifestes", nargs="+")
    se.add_argument("--dossier", default="local-data/osm", help="dossier des extraits .osm.pbf")
    se.add_argument("--index", help="index Geofabrik (index-v1.json) ; sinon lu en ligne et gardé "
                                    "dans le dossier")
    se.add_argument("--min-mailles", type=int, default=50,
                    help="mailles de sorties (0,01°) en dessous desquelles un extrait sans course "
                         "est laissé de côté")
    se.add_argument("--sans-archives", action="store_true", help="les traces des courses seulement")
    se.add_argument("--telecharger", action="store_true", help="télécharge les extraits qui manquent")
    se.add_argument("--set", action="append", default=[], metavar="BLOC.CLÉ=VALEUR")
    args = ap.parse_args(argv)
    cfg = load_config()
    try:
        for spec in args.set:
            cfg = override_config(cfg, spec)
    except ValueError as exc:
        print(f"--set : {exc}", file=sys.stderr)
        return 2
    try:
        if args.commande == "parcours":
            return _parcours(args, cfg)
        if args.commande == "activite":
            return _activite(args, cfg)
        if args.commande == "terrain":
            return _terrain(args, cfg)
        if args.commande == "banc":
            return _banc(args, cfg)
        if args.commande == "extraits":
            return _extraits(args, cfg)
        return _modele(args, cfg)
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
