"""Les profils de configuration qu'un plan peut servir : défaut, référence, expérimental.

Le profil **défaut** est ``twin.config.json`` tel quel. Les deux autres sont des surcharges
« bloc.clé=valeur » posées dans le même fichier, bloc ``profils`` (hors de la configuration
effective : ni l'empreinte ni les drapeaux d'un run du défaut n'en dépendent) :

* **référence** — les drapeaux qu'un run a gardés hors du défaut faute de preuve sur les cas
  frais, servis à l'athlète dont ils améliorent le plan ;
* **expérimental** — les leviers à l'essai.

Le profil d'un plan se choisit sur l'écran Plan ; le registre le retient avec l'entrée servie
(nom, et drapeaux effectivement hors défaut).

Un fichier de configuration partiel (``TWIN_CONFIG_PATH``) garde les profils de
``twin.config.json`` qu'il ne redéfinit pas, comme il garde les autres clés absentes.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .config import Config, _default_config_path, override_config

PROFILS = ("defaut", "reference", "experimental")
TITRES = {"defaut": "Défaut", "reference": "Référence", "experimental": "Expérimental"}


def _lire(path: Path) -> dict:
    try:
        return dict(json.loads(path.read_text(encoding="utf-8")).get("profils") or {})
    except (OSError, json.JSONDecodeError):
        return {}


def _bloc(chemin: str | os.PathLike[str] | None = None) -> dict:
    # Le bloc ``profils`` n'a pas de valeurs par défaut dans ``Config`` : sans la lecture du
    # fichier livré, un fichier partiel viderait en silence les profils qu'il ne nomme pas.
    livre = _default_config_path()
    path = Path(chemin or os.environ.get("TWIN_CONFIG_PATH") or livre)
    bloc = _lire(livre)
    if path.resolve() != livre.resolve():
        bloc.update(_lire(path))
    return bloc


def surcharges(nom: str, chemin: str | os.PathLike[str] | None = None) -> list[str]:
    """Les surcharges « bloc.clé=valeur » du profil ``nom`` (aucune pour le défaut)."""
    if nom not in PROFILS:
        raise ValueError(f"profil inconnu : {nom!r} (attendu {', '.join(PROFILS)})")
    if nom == "defaut":
        return []
    return [str(x) for x in (_bloc(chemin).get(nom) or {}).get("drapeaux") or []]


def config_du_profil(cfg: Config, nom: str, chemin: str | os.PathLike[str] | None = None) -> Config:
    """La configuration ``cfg`` sous le profil ``nom``."""
    spec = ",".join(surcharges(nom, chemin))
    return override_config(cfg, spec) if spec else cfg


def lister(chemin: str | os.PathLike[str] | None = None) -> list[dict]:
    """Les profils, dans l'ordre, avec leur titre, leur description et leurs surcharges."""
    bloc = _bloc(chemin)
    return [{"nom": nom, "titre": TITRES[nom],
             "description": (bloc.get(nom) or {}).get("description") or (
                 "twin.config.json tel quel" if nom == "defaut" else ""),
             "drapeaux": surcharges(nom, chemin)} for nom in PROFILS]


__all__ = ["PROFILS", "TITRES", "config_du_profil", "lister", "surcharges"]
