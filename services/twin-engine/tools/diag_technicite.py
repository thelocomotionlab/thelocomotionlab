"""La technicité d'un parcours, lue sur OpenStreetMap, contre ce que la montre a mesuré.

Sur un parcours déjà couru, l'outil croise deux choses :

  * ce que la carte dit de chaque sentier : son revêtement (roche, cailloux, terre…) et sa
    difficulté (``sac_scale``), récupérés sur OpenStreetMap le long de la trace ;
  * ce que l'athlète y a fait : sa vitesse verticale en descente, tronçon de 100 m par
    tronçon, sur l'enregistrement de sa montre recalé sur le carnet de route.

Le test compare, à pente égale et dans une même fenêtre de course (même fatigue, même
lumière), les descentes sur sentier « caillouteux » et sur sentier « roulant ». Il réussit si
l'écart de vitesse verticale atteint ``--seuil`` avec au moins ``--min-km`` de descente de
chaque côté. Le même test est refait sur la difficulté du sentier (T2 et plus contre T1).

    PYTHONPATH=src python -m tools.diag_technicite activite.gpx --race examples/nice-100m.json \\
        --trace ../../apps/site/public/tracks/nice-100m-2026.gpx --depuis-km 95.1 --heures 20 30

``--osm`` relit une réponse OpenStreetMap déjà enregistrée au lieu de la demander.
"""

from __future__ import annotations

import argparse
import bisect
import json
import math
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

import numpy as np

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course

OVERPASS = "https://overpass-api.de/api/interpreter"
RAYON_M = 6371008.8

ROCHEUX = {"rock", "stone", "stones", "pebblestone", "scree", "gravel"}
ROULANT = {"ground", "dirt", "earth", "grass", "compacted", "asphalt", "paved", "concrete",
           "fine_gravel"}
MAUVAIS = {"bad", "very_bad", "horrible", "very_horrible", "impassable"}
SAC_MONTAGNE = {"mountain_hiking", "demanding_mountain_hiking", "alpine_hiking",
                "demanding_alpine_hiking", "difficult_alpine_hiking"}
STRATES_DE_PENTE = [(-0.10, -0.05), (-0.15, -0.10), (-0.20, -0.15), (-0.30, -0.20), (-9.0, -0.30)]


