# Plan — Refonte du système de contenu (cinq sortes)

*Plan de chantier, écrit le 4 septembre 2026 à partir de l'étude « Réorganiser le Locomotion Lab : un système de
contenu robuste » et d'une lecture du dépôt tel qu'il est sur cette branche. Ce document est un mode d'emploi de
chantier : il part dans `docs/archive/` quand le chantier est fini.*

> **Où on en est.** Les chantiers 0 à 4 sont faits : le nettoyage, la plomberie `content/`, les index, la découpe
> des deux carnets en 28 atomes, les blocs de relation générés et la vérification des liens au build. Du chantier 5,
> la partie outillage est faite (cartes typographiques par sorte, badge d'état sur chaque page, bibliographie
> élargie au noyau) ; **la partie éditoriale t'attend** : la page-pilier `robustesse-physiologique` est écrite mais
> reste en brouillon — c'est la thèse du labo, elle doit passer par ta plume avant d'être publiée. Restent aussi à
> écrire les concepts du noyau (dégénérescence, allostasie, variété requise, robuste-mais-fragile), la découpe du
> brouillon respiration en quatre atomes, le mécanisme du concept froid, et la réécriture de *La genèse* en constat.
> Ce document s'archive quand tu auras ajusté ce qui précède.

---

## 0. En bref

L'étude est adoptée telle quelle sur le fond : cinq sortes (concept, protocole, expédition, fiche, carnet), la sorte
déduite du dossier, quatre champs de relation, un statut de maturité, aucune catégorie vide, les protocoles dans
Explorer, chaque URL publiée qui survit en 308.

Ce plan fait trois choses que l'étude ne pouvait pas faire :

