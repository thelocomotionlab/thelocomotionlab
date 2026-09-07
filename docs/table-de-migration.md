# Table de migration du contenu

Une ligne par section source. Destination proposée, sorte, et ce qui coince.
À relire avant d'écrire le moindre fichier de contenu.

Les slugs de destination sont des propositions. Ceux marqués « existe » sont déjà écrits.

---

## 1. `public/projets/saison-trail-2026.md` — le journal 2026

Le journal se scinde en trois campagnes par **intention déclarée dans le texte**. Le découpage
retenu, avec la phrase qui le fonde :

| Période | Campagne | Phrase qui le déclare |
|---|---|---|
| 05/01 | aucune | « Ma saison sera balisée plus franchement au moment du tirage au sort de l'UTMB » |
| 31/01 → 30/04 | `vercors-2026` | 08/02 : « avec un gros projet OFF prévu pour début mai en ligne de mire » ; 06/03 : « toujours en vue de préparer un OFF sur plusieurs jours en mai en autonomie complète » |
| 17/05 → 27/07 | `nice-2026` | 17/05 : « un plan d'entraînement sur 5 mois, jusqu'à fin septembre pour le Nice by UTMB » |
| 09/08 → 18/08 | `tour-des-ecrins` | 09/08 : « le focus est mis sur la finalisation de ma préparation pour le tour des Écrins » |

