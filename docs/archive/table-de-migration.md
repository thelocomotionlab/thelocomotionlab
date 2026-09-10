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
| 17/05 → 18/08 | `tour-des-ecrins` | 17/05 : « une aventure commence à mijoter dans mon esprit… le tour des Écrins en autonomie sur 3 ou 4 jours » ; 09/08 : « le focus est mis sur la finalisation de ma préparation pour le tour des Écrins » |

`nice-2026` **recouvre** la campagne des Écrins : le bloc du 17/05 vise aussi Nice (« un plan
d'entraînement sur 5 mois, jusqu'à fin septembre »). Un billet garde un seul rattachement — les
Écrins — et la table de séances de `nice-2026` cite les **mêmes slugs de billets**. Sa dernière
colonne est justement un slug résolu en lien : le même billet apparaît dans les deux
préparations sans être dupliqué.

| Source (fichier + titre de section) | Destination | Sorte | Notes |
|---|---|---|---|
| journal 2026 — chapeau d'ouverture (« Voici un carnet de bord… ») | rien | — | Chapeau du fichier source, pas une entrée datée. Le modèle n'a pas de page « journal » : l'index Blog remplit ce rôle. |
| Janvier — « Reprise après quasiment 2 mois d'arrêt » *05/01/2026* | `/blog/reprise-apres-deux-mois` | billet (`billet`) | **Sans rattachement** : la campagne n'est pas encore choisie, le tirage UTMB est le 16/01. |
| Janvier — « Bilan de reprise » *31/01/2026* | `/blog/bilan-de-reprise` | billet (`bilan`) | Rattaché `vercors-2026` : le bloc annoncé va « jusqu'à début avril, date d'une aventure prévue de longue date ». La section annonce AUSSI l'inscription à Nice — c'est le point de naissance de `nice-2026`, à citer dans son chapeau. |
| Février — « Les choses sérieuses reprennent » *08/02/2026* | `/blog/premiere-sortie-longue-2026` | billet (`recit-de-sortie`) | Rattaché `vercors-2026`. Contient un GPX (`premiere-sortie-longue-2026_komoot.gpx`) et une légende. |
| Février — « *Use it or lose it*, vous êtes sûr ? » *26/02/2026* | `/science/use-it-or-lose-it` **(existe)** | article | **Section entière**, paragraphe d'ouverture compris : l'entraînement de février amène la question, c'est le même mouvement de pensée. Corps déjà migré en phase 1. Refs `gundersen2016`, `bonaldo2013`, `buxton2024`, `encarnacao2022`. `publie_le: 2026-02-26`. Chapeau → **TODO** (absent de la source). |
| Mars — « Objectif 3x10min en côtes atteint » *04/03/2026* | `/blog/fractionnes-longs-en-cotes` | billet (`billet`) | Rattaché `vercors-2026`. Contient la progression S1→S6 des séances et la formule `r = R/2 + 30 s`. |
| Mars — « Premier maratrail » *06/03/2026* | `/blog/premier-maratrail-2026` | billet (`recit-de-sortie`) | Rattaché `vercors-2026`. 44 km / 2 100 m D+ / sac 6,4 kg. GPX joint. |
| Mars — « Projet OFF Monts du Lyonnais » *14/03/2026* | `/blog/monts-du-lyonnais` | billet (`recit-de-sortie`) | Rattaché `vercors-2026`. 65 km / 3 500 m D+ / sac 8,9 kg. Ligne du tableau de séances de `vercors-2026`. **Porte un replay** → voir manque **M1**. |
| Avril — « Projet OFF Traversée de la Chartreuse » *04/04/2026* | `/blog/traversee-chartreuse` | billet (`recit-de-sortie`) | Rattaché `vercors-2026`. 81 km réels (90 prévus). Ligne du tableau de séances. **Porte un replay** → **M1**. |
| Avril — « Se préparer par l'hormèse » *30/04/2026* | `/blog/se-preparer-par-l-hormese` | billet (`billet`) | Rattaché `vercors-2026`. **Le billet garde tout son texte**, rien n'en est retiré. |
| Avril — « Se préparer par l'hormèse » — sa forme structurée | `vercors-2026` › `preparation.stresseurs` | section d'aventure | Le tableau est **dérivé** du texte, ce n'est pas un morceau prélevé : trois stresseurs travaillés — chaleur (hammam Jolt, 4–5 sessions/sem, 15–18 min), jeûne intermittent (fenêtre 14–16 h, quotidien), mouvement primal. Même partage que `paquetage` : le billet raconte le sac, l'aventure porte le tableau. Le billet **n'affiche pas** ce tableau. Aucun `non_travailles` déclaré → champ vide. |
| Mai — « Préparatifs du projet Fontaine-Rémuzat › La genèse du projet » *01/05/2026* | `vercors-2026` › section `libre` « Genèse du projet » | section d'aventure | Texte long, photo de Jean-Phi. C'est la raison d'être de la campagne : elle appartient à la page Aventure, pas au fil. |
| Mai — « … › Caractéristiques du projet » *01/05/2026* — le texte | `vercors-2026` › section `libre` « Le couchage » | section d'aventure | Système de couchage détaillé, photo du pliage. |
| Mai — « … › Caractéristiques du projet » — `<paquetage src="vercors-drome.csv">` | `vercors-2026` › `paquetage` `ref: "vercors-drome"` | section d'aventure | Le CSV existe déjà dans `public/paquetages/`. |
| Mai — « … › Caractéristiques du projet » — la liste matériel/nutrition **en commentaire HTML** | rien | — | Commentée dans la source (remplacée par le `<paquetage>`). Ne pas la ressusciter. |
| Mai — « Projet OFF Fontaine-Rémuzat » *02/05/2026* | `vercors-2026` › `direct` | section d'aventure | Deux lignes qui renvoient au récit, plus le replay. Le replay est celui de la campagne elle-même → il a sa place en `direct`. |
| Mai — « Nouveau bloc d'entraînement › Structure et variabilité des séances » *17/05/2026* | `/blog/nouveau-bloc` **(existe)** | billet (`billet`) | Rattaché `tour-des-ecrins`. Le billet existe déjà mais avec un corps partiel : à compléter depuis la source. |
| Mai — « … › Structure… » — `<plot name="km-2026">` | `vercors-2026` › `preparation.graphe` | section d'aventure | ⚠️ Voir manque **M5** : le graphe du modèle prend des valeurs en clair, la source est un JSON Plotly de 19 semaines couvrant TOUTE l'année, pas le seul bloc Nice. |
| Mai — « … › Nouvelle gestion de l'alimentation » *17/05/2026* | `/blog/nouveau-bloc` (même billet) | billet | Refs `abdullah2021`, `volek2016`, `kuhn2018`. Exposé physiologique long : candidat naturel à un **bloc `Note`** dans le billet plutôt qu'à du corps courant. À trancher. |
| Mai — « … › Protocole 1 » *17/05/2026* | `/blog/nouveau-bloc` › `<Protocole id="footing-a-jeun-prolonge">` | bloc Protocole | Objectif et Sensations explicites dans la source. `statut` **non déclaré** → `en-test` (aucun n'est présenté comme éprouvé au 17/05). |
| Mai — « … › Protocole 2 » | `<Protocole id="jeune-cetogene-apres-midi">` | bloc Protocole | idem |
| Mai — « … › Protocole 3 » | `<Protocole id="descentes-glycogene-bas">` | bloc Protocole | idem |
| Mai — « … › Protocole 4 » | `<Protocole id="train-low-eat-low">` **(existe)** | bloc Protocole | Déjà écrit en phase 1. Ref `marquet2016`. |
| Mai — « … › Protocole 5 » | `<Protocole id="sortie-longue-cetogene">` | bloc Protocole | idem |
| Mai — les cinq protocoles, cités depuis l'aventure | `tour-des-ecrins` › `preparation.protocoles` (+ `nice-2026`) | section d'aventure | Cartes de renvoi, jamais de copie. |
| Mai — « Bilan du mois de mai » *31/05/2026* | `/blog/bilan-de-mai` | billet (`bilan`) | Rattaché `tour-des-ecrins`. Sortie d'Aiguebelette + fracture de l'auriculaire. Deux photos légendées. |
| Juin — « Week-End choc dans les Aravis » *06/06/2026* | `/blog/wec-aravis` | billet (`recit-de-sortie`) | Rattaché `tour-des-ecrins`. 86 km / 6 700 m D+ sur 3 jours. Ligne du tableau de séances de `nice-2026`. Quatre photos. |
| Juin — « Bilan du mois de juin : chaleur et montagne » *28/06/2026* | `/blog/bilan-de-juin` | billet (`bilan`) | Rattaché `tour-des-ecrins`. Refs `fink1975`, `febbraio2001`. Contient un bloc `:::split` (deux images côte à côte). |
| Juillet — « Pic de volume et grosse décharge » *05/07/2026* | `/blog/pic-de-volume` | billet (`bilan`) | Rattaché `tour-des-ecrins`. 112 puis 121 km. |
| Juillet — « Système nerveux en alerte, peur et hyperthermie » *27/07/2026* — récit | `/blog/systeme-nerveux-en-alerte` | billet (`recit-de-sortie`) | Rattaché `tour-des-ecrins`. 4x2000 m de Chartreuse, brèche Arnaud. Ligne du tableau de séances. |
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
| S3 — « La découverte du "rest step" en montée » *13/10/2025* | `/blog/rest-step` + `<Protocole id="rest-step">` | billet + bloc Protocole | Rattaché `reunion-2025`. Cité par `reunion-2025` › `preparation.protocoles`. `statut` **non déclaré** dans la source → `eprouve` : le texte du 13/10 le dit « très prometteur », celui du 25/10 le valide (« plus du tout des quadriceps »), et il est utilisé tel quel à la Réunion. `objectif` formulé depuis le texte. |
| S3 — « Incarner le concept de la chasse d'eau » *18/10/2025* | `/science/chasse-d-eau` | article | **Section entière**, anecdote du demi-tour dans la voiture comprise : c'est l'illustration du concept. Ref `millet2012`. `publie_le: 2025-10-18`. Chapeau → **TODO**. |
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
| `la-genese.md` — « L'an 2020 : la genèse du labo » (`published: true`) | `/science/l-an-2020` | article | `type: recit` dans la source, mais un récit exige une aventure et celui-ci n'en a pas : il devient un article. `publie_le: 2025-09-21`, ref `dubois2020`. Troisième article Science, alors que la liste blanche dit « il n'y en a que deux » → `docs/invetaire-contenus.md` à corriger. |
| `developpe-ta-respiration-fonctionnelle.md` (`published: false`) | `/science/respiration-fonctionnelle` | article, `statut: brouillon` | Trois sections rédigées, cover, `teaserText` comme chapeau. |
| `initiation-exposition-au-froid.md` (`published: false`) | `/science/exposition-au-froid` | article, `statut: brouillon` | ⚠️ Le fichier fait 332 octets : **corps entièrement vide**, il n'y a que le frontmatter. La page existera, vide, avec un corps `TODO`. |

---

## 5. Ce qui manquait, et ce qui a été décidé

**Les billets portent leurs replays.** `packages/tracking` exporte déjà un composant `Replay`, et
`PostLiveTrackingLazy.jsx` l'emballe. On l'autorise dans le corps d'un billet, au même titre que
`Note` et `Protocole` : une entrée de plus dans la table de composants de `Corps.jsx`. Pas de
nouvelle route, pas de nouveau type de section ; les JSON de replay vivent déjà sous
`/replays/<slug>/`. Concerne les Monts du Lyonnais, la traversée de la Chartreuse, les 4x2000 m
et la première sortie longue.

**Les sections structurées accueillent du texte.** `caracteristiques`, `geo`, `paquetage` et
`nutrition` acceptent un `id` facultatif. Quand le MDX déclare un `<SectionLibre id="…">` du même
id, cette prose se rend au-dessus du tableau. Un seul mécanisme — celui des sections libres — et
aucun composant nouveau. C'est ce qui rend leur place au texte de la trace Réunion, du couchage
Vercors, des gels, et de la gestion de l'eau entre Bourg-Murat et la Fournaise.

**Le graphe s'écrit en clair.** Le journal pointe vers `/data/plots/kilometrage-hebdo-2026.json`,
19 semaines à partir du 1er janvier — donc jusqu'à mi-mai : c'est le bloc Vercors, pas celui des
Écrins. Les valeurs sont transcrites à la main dans `vercors-2026 › preparation.graphe`, comme le
modèle le demande (« tout est saisi à la main, aucune donnée n'est synchronisée depuis un service
externe »). Pas de champ `src` : il créerait une seconde source de vérité pour dix-neuf nombres.
Le graphe reste aussi dans le billet du 17/05, où il sert de rétrospective.

**Aucun texte n'est coupé.** Une section source part entière dans sa destination. Ce qui apparaît
à deux endroits n'est jamais un morceau prélevé, mais une **forme structurée** dérivée du texte —
le tableau de stresseurs à côté du billet sur l'hormèse, comme le `paquetage` à côté du billet qui
raconte le sac. Les blocs `Note` et `Protocole` restent entiers dans le billet où ils ont été
écrits ; ailleurs, une carte pointe dessus, jamais un extrait.

**Le champ `n` d'un protocole disparaît.** Il n'apporte rien et ne vient pas des sources. À retirer
du schéma des blocs, de la validation, du composant `Protocole`, de leurs tests, du MDX déjà écrit
et du §6 de `docs/systeme-de-contenu.md`.

**Reste ouvert — les instruments du Labo.** La liste blanche en demande quatre : Direct v1 (2025),
Direct v2 (2026), le modèle de reconstruction du signal GPS, et les paquetages. Le modèle ne
définit ni sorte ni section pour eux, et la page Labo n'a que la quête, à propos et contact. Deux
issues : une section « Instruments » sur la page Labo, alimentée par une liste en frontmatter ; ou
bien ces trois textes deviennent des billets et la liste blanche n'est pas honorée. **À trancher.**

---

## 6. Destinations qui se retrouveraient vides ou fausses

**`nice-2026` — une campagne à deux sections.**
Elle n'a ni `geo` (aucune trace dans les sources), ni `paquetage`, ni `nutrition`, ni `recit` : le
journal s'arrête au 18/08/2026 et la course est le 25/09. Ses deux sections réelles sont
`caracteristiques` (165 km, 9 000 m D+, départ le 25/09/2026 — sourcés) et `preparation`, dont la
table de séances cite les billets de la période, ceux des Écrins compris, puisque Nice recouvre
cette campagne. `etat: en-preparation`. C'est le cas de test du modèle : **une page à deux
sections doit avoir l'air finie, pas amputée.**

**`tour-des-ecrins` — deux jeux de chiffres, tous les deux vrais.**
La campagne a changé de caractéristiques en cours de route, et la fiche clé/valeur les porte tous
les deux sans qu'il faille toucher au modèle : le **prévu** vient du journal du 18/08 (188 km,
12 200 m D+, quatre jours, trois bivouacs) et le **réalisé** est confirmé par Valentin — distance
198,1 km, dénivelé 12 767 m, durée 79 h 34 min, sac au départ 10,1 kg, bivouacs Valgaudémar
(km 57,5), Vallouise (km 108,7) et Arsine (km 155,5), campagne 22 → 25/08/2026. Le champ
« Appui » est retiré : il n'apporte rien. Le récit reste `brouillon` (amorce d'1 ko).

**`vercors-2026` — campagne complète.** Elle a de la matière pour `caracteristiques`, `geo`
(`fontaine-remuzat.gpx` existe dans `public/tracks/`, mais **aucun tableau de repères n'est écrit
dans la source** : les colonnes seront `TODO`), `libre` (genèse), `libre` (couchage),
`preparation` (stresseurs, séances), `paquetage`, `direct` et `recit`. C'est la campagne la plus
complète des quatre.

**Bilans S1, S2, S4, S5 de la Réunion.** Absorbés par le graphe de préparation. Leur seule
narration tient en une ou deux phrases : en faire des billets donnerait quatre entrées vides dans
le registre du Blog. Décision : **rien**, les chiffres suffisent.

**Bibliographie.** Les 15 références de `content/bibliography.json` sont toutes citées par au
moins un texte migré. **Aucune référence à ajouter.**
