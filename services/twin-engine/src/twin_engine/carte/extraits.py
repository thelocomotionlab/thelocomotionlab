"""Les extraits OpenStreetMap de Geofabrik qui couvrent des positions.

L'index de Geofabrik (``index-v1.json``) donne, pour chaque extrait, son contour (GeoJSON),
son nom et ses adresses de téléchargement. Pour chaque position, l'extrait retenu est le plus
petit qui la contient (une région plutôt que son pays, un pays plutôt que son continent) :
c'est ce qu'il faut télécharger pour qu'aucune trace ne tombe hors des extraits.
"""

from __future__ import annotations

from typing import NamedTuple

import numpy as np

INDEX_URL = "https://download.geofabrik.de/index-v1.json"


class Extrait(NamedTuple):
    id: str
    nom: str
    url: str
    bbox: tuple[float, float, float, float]      # ouest, sud, est, nord
    aire: float                                   # aire de la boîte, degrés carrés
    polygones: list[list[np.ndarray]]             # anneaux (lon, lat) de chaque polygone


def lire_index(index: dict) -> list[Extrait]:
    """Les extraits d'un index Geofabrik qui ont un contour et une adresse ``.osm.pbf``, du
    plus petit au plus grand."""
    out: list[Extrait] = []
    for f in index.get("features", []):
        p = f.get("properties") or {}
        g = f.get("geometry") or {}
        url = (p.get("urls") or {}).get("pbf")
        coords = g.get("coordinates") or []
        polys = coords if g.get("type") == "MultiPolygon" else [coords] if g.get("type") == "Polygon" else []
        anneaux = [[np.asarray(r, dtype=float)[:, :2] for r in poly if len(r) >= 3] for poly in polys]
        anneaux = [poly for poly in anneaux if poly]
        if not url or not anneaux:
            continue
        tous = np.concatenate([r for poly in anneaux for r in poly])
        (o, s), (e, n) = tous.min(axis=0), tous.max(axis=0)
        out.append(Extrait(str(p.get("id")), str(p.get("name") or p.get("id")), url,
                           (float(o), float(s), float(e), float(n)), float((e - o) * (n - s)), anneaux))
    return sorted(out, key=lambda x: x.aire)


def _dans_anneau(lon: np.ndarray, lat: np.ndarray, anneau: np.ndarray) -> np.ndarray:
    """Règle pair-impair : vrai pour chaque position qu'un rayon vers l'est fait sortir de
    l'anneau un nombre impair de fois."""
    dedans = np.zeros(lon.size, dtype=bool)
    x, y = anneau[:, 0], anneau[:, 1]
    for a, b, c, d in zip(x, y, np.roll(x, 1), np.roll(y, 1)):
        if b == d:
            continue
        dedans ^= ((b > lat) != (d > lat)) & (lon < (c - a) * (lat - b) / (d - b) + a)
    return dedans


def extrait_de(lat, lon, extraits: list[Extrait]) -> list[str | None]:
    """Pour chaque position, l'identifiant de l'extrait le plus petit qui la contient (None :
    aucun) ; ``extraits`` du plus petit au plus grand, comme :func:`lire_index` les rend."""
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    out = np.full(lat.size, None, dtype=object)
    reste = np.isfinite(lat) & np.isfinite(lon)
    for ex in extraits:
        o, s, e, n = ex.bbox
        idx = np.flatnonzero(reste & (lon >= o) & (lon <= e) & (lat >= s) & (lat <= n))
        if idx.size == 0:
            continue
        dedans = np.zeros(idx.size, dtype=bool)
        for poly in ex.polygones:
            d = np.zeros(idx.size, dtype=bool)
            for anneau in poly:                  # contour puis trous : pair-impair sur le tout
                d ^= _dans_anneau(lon[idx], lat[idx], anneau)
            dedans |= d
        out[idx[dedans]] = ex.id
        reste[idx[dedans]] = False
        if not reste.any():
            break
    return out.tolist()


def mailles(lat, lon, pas_deg: float = 0.01) -> np.ndarray:
    """Les positions ramenées au centre de leur maille de ``pas_deg`` degrés, sans doublon :
    (n, 2) en (lat, lon)."""
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    ok = np.isfinite(lat) & np.isfinite(lon)
    if not ok.any():
        return np.zeros((0, 2))
    m = np.unique(np.floor(np.column_stack([lat[ok], lon[ok]]) / pas_deg), axis=0)
    return (m + 0.5) * pas_deg


__all__ = ["INDEX_URL", "Extrait", "extrait_de", "lire_index", "mailles"]