| Source (fichier + titre de section) | Destination | Sorte | Notes |
|---|---|---|---|
| journal 2026 — chapeau d'ouverture (« Voici un carnet de bord… ») | rien | — | Chapeau du fichier source, pas une entrée datée. Le modèle n'a pas de page « journal » : l'index Blog remplit ce rôle. |
| Janvier — « Reprise après quasiment 2 mois d'arrêt » *05/01/2026* | `/blog/reprise-apres-deux-mois` | billet (`billet`) | **Sans rattachement** : la campagne n'est pas encore choisie, le tirage UTMB est le 16/01. |
| Janvier — « Bilan de reprise » *31/01/2026* | `/blog/bilan-de-reprise` | billet (`bilan`) | Rattaché `vercors-2026` : le bloc annoncé va « jusqu'à début avril, date d'une aventure prévue de longue date ». La section annonce AUSSI l'inscription à Nice — c'est le point de naissance de `nice-2026`, à citer dans son chapeau. |
| Février — « Les choses sérieuses reprennent » *08/02/2026* | `/blog/premiere-sortie-longue-2026` | billet (`recit-de-sortie`) | Rattaché `vercors-2026`. Contient un GPX (`premiere-sortie-longue-2026_komoot.gpx`) et une légende. |
| Février — « *Use it or lose it*, vous êtes sûr ? » *26/02/2026* — 1er paragraphe | `/blog/bilan-de-fevrier` **ou** absorbé | billet (`bilan`) | ⚠️ **La section se coupe en deux** (§1 du modèle). Le 1er paragraphe est un bilan d'entraînement (« montée de volume tranquille, 70–80 km, 2 000–3 000 m D+ ») : narratif et daté → Blog. |
| Février — « *Use it or lose it*, vous êtes sûr ? » *26/02/2026* — paragraphes 2 à 4 | `/science/use-it-or-lose-it` **(existe)** | article | Corps déjà migré en phase 1. Refs `gundersen2016`, `bonaldo2013`, `buxton2024`, `encarnacao2022`. `publie_le: 2026-02-26`. Chapeau à écrire → **TODO** (absent de la source). |
| Mars — « Objectif 3x10min en côtes atteint » *04/03/2026* | `/blog/fractionnes-longs-en-cotes` | billet (`billet`) | Rattaché `vercors-2026`. Contient la progression S1→S6 des séances et la formule `r = R/2 + 30 s`. |
| Mars — « Premier maratrail » *06/03/2026* | `/blog/premier-maratrail-2026` | billet (`recit-de-sortie`) | Rattaché `vercors-2026`. 44 km / 2 100 m D+ / sac 6,4 kg. GPX joint. |
| Mars — « Projet OFF Monts du Lyonnais » *14/03/2026* | `/blog/monts-du-lyonnais` | billet (`recit-de-sortie`) | Rattaché `vercors-2026`. 65 km / 3 500 m D+ / sac 8,9 kg. Ligne du tableau de séances de `vercors-2026`. **Porte un replay** → voir manque **M1**. |
| Avril — « Projet OFF Traversée de la Chartreuse » *04/04/2026* | `/blog/traversee-chartreuse` | billet (`recit-de-sortie`) | Rattaché `vercors-2026`. 81 km réels (90 prévus). Ligne du tableau de séances. **Porte un replay** → **M1**. |
| Avril — « Se préparer par l'hormèse » *30/04/2026* — récit | `/blog/se-preparer-par-l-hormese` | billet (`billet`) | Rattaché `vercors-2026`. |
| Avril — « Se préparer par l'hormèse » *30/04/2026* — données | `vercors-2026` › `preparation.stresseurs` | section d'aventure | ⚠️ **Se coupe en deux.** Trois stresseurs travaillés avec dose et fréquence explicites : chaleur (hammam Jolt, 4–5 sessions/sem, 15–18 min), jeûne intermittent (fenêtre 14–16 h, quotidien), mouvement primal. `intensite` et `pourquoi` sont dans le texte. **Aucun `non_travailles` déclaré** → champ vide. |
| Mai — « Préparatifs du projet Fontaine-Rémuzat › La genèse du projet » *01/05/2026* | `vercors-2026` › section `libre` « Genèse du projet » | section d'aventure | Texte long, photo de Jean-Phi. C'est la raison d'être de la campagne : elle appartient à la page Aventure, pas au fil. |
| Mai — « … › Caractéristiques du projet » *01/05/2026* — le texte | `vercors-2026` › section `libre` « Le couchage » | section d'aventure | Système de couchage détaillé, photo du pliage. |
| Mai — « … › Caractéristiques du projet » — `<paquetage src="vercors-drome.csv">` | `vercors-2026` › `paquetage` `ref: "vercors-drome"` | section d'aventure | Le CSV existe déjà dans `public/paquetages/`. |
| Mai — « … › Caractéristiques du projet » — la liste matériel/nutrition **en commentaire HTML** | rien | — | Commentée dans la source (remplacée par le `<paquetage>`). Ne pas la ressusciter. |
| Mai — « Projet OFF Fontaine-Rémuzat » *02/05/2026* | `vercors-2026` › `direct` | section d'aventure | Deux lignes qui renvoient au récit, plus le replay. Le replay est celui de la campagne elle-même → il a sa place en `direct`. |
| Mai — « Nouveau bloc d'entraînement › Structure et variabilité des séances » *17/05/2026* | `/blog/nouveau-bloc` **(existe)** | billet (`billet`) | Rattaché `nice-2026`. Le billet existe déjà mais avec un corps partiel : à compléter depuis la source. |
| Mai — « … › Structure… » — `<plot name="km-2026">` | `nice-2026` › `preparation.graphe` | section d'aventure | ⚠️ Voir manque **M5** : le graphe du modèle prend des valeurs en clair, la source est un JSON Plotly de 19 semaines couvrant TOUTE l'année, pas le seul bloc Nice. |
| Mai — « … › Nouvelle gestion de l'alimentation » *17/05/2026* | `/blog/nouveau-bloc` (même billet) | billet | Refs `abdullah2021`, `volek2016`, `kuhn2018`. Exposé physiologique long : candidat naturel à un **bloc `Note`** dans le billet plutôt qu'à du corps courant. À trancher. |
| Mai — « … › Protocole 1 » *17/05/2026* | `/blog/nouveau-bloc` › `<Protocole id="footing-a-jeun-prolonge">` | bloc Protocole | Objectif et Sensations explicites dans la source. `statut` **non déclaré** → à trancher (proposition : `en-test`). `n` non déclaré → **TODO**. |
| Mai — « … › Protocole 2 » | `<Protocole id="jeune-cetogene-apres-midi">` | bloc Protocole | idem |
| Mai — « … › Protocole 3 » | `<Protocole id="descentes-glycogene-bas">` | bloc Protocole | idem |
| Mai — « … › Protocole 4 » | `<Protocole id="train-low-eat-low">` **(existe)** | bloc Protocole | Déjà écrit en phase 1. Ref `marquet2016`. Le `n="4"` actuel vient du numéro de la source (« Protocole 4 »), pas d'un effectif : **à corriger**, `n` est un effectif. |
| Mai — « … › Protocole 5 » | `<Protocole id="sortie-longue-cetogene">` | bloc Protocole | idem |
| Mai — les cinq protocoles, cités depuis l'aventure | `nice-2026` › `preparation.protocoles: [5 ids]` | section d'aventure | Cartes de renvoi, jamais de copie. |
| Mai — « Bilan du mois de mai » *31/05/2026* | `/blog/bilan-de-mai` | billet (`bilan`) | Rattaché `nice-2026`. Sortie d'Aiguebelette + fracture de l'auriculaire. Deux photos légendées. |
| Juin — « Week-End choc dans les Aravis » *06/06/2026* | `/blog/wec-aravis` | billet (`recit-de-sortie`) | Rattaché `nice-2026`. 86 km / 6 700 m D+ sur 3 jours. Ligne du tableau de séances de `nice-2026`. Quatre photos. |
| Juin — « Bilan du mois de juin : chaleur et montagne » *28/06/2026* | `/blog/bilan-de-juin` | billet (`bilan`) | Rattaché `nice-2026`. Refs `fink1975`, `febbraio2001`. Contient un bloc `:::split` (deux images côte à côte). |
| Juillet — « Pic de volume et grosse décharge » *05/07/2026* | `/blog/pic-de-volume` | billet (`bilan`) | Rattaché `nice-2026`. 112 puis 121 km. |
| Juillet — « Système nerveux en alerte, peur et hyperthermie » *27/07/2026* — récit | `/blog/systeme-nerveux-en-alerte` | billet (`recit-de-sortie`) | Rattaché `nice-2026`. 4x2000 m de Chartreuse, brèche Arnaud. Ligne du tableau de séances. |
| Juillet — « Système nerveux… » — le paragraphe sur le live 2.0 | instrument du Labo « Direct v2 (2026) » | ⚠️ **sans destination** | Voir manque **M2**. Renvoie déjà vers `/live/archives/chartreuse-4x2000`, qui existe. |
| Juillet — « Système nerveux… » — le replay 4x2000 | ⚠️ **sans destination** | — | Voir manque **M1** : un billet n'a pas de place pour un replay. |
| Août — « Reprise appaisée et ancrée » *09/08/2026* | `/blog/reprise-apaisee-et-ancree` | billet (`billet`) | Rattaché `tour-des-ecrins`. Retraite Ose Ta Vie, Belledonne (24 km / 2 700 m), Moucherotte. Trois photos. |
| Août — « Préparatifs du projet Écrins › Genèse et préparatifs » *18/08/2026* | `tour-des-ecrins` › section `libre` « Genèse et préparatifs » **(existe)** | section d'aventure | Déjà migré en phase 1. Porte le GPX et le découpage en 4 jours. |
| Août — « … › Le paquetage » *18/08/2026* | `tour-des-ecrins` › `paquetage` `ref: "tour-des-ecrins"` **(existe)** | section d'aventure | Le texte d'accompagnement (Gatewood Cape, inReach, Panta Boreas) et les deux photos n'ont pas de place dans la section `paquetage`, qui n'affiche qu'un tableau → **M4**. |
| Août — « … › Nutrition » *18/08/2026* | `tour-des-ecrins` › `nutrition` | section d'aventure | Deux recettes chiffrées (gruau 115 g / 615 kcal ; couscous 175 g / 920 kcal) + snacks + total 16 000 kcal. Colonnes libres, donc migrable tel quel. |
| Tout le fichier — blocs `<livetracking>` en commentaire HTML | rien | — | Code de composant mis en commentaire dans la source. |

