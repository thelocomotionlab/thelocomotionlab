"""La carte de technicité d'une trace, par tranche de ``carte.pas_m`` mètres, depuis des
données ouvertes (OpenStreetMap, MNT, occupation du sol, géologie), et ce qu'elle dit de la
technicité une fois apprise sur les descentes de l'athlète (:mod:`.modele`).

Les variables de la carte sont des entrées, jamais des scores : leur coût s'estime sur les
fenêtres de descente que le détecteur étiquette.
"""

from .carte import (NUMERIQUES, Carte, cle_de_cache, dresser, ecrire_le_cache, hors_des_extraits,
                    lire_le_cache, par_partie, sans_voie_osm)
from .tranches import Tranches, geometrie, tranches_de, tranches_du_parcours

__all__ = ["Carte", "NUMERIQUES", "Tranches", "cle_de_cache", "dresser", "ecrire_le_cache",
           "geometrie", "hors_des_extraits", "lire_le_cache", "par_partie", "sans_voie_osm",
           "tranches_de", "tranches_du_parcours"]
