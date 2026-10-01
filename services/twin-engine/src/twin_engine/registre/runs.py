"""Ce qui marque un run du registre : quel code, quelle configuration, quand.

Un run du banc se régénère à volonté ; ce qui permet de le relire des mois plus tard, c'est
de savoir ce qui l'a produit. Trois marques :

* le **commit** du moteur (``git``, ou ``TWIN_COMMIT`` dans l'image où il n'y a pas de dépôt),
  avec un drapeau quand l'arbre de travail du service est modifié ;
* l'**empreinte de configuration** : un condensé de la configuration effective, chemins
  exclus — deux runs de même empreinte ont tourné sous les mêmes constantes ;
* les **drapeaux hors défaut** : chaque ``bloc.clé`` dont la valeur diffère de
  ``twin.config.json`` livré avec le moteur, lisible sans recalculer l'empreinte.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import unicodedata
from dataclasses import asdict, fields
from datetime import datetime, timezone
from pathlib import Path

from ..config import Config, _default_config_path, load_config

_RACINE_SERVICE = Path(__file__).resolve().parents[3]


def _plat(cfg: Config) -> dict[str, object]:
    """La configuration en ``{"bloc.clé": valeur}``, chemins exclus, valeurs JSON."""
    out: dict[str, object] = {}
    for f in fields(cfg):
        if f.name == "data_dir":
            continue
        bloc = asdict(getattr(cfg, f.name))
        for cle, valeur in bloc.items():
            out[f"{f.name}.{cle}"] = json.loads(json.dumps(valeur))
    return out


def empreinte_config(cfg: Config) -> str:
    """Condensé (12 caractères hexadécimaux) de la configuration effective."""
    texte = json.dumps(_plat(cfg), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(texte.encode("utf-8")).hexdigest()[:12]


def drapeaux_hors_defaut(cfg: Config, defauts: Config | None = None) -> dict[str, object]:
    """Les clés dont la valeur diffère de la configuration livrée (``twin.config.json`` du
    service), avec leur valeur effective."""
    base = _plat(defauts if defauts is not None else load_config(_default_config_path()))
    effective = _plat(cfg)
    return {k: v for k, v in sorted(effective.items()) if base.get(k) != v}


def version_du_moteur() -> dict:
    """``{"commit": …, "modifie": bool | None}`` — ``git`` quand le service est dans un dépôt,
    sinon ``TWIN_COMMIT`` (posé à la construction de l'image), sinon inconnu."""
    try:
        commit = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"], cwd=_RACINE_SERVICE,
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip()
        etat = subprocess.run(
            ["git", "status", "--porcelain", "--", "src", "twin.config.json"],
            cwd=_RACINE_SERVICE, capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip()
        if commit:
            return {"commit": commit, "modifie": bool(etat)}
    except (OSError, subprocess.SubprocessError):
        pass
    commit = os.environ.get("TWIN_COMMIT", "").strip()
    return {"commit": commit[:12] or None, "modifie": None}


def _slug(texte: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-") or "run"


def entete_de_run(cfg: Config, *, livre: str, label: str = "defauts",
                  manifestes: list[dict] | None = None,
                  le: datetime | None = None, defauts: Config | None = None) -> dict:
    """L'en-tête d'un run : identifiant, livre, étiquette, date, commit, empreinte, drapeaux."""
    le = (le or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(microsecond=0)
    empreinte = empreinte_config(cfg)
    moteur = version_du_moteur()
    return {
        "id": f"{le:%Y%m%d-%H%M%S}-{_slug(label)}-{empreinte[:6]}",
        "livre": livre,
        "label": label,
        "le": le.isoformat(),
        "commit": moteur["commit"],
        "modifie": moteur["modifie"],
        "config_empreinte": empreinte,
        "drapeaux": drapeaux_hors_defaut(cfg, defauts),
        "manifestes": list(manifestes or []),
    }


__all__ = ["drapeaux_hors_defaut", "empreinte_config", "entete_de_run", "version_du_moteur"]
