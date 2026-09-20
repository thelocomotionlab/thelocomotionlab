# Canevas du rapport v4

Le squelette du rapport et de la feuille, bloc par bloc, avec **ce qui alimente chaque bloc**.
C'est la référence : on discute d'un bloc en le nommant, on le déplace dans
`services/twin-engine/src/twin_engine/report/latex/report.tex.j2` entre ses marqueurs
`% LL:BEGIN` / `% LL:END`, et l'ordre des blocs dans le fichier est l'ordre des pages.

Règle qui prime : **aucun chiffre n'est écrit dans un gabarit**. Chaque bloc lit une clé du
contexte calculé (`report/context.py`), et un test refuse le rapport si un chiffre apparaît
ailleurs (`tests/test_report_v3.py::test_no_number_is_hard_coded_…`). Un bloc dont la mesure
n'existe pas ne s'imprime pas : il n'a pas de valeur de repli.

Rendu de référence : `local-data/out/rapport.pdf` et `local-data/out/feuille.pdf`.

---

## Page 1 — `page-vivre`

Barre verticale bleu-vert + liseré ocre sur toute la hauteur, marque en haut. La page de
garde et la prédiction sont fondues : on ne gaspille pas une page pour un titre.

| bloc | contenu | source |
|---|---|---|
| en-tête | surtitre, titre de course, filet ocre | `report_date`, `race_name` |
| méta | athlète, distance, D+, D− **et le D+ du carnet de route quand il diffère**, départ | `athlete`, `length_km`, `dplus_m`, `dminus_m`, `dplus_officiel`, `dplus_ecart_pct`, `start_time` |
| la phrase | l'arrivée prédite et sa fourchette, en grand | `pred_central`, `arrival_clock`, `plan_low/high`, `plan_band_word` |
| quatre tuiles | rapide · centrale · prudent · la fenêtre de l'assistance | `plan_low`, `pred_central`, `plan_high`, `arrival_safety_*`, `safety_word` |
| **Ton passé** | une ligne par comparaison disponible : durée, D+, plus longue descente, nuits | `faits.passe[].phrase` |
| **L'intensité** | % de VC de cette course, celui de ses ultras, et le rang | `faits.intensites.phrase` |

## Page 2 — `page-temps`

| bloc | contenu | source |
|---|---|---|
| profil | altimétrie, ravitaillements, **trame sombre sur les heures de nuit** — aucune annotation de catégorie | `figures/profil.png` |
| **Le temps prévu** | barre empilée montée / roulant / descente / arrêts, sa légende chiffrée, la lecture (part du temps contre part de la distance, rapport montée/descente) et son seuil | `faits.ventilation.parts[]`, `.lecture`, `.legende` |
| **Les trois moments qui décident** | plus grosse montée, plus grosse descente, plus long segment : où, quand, durée. Le « où » ne nomme un ravitaillement que si le morceau y finit vraiment ; sinon il se situe après le dernier franchi | `faits.moments[]` |
| **Le lever du jour** | l'heure et l'endroit | `faits.lever.phrase` |

## Page 3 — `page-plan`

| bloc | contenu | source |
|---|---|---|
| l'allure visée | dérive assumée et sa preuve, **l'allure du départ en chiffres de montre**, politique d'arrêts | `fade_pct`, `fade_evidence`, `faits.depart`, `stops_policy.sentence` |
| tableau | une ligne par segment, trois colonnes d'heures titrées par leur arrivée | `feuille_rows[]`, `clock_titles` |
| cumul | temps cumulé et sa bande | `figures/cumul.png`, `caption_cumul` |
| **Le risque des arrêts** | ce que le plan retranche contre le taux d'arrêt mesuré sur ses ultras ; rien sans arrêts mesurés | `faits.arrets` |
| **Deux scénarios** | la journée à −10 % de forme et celle à +10 %, deux points fixes rejoués | `faits.scenarios.moins`, `.plus` |

## Page 4 — `page-preuve`

| bloc | contenu | source |
|---|---|---|
| ouverture | le cadrage, **et rien d'autre** : sans validation croisée, la prudence ; avec, la clé est vide et le bloc ne s'imprime pas — les jauges disent déjà le profil | `opening` |
| jauges | **une jauge par mesure disponible** — pas de jauge alimentée par un défaut ; sa phrase est celle de la table de profil, dite une seule fois dans le document | `gauges[]` |
| validation croisée | la figure (seule du rapport), sa légende et l'erreur mesurée à côté | `figures/validation.png`, `caption_validation`, `honesty` |
| **Les limites** | les quatre limites, les hypothèses, le QR et l'adresse en clair | `limits_short[]`, `assumptions[]`, `annex_url` |

La courbe record et le plan intégral vivent à l'annexe en ligne.

---

## Feuille détachable — `feuille-recto` / `feuille-verso`

A4 paysage, deux tableaux et rien d'autre. En pied : le folio seul.

**Recto — tableau de marche.** Une ligne par segment. Colonnes : `#`, ravitaillement, km
cumulé, km du segment, D+, D−, allure, les trois heures, arrêt, *eau / ravito* (seulement si
la nutrition est déclarée), et la colonne des consignes.

Trois encodages, pas un de plus :

- **colonne encadrée en pointillé ocre** — l'heure prévue ;
- **ligne ocre** — l'assistance est autorisée à ce ravitaillement ;
- **ligne grise** — le segment se court de nuit (l'ocre passe devant quand les deux
  coïncident : c'est elle qui demande une action).

Le gras des forts dénivelés reste, sans légende.

**La colonne des consignes ne porte que des moments singuliers** — au plus cinq ou six sur la
feuille : ce que l'athlète a écrit, ce que son assistance prépare, l'entrée dans la nuit, le
retour du jour, le segment le plus long avec sa durée, la plus grosse montée, la plus grosse
descente. Partout ailleurs la case est **vide et c'est voulu** : de la place pour écrire.

Les trois moments arrivent de `faits.trois_moments` — **les mêmes objets que la page 2**, donc
les mêmes chiffres. Les recalculer ici (le D+ du segment au lieu de la montée continue, le temps
de mouvement au lieu de l'horloge) donnerait deux « plus grosse montée » qui ne se ressemblent
pas ; un test l'interdit.

**Verso — tableau d'assistance.** Un poste par ligne : nom, km, au plus tôt, prévu, au plus
tard, à prévoir. **Les lignes grises sont les postes de nuit.**
