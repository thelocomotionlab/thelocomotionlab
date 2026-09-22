"""Le tableau de bord : les objets de travail posés devant le moteur.

Le moteur ne change pas. Cette couche écrit des ``RaceSpec`` depuis des Courses, lit
des dossiers, et range le tout en fichiers JSON sur le volume de données. Le contrat
est dans ``docs/twin-tableau-de-bord-api.md``.
"""

from __future__ import annotations

from .magasin import Collection, Magasin, ecrire_json, lire_json
from .objets import Athlete, Course, Demande, Plan, niveau_du_verdict
from .reference import reference_de_plan

__all__ = [
    "Athlete", "Collection", "Course", "Demande", "Magasin", "Plan",
    "ecrire_json", "lire_json", "niveau_du_verdict", "reference_de_plan",
]
