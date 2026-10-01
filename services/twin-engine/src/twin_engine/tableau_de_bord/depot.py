"""Le client du service de dépôt, vu du moteur.

Les archives d'entraînement n'entrent **jamais** par l'API du moteur : elles arrivent sur
``depot.thelocomotionlab.com`` (sous-domaine hors proxy Cloudflare, parce qu'une archive
pèse couramment plusieurs centaines de Mo), et le moteur va les chercher tout seul sur le
réseau Docker avec ``TWIN_DEPOT_ADMIN_TOKEN``.

Une archive ne passe **pas par la mémoire** : elle est copiée par blocs vers un fichier du
volume. Le dépôt la streame déjà à l'écriture ; la relire d'un bloc ici annulerait tout le
bénéfice, sur le service dont on vient justement de borner la mémoire à 3 Go.

Pas de httpx ni de requests : ``urllib`` suffit, et le moteur n'a pas besoin d'une
dépendance de plus dans son image. Les proxies de l'environnement sont explicitement
ignorés — l'appel ne sort pas de la machine, un ``HTTP_PROXY`` traînant n'aurait aucune
raison de s'y glisser.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

BASE_PAR_DEFAUT = "http://twin-depot:3000"
DELAI_S = 30.0
# Lecture d'une archive : elle peut faire plusieurs centaines de Mo sur le réseau Docker.
DELAI_ARCHIVE_S = 600.0


class DepotIndisponible(RuntimeError):
    """Le dépôt n'a pas répondu, ou a répondu autre chose que ce qu'on attendait."""


def _ouvreur():
    """Un ouvreur sans proxy : l'appel reste dans le réseau Docker."""
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


class Depot:
    def __init__(self, base: str | None = None, jeton: str | None = None):
        self.base = (base or os.environ.get("TWIN_DEPOT_URL") or BASE_PAR_DEFAUT).rstrip("/")
        self.jeton = jeton if jeton is not None else os.environ.get("TWIN_DEPOT_ADMIN_TOKEN", "")

    @property
    def servi(self) -> bool:
        """Sans jeton, le moteur ne peut rien aller chercher : on le dit plutôt que de
        laisser une ingestion échouer avec un 401 illisible."""
        return bool(self.jeton)

    def _requete(self, chemin: str) -> urllib.request.Request:
        requete = urllib.request.Request(f"{self.base}{chemin}")
        requete.add_header("Authorization", f"Bearer {self.jeton}")
        return requete

    def lister(self) -> list[dict]:
        """Les dépôts en attente sur le service (route admin ``GET /twin/depots``)."""
        if not self.servi:
            raise DepotIndisponible("TWIN_DEPOT_ADMIN_TOKEN manquant")
        try:
            with _ouvreur().open(self._requete("/twin/depots"), timeout=DELAI_S) as reponse:
                charge = json.loads(reponse.read().decode("utf-8"))
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as exc:
            raise DepotIndisponible(f"dépôt injoignable : {exc}") from exc
        depots = charge.get("depots")
        if not isinstance(depots, list):
            raise DepotIndisponible("réponse inattendue du dépôt (pas de liste « depots »)")
        return depots

    def trouver(self, depot_id: str) -> dict | None:
        return next((d for d in self.lister() if d.get("id") == depot_id), None)

    def telecharger(self, depot_id: str, destination: Path, sha256: str | None = None) -> Path:
        """Copie l'archive vers ``destination``, par blocs, sans la charger en mémoire. Avec
        ``sha256`` (celui que le dépôt a calculé sur le clair à la réception), une copie qui
        ne le rend pas est effacée et refusée : l'archive est chiffrée au repos, une clé
        fausse ou un fichier altéré se voient ici."""
        if not self.servi:
            raise DepotIndisponible("TWIN_DEPOT_ADMIN_TOKEN manquant")
        destination.parent.mkdir(parents=True, exist_ok=True)
        requete = self._requete(f"/twin/depots/{depot_id}/archive")
        empreinte = hashlib.sha256()
        try:
            with _ouvreur().open(requete, timeout=DELAI_ARCHIVE_S) as reponse, \
                 destination.open("wb") as sortie:
                while bloc := reponse.read(1024 * 1024):
                    empreinte.update(bloc)
                    sortie.write(bloc)
        except (urllib.error.URLError, OSError) as exc:
            destination.unlink(missing_ok=True)
            raise DepotIndisponible(f"archive introuvable ou illisible : {exc}") from exc
        if sha256 and empreinte.hexdigest() != sha256:
            destination.unlink(missing_ok=True)
            raise DepotIndisponible("archive altérée : son SHA-256 n'est pas celui du dépôt")
        return destination

    def supprimer(self, depot_id: str) -> bool:
        """Purge l'archive et le dépôt sur le service (route admin ``DELETE``). Rend False
        si le dépôt n'existait plus (déjà purgé) ; lève si le service ne répond pas."""
        if not self.servi:
            raise DepotIndisponible("TWIN_DEPOT_ADMIN_TOKEN manquant")
        requete = self._requete(f"/twin/depots/{depot_id}")
        requete.method = "DELETE"
        try:
            with _ouvreur().open(requete, timeout=DELAI_S):
                return True
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return False
            raise DepotIndisponible(f"purge refusée par le dépôt : {exc}") from exc
        except (urllib.error.URLError, OSError) as exc:
            raise DepotIndisponible(f"dépôt injoignable : {exc}") from exc


__all__ = ["BASE_PAR_DEFAUT", "Depot", "DepotIndisponible"]
