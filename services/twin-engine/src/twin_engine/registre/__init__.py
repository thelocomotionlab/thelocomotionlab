"""Le registre de couverture : ce que le moteur a promis, et où le réel est tombé.

* :mod:`.blocs` — les blocs d'une entrée (course, modèle, prédiction, écarts, domaine),
  partagés par le banc et le tableau de bord ;
* :mod:`.runs` — ce qui marque un run : commit, empreinte de configuration, drapeaux hors
  défaut ;
* :mod:`.statuts` — le statut ``dev`` / ``frais`` d'un athlète, daté et journalisé ;
* :mod:`.livres` — le registre committé : livre banc (un fichier par run), livre servi,
  statuts, quarantaines, passages ;
* :mod:`.forme` — la forme du plan jugée contre les passages réels.

C'est le registre qui tranche les débats de calibration (``docs/twin-registre-couverture.md``).
"""

from .blocs import (bloc_course, bloc_domaine, bloc_modele, bloc_prediction, ecarts,
                    sous_le_domaine)
from .forme import bloc_forme
from .livres import DEFAULT_RACINE, LIVRE_BANC, LIVRE_SERVI, Depot, a_un_resultat, cle, lire_entrees
from .runs import drapeaux_hors_defaut, empreinte_config, entete_de_run, version_du_moteur
from .statuts import (STATUT_DEV, STATUT_FRAIS, basculer, fiche_vide, frais_a_la_date,
                      statut_a_la_date)

__all__ = [
    "DEFAULT_RACINE", "Depot", "LIVRE_BANC", "LIVRE_SERVI", "STATUT_DEV", "STATUT_FRAIS",
    "a_un_resultat", "basculer", "bloc_course", "bloc_domaine", "bloc_forme", "bloc_modele",
    "bloc_prediction", "cle", "drapeaux_hors_defaut", "ecarts", "empreinte_config",
    "entete_de_run", "fiche_vide", "frais_a_la_date", "lire_entrees", "sous_le_domaine",
    "statut_a_la_date", "version_du_moteur",
]