1. **Il constate ce qui est déjà fait.** La « constitution » `CLAUDE.md` (40 lignes), le verrou `.claude/settings.json`
   et l'archivage de trois audits sont sur cette branche. Il reste, de la section 4.15 de l'étude : écrire
   `docs/systeme-de-contenu.md` (que `CLAUDE.md` cite déjà, mais qui n'existe pas), purger les commentaires de code
   qui citent des audits ou des sessions, archiver la revue de juillet.
2. **Il tranche le sort de la branche « Atomiser le labo »** (`claude/locomotionlab-articles-reorganization-wvhplz`,
   trois commits des 1er et 2 septembre) : on ne la fusionne pas, on en reprend les idées. Les raisons sont au §1.3.
3. **Il ordonne le travail en six chantiers**, chacun laissant le site complet, déployable et vert
   (`pnpm -F site build`, `lint`, `test`), avec sa liste de fichiers, sa recette et sa taille.

| # | Chantier | Visible ? | Taille | Dépend de |
|---|---|---|---|---|
| 0 | Fermer le nettoyage : `systeme-de-contenu.md`, commentaires, archive | non | petit | rien |
| 1 | La plomberie : `content/`, cinq sortes, relations, règles de build, 308, tests | non | gros | 0 (pour le doc) |
| 2 | Les index : liste de Comprendre, quatre sections d'Explorer, badges, « par où commencer » | oui | moyen | 1 |
| 3 | La découpe : d'abord la Réunion (fermée), puis le carnet 2026 (vivant) | oui | gros, en plusieurs PR | 1, 2 |
| 4 | Les blocs générés et le bloc technique des expéditions ; fin de `getRelated` | oui | moyen | 3a (la Réunion suffit) |
| 5 | Le contenu nouveau : page-pilier, concepts du noyau, respiration, froid ; cartes typographiques | oui | continu | 4 |

Avant le chantier 1, il te faut trancher les huit points du §2. Tout le reste est du travail.

---

## 1. Point de départ vérifié dans le dépôt

### 1.1 Ce qui est déjà fait (section 4.15 de l'étude)

- `CLAUDE.md` est la constitution en une page : invariants, mode de travail, clause de liberté, interdiction d'ajouter
  des règles sans demande explicite. Sur `origin/main` c'est encore l'ancien fichier de 139 lignes : cette branche porte
  la nouvelle version.
- `.claude/settings.json` refuse `Edit` sur `CLAUDE.md` et `.claude/`, et demande confirmation pour `docs/`. Toute
  écriture dans `docs/` pendant ce chantier (dont ce plan) passe donc par ton oui.
- `docs/archive/` a reçu `audit-ux-ui-site.md`, `plan-staging.md`, `twin-review-2026-07.md`.

### 1.2 Ce qui reste du nettoyage

- `docs/systeme-de-contenu.md` n'existe pas, alors que `CLAUDE.md` y renvoie pour « cinq sortes, routage, gabarits,
  règles de build ». C'est la section 4 de l'étude, à écrire après les décisions du §2.
- Vingt-cinq commentaires de code, dans `apps/site`, citent un audit, une PR ou un brief : « (audit des titres, 08/2026) »
  dans dix pages, « PR1 §13 », « brief §5 », « plan PR4 §2 » dans `lib/freshness.js`, `lib/liveTime.js`,
  `lib/simplify.js`, `app/live/page.jsx`, etc. Les mentions de Valentin dans le texte affiché (À propos, mentions
  légales, Pratiquer) ne sont pas concernées.
- `docs/revue-integrale-2026-07/` est un dossier de chantier terminé, encore au premier niveau de `docs/`.
- `docs/archive/README.md` ne décrit pas les trois fichiers archivés le 4 septembre.

### 1.3 La branche « Atomiser le labo » : reprendre les idées, pas les commits

La branche porte `docs/refonte-atomes-brief.md`, un `lib/contentRoutes.mjs` de 322 lignes, 24 tests, `ComprendreCarte`,
un `ExplorerSections` à quatre sections, et les `git mv` de neuf fichiers. C'est un travail sérieux. Trois raisons de
ne pas le fusionner :

- **Le modèle a changé sur quatre points.** Sept sortes contre cinq ; « expérience » devient « protocole » avec son
  propre vocabulaire (`statut`) ; « réflexion » disparaît au profit de la maturité « graine » ; « récit » disparaît, il
  est le corps d'une expédition. Le champ `chantier:` (branche fermée, obligatoire sur tout atome de Comprendre) est
  remplacé par des branches qui naissent à deux atomes publiés. La règle de build n° 4 et la moitié des tests sont donc
  à réécrire, et `ComprendreCarte` affiche exactement ce que l'étude interdit (des branches vides en gris).
- **Elle est partie de `main` du 1er septembre ; cette branche a 25 commits de plus**, dont quatre touchent les mêmes
  fichiers : `saison-trail-2026.md` (+174 lignes, renommé sur la branche), le récit Écrins (réécrit ici, renommé
  là-bas), les trois squelettes Chianti / GRF / Lavaredo (supprimés ici, déplacés là-bas), et `ProjetBody` /
  `ArticleBody` (le composant Paquetage, inconnu de la branche). Une fusion produirait des conflits
  renommage / suppression sur du contenu, le pire endroit pour en avoir.
- **Son brief ouvre par douze règles de travail**, exactement ce que la nouvelle constitution refuse d'accumuler.

Ce qu'on reprend, en le réécrivant pour cinq sortes : la structure de `assertContentRules` (erreurs accumulées, entrées
et alias injectables pour les tests), la table `SLUG_ALIASES` qui produit trois 308 par renommage, le catalogue de cas
de test, `extractCarnetNotes`, l'inventaire des liens internes et des ancres intra-page (§6.2 et §6.3 du brief, dont
les lignes Chianti / Lavaredo sont périmées). La branche reste sur `origin` comme trace, non fusionnée.

### 1.4 L'inventaire des contenus, chiffré

| Fichier | Sorte aujourd'hui | Publié | Mots | Images | Directives |
|---|---|---|---|---|---|
| `public/projets/saison-trail-2026.md` | projet (aire déguisée) | oui | 9 236 | 28 | 20 (`<Citation>`, `<postlivetracking>`, `<paquetage>` ×2, `<plot>`) |
| `public/projets/traversee-reunion.md` | projet (vrai projet, fini) | oui | 4 634 | 16 | 4 |
| `public/projets/coach-tarzan-movement.md` | projet | non | 39 | 0 | 0 |
| `public/articles/immersion-primale-entre-vercors-et-drome.md` | récit | oui | 3 472 | 9 | 0 |
| `public/articles/recit-reunion-2025.md` | récit | oui | 2 981 | 14 | 0 |
| `public/articles/la-genese.md` | récit | oui | 533 | 0 | 1 (`{{cite:dubois2020}}`) |
| `public/articles/mon-tour-des-ecrins-en-80-heures.md` | récit | non | 138 | 0 | 0 |
| `public/articles/developpe-ta-respiration-fonctionnelle.md` | article (teaser) | non | 1 248 | 0 | 0 |
| `public/articles/initiation-exposition-au-froid.md` | article | non | 31 | 0 | 0 |

