# Le système de contenu du site

> **À qui ça s'adresse :** toi quand tu écris, et toute session qui touche au contenu du site.
> Mode d'emploi, pas règlement. La source de vérité du code est `apps/site/lib/contentRoutes.mjs` ;
> ce document explique ce qu'elle fait et comment s'en servir.

---

## 0. En une page

Cinq sortes de contenu. Chacune répond à **une seule question de lecteur**, vit dans **son dossier**, et se
range **sans décision** parce que le dossier fait foi.

| Sorte | Dossier | Pilier | La question | Elle est finie quand… |
|---|---|---|---|---|
| **Concept** | `content/concepts/` | Comprendre | *Pourquoi ça marche ?* | le mécanisme est écrit, une source au moins, « Ce que ça fragilise » rempli |
| **Protocole** | `content/protocoles/` | Explorer | *Comment je fais, et qu'est-ce que ça donne ?* | quelqu'un d'autre pourrait le reproduire : dose, durée, observations datées, statut |
| **Expédition** | `content/expeditions/` | Explorer | *Où, quand, combien, avec quoi — et qu'est-ce que ça m'a fait ?* | le bloc technique est rempli ; le récit peut manquer ou arriver après |
| **Fiche** | `content/fiches/` | Explorer | *Qu'est-ce que j'emporte, quelle liste, quelle valeur ?* | la liste est complète, datée, sans commentaire, rattachée à un parent |
| **Carnet** | `content/carnets/` | Explorer | *Qu'est-ce qui se passe en ce moment ?* | jamais — c'est le seul contenu ouvert, et c'est voulu |

**La règle de routage, deux questions au moment d'écrire :**

