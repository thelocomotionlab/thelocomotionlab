# Canevas du rapport

Le squelette du rapport, de la feuille et des fiches, bloc par bloc, avec **ce qui alimente
chaque bloc**. C'est la référence : on discute d'un bloc en le nommant, on le déplace dans
`services/twin-engine/src/twin_engine/report/latex/report.tex.j2` entre ses marqueurs
`% LL:BEGIN` / `% LL:END`, et l'ordre des blocs dans le fichier est l'ordre des pages.

Règle qui prime : **aucun chiffre n'est écrit dans un gabarit**. Chaque bloc lit une clé du
contexte calculé (`report/context.py`), et un test refuse le rapport si un chiffre apparaît
ailleurs (`tests/test_report_v3.py::test_no_number_is_hard_coded_…`). Un bloc dont la mesure
n'existe pas ne s'imprime pas : il n'a pas de valeur de repli.

Trois documents : `rapport.pdf` (A4 portrait, une garde et quatre pages), `feuille.pdf`
(A4 paysage, recto-verso, à découper) et `fiches.pdf` (A4 portrait, une fiche par poste
d'assistance, à découper). Rendu de référence : `local-data/out/`.

**Le décor est le même partout** : bandeau bleu-vert à fleur du bord avec son filet ocre, la
marque à gauche, le nom de la course à droite ; en pied, un filet ocre, la légende de la page
s'il y en a une, et le folio à droite. Un seul pied est défini dans la classe
(`\LLpied`), les deux styles de page s'en servent, et aucun gabarit n'en pose un autre.

---

## Page de garde — `page-garde`

Barre verticale bleu-vert + liseré ocre sur toute la hauteur, la marque en haut, le titre
dans le bas. Elle classe le dossier ; elle n'annonce aucun chiffre de prédiction.

| bloc | contenu | source |
|---|---|---|
| marque | signe + mot-symbole | `\LLbrand` |
| titre | surtitre, nom de course, filet ocre, « Pour … » | `race_name`, `athlete` |
| méta | distance, D+, D− **et le D+ du carnet de route quand il diffère**, départ | `length_km`, `dplus_m`, `dminus_m`, `dplus_officiel`, `dplus_ecart_pct`, `start_time` |
| pied | date d'édition, référence du rapport | `report_date`, `annex_ref` |

## Page 1 — `page-course`

| bloc | contenu | source |
|---|---|---|
| méta | athlète, distance, D+, D−, départ | `athlete`, `length_km`, `dplus_m`, `dminus_m`, `start_time` |
| l'arrivée | l'heure prédite en très grand, le jour à côté, puis la fourchette de course | `pred_central`, `arrival_clock`, `plan_low/high`, `plan_band_word` |
| trois tuiles | rapide · centrale · prudent, dans un seul encadré divisé par des filets | `plan_low`, `pred_central`, `plan_high`, `arrival_*_clock` |
| **La course** | ce que le parcours demande, en une phrase | `recit.course` |
| **Ton historique** | ses records qui servent de repère, et ce que cette course demande en plus | `recit.historique` |
| **Comment c'est prédit** | les mesures servies, leur application, et la validation croisée | `recit.methode` |
| **Les fourchettes** | les deux bandes, dites en courses ET en pour cent | `recit.fourchettes[]` |

## Page 2 — `page-temps`

| bloc | contenu | source |
|---|---|---|
| **Le profil** | altimétrie, ravitaillements, **trame diagonale sur les heures de nuit** — aucune annotation de catégorie | `figures/profil.png` |
| **Le temps prévu** | barre empilée montée / roulant / descente / arrêts, sa légende chiffrée en deux colonnes, la lecture (part du temps contre part de la distance, rapport montée/descente) et son seuil | `faits.ventilation.parts[]`, `.lecture`, `.legende` |
| **Les cinq segments qui pèsent le plus** | ce qu'ils pèsent ensemble, puis une ligne par segment : nom, barre de durée, bornes en km, durée, part | `faits.lourds.phrase`, `.lignes[]` |
| **Le lever du jour** | l'heure et l'endroit | `faits.lever.phrase` |

## Page 3 — `page-plan`

| bloc | contenu | source |
|---|---|---|
| l'allure visée | dérive assumée et sa preuve, **l'allure du départ en chiffres de montre**, politique d'arrêts | `fade_pct`, `fade_evidence`, `faits.depart`, `stops_policy.sentence` |
| tableau | une ligne par segment ; **trois colonnes horaires teintées**, titrées par leur heure d'arrivée ; **filet terracotta en marge** quand l'assistance est autorisée ; **point d'encre** à côté du nom quand le segment se court de nuit | `feuille_rows[]`, `clock_titles` |
| cumul | temps cumulé et sa bande | `figures/cumul.png`, `caption_cumul` |
| **Le risque des arrêts** | ce que le plan retranche contre le taux d'arrêt mesuré sur ses ultras ; rien sans arrêts mesurés | `faits.arrets` |
| **Deux scénarios** | la journée à −10 % de forme et celle à +10 %, deux points fixes rejoués | `faits.scenarios.moins`, `.plus` |

## Page 4 — `page-preuve`

| bloc | contenu | source |
|---|---|---|
| **Ton profil** | trois lignes : la mesure, sa valeur, ce qu'elle est et ce qu'elle vaut chez lui. Une mesure absente le dit | `profil_lignes[]` |
| **L'intensité** | le rang de cette course dans sa série, le rappel de ce que la VC veut dire, et la barre qui place la course sur l'étendue de ses ultras | `faits.intensites.phrase`, `.rappel`, `.barre` |
| **La validation croisée** | la figure (seule du rapport), sa lecture, l'erreur mesurée, et l'encadré des quatre limites | `figures/validation.png`, `caption_validation`, `honesty`, `limits_short[]` |
| **Les hypothèses** | ce que le plan suppose, le QR et l'adresse en clair | `assumptions[]`, `annex_url` |

La courbe record et le plan intégral vivent à l'annexe en ligne.

---

## Feuille détachable — `feuille-recto` / `feuille-verso`

A4 paysage, un tableau par face, dans un liseré pointillé qui dit où couper.

**Recto — tableau de marche.** Une ligne par segment. Colonnes : marge, `#`, ravitaillement,
km cumulé, km du segment, D+, D−, les trois heures, arrêt, *eau / ravito* (seulement si la
nutrition est déclarée), et la colonne des consignes.

Trois repères, pas un de plus :

- **colonnes horaires teintées** — sauge = rapide, terracotta = centrale, ambre = prudent ;
- **filet terracotta en marge** — l'assistance est autorisée à ce ravitaillement ;
- **point d'encre à côté du nom** — le segment se court de nuit.

Le gras des forts dénivelés reste, sans légende.

**La colonne des consignes ne porte que des moments singuliers** — au plus cinq ou six sur la
feuille : ce que l'athlète a écrit, ce que son assistance prépare, l'entrée dans la nuit, le
retour du jour, le segment le plus long avec sa durée, la plus grosse montée, la plus grosse
descente. Partout ailleurs, une ligne pointillée : **de la place pour écrire**.

Les trois moments arrivent de `faits.trois_moments` — **les mêmes objets que la page 2**, donc
les mêmes chiffres. Les recalculer ici (le D+ du segment au lieu de la montée continue, le temps
de mouvement au lieu de l'horloge) donnerait deux « plus grosse montée » qui ne se ressemblent
pas ; un test l'interdit.

**Verso — tableau d'assistance.** Un poste par ligne : nom (avec son point d'encre s'il tombe
de nuit), km, au plus tôt, **prévu** (la colonne teintée), au plus tard, à prévoir.

## Fiches d'assistance — `fiches`

A4 portrait, deux colonnes de quatre, traits de coupe pointillés. Une fiche par poste, arrivée
comprise : le nom, le kilomètre, les trois heures (l'heure prévue en grand, son jour dessous),
deux lignes à remplir, et un pied qui rappelle pour qui elle est et si le poste tombe de nuit.
Même source que le verso (`fiches[]`, dérivé de `crew_rows` et `finish_row`) : la fiche ne
recalcule rien.

Document à part et non troisième page de la feuille : celle-ci est en paysage, et une
orientation ne se change pas en cours de document sans casser la géométrie des deux premières
pages.