- Bibliographie : 16 clés dans `content/bibliography.json`, dont `template` ; 15 citations réelles, toutes dans les deux
  projets sauf Dubois 2020. Les deux syntaxes (`<Citation id>` et `{{cite:}}`) sont déjà lues par `getUsedCitations`.
- Liens internes : écrits en URL absolues `https://thelocomotionlab.com/...`, onze en tout, dont **trois ancres
  profondes** (`traversee-reunion#incarner-le-concept-de-la-chasse-deau` deux fois depuis le carnet 2026,
  `saison-trail-2026#préparatifs-du-projet-fontaine-rémuzat` depuis le récit Vercors). Le brouillon Écrins pointe vers
  `/explorer/la-genese`, que le 308 couvrira.
- Ancres intra-page : 12 `#sommaire` (l'`id` du bloc de TOC de `ProjetBody`, qui survit tant que l'atome est rendu par
  `ProjetBody`), **trois ancres qui casseront à la découpe** (`#la-découverte-du-rest-step-en-montée`,
  `#la-big-sortie`, `#création-de-la-trace-gpx`, toutes dans `traversee-reunion.md`), et une ancre déjà morte dans un
  bloc commenté du carnet 2026, à laisser.
- Données déjà structurées : `public/paquetages/{tour-des-ecrins,vercors-drome}.csv` rendus par `<paquetage>`
  (`lib/paquetage.js`, testé) ; `public/replays/<slug>/aventure.json` lus par `lib/archives.mjs` (distance, D+, dates,
  intention) pour deux aventures (Chartreuse 4×2000, Tour des Écrins), les six autres replays n'en ayant pas ;
  `public/data/plots` pour `<plot>`.

### 1.5 La plomberie qui dépend des deux dossiers

Seize fichiers lisent `public/articles`, `public/projets` ou `contentRoutes.mjs`. Ils sont tous dans le chantier 1 :

