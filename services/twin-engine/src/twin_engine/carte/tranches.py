"""Une trace découpée en tranches de ``carte.pas_m`` mètres, et ce que sa géométrie dit.

Les tranches portent la position, l'altitude lissée, la pente, le cap, le dénivelé
négatif déjà descendu et le km de la tranche (officiel sur un parcours, celui de la trace
sur une activité) ; elles se font depuis un parcours (``CourseProfile``, sa grille
horizontale) ou depuis des positions brutes (une activité).

La géométrie se lit sur la trace seule, sans donnée externe, sur une fenêtre de
``carte.fenetre_geometrie_m`` centrée sur la tranche : le virage cumulé (degrés par 100 m),
les lacets (changements de cap de plus de 60° entre tranches voisines) et la variabilité de
la pente (écart type de la pente des tranches).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..config import Config

_R_TERRE = 6_371_000.0


@dataclass
class Tranches:
    """Les tranches d'une trace, au milieu de chacune."""

    x_m: np.ndarray          # distance horizontale depuis le départ
    lat: np.ndarray
    lon: np.ndarray
    alt_m: np.ndarray        # altitude lissée
    pente: np.ndarray        # dénivelé ÷ distance sur la tranche
    cap_deg: np.ndarray      # 0 = nord, 90 = est
    dminus_m: np.ndarray     # dénivelé négatif déjà descendu au début de la tranche
    pas_m: float
    km: np.ndarray | None = None   # km officiel au milieu (parcours) ; x_m ÷ 1000 sinon

    def __post_init__(self) -> None:
        if self.km is None:
            self.km = self.x_m / 1000.0

    @property
    def n(self) -> int:
        return int(self.x_m.size)


def _cap(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Cap (degrés) de chaque point vers le suivant ; le dernier reprend l'avant-dernier."""
    phi = np.radians(lat)
    dlam = np.radians(np.diff(lon))
    y = np.sin(dlam) * np.cos(phi[1:])
    x = np.cos(phi[:-1]) * np.sin(phi[1:]) - np.sin(phi[:-1]) * np.cos(phi[1:]) * np.cos(dlam)
    c = (np.degrees(np.arctan2(y, x)) + 360.0) % 360.0
    return np.concatenate([c, c[-1:]]) if c.size else np.zeros(lat.size)


def _distance(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    phi = np.radians(lat)
    a = (np.sin(np.diff(phi) / 2) ** 2
         + np.cos(phi[:-1]) * np.cos(phi[1:]) * np.sin(np.radians(np.diff(lon)) / 2) ** 2)
    return np.concatenate([[0.0], np.cumsum(2 * _R_TERRE * np.arcsin(np.sqrt(np.clip(a, 0, 1))))])


def tranches_de(lat, lon, alt, cfg: Config, *, x_m=None, km=None) -> Tranches:
    """Les tranches d'une trace donnée par ses positions (et la distance cumulée ``x_m`` si
    on l'a déjà, le km officiel ``km`` en chaque point si on l'a) ; l'altitude est lissée
    sur trois tranches."""
    lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
    alt = np.asarray(alt, dtype=float)
    ok = np.isfinite(lat) & np.isfinite(lon)
    lat, lon, alt = lat[ok], lon[ok], alt[ok]
    x = _distance(lat, lon) if x_m is None else np.nan_to_num(np.asarray(x_m, dtype=float))[ok]
    x = np.maximum.accumulate(x)
    pas = float(cfg.carte.pas_m)
    if x.size < 2 or x[-1] < pas:
        vide = np.zeros(0)
        return Tranches(vide, vide, vide, vide, vide, vide, vide, pas)
    bords = np.arange(0.0, x[-1] + 1e-9, pas)
    if bords[-1] < x[-1] - 1e-6:
        bords = np.concatenate([bords, [x[-1]]])
    milieux = (bords[:-1] + bords[1:]) / 2.0
    altf = alt if np.isfinite(alt).any() else np.zeros_like(alt)
    if np.isfinite(altf).any():
        bon = np.isfinite(altf)
        altf = np.interp(x, x[bon], altf[bon])
    z_bords = np.interp(bords, x, altf)
    k = 3
    z_lisse = np.convolve(np.pad(z_bords, k // 2, mode="edge"), np.ones(k) / k, mode="valid")
    longueurs = np.diff(bords)
    pente = np.diff(z_lisse) / np.where(longueurs > 0, longueurs, 1.0)
    descente = np.maximum(-np.diff(z_lisse), 0.0)
    dminus = np.concatenate([[0.0], np.cumsum(descente)[:-1]])
    lat_b, lon_b = np.interp(bords, x, lat), np.interp(bords, x, lon)
    cap = _cap(lat_b, lon_b)[:-1]
    km_milieux = None if km is None else np.interp(milieux, x, np.asarray(km, dtype=float)[ok])
    return Tranches(x_m=milieux, lat=np.interp(milieux, x, lat), lon=np.interp(milieux, x, lon),
                    alt_m=(z_lisse[:-1] + z_lisse[1:]) / 2.0, pente=pente, cap_deg=cap,
                    dminus_m=dminus, pas_m=pas, km=km_milieux)


def tranches_du_parcours(course, cfg: Config) -> Tranches:
    """Les tranches d'un parcours, sur sa grille horizontale et son altitude lissée."""
    if course.lat_grid is None or course.lon_grid is None:
        raise ValueError("parcours sans positions (lat_grid/lon_grid absents)")
    return tranches_de(course.lat_grid, course.lon_grid, course.alt_smooth_m, cfg, x_m=course.x_m,
                       km=course.off_km_grid)


def _fenetre(valeurs: np.ndarray, demi: int, fonction) -> np.ndarray:
    out = np.empty(valeurs.size)
    for i in range(valeurs.size):
        out[i] = fonction(valeurs[max(0, i - demi): i + demi + 1])
    return out


def geometrie(t: Tranches, cfg: Config) -> dict[str, np.ndarray]:
    """Virage cumulé (degrés par 100 m), lacets (changements de cap de plus de 60° par km) et
    variabilité de la pente (écart type) sur la fenêtre centrée sur chaque tranche."""
    if t.n == 0:
        vide = np.zeros(0)
        return {"virage_deg_100m": vide, "lacets_km": vide, "pente_ecart": vide}
    demi = max(int(round(cfg.carte.fenetre_geometrie_m / t.pas_m / 2.0)), 1)
    dcap = np.abs((np.diff(t.cap_deg) + 180.0) % 360.0 - 180.0)
    dcap = np.concatenate([[0.0], dcap])
    longueur = (2 * demi + 1) * t.pas_m
    virage = _fenetre(dcap, demi, np.sum) / longueur * 100.0
    lacets = _fenetre((dcap > 60.0).astype(float), demi, np.sum) / longueur * 1000.0
    ecart = _fenetre(t.pente, demi, lambda v: float(np.std(v)) if v.size > 1 else 0.0)
    return {"virage_deg_100m": virage, "lacets_km": lacets, "pente_ecart": ecart}


__all__ = ["Tranches", "geometrie", "tranches_de", "tranches_du_parcours"]