1. **Est-ce daté ?** Le texte n'a de sens qu'à une date (un bilan de semaine, une sortie, un état d'esprit)
   → **carnet**. C'est une aventure complète, avec un début, une fin et des chiffres → **expédition**.
2. Sinon : **est-ce une liste, une méthode ou une explication ?** → **fiche**, **protocole**, **concept**.

**En cas de doute : carnet.** Le carnet est l'inbox du système ; on n'attend jamais de savoir où ranger pour
écrire. Quand une entrée de carnet grossit, c'est qu'une autre sorte veut naître : on coupe, on colle dans le
gabarit, on remplace par deux lignes et un lien.

---

## 1. Où vivent les fichiers

```
apps/site/content/
├─ bibliography.json      # les références, par clé ({{cite:millet2012}})
├─ concepts/              # Comprendre
├─ protocoles/            # Explorer
├─ expeditions/           # Explorer
├─ fiches/                # Explorer
└─ carnets/               # Explorer
```

Les `.md` ne vivent **pas** dans `public/` : ce qui y est déposé est servi brut, brouillons compris. Les images
restent sous `public/images/`, les paquetages sous `public/paquetages/*.csv`, les replays sous
`public/replays/<slug>/`, les graphes sous `public/data/plots/`.

**La sorte vient du dossier, jamais d'un champ.** Un fichier mal rangé se voit à l'œil nu, et il n'existe aucun
état où le dossier et le frontmatter se contredisent.

**Les URL** : `/comprendre/<slug>` pour un concept, `/explorer/<slug>` pour les quatre autres sortes. Un slug est
unique dans tout `content/`, brouillons compris — c'est ce qui permet aux relations de désigner un atome par son
seul nom.

---

## 2. Le frontmatter

```yaml
# communs à toutes les sortes
title: "Le froid comme stresseur"
description: "Pourquoi une exposition dosée au froid renforce, et ce qu'elle fragilise."
date: 2026-09-20
published: true              # false = brouillon, jamais rendu
cover: "/images/…"           # facultatif : sans lui, la carte est typographique
tags: [thermique]            # libres, pour la recherche
author: "Valentin Fer"

# selon la sorte
maturite: graine             # CONCEPT : graine | pousse | etabli
statut: eprouve              # PROTOCOLE : en-test | eprouve | abandonne
branche: thermique           # CONCEPT, facultatif : sa branche sur la carte
parent: tour-des-ecrins      # FICHE : obligatoire, l'atome depuis lequel on la consulte
archive: tour-des-ecrins     # EXPÉDITION, facultatif : le dossier de public/replays/

# les relations
concepts: [hormese]                 # protocole, expédition → les concepts éprouvés
fiches:   [paquetage-ecrins-2026]   # expédition, protocole → les listes emportées
lie:      [robuste-mais-fragile]    # concept ↔ concept
origine:  staps-l2-neurosciences    # facultatif : d'où vient la matière
```

`maturite` est obligatoire sur un concept publié, `statut` sur un protocole publié. Un brouillon peut s'en
passer : c'est la marche d'avant.

### Les relations, et ce qu'elles engendrent

Quatre champs, trois blocs générés. On n'écrit **jamais** un lien de contenu à la main entre deux atomes.

| Champ | Porté par | Ce qu'il affiche | Le bloc inverse |
|---|---|---|---|
| `concepts:` | protocole, expédition | « Ce que j'ai compris » | « Sur le terrain » sur le concept |
| `fiches:` | expédition, protocole | « Ce que j'ai emporté » | — |
| `parent:` | fiche | le fil d'Ariane vers l'atome parent | « Dans cette expédition » |
| `lie:` | concept | « Motifs voisins » | réciproque, dans les deux sens |

---

## 3. Les gabarits

Le gabarit n'est pas une contrainte de style, c'est l'anti-page-blanche : on remplit des cases. Les fichiers
d'exemple sont dans `content/_gabarits/`.

**Concept** — 600 à 1 500 mots ; plus court est permis pour une graine.

- *En bref* — trois lignes, la réponse d'abord.
- *Ce que j'ai observé* — le terrain, deux phrases, daté.
- *Le mécanisme* — sourcé, avec `{{cite:cle}}`.
- *La fenêtre de dose* — ce que le mécanisme ne dit pas, où il bascule.
- *Ce que ça fragilise* — la contrepartie. C'est la section qui distingue un concept de robustesse d'un article
  de vulgarisation : *robustesse de [la fonction] face à [la perturbation] au prix de [la fragilité]*.
- *Sur le terrain* et *Motifs voisins* — **générés**, jamais écrits.

**Protocole** — *En bref* · *L'hypothèse* (le concept éprouvé, via `concepts:`) · *Le protocole* (dose, fréquence,
durée, ce qu'on regarde) · *Les observations*, datées · *Ce que ça fragilise*. Le statut est dans le frontmatter.
Un protocole abandonné est un résultat, et se publie comme tel.

**Expédition** — le *bloc technique* est généré (frontmatter + `aventure.json` de l'archive s'il existe) ; puis
*Ce que j'ai emporté* (généré depuis `fiches:`), *le direct archivé* s'il existe, *le récit* (le texte long, tel
que tu l'écris — il peut manquer, la page est complète sans lui), *Ce que j'ai compris* (généré), *Bilan*
(facultatif).

**Fiche** — le frontmatter, puis un `<paquetage>` ou une liste sans commentaire. Une fiche qui commente déborde
vers le protocole.

**Carnet** — un par année, entrées `### Titre` suivi de `*JJ/MM/AAAA*`. C'est ce format que le site lit pour
afficher les dernières notes. Fermé au 31 décembre. Chaque entrée peut pointer vers l'atome qu'elle a fait naître.

---

## 4. La maturité, et pourquoi elle débloque

Trois marches publiables, à la place du « article ultra complet » qui ne sort jamais :

- **Graine** — *En bref* + *Ce que j'ai observé* + un mécanisme même court + une source **ou** une position
  assumée. Se publie.
- **Pousse** — mécanisme sourcé (deux références au moins), *Ce que ça fragilise* rempli, et au moins un
  protocole ou une expédition qui le cite (le bloc « Sur le terrain » n'est pas vide).
- **Établi** — trois références au moins dont une contradictoire ou nuancée, éprouvé sur deux terrains, et la
  fenêtre de dose est écrite.

La maturité s'affiche sur chaque carte et en tête de chaque page. C'est ce qui autorise à publier une graine sans
trahir la promesse de Comprendre : la promesse est écrite sur l'atome.

Pour un protocole, le vocabulaire est celui de l'expérience : **en test**, **éprouvé**, **abandonné**. Un N = 1
reste un N = 1 ; le statut le dit.

---

## 5. Les index

**Comprendre** est une liste de concepts, triée par maturité puis par date, avec la page-pilier en tête. Dès que
**deux concepts publiés** partagent la même `branche:`, la liste se regroupe sous ce titre. En dessous de deux,
la branche n'apparaît nulle part : ni encadré, ni mot en gris. Les branches connues sont dans `BRANCHES`
(`contentRoutes.mjs`) ; en ajouter une est un changement d'une ligne, le jour où deux concepts la demandent.

**Explorer** a quatre sections, dans cet ordre : **Expéditions**, **Protocoles**, **Carnet**, **Fiches**
(repliée). Une section vide ne s'affiche pas, et son bouton de filtre non plus.

**Aucune catégorie vide, jamais.** C'est la règle qui tient les deux index.

---

## 6. Ce que le build vérifie

Ces règles font **échouer la compilation** en nommant le fichier fautif (`assertContentRules`, appelée par
`lib/legacyRedirects.mjs`, donc par tout build) :

1. Deux fichiers ne peuvent pas produire le même slug dans tout `content/`, brouillons compris.
2. Une fiche déclare un `parent:`, qui résout vers une expédition ou un protocole.
3. Chaque entrée de `concepts:` et de `lie:` résout vers un concept ; chaque entrée de `fiches:` vers une fiche.
4. `maturite` et `statut` appartiennent au vocabulaire de leur sorte, et sont présents sur un atome publié.
5. `branche` appartient à la table des branches.
6. Un alias de slug ne masque jamais un atome vivant, et mène à un atome qui existe.
7. Toute ancre `#…` d'un contenu publié résout vers un titre du même fichier, et tout lien interne vers
   `/comprendre/…` ou `/explorer/…` résout vers un atome ou un alias.

C'est la contrepartie de la seule fragilité du modèle : la décision de rangement au moment d'écrire. Le build
rattrape ce que la main a mal posé.

---

## 7. Renommer, déplacer, ne jamais casser une URL

Toute adresse publiée un jour continue de répondre. Deux couches, dans `lib/legacyRedirects.mjs` :

- les anciens rayons `/articles/<slug>` et `/projets/<slug>` répondent pour **tout** atome ;
- la table `SLUG_ALIASES` (dans `contentRoutes.mjs`) produit trois 308 par renommage : depuis le pilier, depuis
  `/articles`, depuis `/projets`.

**Quand tu renommes ou scindes un atome, ajoute son ancien slug à `SLUG_ALIASES`.** C'est le seul geste manuel du
système, et le build refuse un alias qui ne mène nulle part.

---

## 8. Les images : une règle par sorte, pas une image par entrée

Le visuel est une propriété de la **sorte**, pas de l'entrée. Décidé une fois, le nombre de couvertures cesse de
croître avec le nombre de pages.

| Sorte | Visuel de carte | Décision à l'écriture |
|---|---|---|
| **Expédition** | une photo | choisir une photo — la seule sorte où c'est demandé |
| **Carnet** | une photo par année | une fois par an |
| **Protocole** | carte typographique, teinte Explorer, badge de statut | aucune |
| **Concept** | carte typographique, teinte Comprendre sur la grille du labo, titre en Lora italique, badge de maturité | aucune ; `cover:` reste possible |
| **Fiche** | carte-donnée : masse totale, nombre d'éléments, parent | aucune, c'est calculé depuis le CSV |

La variété vient des données, pas des images : une silhouette altimétrique pour une expédition sans photo, un
mini-graphe pour un protocole qui a des mesures, des chiffres pour une fiche. Ce sont des images fabriquées par
le labo à partir de ses propres mesures. Aucune image de stock, aucune image générée.

---

## 9. Le miroir Obsidian

Les mêmes cinq dossiers dans le coffre, le même frontmatter, et les wiki-liens portent les slugs
(`[[flexibilite-metabolique]]`). Une note passe du coffre au site **par copie, sans reclassement** : la sorte est
déjà le dossier, les relations sont déjà les liens.

Ce que le coffre a en plus, et qui ne sort jamais : `cours/` (notes de cours et de lecture, par UE et par
chapitre) et les notes fugaces.

La chaîne complète : note de lecture (coffre) → entrée de carnet (site, datée) → graine → pousse → établi.
Chaque marche est un fichier qu'on déplace, pas un texte qu'on réécrit.

**Le filtre du flux STAPS** : une note de cours entre dans Comprendre quand elle répond à une question du labo,
c'est-à-dire quand elle est reliée soit à une observation déjà écrite (le bloc « Sur le terrain » n'est pas
vide), soit à un concept du noyau (`lie:`). Sinon elle reste dans le coffre. On écrit la graine **de mémoire**
après le cours, on corrige contre le manuel, et on cite le manuel plutôt que le cours.

---

## 10. Les composants disponibles dans un markdown

- `{{cite:cle}}` ou `<Citation id="cle">` — une référence de `bibliography.json`, avec sa bulle et son entrée en
  bas de page.
- `<paquetage src="/paquetages/<slug>.csv">` — un export LighterPack rendu en tableau, avec les masses.
- `<plot name="…" src="/data/plots/…">` et `{{fig:name}}` — un graphe et sa référence numérotée.
- `<postlivetracking positions="/replays/<slug>/live-positions.json">` — un replay de trace figée.
- `<livetracking referenceGpx="…">` — la variante en direct.
- `:::split` — deux colonnes.
- `![alt](src)` — une image ; toute image s'ouvre en taille réelle au clic.

---

## 11. Écrire un nouvel atome, en pratique

1. Poser les deux questions du §0 ; en cas de doute, écrire dans le carnet de l'année.
2. Créer le fichier dans le dossier de sa sorte, copier le gabarit de `content/_gabarits/`.
3. Remplir le frontmatter — `title`, `description`, `date`, la maturité ou le statut, les relations.
4. `pnpm -F site dev` et lire la page. `pnpm -F site build` dit ce qui manque, fichier par fichier.
5. Si l'atome sort d'une entrée de carnet : couper le passage, le coller dans le gabarit, et laisser dans le
   carnet deux lignes et un lien.