---

## 2. `public/projets/traversee-reunion.md` — la campagne Réunion

Une seule campagne : `reunion-2025`, qui **existe déjà**. Les chiffres de sa page actuelle sont
tous sourcés (170 km, 9 800 m D+, 8,5 kg, arrêt au km 85 après 26 h 52 et 7 700 m D+).

| Source (fichier + titre de section) | Destination | Sorte | Notes |
|---|---|---|---|
| Réunion — chapeau d'ouverture | `reunion-2025` › `chapeau` (déjà écrit) | — | Le récit de l'abandon au Grand Raid du Finistère qu'il contient n'est nulle part ailleurs : candidat à un billet daté du 19/09/2025, hors périmètre du fichier. **À trancher.** |
| S1 — « Début du bloc d'entraînement spécifique » *29/09/2025* | `/blog/debut-du-bloc-reunion` | billet (`billet`) | Rattaché `reunion-2025`. Bloc de 6 semaines d'après Quentin Giacomazzo. Photo PPG. |
| S1 — « Création de la trace GPX » *30/09/2025* | `reunion-2025` › `geo` (déjà écrit) | section d'aventure | La méthode (komoot, tracedetrail, geoportail) et l'update du 07/11 sont du texte : ils n'ont pas de place dans la section `geo`, qui n'a que carte + tableau → **M4**. |
| S1 — « Bilan S1 » *05/10/2025* | `reunion-2025` › `preparation.graphe` (déjà écrit) | section d'aventure | 64 km / 2 000 m D+. Deux phrases de narration seulement → pas de billet propre. |
| S2 — « Première simulation en sortie longue » *12/10/2025* | `/blog/tour-du-taillefer` | billet (`recit-de-sortie`) | Rattaché `reunion-2025`. **Remplit la colonne « Billet » vide** de la 1re ligne de séances de `reunion-2025.mdx`. |
| S2 — « Bilan S2 » *12/10/2025* | `reunion-2025` › `preparation.graphe` (déjà écrit) | section d'aventure | 104 km / 4 800 m D+. |
| S3 — « La découverte du "rest step" en montée » *13/10/2025* | `/blog/rest-step` + `<Protocole id="rest-step">` | billet + bloc Protocole | Rattaché `reunion-2025`. Cité par `reunion-2025` › `preparation.protocoles`. `statut` **non déclaré** : le texte du 13/10 dit « très prometteur », celui du 25/10 le valide (« plus du tout des quadriceps »). Proposition `eprouve` — **à trancher**. `objectif` à formuler depuis le texte, `n` **TODO**. |
| S3 — « Incarner le concept de la chasse d'eau » *18/10/2025* | `/science/chasse-d-eau` | article | Le deuxième des deux articles Science de la liste blanche. Ref `millet2012`. `publie_le: 2025-10-18`. Chapeau → **TODO**. ⚠️ Le dernier paragraphe est une anecdote personnelle datée (demi-tour dans la voiture) : narratif → il part au Blog ou reste en exemple dans l'article. **À trancher.** |
| S3 — « Bilan S3 » *19/10/2025* | `/blog/bilan-s3-integration` | billet (`bilan`) | Rattaché `reunion-2025`. 48 km / 1 200 m D+ → aussi dans le graphe. Contient l'entrée en formation Tarzan Movement et deux photos (quadrupédie, grimpe d'arbre). |
| S4 — « Développement d'un live-tracking maison » *17/10/2025* | instrument du Labo « Direct v1 (2025) » | ⚠️ **sans destination** | Voir **M2**. À défaut : billet `/blog/live-tracking-maison` rattaché `reunion-2025`. |
| S4 — « La BIG sortie » *25/10/2025* | `/blog/utmc-off` | billet (`recit-de-sortie`) | Rattaché `reunion-2025`. 85 km / 4 500 m D+ / 7,4 kg / ~15 h. **Remplit la colonne « Billet »** de la 2e ligne de séances. Quatre photos. |
| S4 — « Bilan S4 » *26/10/2025* | `reunion-2025` › `preparation.graphe` (déjà écrit) | section d'aventure | 117 km / 5 100 m D+. |
| S5–6 — « Bilan S5 » *01/11/2025* | rien | — | Trois lignes qui disent qu'il n'y a rien à dire. Ne pas en faire un billet. |
| S5–6 — « Quelques images de la Réunion » *08/11/2025* | `/blog/premieres-images-de-la-reunion` | billet (`note-de-terrain`) | Rattaché `reunion-2025`. Acclimatation, quatre photos en `:::split`, clinique du squat d'Ido Portal. |
| S5–6 — « Les derniers préparatifs › Matériel, nutrition et hydratation » *09/11/2025* | `reunion-2025` › `paquetage` + `nutrition` (déjà écrits) | sections d'aventure | Les deux listes chiffrées. Le commentaire (« la surprise du chef sera sur les gels ») n'a pas de place → **M4**. |
| S5–6 — « … › Ajustement du live-tracking » *09/11/2025* | instrument du Labo « Modèle de reconstruction du signal GPS » | ⚠️ **sans destination** | Voir **M2**. Refs `fearnhead2003`, `haklay2010`, `sanchez2025` — les coefficients ×1,12 / ×1,3 / ×0,9 y sont. |
| S5–6 — « … › Déroulé du parcours » *09/11/2025* | `reunion-2025` › `geo` (tableau, déjà écrit) | section d'aventure | Le raisonnement sur l'eau et l'heure de départ est du texte long → **M4**. |
| S7 — « La traversée de la Réunion (replay) » *10/11/2025* | `reunion-2025` › `direct` (déjà écrit) | section d'aventure | Renvoi vers le récit + replay de la campagne. |

