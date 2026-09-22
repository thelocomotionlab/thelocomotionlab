"""La file de travail, en fichiers JSON sur le volume de données.

Un job par répertoire — ``jobs/{id}/job.json`` à côté de ``upload/`` et du PDF qu'il
produit : l'état d'un passage et ce qu'il a écrit vivent au même endroit, et purger
l'un purge l'autre. Pas de base de données (récapitulatif §3.5) : le fichier est la
vérité, l'index en mémoire se reconstruit au démarrage.

Le champ ``avancement`` est du texte libre poussé par le moteur pendant qu'il travaille.
L'interface le montre tel quel et n'annonce **aucune durée** : on ne sait pas combien de
temps prend une archive tant qu'on ne l'a pas lue.
"""

from __future__ import annotations

from pathlib import Path

from ..tableau_de_bord.magasin import Collection
from ..tableau_de_bord.objets import (
    JOB_ECHEC,
    JOB_EN_COURS,
    JOB_EN_FILE,
    JOB_FINI,
    JOB_GENERATION,
    maintenant,
)

# Ce qu'un client voit (§5.7). ``pdf`` porte un chemin serveur et reste dedans.
PUBLICS = ("id", "type", "statut", "avancement", "resultat", "erreur",
           "athlete_id", "plan_ref", "cree_le", "maj_le")

# `/twin/jobs/*` est l'un des trois préfixes que Caddy route vers le moteur : ce qui
# sort d'ici sort sur l'internet. Le résultat du pipeline porte des chemins ABSOLUS du
# conteneur (le PDF, les figures, chaque livrable) ; ils ne disent rien à un client et
# dessinent l'intérieur du service. Les fichiers se servent par leur route, jamais par
# leur chemin.
_CHEMINS = ("pdf", "figures", "livrables")

MODIFIABLES = {"statut", "avancement", "resultat", "erreur", "pdf"}

_EN_ATTENTE = (JOB_EN_FILE, JOB_EN_COURS)


class JobStore:
    def __init__(self, data_dir: str | Path):
        self.racine = Path(data_dir) / "jobs"
        self._jobs = Collection(self.racine, fichier="job.json")

    def repertoire(self, job_id: str) -> Path:
        """Le répertoire de travail du job (upload, figures, PDF)."""
        return self.racine / job_id

    def creer(self, job_id: str, *, type: str = JOB_GENERATION,
              athlete_id: str = "", plan_ref: str = "", avancement: str = "") -> dict:
        now = maintenant()
        return self._jobs.ecrire({
            "id": job_id,
            "type": type,
            "statut": JOB_EN_FILE,
            "avancement": avancement,
            "resultat": None,
            "erreur": "",
            "athlete_id": athlete_id,
            "plan_ref": plan_ref,
            "pdf": "",
            "cree_le": now,
            "maj_le": now,
        })

    def modifier(self, job_id: str, **champs) -> dict | None:
        inconnus = set(champs) - MODIFIABLES
        if inconnus:
            raise ValueError(f"champs non modifiables: {inconnus}")
        return self._jobs.modifier(job_id, **champs, maj_le=maintenant())

    def avancer(self, job_id: str, texte: str) -> None:
        """Ce que le moteur fait EN CE MOMENT, au présent et en trois mots."""
        self._jobs.modifier(job_id, avancement=texte, maj_le=maintenant())

    def lire(self, job_id: str) -> dict | None:
        return self._jobs.lire(job_id)

    @staticmethod
    def rendre_public(job: dict) -> dict:
        """Le job tel que le tableau de bord le reçoit : sans chemin de fichier."""
        vu = {k: job.get(k) for k in PUBLICS}
        if isinstance(vu.get("resultat"), dict):
            vu["resultat"] = {k: v for k, v in vu["resultat"].items() if k not in _CHEMINS}
        return vu

    def public(self, job_id: str) -> dict | None:
        job = self._jobs.lire(job_id)
        return None if job is None else self.rendre_public(job)

    def balayer_interrompus(self, erreur: str) -> list[str]:
        """Clôt en échec les jobs restés en file ou en cours (orphelins d'un crash).

        À appeler au démarrage : sans reprise ni battement de cœur, un job tué par un
        SIGKILL ou l'OOM resterait « en cours » à jamais — et son upload (données
        personnelles) sur le disque, que l'appelant purge à partir des ids rendus."""
        ids = [j["id"] for j in self._jobs.lister() if j.get("statut") in _EN_ATTENTE]
        for job_id in ids:
            self._jobs.modifier(job_id, statut=JOB_ECHEC, erreur=erreur,
                                avancement="", maj_le=maintenant())
        return ids


__all__ = ["JobStore", "PUBLICS", "JOB_ECHEC", "JOB_EN_COURS", "JOB_EN_FILE", "JOB_FINI"]
