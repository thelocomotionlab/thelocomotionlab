"""Parcours : de la trace GPX à la demande (twin-theory §1).

GPX → distance (haversine + 3D, réalignée sur le carnet de route) → altimétrie lissée
→ pente écrêtée → coût de Minetti → **distance équivalente à plat ``Deq``** → découpage
par segments aux ravitaillements. Tout est paramétré par :class:`Config` (constantes
fixes) et :class:`RaceSpec` (géométrie de la course) — aucun chemin ni nombre en dur.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, replace

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
    # surcoût de pente du segment sous la loi de Minetti, en km équivalents : montée (≥ 0) et
    # descente (≤ 0, la descente coûte moins qu'à plat) — deq = horizontal + montée + descente,
    # avant majoration de technicité ; c'est ce que le coût de pente personnel remet à l'échelle
    excess_up_km: float = 0.0
    excess_down_km: float = 0.0

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
    # majoration de technicité RÉELLEMENT servie (%) — 0 = aucune. Portée par le profil pour
    # que le rapport ne puisse pas afficher un Deq majoré sans en donner la raison.
    technicity_pct: float = 0.0
    # position (deg) sur la même grille horizontale : sert à localiser les points de
    # découpage (passages réels, waypoints GPX) — None sur un profil construit à la main
    lat_grid: np.ndarray | None = None
    lon_grid: np.ndarray | None = None
    # décomposition du Deq (Phase 5, C1) sur la grille, hors technicité : distance de base
    # cumulée, surcoût de montée cumulé (≥ 0), surcoût de descente cumulé (≤ 0) ; None sur un
    # profil construit à la main. ``slope_kappa`` = facteurs (montée, descente) réellement
    # servis, None = loi de Minetti telle quelle.
    base_grid_m: np.ndarray | None = None
    excess_up_grid_m: np.ndarray | None = None
    excess_down_grid_m: np.ndarray | None = None
    slope_kappa: tuple[float, float] | None = None

    def with_slope_cost(self, kappa_up: float, kappa_down: float) -> "CourseProfile":
        """Le même parcours sous un coût de pente personnel : le surcoût de montée est
        multiplié par ``kappa_up``, celui de descente par ``kappa_down`` (1, 1 rend le profil
        de Minetti au bit près, technicité comprise). Segments, Deq total et facteur de pente
        sont recalculés ; un profil sans décomposition est rendu tel quel."""
        if self.base_grid_m is None or self.excess_up_grid_m is None or self.excess_down_grid_m is None:
            return self
        ku, kd = float(kappa_up), float(kappa_down)
        tech = 1.0 + self.technicity_pct / 100.0
        deq_grid = (self.base_grid_m + ku * self.excess_up_grid_m + kd * self.excess_down_grid_m) * tech
        f = np.where(self.grade > 0, 1.0 + ku * (self.grade_factor - 1.0),
                     np.where(self.grade < 0, 1.0 + kd * (self.grade_factor - 1.0), self.grade_factor))
        segments = []
        for seg in self.segments:
            i0, i1 = _grid_index(self.off_km_grid, seg.off0), _grid_index(self.off_km_grid, seg.off1)
            segments.append(replace(seg, deq_km=float((deq_grid[i1] - deq_grid[i0]) / 1000.0)))
        return replace(self, deq_grid_m=deq_grid, grade_factor=f, segments=segments,
                       deq_km=float(deq_grid[-1] / 1000.0), slope_kappa=(ku, kd))

    def checkpoint_coords(self) -> list[tuple[float, float, float]]:
        """(km officiel, lat, lon) de chaque point de découpage — le MÊME indice de grille
        que celui qui borne les segments (:func:`_grid_index`)."""
        if self.lat_grid is None or self.lon_grid is None:
            raise ValueError("profil sans position sur la grille (lat_grid/lon_grid absents)")
        out: list[tuple[float, float, float]] = []
        for km in self.aid_km:
            i = _grid_index(self.off_km_grid, float(km))
            out.append((float(km), float(self.lat_grid[i]), float(self.lon_grid[i])))
        return out

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
            "technicity_pct": self.technicity_pct,
            "slope_kappa": None if self.slope_kappa is None else [round(k, 4) for k in self.slope_kappa],
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


def _grid_index(off_km_grid: np.ndarray, off_km: float) -> int:
    """Indice de grille du km officiel le plus proche (borne de segment, point de découpage)."""
    return int(np.argmin(np.abs(off_km_grid - off_km)))


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
    lat_g = np.interp(xg, cum, lat)
    lon_g = np.interp(xg, cum, lon)
    k = max(1, int(round(cfg.course.smooth_window_m / step)))
    egp = np.pad(eg, k, mode="reflect")
    es = np.convolve(egp, np.ones(k) / k, mode="same")[k:-k]

    # --- pente écrêtée + Minetti + Deq ---
    grad = np.clip(np.gradient(es, step), -cfg.course.grade_clip, cfg.course.grade_clip)
    f = grade_factor(grad, cfg.course.cr0)        # pas de plafond : pente déjà écrêtée à ±0,45
    # TECHNICITÉ (déclarée, jamais devinée) : Minetti traduit la PENTE en coût, en supposant un
    # sol roulant. Un pierrier, un chaos d'arête ou une main courante coûtent davantage à pente
    # égale — et rien de tout cela n'est dans le GPX. La majoration s'applique uniformément au
    # coût par mètre : « ce parcours se comporte comme (1+τ) fois sa distance équivalente ».
    # τ=0 (défaut) → aucun effet, le Deq est celui d'avant à l'octet près.
    deq_grid = np.cumsum(f * step) * (1.0 + race.technicity_pct / 100.0)
    # décomposition exacte du Deq (hors technicité) : base + surcoût de montée + surcoût de
    # descente, cumulés sur la grille — ce que le coût de pente personnel remet à l'échelle
    excess = (f - 1.0) * step
    base_grid = np.cumsum(np.full_like(f, step))
    up_grid = np.cumsum(np.where(grad > 0, excess, 0.0))
    down_grid = np.cumsum(np.where(grad < 0, excess, 0.0))

    dist3d_grid = np.interp(xg, cum, dist3d)
    off_km_grid = dist3d_grid * scale / 1000.0

    # --- découpage : par ravitaillements officiels, ou automatique (pas régulier) ---
    if race.has_aid_stations:
        aid = np.asarray(race.aid_km, dtype=float)
        names = list(race.aid_names)
    else:
        aid, names = _auto_segmentation(float(off_km_grid[-1]), cfg.course.default_segment_km)

    def grid_idx(off_km: float) -> int:
        return _grid_index(off_km_grid, off_km)

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
                excess_up_km=float((up_grid[i1] - up_grid[i0]) / 1000.0),
                excess_down_km=float((down_grid[i1] - down_grid[i0]) / 1000.0),
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
        technicity_pct=float(race.technicity_pct),
        lat_grid=lat_g,
        lon_grid=lon_g,
        base_grid_m=base_grid,
        excess_up_grid_m=up_grid,
        excess_down_grid_m=down_grid,
    )


__all__ = ["Segment", "CourseProfile", "build_course"]