---

## 3. `public/projets/coach-tarzan-movement.md`

| Source | Destination | Sorte | Notes |
|---|---|---|---|
| Le fichier entier (`published: false`, corps vide) | `/blog/coach-tarzan-movement` **ou rien** | billet, `statut: brouillon` | ⚠️ **Le corps est vide** : un titre de niveau 1 et rien d'autre. Un brouillon sans matière n'est pas un contenu. Ma proposition : **rien**, et on l'écrira quand il y aura un texte. La formation est déjà racontée dans le Bilan S3 du 19/10/2025 et dans la reprise du 05/01/2026. |

---

## 4. `public/articles/`

| Source | Destination | Sorte | Notes |
|---|---|---|---|
| `recit-reunion-2025.md` — « L'île intense vous dites ? » (`published: true`) | `/aventures/reunion-2025/recit` **(existe)** | récit | 5 sections. `date: 2025-12-09`. Chiffres de la barre déjà sourcés. |
| `immersion-primale-entre-vercors-et-drome.md` (`published: true`) | `/aventures/vercors-2026/recit` | récit | 6 sections (Préambule → Conclusion). `date: 2026-05-28`. Chiffres sourcés dans le corps : 160 km / 8 000 m D+ annoncés, **arrêt à Valdrôme après 131 km et 8 000 m D+**, aucune douleur avant le km 110. Masse au départ ≈ 10 kg (journal du 01/05). |
| `mon-tour-des-ecrins-en-80-heures.md` (`published: false`) | `/aventures/tour-des-ecrins/recit` | récit, `statut: brouillon` | ⚠️ **Amorce d'1 ko** : un chapeau, un titre de section et un titre vide. La phrase « Mon protocole de nutrition robuste » est coupée en plein milieu. Le corps est **TODO**. |
| `la-genese.md` — « L'an 2020 : la genèse du labo » (`published: true`) | ⚠️ **sans destination** | — | Voir manque **M3**. `type: recit` dans la source, mais le modèle exige qu'un récit ait une aventure — et celui-ci n'en a pas. **Absent de la liste blanche.** |
| `developpe-ta-respiration-fonctionnelle.md` (`published: false`) | `/science/respiration-fonctionnelle` | article, `statut: brouillon` | ⚠️ **Contradiction** : voir **M6**. Trois sections rédigées, cover, `teaserText`. |
| `initiation-exposition-au-froid.md` (`published: false`) | `/science/exposition-au-froid` | article, `statut: brouillon` | ⚠️ **Contradiction** : voir **M6**. Et le fichier ne fait que 332 octets : **corps entièrement vide**, il n'y a que le frontmatter. |

