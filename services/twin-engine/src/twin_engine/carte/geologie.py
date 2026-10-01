"""La géologie sous une trace, depuis une couche locale de polygones (GeoJSON).

Par exemple la carte géologique harmonisée au 1/50 000 du BRGM (Licence Ouverte), exportée
en GeoJSON (WGS 84) : chaque tranche reçoit la valeur de la propriété demandée (une
lithologie, une notation) du polygone qui contient son milieu, None hors de la couche.
Point dans le polygone par lancer de rayon, trous compris.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .tranches import Tranches

ATTRIBUTION_BRGM = "Carte géologique © BRGM, Licence Ouverte Etalab 2.0"


def _dans(x: float, y: float, anneau: np.ndarray) -> bool:
    xs, ys = anneau[:, 0], anneau[:, 1]
    x2, y2 = np.roll(xs, -1), np.roll(ys, -1)
    croise = ((ys > y) != (y2 > y)) & (x < (x2 - xs) * (y - ys) / np.where(y2 != ys, y2 - ys, 1e-30) + xs)
    return bool(np.count_nonzero(croise) % 2)


def _polygones(geometrie: dict):
    if geometrie["type"] == "Polygon":
        yield [np.asarray(a, dtype=float) for a in geometrie["coordinates"]]
    elif geometrie["type"] == "MultiPolygon":
        for p in geometrie["coordinates"]:
            yield [np.asarray(a, dtype=float) for a in p]


def geologie(t: Tranches, chemin: str | Path, propriete: str) -> list:
    """La valeur de ``propriete`` sous le milieu de chaque tranche (None hors de la couche)."""
    brut = json.loads(Path(chemin).read_text(encoding="utf-8"))
    formes = []
    for f in brut.get("features") or []:
        g = f.get("geometry")
        if not g:
            continue
        for anneaux in _polygones(g):
            ext = anneaux[0]
            formes.append((ext[:, 0].min(), ext[:, 0].max(), ext[:, 1].min(), ext[:, 1].max(),
                           anneaux, (f.get("properties") or {}).get(propriete)))
    out = []
    for la, lo in zip(t.lat, t.lon):
        valeur = None
        for x0, x1, y0, y1, anneaux, v in formes:
            if x0 <= lo <= x1 and y0 <= la <= y1 and _dans(lo, la, anneaux[0]) \
                    and not any(_dans(lo, la, trou) for trou in anneaux[1:]):
                valeur = v
                break
        out.append(valeur)
    return out


__all__ = ["ATTRIBUTION_BRGM", "geologie"]
