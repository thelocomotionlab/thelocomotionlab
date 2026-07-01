"""Parcours : de la trace GPX à la demande (twin-theory §1).

GPX → distance (haversine + 3D, réalignée sur le carnet de route) → altimétrie lissée
→ pente écrêtée → coût de Minetti → **distance équivalente à plat ``Deq``** → découpage
par segments aux ravitaillements. Tout est paramétré par :class:`Config` (constantes
fixes) et :class:`RaceSpec` (géométrie de la course) — aucun chemin ni nombre en dur.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass

import numpy as np

from ..config import Config
from ..ingest._xml import child, localname, text_of
from ..ingest.canonical import haversine_cumulative
from ..minetti import grade_factor
from .spec import RaceSpec


@dataclass(frozen=True)
class Segment:
    index: int
    frm: str
    to: str
    off0: float          # km officiel de début
    off1: float          # km officiel de fin
    off_len: float       # longueur officielle (km)
    horiz_km: float      # longueur horizontale mesurée (km)
    dplus_m: float
    dminus_m: float
    deq_km: float        # distance équivalente à plat du segment
    mean_grade_pct: float
    alt_start_m: float
    alt_end_m: float
    alt_min_m: float
    alt_max_m: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class CourseProfile:
    """Profil de parcours traité + segments. Les tableaux sont sur la grille horizontale."""

    name: str
    # grille horizontale (pas = grid_step_m)
    x_m: np.ndarray
    alt_smooth_m: np.ndarray
    grade: np.ndarray
    grade_factor: np.ndarray
    deq_grid_m: np.ndarray       # Deq cumulée (m)
    off_km_grid: np.ndarray      # km officiel à chaque point de grille
    aid_km: np.ndarray
    # agrégats
    segments: list[Segment]
    length_km: float
    dplus_m: float
    dminus_m: float
    deq_km: float

    @property
    def dplus_per_km(self) -> float:
        """D+ par km officiel — entrée de la régression ultra (β2)."""
        return self.dplus_m / self.length_km

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "length_km": self.length_km,
            "dplus_m": self.dplus_m,
            "dminus_m": self.dminus_m,
            "deq_km": self.deq_km,
            "dplus_per_km": self.dplus_per_km,
            "segments": [s.to_dict() for s in self.segments],
        }


def _parse_course_gpx(data: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Trace de parcours (sans temps) → lat, lon, altitude."""
    root = ET.fromstring(data)
    lat: list[float] = []
    lon: list[float] = []
    ele: list[float] = []
    for pt in root.iter():
        if localname(pt.tag) != "trkpt":
            continue
        try:
            la = float(pt.attrib["lat"])
            lo = float(pt.attrib["lon"])
        except (KeyError, ValueError):
            continue
        e = text_of(child(pt, "ele"))
        if e is None:
            continue
        lat.append(la)
        lon.append(lo)
        ele.append(float(e))
    if len(lat) < 2:
        raise ValueError("GPX de parcours sans points/altitude exploitables")
    return np.array(lat), np.array(lon), np.array(ele)


def _auto_segmentation(total_km: float, step_km: float) -> tuple[np.ndarray, list[str]]:
    """Bornes de segments tous les ``step_km`` de 0 à ``total_km`` (dernier = arrivée).

    Utilisé en mode GPX-only (aucun ravitaillement fourni) : noms génériques
    « Départ » / « km N » / « Arrivée ». Le dernier segment peut être plus court.
    """
    if step_km <= 0:
        step_km = 10.0
    edges = [float(x) for x in np.arange(0.0, total_km, step_km)] or [0.0]
    if edges[-1] < total_km - 1e-6:
        edges.append(total_km)
    else:
        edges[-1] = total_km
    n = len(edges)
    names = [
        "Départ" if i == 0 else "Arrivée" if i == n - 1 else f"km {int(round(k))}"
        for i, k in enumerate(edges)
    ]
    return np.asarray(edges, dtype=float), names


