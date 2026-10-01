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
from datetime import date
from pathlib import Path

import numpy as np

from twin_engine.carte import (Carte, cle_de_cache, dresser, ecrire_le_cache, lire_le_cache, par_partie,
                               tranches_de, tranches_du_parcours)
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
    return voies, "+".join(empreintes)


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
        sortie["technicite"] = _technicite(c, modele, cfg, course, args.coupure_km)
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
    lignes += ["", "Sources : " + " · ".join(c.attributions)]
    print("\n".join(lignes))
    return 0


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
def _modele(args, cfg: Config) -> int:
    from twin_engine.ingest import iter_activities
    from twin_engine.twin.descentes import fenetres_de_descente
    from twin_engine.twin.record import activity_distance, process_activity_full

    until = date.fromisoformat(args.until) if args.until else None
    entrees = []
    for act in iter_activities(Path(args.archive), running_only=True):
        if until is not None and (act.start_time is None or act.start_time.date() > until):
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
            entrees.append((f"a{len(entrees) + 1:05d}", t, fen))
    if not entrees:
        print("Aucune activité avec cadence, altitude, positions et descentes.", file=sys.stderr)
        return 1
    print(f"{len(entrees)} activités avec des descentes ; cartes…", file=sys.stderr)
    lecteur = Lecteur(args, cfg, [(t.lat, t.lon) for _, t, _ in entrees])
    ex = Exemples()
    sources = None
    try:
        for k, (nom, t, fen) in enumerate(entrees, start=1):
            c = lecteur.carte(t)
            sources = c.sources
            ex.ajouter(nom, fen, c)
            if k % 25 == 0:
                print(f"  {k}/{len(entrees)}", file=sys.stderr)
    finally:
        lecteur.fermer()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "exemples.json").write_text(json.dumps(ex.to_json(), ensure_ascii=False), encoding="utf-8")
    modele = apprendre(ex, cfg, sources=sources)
    modele["until"] = args.until
    if args.out:
        Path(args.out).write_text(json.dumps(modele, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.json:
        print(json.dumps(modele, ensure_ascii=False, indent=2))
        return 0
    print("\n".join(_resume_modele(modele)))
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
        return _modele(args, cfg)
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
