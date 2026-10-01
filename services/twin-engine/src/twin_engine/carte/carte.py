"""La carte d'une trace : toutes les variables par tranche, leur couverture, leurs sources.

:func:`dresser` assemble ce que les sources disponibles disent de chaque tranche — la
géométrie de la trace (toujours), OpenStreetMap, le relief, l'occupation du sol, la
géologie (quand on les donne) ; une source absente laisse ses variables vides, et la
couverture le dit. :func:`par_partie` compare deux parties d'une trace (avant / après un
km), sur toute la trace et sur ses seules descentes. La carte se garde en JSON
(:meth:`Carte.to_json`), dans un cache hors du dépôt.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from ..config import Config
from . import osm as _osm
from . import raster as _raster
from .geologie import ATTRIBUTION_BRGM
from .geologie import geologie as _geologie
from .tranches import Tranches, geometrie

NUMERIQUES = ("virage_deg_100m", "lacets_km", "pente_ecart", "distance_recalage_m", "tri_m",
              "pente_mnt_ecart", "part_sol_nu")


@dataclass
class Carte:
    tranches: Tranches
    variables: dict[str, list] = field(default_factory=dict)
    attributions: list[str] = field(default_factory=list)
    # ce qui a été lu : {"osm": bool, "mnt": nom ou None, "sol": bool, "geologie": propriété ou None}
    sources: dict = field(default_factory=dict)

    def numerique(self, nom: str) -> np.ndarray:
        return np.array([np.nan if v is None else float(v) for v in self.variables.get(nom, [])])

    def categorie(self, nom: str) -> list:
        return list(self.variables.get(nom, [None] * self.tranches.n))

    def couverture(self, descente_max: float = -0.08) -> dict:
        """Part des tranches (et des tranches en descente) où chaque variable est connue ;
        pour ``recale``, part des tranches recalées sur une voie."""
        desc = self.tranches.pente <= descente_max
        out = {}
        for nom, valeurs in self.variables.items():
            if nom == "recale":
                connu = np.array([bool(v) for v in valeurs])
            else:
                connu = np.array([v is not None and not (isinstance(v, float) and np.isnan(v))
                                  for v in valeurs])
            out[nom] = {"toute": round(float(connu.mean()), 3) if connu.size else None,
                        "descentes": round(float(connu[desc].mean()), 3) if desc.any() else None}
        return out

    def to_json(self) -> dict:
        t = self.tranches
        def _l(a):
            return [None if (isinstance(v, float) and np.isnan(v)) else v for v in a]
        return {
            "pas_m": t.pas_m,
            "tranches": {"x_m": t.x_m.round(1).tolist(), "lat": t.lat.round(6).tolist(),
                         "lon": t.lon.round(6).tolist(), "alt_m": t.alt_m.round(1).tolist(),
                         "pente": t.pente.round(4).tolist(), "cap_deg": t.cap_deg.round(1).tolist(),
                         "dminus_m": t.dminus_m.round(1).tolist(), "km": t.km.round(4).tolist()},
            "variables": {k: _l([round(float(v), 4) if isinstance(v, (float, np.floating)) else v
                                 for v in vals]) for k, vals in self.variables.items()},
            "attributions": self.attributions,
            "sources": self.sources,
        }

    @classmethod
    def depuis_json(cls, brut: dict) -> "Carte":
        tr = brut["tranches"]
        t = Tranches(**{k: np.asarray(v, dtype=float) for k, v in tr.items()},
                     pas_m=float(brut["pas_m"]))
        return cls(t, dict(brut.get("variables") or {}), list(brut.get("attributions") or []),
                   dict(brut.get("sources") or {}))


def dresser(t: Tranches, cfg: Config, *, voies: _osm.Voies | None = None,
            mnt: _raster.Sources | None = None, sol: _raster.Sources | None = None,
            geologie: tuple[str | Path, str] | None = None, nom_mnt: str = "copernicus",
            attribution_mnt: str = _raster.ATTRIBUTION_COPERNICUS) -> Carte:
    """La carte des tranches ``t`` avec les sources données (``nom_mnt`` : de quel MNT
    viennent les rugosités, que la carte retient)."""
    variables: dict[str, list] = {k: list(v) for k, v in geometrie(t, cfg).items()}
    attributions: list[str] = []
    sources = {"osm": voies is not None, "mnt": nom_mnt if mnt is not None else None,
               "sol": sol is not None, "geologie": geologie[1] if geologie is not None else None}
    if voies is not None:
        idx, dist = _osm.recaler(t, voies, cfg)
        variables["recale"] = [bool(i >= 0) for i in idx]
        variables["distance_recalage_m"] = list(dist)
        variables.update(_osm.etiquettes(voies, idx, cfg))
        attributions.append(_osm.ATTRIBUTION)
    rayon = float(cfg.carte.rayon_rugosite_m)
    if mnt is not None:
        variables.update({k: list(v) for k, v in _raster.rugosite(t, mnt, rayon).items()})
        attributions.append(attribution_mnt)
    if sol is not None:
        o = _raster.occupation(t, sol, rayon)
        variables["occupation"] = o["occupation"]
        variables["part_sol_nu"] = list(o["part_sol_nu"])
        attributions.append(_raster.ATTRIBUTION_WORLDCOVER)
    if geologie is not None:
        variables["geologie"] = _geologie(t, geologie[0], geologie[1])
        attributions.append(ATTRIBUTION_BRGM)
    return Carte(t, variables, attributions, sources)


def par_partie(c: Carte, coupure_km: float, descente_max: float = -0.08) -> dict:
    """Les deux parties d'une trace (avant / après le km ``coupure_km``, officiel sur un
    parcours), sur toute la trace et sur les descentes : moyenne des variables numériques,
    répartition des modalités (l'absence d'étiquette comptée comme une modalité)."""
    t = c.tranches
    avant = t.km < coupure_km
    desc = t.pente <= descente_max
    out = {}
    for zone, masque in (("toute", np.ones(t.n, dtype=bool)), ("descentes", desc)):
        bloc = {}
        for partie, sel in (("avant", masque & avant), ("apres", masque & ~avant)):
            p = {"km": round(float(sel.sum() * t.pas_m / 1000.0), 2)}
            for nom in c.variables:
                if nom in NUMERIQUES:
                    v = c.numerique(nom)[sel]
                    v = v[np.isfinite(v)]
                    p[nom] = None if v.size == 0 else round(float(np.mean(v)), 4)
                elif nom != "recale":
                    vals = [("absente" if v is None else str(v))
                            for v, s in zip(c.categorie(nom), sel) if s]
                    if vals:
                        u, n = np.unique(vals, return_counts=True)
                        p[nom] = {str(k): round(float(m) / len(vals), 3) for k, m in zip(u, n)}
                else:
                    r = np.array(c.variables["recale"], dtype=bool)[sel]
                    p[nom] = None if r.size == 0 else round(float(r.mean()), 3)
            bloc[partie] = p
        out[zone] = bloc
    return out


def sans_voie_osm(c: Carte) -> bool:
    """Un extrait OSM a été lu, et aucune tranche de la trace n'est recalée sur une voie :
    la trace est hors des extraits donnés."""
    return bool(c.sources.get("osm")) and not any(c.variables.get("recale") or [])


def hors_des_extraits(c: Carte, cfg: Config, descente_max: float = -0.08) -> str | None:
    """Pourquoi la carte ne s'applique pas aux descentes de cette trace faute de voies OSM
    (None : elle s'applique). Hors des extraits, toutes les étiquettes seraient « absentes »,
    une modalité que le modèle a apprise sur des voies réelles sans étiquette."""
    if not c.sources.get("osm"):
        return None
    part = (c.couverture(descente_max).get("recale") or {}).get("descentes")
    if part is None or part >= cfg.carte.couverture_osm_min:
        return None
    return (f"trace hors des extraits OSM donnés : {100 * part:.0f} % de ses descentes recalées "
            f"sur une voie (il en faut {100 * cfg.carte.couverture_osm_min:.0f} %)")


def cle_de_cache(t: Tranches, cfg: Config, sources: list[str]) -> str:
    """Une empreinte des tranches, des réglages de la carte et des sources."""
    h = hashlib.sha256()
    h.update(np.round(np.column_stack([t.lat, t.lon]), 5).tobytes())
    h.update(np.round(np.column_stack([t.x_m, t.km, t.alt_m]), 2).tobytes())
    h.update(json.dumps({k: getattr(cfg.carte, k) for k in cfg.carte.__dataclass_fields__},
                        sort_keys=True, default=list).encode())
    h.update("|".join(sorted(sources)).encode())
    return h.hexdigest()[:16]


def lire_le_cache(racine: Path, cle: str) -> Carte | None:
    chemin = Path(racine) / "cartes" / f"{cle}.json"
    try:
        return Carte.depuis_json(json.loads(chemin.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, KeyError):
        return None


def ecrire_le_cache(racine: Path, cle: str, c: Carte) -> Path:
    chemin = Path(racine) / "cartes" / f"{cle}.json"
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(c.to_json(), ensure_ascii=False), encoding="utf-8")
    return chemin


__all__ = ["Carte", "NUMERIQUES", "cle_de_cache", "dresser", "ecrire_le_cache", "hors_des_extraits",
           "lire_le_cache", "par_partie", "sans_voie_osm"]