- `lib/contentRoutes.mjs` (source unique), `lib/legacyRedirects.mjs` (consommé par `next.config.mjs`),
  `lib/extractProjectNotes.js` (chemin `public/projets/<slug>.md` codé en dur), `lib/getRecentActivity.js` (dont le
  label `"Carnet"` désigne aujourd'hui un article ou un récit : collision de vocabulaire avec la sorte carnet),
  `lib/getRelated.js` (relie par récence, et mélange récits et articles : constat de la revue de juillet),
  `lib/carouselItems.js`, `lib/buildSearchIndex.js` ;
- `app/page.js`, `app/comprendre/page.jsx`, `app/comprendre/[slug]/page.jsx`, `app/explorer/page.jsx`,
  `app/explorer/[slug]/page.jsx`, `app/sitemap.js`, `app/llms.txt/route.js`, `app/recherche/SearchClient.jsx`
  (filtre `article | recit | projet`), `components/ExplorerSections.jsx` ;
- `scripts/photos.mjs` écrit dans `public/images/{projets|articles}/<slug>/` ;
- `docs/live-tracking.md` cite `public/projets` à deux endroits (« Lier depuis un article », §11).

Aucun test ne couvre cette plomberie aujourd'hui (28 fichiers de test dans `lib/`, aucun sur `contentRoutes`). La CI
(`deploy-site.yml`) ne tourne que sur `main` et enchaîne lint, tests, déploiement ; la recette d'une PR se fait donc
en local.

---

## 2. Les huit décisions à prendre avant le code

Chaque point donne ma recommandation ; un « non » change le chantier 1, pas les suivants.

1. **Les dossiers** : `content/concepts`, `content/protocoles`, `content/expeditions`, `content/fiches`,
   `content/carnets`, à côté de `content/bibliography.json`. Les `.md` quittent `public/` (ils y sont servis bruts,
   brouillons compris). Les images ne bougent pas.
2. **Les renommages du chantier 1** (table au §3.1). Recommandation : renommer dès la plomberie, parce que la table
   d'alias doit être construite et testée de toute façon, et qu'un cas réel vaut mieux qu'un cas de test.
   En particulier : `traversee-reunion.md` (les notes de préparation, semaine par semaine) devient
   `content/carnets/carnet-2025.md` sans changer de corps, et `recit-reunion-2025.md` devient
   `content/expeditions/reunion-2025.md`. L'alias `traversee-reunion → carnet-2025` est honnête tant que le corps est
   le même ; il basculera vers `reunion-2025` quand la découpe aura déplacé le replay dans l'expédition.
3. **`la-genese`** change de pilier : `content/concepts/la-genese.md`, `maturite: pousse` (Dubois 2020 est cité),
   308 de `/explorer/la-genese` vers `/comprendre/la-genese`. Sa réécriture en « constat » (discordance évolutive,
   §6.8 de l'étude) est du chantier 5, avec un alias si le slug change alors.
4. **Le vocabulaire** : `maturite: graine | pousse | etabli` sur un concept, `statut: en-test | eprouve | abandonne` sur
   un protocole, obligatoires dès qu'un atome est publié. Le champ `type:` du frontmatter n'est plus lu ; on le retire
   des fichiers déplacés (le frontmatter n'est pas le corps).
5. **Les branches de Comprendre** : un champ `branche:` facultatif sur un concept, validé au build contre une table de
   libellés dans `contentRoutes.mjs` (énergie, thermique, charge-et-tissus, respiration, esprit, instruments). Une
   branche n'est affichée que si deux atomes publiés la portent. Je préfère un champ dédié aux `tags` (libres :
   « ultra-trail », « minimalisme ») pour que la carte ne dépende pas d'un mot-clé éditorial. Ajouter une branche à la
   table est un changement de code d'une ligne, fait le jour où deux concepts la demandent.
6. **Le rendu par sorte** : concept par `ArticleBody` (citations, notes de bas de page, paquetage) ; expédition,
   protocole, carnet et fiche par `ProjetBody` (TOC, replays, plots, citations, paquetage). Le TOC devient conditionnel
   (sorte carnet et expédition seulement, ou au-delà d'un nombre de titres) pour qu'une fiche de quinze lignes n'affiche
   pas de sommaire.
7. **Le lien expédition ↔ archive du direct** : par slug identique avec `public/replays/<slug>/`, et un champ
   `archive:` facultatif quand les slugs diffèrent. D'où le slug `tour-des-ecrins` pour l'expédition Écrins
   (brouillon aujourd'hui, donc libre) : son `aventure.json` alimentera le bloc technique sans rien écrire.
8. **`coach-tarzan-movement.md`** (39 mots, jamais publié, hors modèle) : suppression, sur ton OK explicite
   (invariant 7). Sinon il reste hors de `content/`, dans `docs/archive/`.

Deux choix déjà pris par l'étude et repris sans discussion : les protocoles dans Explorer ; la carte « à paraître »
disparaît avec le brouillon respiration (le mécanisme `teaser:` est retiré au chantier 2).

---

## 3. Les chantiers

### Chantier 0 — Fermer le nettoyage

*Une PR, docs et commentaires seulement, aucun comportement modifié.*

- Écrire `docs/systeme-de-contenu.md` à partir de la section 4 de l'étude, corrigée des décisions du §2 : les cinq
  sortes, la règle de routage en deux questions, les gabarits, le frontmatter et les relations, les règles de build, la
  maturité, les index, le miroir Obsidian, les images par sorte, le flux STAPS. C'est un mode d'emploi, pas une loi.
- Déplacer `docs/revue-integrale-2026-07/` dans `docs/archive/` ; compléter `docs/archive/README.md` (trois fichiers du
  4 septembre, la revue, et ce plan quand il sera fini).
- Purger les vingt-cinq commentaires : retirer toute phrase qui cite un audit, une PR, un brief ou une décision, garder ce qui
  explique une non-évidence technique. Liste des fichiers présentée avant, diff relu après.
- Recette : `pnpm -F site lint` et `test` verts ; `git diff --stat` ne touche que des commentaires et `docs/`.

### Chantier 1 — La plomberie (aucun changement visible)

*Une PR. Le site rend les mêmes pages aux mêmes URL ; seules les adresses renommées répondent en 308.*

#### 3.1 La table de migration

| Aujourd'hui | Demain | Frontmatter ajouté / retiré | 308 |
|---|---|---|---|
| `public/articles/la-genese.md` | `content/concepts/la-genese.md` | `+ maturite: pousse`, `− type` | `/explorer/la-genese → /comprendre/la-genese` |
| `public/articles/developpe-ta-respiration-fonctionnelle.md` (brouillon) | `content/concepts/developpe-ta-respiration-fonctionnelle.md` | `+ maturite: graine`, `− type`, `− teaser*` | aucun (jamais publié) |
| `public/articles/initiation-exposition-au-froid.md` (brouillon vide) | `content/concepts/froid-stresseur.md` | `+ maturite: graine`, `− type` | aucun |
| `public/articles/immersion-primale-entre-vercors-et-drome.md` | `content/expeditions/immersion-primale-entre-vercors-et-drome.md` | `− type` | aucun (slug conservé) |
| `public/articles/recit-reunion-2025.md` | `content/expeditions/reunion-2025.md` | `− type` | `/explorer/recit-reunion-2025 → /explorer/reunion-2025` |
| `public/articles/mon-tour-des-ecrins-en-80-heures.md` (brouillon) | `content/expeditions/tour-des-ecrins.md` | `− type` | aucun |
| `public/projets/saison-trail-2026.md` | `content/carnets/carnet-2026.md` | `− status, activityAt` (dérivés de la dernière note datée) | `/explorer/saison-trail-2026 → /explorer/carnet-2026` |
| `public/projets/traversee-reunion.md` | `content/carnets/carnet-2025.md` | `− status, completedAt, activityAt` | `/explorer/traversee-reunion → /explorer/carnet-2025` |
| `public/projets/coach-tarzan-movement.md` | supprimé (décision 8) | | |

Tout est déplacé par `git mv`, corps inchangé. Les anciens rayons `/articles/<slug>` et `/projets/<slug>` continuent de
répondre pour tous les slugs, anciens et nouveaux, puisque la sorte ne dépend plus du rayon d'origine.

#### 3.2 Le code

- **`lib/contentRoutes.mjs`** : la table `KINDS` (cinq sortes → dossier, pilier, libellé, corps de rendu) ;
  `listEntries`, `listByKind`, `listByPilier`, `routeFor`, `findComprendreEntry`, `findExplorerEntry` ; lecture
  normalisée de `parent`, `concepts`, `fiches`, `lie`, `maturite`, `statut`, `branche`, `archive`, `origine` ;
  `SLUG_ALIASES` ; `assertContentRules({ entries, aliases })` avec les règles : slugs uniques dans tout `content/`
  brouillons compris ; `parent` obligatoire sur une fiche et résolvant vers une expédition ou un protocole ; chaque
  entrée de `concepts:` résout vers un concept, de `fiches:` vers une fiche, de `lie:` vers un concept ; `maturite` /
  `statut` dans le vocabulaire de leur sorte, obligatoires si publié ; `branche` dans la table ; un alias ne masque
  jamais un atome vivant et mène à un atome existant. Les erreurs s'accumulent et nomment le fichier.
- **`lib/legacyRedirects.mjs`** : appelle `assertContentRules()` (c'est le point par lequel tout build passe), puis
  deux couches : les rayons hérités pour chaque atome, et trois 308 par alias (pilier, `/articles`, `/projets`). Le
  changement de pilier de `la-genese` est un alias comme un autre.
- **`lib/extractProjectNotes.js` → `lib/extractCarnetNotes.js`**, qui lit `content/carnets/` ; la date d'activité
  d'un carnet est celle de sa dernière note datée.
- **`lib/getRecentActivity.js`**, **`lib/carouselItems.js`**, **`lib/getRelated.js`** : le `kind` réel remplace les
  labels `"Carnet" | "Projet"` ; `getRelated` reste par récence mais ne mélange plus les sortes (il disparaît au
  chantier 4).
- **`lib/buildSearchIndex.js`** et **`app/recherche/SearchClient.jsx`** : l'index porte `kind` et `pilier` ; le filtre
  se fait par pilier (le repli `"project"` de l'ancien index en cache reste).
- **`app/sitemap.js`**, **`app/llms.txt/route.js`**, **`app/page.js`** : `listEntries()` à la place de la paire
  `listArticleEntries` + `listProjetEntries`.
- **`app/comprendre/[slug]`** et **`app/explorer/[slug]`** : le corps choisi par la table `KINDS` (décision 6) ;
  `generateStaticParams` continue d'inclure les brouillons pré-rendus en 404 (contrainte Cloudflare Pages déjà
  commentée dans le code). Les index (`app/comprendre/page.jsx`, `app/explorer/page.jsx`) ne changent que leurs
  appels : l'apparence attend le chantier 2.
- **`scripts/photos.mjs`** : les nouvelles photos vont dans `public/images/<sorte>/<slug>/` ; les dossiers
  `articles/` et `projets/` existants ne bougent pas.
- **`docs/live-tracking.md`** : deux phrases à mettre au présent (« un `.md` de `content/` », « les pages rendues par
  ProjetBody »).
- **Tests** : `lib/contentRoutes.test.js` (une entrée par règle, sur un `content/` de fixture ; un test « le contenu
  réel du site passe les règles, alias compris ») et `lib/legacyRedirects.test.js` (chaque ligne de la table 3.1
  produit ses 308, aucun alias ne pointe sur un slug vivant).

#### 3.3 La recette

- Les six URL publiées répondent 200 avec le même corps : `/explorer/immersion-primale-entre-vercors-et-drome`,
  `/explorer/reunion-2025`, `/explorer/carnet-2026`, `/explorer/carnet-2025`, `/comprendre/la-genese`, et `/comprendre`
  (avec `la-genese` en carte, la carte « à paraître » encore présente jusqu'au chantier 2).
- `/explorer/saison-trail-2026`, `/explorer/traversee-reunion`, `/explorer/recit-reunion-2025`, `/explorer/la-genese`,
  `/projets/saison-trail-2026`, `/articles/la-genese` répondent 308 vers la bonne cible.
- `/articles/<slug>.md` ne renvoie plus rien ; `/recherche` trouve un carnet et une expédition ; accueil, sitemap et
  `llms.txt` listent les mêmes contenus qu'avant.
- `pnpm -F site build`, `lint`, `test` verts ; le build échoue avec le nom du fichier si l'on glisse une fiche sans
  `parent:` dans la fixture.

### Chantier 2 — Les index (premier changement visible)

*Une PR.*

- **`/comprendre`** : une liste plate de concepts publiés, triée par maturité (établi, pousse, graine) puis par date ;
  chaque carte porte « CONCEPT · GRAINE » dans `CardMeta`. Dès que deux atomes publiés portent la même `branche:`,
  la liste se regroupe sous ce titre (composant `ComprendreCarte`, réécrit : rien pour une branche vide, ni encadré, ni
  gris). La page-pilier, quand elle existera (chantier 5), s'affiche en tête. Le `TeaserCard` et le champ `teaser:`
  disparaissent ; l'état vide actuel (encadré pointillé + capture email) reste pour le jour zéro.
- **`/explorer`** : `ExplorerSections` prend un tableau de sections, dans l'ordre Expéditions, Protocoles, Carnet,
  Fiches (repliée par défaut) ; une section vide ne s'affiche pas et son bouton de filtre non plus. Les cartes de
  carnet gardent leurs deux dernières notes ; les cartes d'expédition affichent dates et distance quand le
  frontmatter ou `aventure.json` les donne ; les cartes de protocole leur statut ; les cartes de fiche la masse totale et le nombre
  d'éléments (déjà calculés par `lib/paquetage.js`).
- **`CardMeta`** : libellés par sorte et détail en ocre (« PROTOCOLE · EN TEST », « EXPÉDITION · 80 H », « CARNET ·
  2026 », « FICHE · 1,3 KG »). L'accueil et le carrousel de `/live` héritent des mêmes libellés par `carouselItems`.
- **`/quete`** : réactiver le bloc « Par où commencer » (commenté dans `app/quete/page.jsx`, il faut ré-importer
  `Link`), avec ses trois portes : Comprendre, Explorer, Pratiquer.
- Recette : `/comprendre` montre `la-genese` seul, sans branche ; `/explorer` montre Expéditions et Carnet, rien
  d'autre ; le filtre n'a que deux boutons ; build, lint, tests verts.

### Chantier 3 — La découpe

*Plusieurs PR de contenu, une par fichier source, chacune précédée de son inventaire (les passages coupés, les atomes
créés, les ancres réécrites, les alias ajoutés). Aucun corps n'est réécrit : on coupe, on colle dans le gabarit, on
remplace par deux lignes et un lien.*

**3a. La Réunion d'abord** (projet fermé, personne n'y écrit plus) : depuis `carnet-2025.md`, les protocoles
`rest-step-en-montee` (éprouvé), `construire-une-trace-fiable` (éprouvé), `gerer-l-eau-sur-un-off` (éprouvé),
`micro-sieste-auto-hypnose` (éprouvé), `respiration-nasale-a-l-effort` (éprouvé, avec les observations du 12/10 et
du 25/10) ; les concepts `chasse-d-eau` (pousse, Millet 2012) et `trace-sous-echantillonnee` (pousse, Fearnhead,
Haklay, Sanchez) ; les fiches `paquetage-reunion-2025` et `nutrition-reunion-2025` ; le replay de la semaine 7 rejoint
`reunion-2025.md`, dont le bloc technique vient du frontmatter. Les trois ancres intra-page cassées et les deux ancres
profondes depuis le carnet 2026 sont réécrites vers leurs nouvelles cibles dans cette PR. L'alias `traversee-reunion` bascule sur
`reunion-2025`.

**3b. Le carnet 2026 ensuite**, mois par mois pour que tu puisses continuer à y écrire entre deux PR (une PR par
trimestre, ou par mois s'il est chargé) : les concepts `memoire-musculaire` (pousse), `flexibilite-metabolique`
(pousse), `chaleur-et-glycogene` (pousse), `hormese` (graine) ; les protocoles `fractionne-long-en-cotes` (éprouvé),
`entrainement-a-glycogene-bas` (en test, interrompu par la chaleur : c'est un résultat), `acclimatation-au-chaud`
(en test), `jeune-intermittent` (éprouvé), `eau-non-filtree` (abandonné, incident), `systeme-de-couchage-minimal`
(éprouvé), `habituation-a-la-charge` (éprouvé), `nutrition-d-autonomie` (éprouvé) ; les fiches `paquetage-vercors-2026`
et `paquetage-ecrins-2026` (les deux CSV), `nutrition-ecrins-2026`, `plan-ecrins-2026`, `live-tracking-v1` ; les
expéditions Chartreuse, Monts du Lyonnais, Aravis, avec leur `archive:` quand le replay existe. L'ancre profonde depuis
le récit Vercors est réécrite vers `paquetage-vercors-2026`. Les deux passages « à manier avec précaution » de
l'étude (antalgiques après la fracture, eau non filtrée) vont en protocole avec leur statut, jamais en concept.

Recette de chaque PR : le carnet reste lisible du début à la fin ; aucune ancre ne pointe dans le vide (script de
vérification ajouté au chantier 4) ; chaque atome créé passe les règles de build ; les URL de la table 3.1 répondent
toujours.

### Chantier 4 — Les blocs générés

*Une PR, dès que la Réunion est découpée (3a suffit pour avoir des relations réelles).*

- « Sur le terrain » sur un concept : les protocoles et expéditions qui le citent dans `concepts:`.
- « Ce que j'ai compris » sur un protocole ou une expédition : les concepts de `concepts:`, avec leur maturité.
- « Dans cette expédition » : les fiches (`parent:` et `fiches:`) et les protocoles rattachés.
- « Motifs voisins » sur un concept : `lie:`, dans les deux sens.
- Le bloc technique d'une expédition : frontmatter + `aventure.json` (intention, dates, distance, D+, bivouacs,
  statut), le lien vers `/live/archives/<slug>` s'il existe, le paquetage rendu depuis `fiches:`.
- `getRelated` disparaît ; le TOC devient conditionnel (décision 6).
- Une vérification de build de plus : toute ancre `#…` d'un contenu publié résout vers un titre du même fichier
  (les `#sommaire` compris), et tout lien vers `/comprendre/…` ou `/explorer/…` résout vers un atome ou un alias.
- Recette : la page `chasse-d-eau` liste `rest-step-en-montee` sous « Sur le terrain » sans qu'une ligne ait été
  écrite ; un `concepts:` mal orthographié fait échouer le build.

### Chantier 5 — Le contenu nouveau et les cartes typographiques

*Continu, une PR par atome ou par lot ; c'est le régime de croisière du site.*

- La page-pilier `content/concepts/robustesse-physiologique.md`, désignée dans le code comme tête de la carte : la
  définition opérationnelle (« robustesse de… face à… au prix de… »), l'ordre de lecture du noyau (§6.8 de l'étude),
  les familles de fluctuations nommées en prose.
- Les concepts qui manquent au noyau : `hormese`, `robuste-mais-fragile`, `degenerescence`, `allostasie`,
  `variete-requise` ; la réécriture de `la-genese` en constat ; les protocoles des Écrins.
- La respiration (§4.14) : `effet-bohr`, `monoxyde-d-azote-nasal`, `respiration-dysfonctionnelle` (concepts) ; le
  protocole `respiration-nasale-a-l-effort` existe depuis 3a. Le froid : `froid-stresseur` (graine, chantier 1) reçoit
  son mécanisme, et le protocole `exposition-au-froid` (éprouvé, trois hivers) naît.
- `/quete` devient la porte du noyau (manifeste, constat, par où commencer) ; `/a-propos` ne garde que la biographie
  et le contact.
- Les cartes typographiques (§4.13) : d'abord en CSS, dans la charte (teinte du pilier, grille de labo, Lora
  italique, badge), sans image versionnée ; les images de partage (OG) par le script `build:og` existant, étendu au
  frontmatter, dans un second temps. `cover:` devient facultatif ; une expédition sans photo reçoit la silhouette
  altimétrique dessinée par le code du studio (`habillage.js`, `carrouselTrace.js`).
- Le flux STAPS (§4.12) : le champ `origine:` est lu dès le chantier 1 ; son affichage en page est une décision de
  ce chantier. Le dossier `cours/` du coffre ne touche jamais le dépôt.

### La route de secours Écrins

Si le carrousel Écrins doit sortir avant le chantier 1 : l'expédition `tour-des-ecrins` (le squelette existe, en
brouillon) et les deux fiches (paquetage depuis le CSV, nutrition) s'écrivent dès maintenant dans les dossiers
actuels, avec les slugs de ce plan ; elles migrent ensuite par `git mv`. Rien dans ce plan ne les attend.

---

## 4. Ce qui ne bouge pas

Pratiquer, Outils et le studio (surfaces d'offre et d'outillage : le lien va de l'offre vers le savoir) ; `/live`, les
archives, les replays et `packages/tracking` ; la charte et `packages/ui` ; `apps/twin`, `services/` ; les images sous
`public/images/` ; la migration TypeScript du site ; les versions des dépendances ; le format des notes de carnet
(`### Titre` puis `*JJ/MM/AAAA*`), que `extractCarnetNotes` continue de lire.

---

## 5. Risques et parades

- **Le carnet 2026 est vivant** (dernière note le 3 septembre). Une découpe d'un seul bloc entrerait en conflit avec
  ton écriture : d'où le découpage par mois (3b), et une règle simple pendant une PR de découpe : tu écris tes
  nouvelles entrées en fin de fichier, on ne touche pas aux mois en cours.
- **Une ancre morte ne fait pas échouer un build.** Les six ancres inventoriées se réécrivent dans la PR qui crée
  leur cible, et la vérification du chantier 4 empêche la suivante.
- **`generateStaticParams` sans aucun chemin** exigerait le runtime edge sous Cloudflare Pages : chaque route `[slug]`
  garde les brouillons pré-rendus en 404, comme aujourd'hui, même pour une sorte encore vide.
- **`Edit(/docs/**)` demande ton accord** : les chantiers 0 et 1 touchent `docs/` ; prévoir de valider ces éditions en
  session plutôt que de contourner le verrou.
- **Le vocabulaire des cartes** (« Carnet » désignait un article) : le chantier 1 renomme les labels internes, le
  chantier 2 les libellés affichés ; entre les deux, rien de visible ne change.
- **La branche « Atomiser »** ne doit pas être fusionnée par réflexe (conflits de renommage sur du contenu, §1.3) :
  ce plan la remplace ; elle reste sur `origin` comme trace.

---

## 6. Définition de « fini »

Le chantier est fini quand : les cinq dossiers de `content/` existent et sont peuplés ; aucune URL publiée avant le
chantier ne répond 404, et chaque adresse renommée répond 308 depuis ses trois anciennes formes ; `/comprendre`
affiche ses concepts par maturité, avec la page-pilier en tête et des branches qui n'existent qu'à deux atomes ;
`/explorer` affiche ses quatre sections sans jamais en montrer une vide ; les quatre blocs de relation sont générés
et aucune ancre écrite à la main ne pointe dans le vide dans un contenu publié ; `content/` n'est plus servi en brut ;
les règles de build et la table d'alias sont couvertes par des tests ; `docs/systeme-de-contenu.md` décrit le système
tel qu'il est ; ce plan est dans `docs/archive/` ; build, lint et tests verts.