---

## 5. Ce qui n'a pas de destination

**M1 — Un billet ne peut pas porter son replay.**
Quatre replays sont attachés à des sorties OFF, qui sont des billets et non des aventures :
Monts du Lyonnais, traversée de la Chartreuse, 4x2000 m de Chartreuse, et le replay de la
première sortie longue. Le type de section `direct` n'existe que sur une aventure, et un billet
n'a pas de sections. Trois issues possibles :
1. le billet renvoie vers `/live/archives/<slug>` — la route existe et sert déjà
   `chartreuse-4x2000` et `tour-des-ecrins` ; c'est le moins coûteux ;
2. on autorise un composant `<Replay>` dans le corps d'un billet, au même titre que `Note` et
   `Protocole` ;
3. le replay remonte dans la section `direct` de la campagne à laquelle le billet est rattaché.

**M2 — Les instruments du Labo n'ont pas de gabarit.**
La liste blanche demande quatre instruments : Direct v1 (2025), Direct v2 (2026), le modèle de
reconstruction du signal GPS, et les paquetages. Le modèle ne définit ni une sorte ni un type de
section pour eux, et la page Labo n'a que trois sections (la quête, à propos, contact). Les
paquetages ont bien une section d'aventure, mais pas de vitrine au Labo. **Il manque quelque
chose** : soit une section « Instruments » sur la page Labo alimentée par une liste en
frontmatter, soit une cinquième sorte. À défaut, ces trois textes deviennent des billets et la
liste blanche n'est pas honorée.