def build_course(gpx_data: bytes, race: RaceSpec, cfg: Config) -> CourseProfile:
    lat, lon, ele = _parse_course_gpx(gpx_data)

    # --- distances : horizontale (haversine) + 3D, réalignée sur le carnet de route ---
    cum = haversine_cumulative(lat, lon)          # horizontal cumulé (m)
    seg = np.diff(cum)
    dele = np.diff(ele)
    seg3d = np.sqrt(seg**2 + dele**2)
    dist3d = np.concatenate([[0.0], np.cumsum(seg3d)])
    L = cum[-1]
    L3d = dist3d[-1]
    # Avec ravitaillements officiels : on recale la distance 3D sur le km officiel (le GPS
    # dérive, le carnet de route fait foi). Sans (mode GPX-only) : on fait confiance à la
    # longueur 3D de la trace telle quelle (scale = 1).
    scale = race.official_finish_km * 1000.0 / L3d if race.has_aid_stations else 1.0

    # --- grille régulière + lissage de l'altimétrie (règle fixe : fenêtre config) ---
    step = cfg.course.grid_step_m
    xg = np.arange(0.0, L, step)
    eg = np.interp(xg, cum, ele)
    k = max(1, int(round(cfg.course.smooth_window_m / step)))
    egp = np.pad(eg, k, mode="reflect")
    es = np.convolve(egp, np.ones(k) / k, mode="same")[k:-k]

    # --- pente écrêtée + Minetti + Deq ---
    grad = np.clip(np.gradient(es, step), -cfg.course.grade_clip, cfg.course.grade_clip)
    f = grade_factor(grad, cfg.course.cr0)        # pas de plafond : pente déjà écrêtée à ±0,45
    deq_grid = np.cumsum(f * step)

    dist3d_grid = np.interp(xg, cum, dist3d)
    off_km_grid = dist3d_grid * scale / 1000.0

    # --- découpage : par ravitaillements officiels, ou automatique (pas régulier) ---
    if race.has_aid_stations:
        aid = np.asarray(race.aid_km, dtype=float)
        names = list(race.aid_names)
    else:
        aid, names = _auto_segmentation(float(off_km_grid[-1]), cfg.course.default_segment_km)

    def grid_idx(off_km: float) -> int:
        return int(np.argmin(np.abs(off_km_grid - off_km)))

    segments: list[Segment] = []
    for s in range(len(aid) - 1):
        i0, i1 = grid_idx(aid[s]), grid_idx(aid[s + 1])
        seg_e = es[i0 : i1 + 1]
        seg_grad = grad[i0:i1]
        de = np.diff(seg_e)
        segments.append(
            Segment(
                index=s + 1,
                frm=names[s],
                to=names[s + 1],
                off0=float(aid[s]),
                off1=float(aid[s + 1]),
                off_len=float(aid[s + 1] - aid[s]),
                horiz_km=float((xg[i1] - xg[i0]) / 1000.0),
                dplus_m=float(de[de > 0].sum()),
                dminus_m=float(-de[de < 0].sum()),
                deq_km=float((deq_grid[i1] - deq_grid[i0]) / 1000.0),
                mean_grade_pct=float(np.mean(seg_grad) * 100) if seg_grad.size else 0.0,
                alt_start_m=float(seg_e[0]),
                alt_end_m=float(seg_e[-1]),
                alt_min_m=float(seg_e.min()),
                alt_max_m=float(seg_e.max()),
            )
        )

    deg = np.diff(es)
    return CourseProfile(
        name=race.name,
        x_m=xg,
        alt_smooth_m=es,
        grade=grad,
        grade_factor=f,
        deq_grid_m=deq_grid,
        off_km_grid=off_km_grid,
        aid_km=aid,
        segments=segments,
        length_km=float(off_km_grid[-1]),
        dplus_m=float(deg[deg > 0].sum()),
        dminus_m=float(-deg[deg < 0].sum()),
        deq_km=float(deq_grid[-1] / 1000.0),
    )


__all__ = ["Segment", "CourseProfile", "build_course"]
