"""Les rasters le long d'une trace : la rugosité du relief et l'occupation du sol.

Sources (lues par ``rasterio`` quand il est installé ; une URL se lit par plages HTTP, sans
télécharger la tuile) :

* **MNT** — Copernicus GLO-30 (≈ 30 m, monde, tuiles de 1°, © DLR / ESA, licence
  Copernicus), ou des dalles locales (RGE ALTI 1 m de l'IGN en France, Licence Ouverte) —
  une mosaïque VRT des dalles (``gdalbuildvrt``) lue comme un seul fichier évite qu'un
  disque soit coupé au bord d'une dalle ;
* **occupation du sol** — ESA WorldCover 10 m 2021 (tuiles de 3°, © ESA, CC BY 4.0).

Sur un disque de ``carte.rayon_rugosite_m`` autour de chaque tranche : l'indice de rugosité
du terrain (TRI, Riley et al. 1999 : moyenne des écarts absolus d'altitude entre une maille
et ses huit voisines) et l'écart type de la pente des mailles ; la classe d'occupation du
sol la plus présente et la part de sol nu ou à végétation clairsemée (classe 60). Sur un
MNT à 30 m, c'est la rugosité du versant qui se lit, pas celle du sentier ; le TRI dépend
du pas du MNT : deux cartes ne se comparent que sur le même MNT.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .tranches import Tranches

ATTRIBUTION_COPERNICUS = "MNT Copernicus GLO-30 © DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni sous licence COPERNICUS par l'Union européenne et l'ESA"
ATTRIBUTION_WORLDCOVER = "ESA WorldCover 10 m 2021 v200 © ESA, licence CC BY 4.0"
ATTRIBUTION_RGEALTI = "RGE ALTI® 1 m © IGN, Licence Ouverte Etalab 2.0"

WORLDCOVER_CLASSES = {10: "arbres", 20: "arbustes", 30: "prairie", 40: "cultures", 50: "bâti",
                      60: "sol nu ou clairsemé", 70: "neige et glace", 80: "eau",
                      90: "zone humide", 95: "mangrove", 100: "mousses et lichens"}

_M_PAR_DEGRE = 111_320.0
_PAQUET = 60          # tranches lues dans une même fenêtre de raster


def url_copernicus(lat: float, lon: float) -> str:
    """La tuile Copernicus GLO-30 qui contient (lat, lon)."""
    la, lo = int(np.floor(lat)), int(np.floor(lon))
    nom = (f"Copernicus_DSM_COG_10_{'N' if la >= 0 else 'S'}{abs(la):02d}_00_"
           f"{'E' if lo >= 0 else 'W'}{abs(lo):03d}_00_DEM")
    return f"https://copernicus-dem-30m.s3.amazonaws.com/{nom}/{nom}.tif"


def url_worldcover(lat: float, lon: float) -> str:
    """La tuile ESA WorldCover 2021 qui contient (lat, lon)."""
    la, lo = int(np.floor(lat / 3.0) * 3), int(np.floor(lon / 3.0) * 3)
    nom = (f"ESA_WorldCover_10m_2021_v200_{'N' if la >= 0 else 'S'}{abs(la):02d}"
           f"{'E' if lo >= 0 else 'W'}{abs(lo):03d}_Map")
    return f"https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/{nom}.tif"


def tri(z: np.ndarray) -> np.ndarray:
    """Indice de rugosité du terrain de chaque maille intérieure (bords : NaN)."""
    z = np.asarray(z, dtype=float)
    out = np.full(z.shape, np.nan)
    if z.shape[0] < 3 or z.shape[1] < 3:
        return out
    c = z[1:-1, 1:-1]
    somme = np.zeros_like(c)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            if di or dj:
                somme += np.abs(z[1 + di: z.shape[0] - 1 + di, 1 + dj: z.shape[1] - 1 + dj] - c)
    out[1:-1, 1:-1] = somme / 8.0
    return out


def pente_des_mailles(z: np.ndarray, dx_m: float, dy_m: float) -> np.ndarray:
    """Pente (m/m) de chaque maille ; NaN sur une fenêtre de moins de deux mailles de côté
    (un disque coupé au bord d'une tuile)."""
    z = np.asarray(z, dtype=float)
    if z.shape[0] < 2 or z.shape[1] < 2:
        return np.full(z.shape, np.nan)
    gy, gx = np.gradient(z, dy_m, dx_m)
    return np.hypot(gx, gy)


@dataclass
class Fenetre:
    """Une fenêtre lue dans un raster : valeurs, coordonnées des centres de mailles dans le
    système du raster (degrés s'il est géographique, mètres s'il est projeté)."""

    valeurs: np.ndarray
    xs: np.ndarray           # (colonnes,) : abscisse (longitude) des mailles
    ys: np.ndarray           # (lignes,) : ordonnée (latitude) des mailles
    dx_m: float = 1.0        # pas des mailles, en mètres
    dy_m: float = 1.0
    vers_raster: object = None   # (lat, lon) → (x, y) dans le système du raster ; None : géographique

    def disque(self, lat: float, lon: float, rayon_m: float) -> tuple[slice, slice, np.ndarray] | None:
        """(lignes, colonnes, masque) des mailles à moins de ``rayon_m`` de (lat, lon) ;
        None si aucune."""
        if self.vers_raster is None:
            dx = (self.xs - lon) * _M_PAR_DEGRE * np.cos(np.radians(lat))
            dy = (self.ys - lat) * _M_PAR_DEGRE
        else:
            x, y = self.vers_raster(lat, lon)
            dx, dy = self.xs - x, self.ys - y
        cols = np.flatnonzero(np.abs(dx) <= rayon_m)
        rows = np.flatnonzero(np.abs(dy) <= rayon_m)
        if cols.size == 0 or rows.size == 0:
            return None
        sl_r, sl_c = slice(rows[0], rows[-1] + 1), slice(cols[0], cols[-1] + 1)
        masque = np.hypot(dx[sl_c][None, :], dy[sl_r][:, None]) <= rayon_m
        return (sl_r, sl_c, masque) if masque.any() else None


class Raster:
    """Un raster géographique (EPSG:4326 ou projeté) ouvert une fois, lu par fenêtres. Un
    fichier sans système de coordonnées (les dalles ``.asc`` du RGE ALTI) prend
    ``crs_defaut``."""

    def __init__(self, source: str | Path, crs_defaut: str | None = None):
        import rasterio
        from rasterio.crs import CRS

        self.source = str(source)
        self._ds = rasterio.open(self.source)
        self.crs = self._ds.crs or (CRS.from_user_input(crs_defaut) if crs_defaut else None)
        if self.crs is None:
            self._ds.close()
            raise ValueError(f"{self.source} : aucun système de coordonnées (donner crs_defaut)")
        self._geographique = bool(self.crs.is_geographic)

    def fermer(self) -> None:
        self._ds.close()

    def _vers_raster(self, lat: float, lon: float) -> tuple[float, float]:
        from rasterio.warp import transform

        xs, ys = transform("EPSG:4326", self.crs, [lon], [lat])
        return float(xs[0]), float(ys[0])

    def fenetre(self, sud: float, ouest: float, nord: float, est: float) -> Fenetre | None:
        """Les mailles de la boîte (degrés) ; None hors du raster."""
        from rasterio.warp import transform
        from rasterio.windows import from_bounds

        ds = self._ds
        if self._geographique:
            x0, y0, x1, y1 = ouest, sud, est, nord
        else:
            xs, ys = transform("EPSG:4326", self.crs, [ouest, est, ouest, est], [sud, sud, nord, nord])
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        b = ds.bounds
        if x1 < b.left or x0 > b.right or y1 < b.bottom or y0 > b.top:
            return None
        w = from_bounds(max(x0, b.left), max(y0, b.bottom), min(x1, b.right), min(y1, b.top),
                        ds.transform).round_offsets().round_lengths()
        if w.width < 1 or w.height < 1:
            return None
        v = ds.read(1, window=w).astype(float)
        if ds.nodata is not None:
            v[v == ds.nodata] = np.nan
        t = ds.window_transform(w)
        cols = t.c + (np.arange(v.shape[1]) + 0.5) * t.a
        rows = t.f + (np.arange(v.shape[0]) + 0.5) * t.e
        if self._geographique:
            lat_moy = float(np.mean(rows))
            return Fenetre(v, cols, rows, dx_m=abs(t.a) * _M_PAR_DEGRE * np.cos(np.radians(lat_moy)),
                           dy_m=abs(t.e) * _M_PAR_DEGRE)
        return Fenetre(v, cols, rows, dx_m=abs(t.a), dy_m=abs(t.e), vers_raster=self._vers_raster)


class Sources:
    """Où lire : une fonction (lat, lon) → source du raster (URL de tuile, ou fichier d'une
    dalle) ; chaque source s'ouvre une fois. ``crs_defaut`` : cf. :class:`Raster`."""

    def __init__(self, choisir, crs_defaut: str | None = None):
        self.choisir = choisir
        self.crs_defaut = crs_defaut
        self._ouverts: dict[str, Raster | None] = {}
        self.illisibles: list[str] = []

    def raster(self, lat: float, lon: float) -> Raster | None:
        source = self.choisir(lat, lon)
        if source is None:
            return None
        if source not in self._ouverts:
            try:
                self._ouverts[source] = Raster(source, self.crs_defaut)
            except Exception:  # noqa: BLE001 — tuile absente, réseau coupé : la tranche reste vide
                self._ouverts[source] = None
                self.illisibles.append(str(source))
        return self._ouverts[source]

    def fermer(self) -> None:
        for r in self._ouverts.values():
            if r is not None:
                r.fermer()


def dalles_locales(repertoire: str | Path, crs_defaut: str | None = None):
    """Un choix de source sur des dalles locales (RGE ALTI…) : la dalle qui contient le
    point ; une dalle sans système de coordonnées prend ``crs_defaut``."""
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import transform

    dalles = []
    for chemin in sorted(Path(repertoire).rglob("*")):
        if chemin.suffix.lower() not in (".tif", ".tiff", ".asc"):
            continue
        with rasterio.open(chemin) as ds:
            crs = ds.crs or (CRS.from_user_input(crs_defaut) if crs_defaut else None)
            if crs is not None:
                dalles.append((str(chemin), crs, ds.bounds))

    def choisir(lat: float, lon: float):
        for chemin, crs, b in dalles:
            x, y = transform("EPSG:4326", crs, [lon], [lat]) if not crs.is_geographic \
                else ([lon], [lat])
            if b.left <= x[0] <= b.right and b.bottom <= y[0] <= b.top:
                return chemin
        return None

    return choisir


def un_fichier(chemin: str | Path):
    """Un choix de source sur un seul raster (un GeoTIFF, une mosaïque VRT de dalles)."""
    chemin = str(chemin)
    return lambda lat, lon: chemin


def _par_paquets(t: Tranches, sources: Sources, rayon_m: float, preparer, mesure):
    """Pour chaque tranche, ``mesure(préparé, lignes, colonnes, masque) → dict`` sur le
    disque de ``rayon_m`` autour d'elle ; une fenêtre de raster est lue (et
    ``preparer(fenêtre)`` appelé) par paquet de tranches voisines et par source."""
    sorties: list[dict | None] = [None] * t.n
    marge_lat = rayon_m / _M_PAR_DEGRE * 1.5
    for debut in range(0, t.n, _PAQUET):
        sel = np.arange(debut, min(debut + _PAQUET, t.n))
        par_source: dict[int, tuple[Raster, list[int]]] = {}
        for i in sel:
            r = sources.raster(float(t.lat[i]), float(t.lon[i]))
            if r is not None:
                par_source.setdefault(id(r), (r, []))[1].append(int(i))
        for r, indices in par_source.values():
            la, lo = t.lat[indices], t.lon[indices]
            marge_lon = marge_lat / max(np.cos(np.radians(float(np.mean(la)))), 0.1)
            f = r.fenetre(float(la.min()) - marge_lat, float(lo.min()) - marge_lon,
                          float(la.max()) + marge_lat, float(lo.max()) + marge_lon)
            if f is None:
                continue
            pret = preparer(f)
            for i in indices:
                d = f.disque(float(t.lat[i]), float(t.lon[i]), rayon_m)
                if d is not None:
                    sorties[i] = mesure(pret, *d)
    return sorties


def rugosite(t: Tranches, sources: Sources, rayon_m: float) -> dict[str, np.ndarray]:
    """TRI moyen (m) et écart type de la pente des mailles sur le disque de chaque tranche."""

    def preparer(f: Fenetre):
        return tri(f.valeurs), pente_des_mailles(f.valeurs, f.dx_m, f.dy_m)

    def mesure(pret, lignes, colonnes, masque) -> dict:
        r = pret[0][lignes, colonnes][masque]
        p = pret[1][lignes, colonnes][masque]
        return {"tri": float(np.nanmean(r)) if np.isfinite(r).any() else np.nan,
                "pente_ecart": float(np.nanstd(p)) if np.isfinite(p).any() else np.nan}

    sorties = _par_paquets(t, sources, rayon_m, preparer, mesure)
    return {"tri_m": np.array([np.nan if s is None else s["tri"] for s in sorties]),
            "pente_mnt_ecart": np.array([np.nan if s is None else s["pente_ecart"] for s in sorties])}


def occupation(t: Tranches, sources: Sources, rayon_m: float) -> dict[str, list]:
    """La classe d'occupation du sol la plus présente sur le disque, et la part de sol nu."""

    def mesure(f: Fenetre, lignes, colonnes, masque) -> dict:
        v = f.valeurs[lignes, colonnes][masque]
        v = v[np.isfinite(v)].astype(int)
        if v.size == 0:
            return {"classe": None, "nu": np.nan}
        classes, n = np.unique(v, return_counts=True)
        return {"classe": int(classes[np.argmax(n)]), "nu": float(np.mean(v == 60))}

    sorties = _par_paquets(t, sources, rayon_m, lambda f: f, mesure)
    return {"occupation": [None if s is None else s["classe"] for s in sorties],
            "part_sol_nu": np.array([np.nan if s is None else s["nu"] for s in sorties])}


__all__ = ["ATTRIBUTION_COPERNICUS", "ATTRIBUTION_RGEALTI", "ATTRIBUTION_WORLDCOVER",
           "Fenetre", "Raster", "Sources", "WORLDCOVER_CLASSES", "dalles_locales", "occupation",
           "pente_des_mailles", "rugosite", "tri", "un_fichier", "url_copernicus", "url_worldcover"]