**M3 — « L'an 2020 : la genèse du labo » n'entre dans aucune sorte.**
Publié, narratif, daté (21/09/2025), mais rattaché à aucune campagne : ce n'est donc pas un
`recit` au sens du modèle. Ce n'est pas non plus un carnet de bord — c'est le texte fondateur du
labo. Trois issues : un billet daté du 21/09/2025 ; une section de la page Labo à côté de la
quête ; ou « rien », et il disparaît. Il **n'est pas dans la liste blanche** : la trancher revient
peut-être à l'y ajouter.

**M4 — Les sections structurées n'ont pas de place pour leur texte.**
`geo`, `paquetage` et `nutrition` n'affichent qu'un tableau. Or chaque fois, la source entoure ses
chiffres d'un texte qui les explique : comment la trace a été construite, pourquoi ce couchage,
pourquoi ces gels, comment gérer l'eau entre Bourg-Murat et la Fournaise. Ce texte est factuel et
appartient à la page Aventure, pas au Blog. Deux issues : une section `libre` avant chaque section
structurée (ça marche, mais ça double le nombre de sections), ou un champ `texte` facultatif sur
`geo`, `paquetage` et `nutrition`. **Sans l'un des deux, on perd du contenu réel.**

**M5 — Le graphe de préparation ne sait pas lire un JSON.**
`preparation.graphe` prend `abscisse` et `series.valeurs` en clair. Le journal 2026 pointe vers
`/data/plots/kilometrage-hebdo-2026.json`, 19 semaines × 2 séries, et surtout : ce graphe couvre
**toute l'année 2026**, pas le seul bloc Nice. Le recopier tel quel dans
`nice-2026 › preparation.graphe` afficherait des semaines qui appartiennent à `vercors-2026`.
Trois issues : découper les valeurs par campagne (S1–S18 Vercors, S19+ Nice) et transcrire en
clair ; garder le graphe annuel dans le billet et laisser l'aventure sans graphe ; ou autoriser
`graphe: { src: "…" }`.

**M6 — La liste blanche et la consigne de phase 4 se contredisent.**
`docs/invetaire-contenus.md` range « Développe ta respiration fonctionnelle » et « Pourquoi et
comment s'initier à l'exposition au froid ? » dans **« N'existe pas (fixtures uniquement, jamais
de page) »**. La consigne de phase 4 demande d'en faire des contenus `statut: brouillon`. J'ai
retenu la consigne (plus récente) dans la table ci-dessus, mais **il faut trancher** — et
l'exposition au froid n'a de toute façon aucun corps à migrer.

---

## 6. Destinations qui se retrouveraient vides ou fausses

**`nice-2026` — campagne sans matière propre.**
Elle n'a ni `geo` (aucune trace dans les sources), ni `paquetage`, ni `nutrition`, ni `recit` : le
journal s'arrête au 18/08/2026 et la course est le 25/09. Ses sections réelles sont
`caracteristiques` (165 km, 9 000 m D+, 25/09/2026 — sourcés) et `preparation` (graphe, séances,
protocoles). C'est un cas de test du modèle : **une page à deux sections doit avoir l'air finie.**
`etat: en-preparation`.

**`tour-des-ecrins` — les chiffres actuels sont faux.**
⚠️ **À corriger.** La page écrite en phase 1 affiche « 198,1 km », « 12 767 m D+ », « 79 h 34 min »,
« sac 10,1 kg », « bivouacs Valgaudémar (km 57,5), Vallouise (km 108,7), Arsine (km 155,5) » et
une campagne « 22 → 25/08/2026 ». **Aucune de ces valeurs n'est dans les sources** : elles
viennent de la maquette. Les sources donnent 188 km / 12 200 m D+ (journal du 18/08), 190 km /
12 200 m (amorce du récit), et le découpage en quatre jours. Tout le reste doit devenir `TODO`.

**`vercors-2026` — campagne complète.** Elle a de la matière pour `caracteristiques`, `geo`
(`fontaine-remuzat.gpx` existe dans `public/tracks/`, mais **aucun tableau de repères n'est écrit
dans la source** : les colonnes seront `TODO`), `libre` (genèse), `libre` (couchage),
`preparation` (stresseurs, séances), `paquetage`, `direct` et `recit`. C'est la campagne la plus
complète des quatre.

**Bilans S1, S2, S4, S5 de la Réunion.** Absorbés par le graphe de préparation. Leur seule
narration tient en une ou deux phrases : en faire des billets donnerait quatre entrées vides dans
le registre du Blog. Proposition : **rien**, les chiffres suffisent.

**Bibliographie.** Les 15 références de `content/bibliography.json` sont toutes citées par au
moins un texte migré. **Aucune référence à ajouter.**