# --------------------------------------------------------------------------- #
# L'enregistrement de la montre
# --------------------------------------------------------------------------- #
def _nom(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _distance_m(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    h = (np.sin((p2 - p1) / 2) ** 2
         + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2)
    return 2 * RAYON_M * np.arcsin(np.sqrt(h))


def lire_activite(chemin: Path) -> dict[str, np.ndarray]:
    """Les points de l'enregistrement, dans l'ordre du fichier.

    La distance cumulée est celle de la montre quand elle l'écrit (extension ``distance``),
    sinon la somme des distances entre points."""
    lat, lon, ele, quand, dist = [], [], [], [], []
    for _, el in ET.iterparse(chemin):
        if _nom(el.tag) != "trkpt":
            continue
        lat.append(float(el.get("lat")))
        lon.append(float(el.get("lon")))
        valeurs = {_nom(e.tag): (e.text or "").strip() for e in el.iter()}
        ele.append(float(valeurs.get("ele") or "nan"))
        quand.append(datetime.fromisoformat(valeurs["time"].replace("Z", "+00:00")))
        dist.append(float(valeurs["distance"]) if valeurs.get("distance") else math.nan)
        el.clear()
    lat, lon = np.array(lat), np.array(lon)
    t = np.array([(q - quand[0]).total_seconds() for q in quand])
    d = np.array(dist)
    if np.isnan(d).any():
        pas = _distance_m(lat[:-1], lon[:-1], lat[1:], lon[1:])
        d = np.concatenate([[0.0], np.cumsum(pas)])
    return {"t": horodatage_monotone(t), "lat": lat, "lon": lon, "ele": np.array(ele), "dist": d}


def horodatage_monotone(t: np.ndarray) -> np.ndarray:
    """Les heures, corrigées des quelques points qu'une montre date de travers.

    L'ordre du fichier fait foi (la distance y croît) ; un point dont l'heure sort de la plus
    longue suite croissante porte une heure fausse, et reprend celle de ses voisins. Les
    pauses de la montre, elles, restent : elles sont croissantes."""
    fins, fins_i, avant = [], [], np.full(len(t), -1)
    for i, v in enumerate(t):
        j = bisect.bisect_right(fins, v)
        if j == len(fins):
            fins.append(v)
            fins_i.append(i)
        else:
            fins[j], fins_i[j] = v, i
        avant[i] = fins_i[j - 1] if j > 0 else -1
    garde = np.zeros(len(t), bool)
    i = fins_i[-1]
    while i >= 0:
        garde[i] = True
        i = avant[i]
    idx = np.arange(len(t))
    corrige = t.copy()
    corrige[~garde] = np.interp(idx[~garde], idx[garde], t[garde])
    return corrige


# --------------------------------------------------------------------------- #
# Le parcours, et le passage de l'athlète à chaque ravitaillement
# --------------------------------------------------------------------------- #
def passages(act: dict, aid_lat, aid_lon, rayon_m: float = 150.0) -> list[tuple[int, int]]:
    """(premier, dernier) point de l'enregistrement dans le rayon de chaque ravitaillement.

    Une visite s'arrête quand l'athlète s'éloigne de plus de deux rayons : un ravitaillement
    qu'on repasse plus tard n'allonge pas l'arrêt du premier passage."""
    out = [(0, 0)]
    debut = 0
    for k in range(1, len(aid_lat)):
        d = _distance_m(act["lat"][debut:], act["lon"][debut:], aid_lat[k], aid_lon[k])
        proches = np.flatnonzero(d < rayon_m)
        if not len(proches):
            raise ValueError(f"ravitaillement {k} jamais approché à moins de {rayon_m:.0f} m")
        j = proches[0]
        while j + 1 < len(d) and d[j + 1] < 2 * rayon_m:
            j += 1
        dedans = np.flatnonzero(d[proches[0]:j + 1] < rayon_m) + proches[0]
        out.append((debut + dedans[0], debut + dedans[-1]))
        debut += dedans[-1]
    return out


def troncons(act: dict, course, aid_km, visites, longueur_km: float = 0.1) -> list[dict]:
    """Les tronçons de ``longueur_km`` du parcours : pente, temps passé, vitesse verticale.

    Chaque point de la montre prend un kilomètre du carnet de route, sa distance recalée
    section par section. Le temps aux ravitaillements et les pauses de la montre sortent."""
    t, d = act["t"], act["dist"]
    dt = np.diff(t, prepend=t[0])
    km = np.full(len(t), np.nan)
    en_route = np.ones(len(t), bool)
    for k in range(len(aid_km) - 1):
        i0, i1 = visites[k][1], visites[k + 1][0]
        km[i0:i1 + 1] = aid_km[k] + (d[i0:i1 + 1] - d[i0]) / max(d[i1] - d[i0], 1.0) * (
            aid_km[k + 1] - aid_km[k])
    for a, b in visites[1:-1]:
        en_route[a:b + 1] = False
    utile = en_route & (dt > 0) & (dt <= 5) & ~np.isnan(km)
    n = int(np.ceil(aid_km[-1] / longueur_km))
    case = np.floor(np.nan_to_num(km, nan=-1.0) / longueur_km).astype(int)
    out = []
    for i in range(n):
        m = utile & (case == i)
        heures = dt[m].sum() / 3600
        if heures <= 0:
            continue
        a0, a1 = np.interp([i * longueur_km, (i + 1) * longueur_km], course.off_km_grid,
                           course.alt_smooth_m)
        out.append({"km": i * longueur_km, "pente": (a1 - a0) / (longueur_km * 1000),
                    "vz": abs(a1 - a0) / heures,
                    "heure": float(np.average(t[m], weights=dt[m]) / 3600)})
    return out


# --------------------------------------------------------------------------- #
# OpenStreetMap
# --------------------------------------------------------------------------- #
def chemins_osm(lat, lon, *, pas: int = 20, rayon_m: int = 25) -> dict:
    """Les chemins OSM à moins de ``rayon_m`` de la trace, avec leurs étiquettes et leur tracé."""
    ligne = ",".join(f"{lat[i]:.6f},{lon[i]:.6f}" for i in range(0, len(lat), pas))
    requete = f"[out:json][timeout:180];way[highway](around:{rayon_m},{ligne});out tags geom;"
    corps = urllib.parse.urlencode({"data": requete}).encode()
    for essai in range(3):
        try:
            demande = urllib.request.Request(OVERPASS, data=corps,
                                             headers={"User-Agent": "locomotion-twin-diag"})
            with urllib.request.urlopen(demande, timeout=240) as reponse:
                return json.load(reponse)
        except OSError as exc:
            if essai == 2:
                raise
            print(f"Overpass : essai {essai + 1} échoué ({exc}), nouvel essai")
            time.sleep(10)
    raise AssertionError


def etiquettes_le_long(lat, lon, osm: dict, rayon_m: float = 25.0) -> list[dict | None]:
    """Pour chaque point de la trace, les étiquettes du chemin OSM le plus proche (ou None)."""
    cos0 = math.cos(math.radians(float(np.mean(lat))))

    def xy(la, lo):
        return np.radians(lo) * RAYON_M * cos0, np.radians(la) * RAYON_M

    gx, gy = xy(np.asarray(lat), np.asarray(lon))
    segments, etiquettes = [], []
    for w in osm.get("elements", []):
        g = w.get("geometry") or []
        if w.get("type") != "way" or len(g) < 2:
            continue
        x, y = xy(np.array([q["lat"] for q in g]), np.array([q["lon"] for q in g]))
        for j in range(len(g) - 1):
            segments.append((x[j], y[j], x[j + 1], y[j + 1]))
            etiquettes.append(w.get("tags", {}))
    if not segments:
        return [None] * len(gx)
    s = np.array(segments)
    meilleur = np.full(len(gx), np.inf)
    lequel = np.full(len(gx), -1)
    for k0 in range(0, len(s), 2000):
        bloc = s[k0:k0 + 2000]
        ax, ay, bx, by = (bloc[:, c][None] for c in range(4))
        dx, dy = bx - ax, by - ay
        u = np.clip(((gx[:, None] - ax) * dx + (gy[:, None] - ay) * dy)
                    / np.maximum(dx * dx + dy * dy, 1e-9), 0, 1)
        dist = np.hypot(gx[:, None] - (ax + u * dx), gy[:, None] - (ay + u * dy))
        j = dist.argmin(1)
        v = dist[np.arange(len(gx)), j]
        mieux = v < meilleur
        meilleur[mieux], lequel[mieux] = v[mieux], j[mieux] + k0
    return [etiquettes[q] if meilleur[i] <= rayon_m else None for i, q in enumerate(lequel)]


def revetement(tags: dict | None) -> str:
    if tags is None:
        return "hors carte"
    if tags.get("surface", "") in ROCHEUX or tags.get("smoothness", "") in MAUVAIS:
        return "caillouteux"
    if tags.get("surface", "") in ROULANT:
        return "roulant"
    return "inconnu"


def difficulte(tags: dict | None) -> str:
    sac = (tags or {}).get("sac_scale", "")
    return "T2 et plus" if sac in SAC_MONTAGNE else ("T1" if sac == "hiking" else "inconnu")


# --------------------------------------------------------------------------- #
# Le test
# --------------------------------------------------------------------------- #
def ecart(a: list[dict], b: list[dict]) -> float:
    """Écart de vitesse verticale de ``a`` sur ``b``, à pente égale (moyenne par strate)."""
    num = den = 0.0
    for bas, haut in STRATES_DE_PENTE:
        la = [math.log(x["vz"]) for x in a if bas <= x["pente"] < haut]
        lb = [math.log(x["vz"]) for x in b if bas <= x["pente"] < haut]
        if len(la) >= 2 and len(lb) >= 2:
            w = min(len(la), len(lb))
            num += w * (np.mean(la) - np.mean(lb))
            den += w
    return math.exp(num / den) - 1 if den else math.nan


def verdict(nom: str, a: list[dict], b: list[dict], *, seuil: float, min_km: float,
            longueur_km: float) -> str:
    e = ecart(a, b)
    ka, kb = len(a) * longueur_km, len(b) * longueur_km
    ligne = f"{nom} : {ka:.1f} km contre {kb:.1f} km ; écart {e:+.0%}"
    if len(a) > 3 and len(b) > 3:
        rng = np.random.default_rng(0)
        tirages = [ecart(list(rng.choice(a, len(a))), list(rng.choice(b, len(b))))
                   for _ in range(1000)]
        ligne += (f" (intervalle à 90 % : {np.nanpercentile(tirages, 5):+.0%} ;"
                  f" {np.nanpercentile(tirages, 95):+.0%})")
    reussi = not math.isnan(e) and abs(e) >= seuil and ka >= min_km and kb >= min_km
    return ligne + f" → {'RÉUSSI' if reussi else 'ÉCHOUÉ'}"


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("activite", type=Path, help="l'enregistrement GPX de la montre")
    ap.add_argument("--race", type=Path, required=True, help="le carnet de route (spec JSON)")
    ap.add_argument("--trace", type=Path, required=True, help="la trace GPX du parcours")
    ap.add_argument("--osm", type=Path, help="réponse OSM déjà enregistrée (JSON)")
    ap.add_argument("--garder-osm", type=Path, help="enregistre la réponse OSM ici")
    ap.add_argument("--depuis-km", type=float, default=0.0,
                    help="ne tester que les tronçons au-delà de ce kilomètre")
    ap.add_argument("--heures", type=float, nargs=2, metavar=("DE", "A"),
                    help="ne tester que les tronçons courus dans cette fenêtre (h de course)")
    ap.add_argument("--seuil", type=float, default=0.15)
    ap.add_argument("--min-km", type=float, default=3.0)
    args = ap.parse_args(argv)

    cfg = load_config()
    race = RaceSpec.from_json(args.race)
    course = build_course(args.trace.read_bytes(), race, cfg)
    aid_km = np.asarray(race.aid_km, float)
    aid_lat = np.interp(aid_km, course.off_km_grid, course.lat_grid)
    aid_lon = np.interp(aid_km, course.off_km_grid, course.lon_grid)

    act = lire_activite(args.activite)
    visites = passages(act, aid_lat, aid_lon)
    print(f"Enregistrement : {len(act['t'])} points, {act['t'][-1] / 3600:.2f} h ;"
          f" {len(visites) - 1} ravitaillements retrouvés")

    osm = json.loads(args.osm.read_text()) if args.osm else chemins_osm(course.lat_grid,
                                                                        course.lon_grid)
    if args.garder_osm:
        args.garder_osm.write_text(json.dumps(osm))
    tags = etiquettes_le_long(course.lat_grid, course.lon_grid, osm)
    rev = np.array([revetement(t) for t in tags])
    dif = np.array([difficulte(t) for t in tags])

    print("\nCe que la carte dit du parcours, section par section :")
    km_g = course.off_km_grid
    for s in range(1, len(aid_km)):
        m = (km_g >= aid_km[s - 1]) & (km_g < aid_km[s])
        parts = " ".join(f"{c} {np.mean(rev[m] == c):4.0%}"
                         for c in ("caillouteux", "roulant", "inconnu", "hors carte"))
        print(f"{s:2d} {race.aid_names[s][:24]:24s} {parts}   T2+ {np.mean(dif[m] == 'T2 et plus'):4.0%}")

    longueur = 0.1
    liste = troncons(act, course, aid_km, visites, longueur)
    for x in liste:
        m = (km_g >= x["km"]) & (km_g < x["km"] + longueur)
        for cle, valeurs in (("rev", rev[m]), ("dif", dif[m])):
            v, n = np.unique(valeurs, return_counts=True)
            x[cle] = str(v[n.argmax()]) if len(v) else ""
    choisis = [x for x in liste if x["pente"] < -0.05 and x["km"] >= args.depuis_km
               and (args.heures is None or args.heures[0] <= x["heure"] <= args.heures[1])]
    print(f"\nTronçons de descente testés : {len(choisis)} ({len(choisis) * longueur:.1f} km)")
    options = {"seuil": args.seuil, "min_km": args.min_km, "longueur_km": longueur}
    print(verdict("Revêtement, caillouteux contre roulant",
                  [x for x in choisis if x["rev"] == "caillouteux"],
                  [x for x in choisis if x["rev"] == "roulant"], **options))
    print(verdict("Difficulté, T2 et plus contre T1",
                  [x for x in choisis if x["dif"] == "T2 et plus"],
                  [x for x in choisis if x["dif"] == "T1"], **options))


if __name__ == "__main__":
    main()
