"""Les objets du tableau de bord, en fichiers JSON sur le volume de données.

**Le fichier est la vérité.** L'index en mémoire n'est qu'un raccourci pour chercher
et trier ; il est reconstruit au démarrage en relisant le volume. Rien à administrer,
rien qui n'existe ailleurs que dans les fichiers — on peut copier le volume, l'ouvrir
dans un éditeur de texte, et tout est là.

Deux formes de rangement, parce que les objets n'ont pas tous la même famille de
fichiers autour d'eux :

  * un objet = un répertoire (``athletes/{id}/athlete.json`` à côté de ``jumeau.json``
    et ``calibration.json``) ;
  * un objet = un fichier (``requests/{id}.json``).

Écriture atomique (fichier temporaire sur le MÊME système de fichiers, puis
``os.replace``) : une coupure de courant laisse l'ancienne version entière, jamais un
JSON tronqué. Même pattern que le magasin du service de dépôt.
"""

from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path
from typing import Any, Iterator


def ecrire_json(chemin: Path, donnees: Any) -> None:
    """Écrit un JSON sans jamais laisser de fichier à moitié écrit à sa place."""
    chemin.parent.mkdir(parents=True, exist_ok=True)
    tmp = chemin.with_name(f"{chemin.name}.tmp")
    tmp.write_text(json.dumps(donnees, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, chemin)


def lire_json(chemin: Path) -> Any | None:
    """Le contenu, ou ``None`` si le fichier manque ou n'est pas du JSON.

    Un fichier illisible ne fait pas tomber le service au démarrage : l'objet manque
    à l'index, et le reste du volume continue de se charger."""
    try:
        return json.loads(chemin.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


# Un identifiant compose un chemin sur le volume : ni séparateur, ni « .. », ni fichier
# caché. Les ids du service (empreintes, uuid, références LL-…) passent tous.
_ID_SUR = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}")


def _sur(oid: str) -> str:
    oid = str(oid)
    if not _ID_SUR.fullmatch(oid) or ".." in oid:
        raise ValueError(f"identifiant inutilisable : {oid!r}")
    return oid


class Collection:
    """Une famille d'objets rangée sous une racine, avec son index en mémoire.

    ``fichier`` donne le nom du JSON À L'INTÉRIEUR du répertoire de chaque objet ;
    ``None`` range chaque objet dans un fichier ``{id}.json`` à la racine.

    L'index est gardé sous verrou : FastAPI sert ses gestionnaires dans un threadpool,
    et deux requêtes peuvent écrire en même temps.
    """

    def __init__(self, racine: Path, *, fichier: str | None = None):
        self.racine = Path(racine)
        self.fichier = fichier
        self._index: dict[str, dict] = {}
        self._verrou = threading.RLock()
        self.racine.mkdir(parents=True, exist_ok=True)
        self.recharger()

    # -- emplacements ------------------------------------------------------- #
    def repertoire(self, oid: str) -> Path:
        """Le répertoire de l'objet — celui qui porte ses fichiers compagnons."""
        return self.racine / _sur(oid) if self.fichier else self.racine

    def chemin(self, oid: str) -> Path:
        oid = _sur(oid)
        return self.racine / oid / self.fichier if self.fichier else self.racine / f"{oid}.json"

    # -- lecture ------------------------------------------------------------ #
    def recharger(self) -> None:
        """Relit tout le volume. Appelé au démarrage du service."""
        index: dict[str, dict] = {}
        motif = f"*/{self.fichier}" if self.fichier else "*.json"
        for chemin in sorted(self.racine.glob(motif)):
            donnees = lire_json(chemin)
            if isinstance(donnees, dict) and donnees.get("id"):
                index[str(donnees["id"])] = donnees
        with self._verrou:
            self._index = index

    def lire(self, oid: str) -> dict | None:
        with self._verrou:
            objet = self._index.get(oid)
            return json.loads(json.dumps(objet)) if objet is not None else None

    def lister(self) -> list[dict]:
        with self._verrou:
            return json.loads(json.dumps(list(self._index.values())))

    def existe(self, oid: str) -> bool:
        with self._verrou:
            return oid in self._index

    def __iter__(self) -> Iterator[dict]:
        return iter(self.lister())

    def __len__(self) -> int:
        with self._verrou:
            return len(self._index)

    # -- écriture ----------------------------------------------------------- #
    def ecrire(self, objet: dict) -> dict:
        """Persiste l'objet puis met l'index à jour — le disque d'abord, toujours.

        Si l'écriture échoue, l'index continue de refléter ce que porte le volume."""
        oid = str(objet["id"])
        ecrire_json(self.chemin(oid), objet)
        with self._verrou:
            self._index[oid] = json.loads(json.dumps(objet))
        return objet

    def modifier(self, oid: str, **champs: Any) -> dict | None:
        """Fusion de surface d'un objet existant (``None`` si l'objet est inconnu)."""
        with self._verrou:
            courant = self._index.get(oid)
            if courant is None:
                return None
            fusion = {**courant, **champs}
        return self.ecrire(fusion)

    def supprimer(self, oid: str) -> bool:
        """Efface l'objet ET ses fichiers compagnons. Sans retour possible."""
        import shutil

        oid = _sur(oid)
        with self._verrou:
            present = self._index.pop(oid, None) is not None
        if self.fichier:
            shutil.rmtree(self.racine / oid, ignore_errors=True)
        else:
            self.chemin(oid).unlink(missing_ok=True)
        return present


class Magasin:
    """Les collections du tableau de bord, sur le volume ``twin_engine_data``.

    ``registre`` garde les entrées des plans courus dont le plan a été supprimé : le
    registre se calcule depuis les plans, et sans elles une suppression effacerait la
    couverture du moteur avec le dossier de la personne."""

    def __init__(self, data_dir: str | Path):
        racine = Path(data_dir)
        self.athletes = Collection(racine / "athletes", fichier="athlete.json")
        self.courses = Collection(racine / "courses", fichier="course.json")
        self.plans = Collection(racine / "plans", fichier="plan.json")
        self.demandes = Collection(racine / "requests")
        self.jobs = Collection(racine / "jobs", fichier="job.json")
        self.registre = Collection(racine / "registre")

    def recharger(self) -> None:
        for collection in (self.athletes, self.courses, self.plans, self.demandes, self.jobs,
                           self.registre):
            collection.recharger()


__all__ = ["Collection", "Magasin", "ecrire_json", "lire_json"]
