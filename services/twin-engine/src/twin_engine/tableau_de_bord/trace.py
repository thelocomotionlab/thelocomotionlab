"""Ce qu'une trace GPX donne à l'éditeur de course.

Le moteur sait déjà lire une trace : ``build_course`` en tire le profil lissé, la
géométrie et le découpage. On l'appelle tel quel — pas une seconde lecture de GPX qui
finirait par ne plus dire la même chose que celle qui fait les rapports.

Ce module ajoute ce dont l'ÉCRAN a besoin et que le moteur n'a pas à connaître : un
profil assez léger pour tenir dans une réponse JSON, les waypoints du fichier (que
``build_course`` ignore : il ne lit que les ``trkpt``), et les heures de soleil du jour
de la course.
"""

from __future__ import annotations

import datetime as dt
import xml.etree.ElementTree as ET

import numpy as np

from .._dt import parse_iso
from ..config import Config
from ..course import RaceSpec, build_course
from ..ingest._xml import localname
from ..pacing.sun import sun_times

# Assez de points pour qu'un profil de 170 km garde ses cols, assez peu pour qu'il
# voyage en JSON sans peser : à ce pas, un point vaut moins de 300 m de course.
POINTS_DE_PROFIL = 600


def waypoints_du_gpx(data: bytes) -> list[dict]:
    """Les ``<wpt>`` du fichier — ce que l'organisateur a épinglé sur sa trace.

    ``build_course`` ne lit que les ``trkpt`` : pour lui, un waypoint n'existe pas. Ils
    sont pourtant la moitié du travail de saisie d'un carnet de route, d'où le bouton
    « Importer les waypoints du GPX »."""
    try:
        racine = ET.fromstring(data)
    except ET.ParseError:
        return []
    trouves = []
    for point in racine.iter():
        if localname(point.tag) != "wpt":
            continue
        try:
            lat, lon = float(point.get("lat")), float(point.get("lon"))
        except (TypeError, ValueError):
            continue
        nom, altitude = "", None
        for enfant in point:
            balise = localname(enfant.tag)
            if balise == "name" and enfant.text:
                nom = enfant.text.strip()
            elif balise == "ele" and enfant.text:
                try:
                    altitude = float(enfant.text)
                except ValueError:
                    altitude = None
        trouves.append({"nom": nom, "lat": lat, "lon": lon, "alt": altitude})
    return trouves


def _km_du_point(profil, lat: float, lon: float) -> float | None:
    """Le kilomètre de la trace le plus proche de ce point.

    Approximation équirectangulaire : sur les quelques centaines de mètres qui séparent
    un waypoint de la trace, elle vaut la haversine et coûte une multiplication.

    ⚠️ Sur un parcours qui repasse au même endroit (aller-retour, boucle), le plus proche
    peut être le mauvais passage. Le kilomètre reste éditable à la main dans l'éditeur,
    et c'est ce qui tranche."""
    if profil.lat_grid is None or profil.lon_grid is None:
        return None
    dlat = profil.lat_grid - lat
    dlon = (profil.lon_grid - lon) * np.cos(np.radians(lat))
    return round(float(profil.off_km_grid[int(np.argmin(dlat**2 + dlon**2))]), 2)


def _profil_leger(profil) -> list[list[float]]:
    """Le profil altimétrique, en couples (km, altitude), assez peu nombreux pour l'écran."""
    n = len(profil.off_km_grid)
    if n == 0:
        return []
    indices = np.unique(np.linspace(0, n - 1, min(POINTS_DE_PROFIL, n)).astype(int))
    return [[round(float(profil.off_km_grid[i]), 3), round(float(profil.alt_smooth_m[i]), 1)]
            for i in indices]


def _heures_de_soleil(depart: dt.datetime | None, lat: float | None, lon: float | None) -> dict:
    """Le coucher du jour du départ et le lever du lendemain.

    Les deux qui comptent pour un ultra : celui qui l'envoie dans la nuit, et celui qui
    l'en sort. Sans départ ni position, on ne devine rien — les champs restent vides."""
    if depart is None or lat is None or lon is None:
        return {"coucher": "", "lever": ""}
    tz = (depart.utcoffset().total_seconds() / 3600.0) if depart.utcoffset() else 0.0

    def _hhmm(minutes: float) -> str:
        minutes = int(round(minutes)) % (24 * 60)
        return f"{minutes // 60:02d}:{minutes % 60:02d}"

    _, coucher = sun_times(depart.year, depart.month, depart.day, lat, lon, tz)
    lendemain = depart.date() + dt.timedelta(days=1)
    lever, _ = sun_times(lendemain.year, lendemain.month, lendemain.day, lat, lon, tz)
    return {"coucher": _hhmm(coucher), "lever": _hhmm(lever)}


def lire_la_trace(gpx: bytes, *, cfg: Config, race: RaceSpec) -> dict:
    """La trace, telle que l'éditeur la montre (récapitulatif §5.3).

    ``race`` porte les ravitaillements DÉJÀ saisis : avec eux, le moteur recale la
    distance 3D sur le kilométrage officiel (le GPS dérive, le carnet de route fait
    foi) ; sans eux, il fait confiance à la longueur de la trace. La géométrie rendue
    ici est donc exactement celle que le plan servira, jamais une autre."""
    profil = build_course(gpx, race, cfg)

    depart_lat = float(profil.lat_grid[0]) if profil.lat_grid is not None else race.lat
    depart_lon = float(profil.lon_grid[0]) if profil.lon_grid is not None else race.lon
    altitudes = profil.alt_smooth_m

    return {
        "geometrie": {
            "distance_km": round(profil.length_km, 3),
            "dplus_m": round(profil.dplus_m, 1),
            "dminus_m": round(profil.dminus_m, 1),
            "alt_max": round(float(np.max(altitudes)), 1) if len(altitudes) else None,
            "alt_min": round(float(np.min(altitudes)), 1) if len(altitudes) else None,
        },
        "profil": _profil_leger(profil),
        "waypoints": [
            {**point, "km": _km_du_point(profil, point["lat"], point["lon"])}
            for point in waypoints_du_gpx(gpx)
        ],
        "lat": depart_lat,
        "lon": depart_lon,
        "soleil": _heures_de_soleil(race.start_time, depart_lat, depart_lon),
        "points": len(profil.off_km_grid),
        "avec_altitude": bool(len(altitudes)),
        # Les segments tels que le moteur les découpe — d'un ravitaillement au suivant,
        # avec leur dénivelé mesuré sur la trace entière, pas sur le profil allégé de
        # l'écran : c'est ce que l'inspecteur montre d'un ravitaillement choisi.
        "segments": [
            {"index": seg.index, "de": seg.frm, "vers": seg.to,
             "du_km": round(seg.off0, 2), "au_km": round(seg.off1, 2),
             "dplus_m": round(seg.dplus_m), "dminus_m": round(seg.dminus_m),
             "alt_debut_m": round(seg.alt_start_m), "alt_fin_m": round(seg.alt_end_m)}
            for seg in profil.segments
        ] if race.has_aid_stations else [],
    }


def parse_depart(iso: str):
    """Le départ d'une course, ou None — pour que l'appelant n'ait pas à tester."""
    return parse_iso(iso) if iso else None


__all__ = ["POINTS_DE_PROFIL", "lire_la_trace", "parse_depart", "waypoints_du_gpx"]
