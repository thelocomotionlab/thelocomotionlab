"""OpenStreetMap le long d'une trace : les voies, le recalage, les étiquettes.

Les voies (``highway=*``) se lisent dans un extrait (``.osm.pbf`` de Geofabrik, ou ``.osm``,
par ``osmium`` quand il est installé), dans une réponse Overpass (``out tags geom``), ou
dans le cache JSON qu'en garde la carte. Données © les contributeurs d'OpenStreetMap,
sous licence ODbL : l'attribution voyage avec la carte (``ATTRIBUTION``).

**Recalage.** Chaque tranche se recale sur le segment de voie le plus proche à moins de
``carte.rayon_recalage_m`` dont le cap ne s'écarte pas de plus de
``carte.angle_cap_max_deg`` de celui de la trace (dans un sens ou dans l'autre) ; à défaut —
un lacet serré, où le cap tourne dans la tranche —, le plus proche à moins de la moitié du
rayon, sans condition de cap. Une tranche sans voie reste non recalée : l'absence est une
modalité, pas un zéro.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from ..config import Config
from .tranches import Tranches

ATTRIBUTION = "© les contributeurs d'OpenStreetMap — données sous licence ODbL (openstreetmap.org/copyright)"
_R_TERRE = 6_371_000.0


@dataclass
class Voies:
    """Les voies d'une zone : leurs étiquettes, et leurs segments en (lat, lon)."""

    tags: list[dict] = field(default_factory=list)
    geometries: list[np.ndarray] = field(default_factory=list)   # (n, 2) lat, lon
    _segments: tuple | None = field(default=None, repr=False, compare=False)

    def ajouter(self, tags: dict, points) -> None:
        pts = np.asarray(points, dtype=float).reshape(-1, 2)
        if pts.shape[0] >= 2 and tags.get("highway"):
            self.tags.append(dict(tags))
            self.geometries.append(pts)
            self._segments = None

    def segments(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """(début (m, 2), fin (m, 2), indice de voie (m,)) de tous les segments, en (lat, lon)."""
        if self._segments is None:
            if not self.geometries:
                vide = np.zeros((0, 2))
                self._segments = (vide, vide, np.zeros(0, dtype=int))
            else:
                self._segments = (np.vstack([g[:-1] for g in self.geometries]),
                                  np.vstack([g[1:] for g in self.geometries]),
                                  np.concatenate([np.full(len(g) - 1, w)
                                                  for w, g in enumerate(self.geometries)]))
        return self._segments

    def __len__(self) -> int:
        return len(self.tags)

    def to_json(self) -> list[dict]:
        return [{"tags": t, "geom": g.round(7).tolist()} for t, g in zip(self.tags, self.geometries)]

    @classmethod
    def depuis_json(cls, brut: list[dict]) -> "Voies":
        v = cls()
        for w in brut:
            v.ajouter(w.get("tags") or {}, w.get("geom") or [])
        return v


def voies_overpass(elements: list[dict]) -> Voies:
    """Les voies d'une réponse Overpass (``way`` avec ``out tags geom``)."""
    v = Voies()
    for e in elements:
        if e.get("type", "way") != "way":
            continue
        v.ajouter(e.get("tags") or {}, [(p["lat"], p["lon"]) for p in e.get("geometry") or []])
    return v


def voies_extrait(chemin: str | Path, bbox: tuple[float, float, float, float] | None = None,
                  garder=None) -> Voies:
    """Les voies d'un extrait OpenStreetMap (``.osm.pbf``, ``.osm``) : celles qui ont un
    nœud dans ``bbox`` (sud, ouest, nord, est) quand elle est donnée, et que ``garder``
    (points en (lat, lon) → bool) retient quand il est donné. Demande ``osmium``."""
    import osmium

    v = Voies()

    class _Lecteur(osmium.SimpleHandler):
        def way(self, w):
            if "highway" not in w.tags:
                return
            try:
                pts = [(n.lat, n.lon) for n in w.nodes]
            except osmium.InvalidLocationError:
                return
            if bbox is not None:
                s, o, n, e = bbox
                if not any(s <= la <= n and o <= lo <= e for la, lo in pts):
                    return
            if garder is not None and not garder(pts):
                return
            v.ajouter({t.k: t.v for t in w.tags}, pts)

    _Lecteur().apply_file(str(chemin), locations=True)
    return v


def pres_des_traces(traces, pas_deg: float = 0.01):
    """Un filtre ``garder`` pour :func:`voies_extrait` : vrai pour une voie dont un nœud
    tombe dans une maille de ``pas_deg`` degrés traversée par une des traces (positions en
    (lat, lon)) ou voisine d'une telle maille."""
    mailles: set[tuple[int, int]] = set()
    for lat, lon in traces:
        la = np.floor(np.asarray(lat, dtype=float) / pas_deg).astype(int)
        lo = np.floor(np.asarray(lon, dtype=float) / pas_deg).astype(int)
        for i, j in set(zip(la.tolist(), lo.tolist())):
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    mailles.add((i + di, j + dj))

    def garder(pts) -> bool:
        return any((int(np.floor(la / pas_deg)), int(np.floor(lo / pas_deg))) in mailles
                   for la, lo in pts)

    return garder


def _xy(lat, lon, lat0: float, lon0: float):
    x = np.radians(np.asarray(lon) - lon0) * _R_TERRE * np.cos(np.radians(lat0))
    y = np.radians(np.asarray(lat) - lat0) * _R_TERRE
    return x, y


def recaler(t: Tranches, voies: Voies, cfg: Config) -> tuple[np.ndarray, np.ndarray]:
    """(indice de voie ou −1, distance de recalage en m ou NaN) de chaque tranche."""
    idx = np.full(t.n, -1, dtype=int)
    dist = np.full(t.n, np.nan)
    if t.n == 0 or len(voies) == 0:
        return idx, dist
    rayon = float(cfg.carte.rayon_recalage_m)
    cos_max = np.cos(np.radians(cfg.carte.angle_cap_max_deg))
    lat0, lon0 = float(np.mean(t.lat)), float(np.mean(t.lon))
    a, b, w = voies.segments()
    # les seuls segments dont la boîte touche celle de la trace (élargie du rayon)
    marge = 2.0 * rayon / 111_000.0
    marge_lon = marge / max(np.cos(np.radians(lat0)), 0.1)
    proche = ((np.maximum(a[:, 0], b[:, 0]) >= t.lat.min() - marge)
              & (np.minimum(a[:, 0], b[:, 0]) <= t.lat.max() + marge)
              & (np.maximum(a[:, 1], b[:, 1]) >= t.lon.min() - marge_lon)
              & (np.minimum(a[:, 1], b[:, 1]) <= t.lon.max() + marge_lon))
    if not proche.any():
        return idx, dist
    a, b, w = a[proche], b[proche], w[proche]
    ax, ay = _xy(a[:, 0], a[:, 1], lat0, lon0)
    bx, by = _xy(b[:, 0], b[:, 1], lat0, lon0)
    abx, aby = bx - ax, by - ay
    L2 = np.maximum(abx ** 2 + aby ** 2, 1e-9)
    ux, uy = abx / np.sqrt(L2), aby / np.sqrt(L2)
    xmin, xmax = np.minimum(ax, bx) - rayon, np.maximum(ax, bx) + rayon
    ymin, ymax = np.minimum(ay, by) - rayon, np.maximum(ay, by) + rayon
    px, py = _xy(t.lat, t.lon, lat0, lon0)
    hx, hy = np.sin(np.radians(t.cap_deg)), np.cos(np.radians(t.cap_deg))
    for i in range(t.n):
        c = np.flatnonzero((xmin <= px[i]) & (px[i] <= xmax) & (ymin <= py[i]) & (py[i] <= ymax))
        if c.size == 0:
            continue
        u = np.clip(((px[i] - ax[c]) * abx[c] + (py[i] - ay[c]) * aby[c]) / L2[c], 0.0, 1.0)
        d = np.hypot(px[i] - (ax[c] + u * abx[c]), py[i] - (ay[c] + u * aby[c]))
        ok = (d <= rayon) & (np.abs(ux[c] * hx[i] + uy[c] * hy[i]) >= cos_max)
        if not ok.any():
            ok = d <= rayon / 2.0
        if ok.any():
            j = int(np.argmin(np.where(ok, d, np.inf)))
            idx[i], dist[i] = int(w[c[j]]), float(d[j])
    return idx, dist


def etiquettes(voies: Voies, idx: np.ndarray, cfg: Config) -> dict[str, list]:
    """Les étiquettes ``carte.etiquettes`` de chaque tranche (None : non recalée ou absente)."""
    return {cle: [None if i < 0 else voies.tags[i].get(cle) for i in idx]
            for cle in cfg.carte.etiquettes}


def charger_cache(chemin: Path) -> Voies | None:
    try:
        return Voies.depuis_json(json.loads(Path(chemin).read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return None


def ecrire_cache(chemin: Path, voies: Voies) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(voies.to_json()), encoding="utf-8")


__all__ = ["ATTRIBUTION", "Voies", "charger_cache", "ecrire_cache", "etiquettes", "pres_des_traces",
           "recaler", "voies_extrait", "voies_overpass"]
