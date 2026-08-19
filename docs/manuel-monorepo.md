# Manuel du monorepo — Locomotion Lab

> **À qui ça s'adresse :** toi (mainteneur) et toute personne qui code ici. Objectif : savoir
> **compiler / lancer / déployer le site** et **travailler sur d'autres apps sans rien casser**,
> sans avoir à deviner comment la nouvelle plomberie marche.
>
> Référence courte de l'archi : [`CLAUDE.md`](../CLAUDE.md). Déploiement détaillé :
> [`docs/deploy-cloudflare.md`](./deploy-cloudflare.md). Secrets : [`docs/secrets.md`](./secrets.md).

---

## 0. TL;DR (les 6 commandes que tu utiliseras 95 % du temps)

```bash
pnpm install                  # 1. installer/relier tout le workspace (à faire après un git pull)

pnpm --filter site dev        # 2. lancer LE SITE en local (http://localhost:3000)
pnpm --filter site build      # 3. compiler le site (vérif avant de pousser)
pnpm --filter site lint       # 4. linter le site

pnpm --filter site deploy:cf  # 5. déployer le site sur Cloudflare Pages (manuel)
pnpm build                    # 6. tout compiler (turbo) — utile en vérif globale / CI
```

Remplace `site` par le nom d'une autre app (`_template`, demain `twin`, …) pour faire la même chose
**sur cette app uniquement**, sans toucher au site. Tout le reste de ce document explique *pourquoi*
et *comment* ça reste cloisonné.

### Raccourcis (moins taper)

Du plus partagé au plus personnel :

1. **Scripts racine** (versionnés → valables pour tout le monde), déjà ajoutés au `package.json`
   racine :

   ```bash
   pnpm dev:site       # = pnpm --filter site dev
   pnpm build:site     # = pnpm --filter site build
   pnpm lint:site      # = pnpm --filter site lint
   pnpm deploy:site    # = pnpm --filter site deploy:cf
   ```

2. **Flag court `-F`** (intégré à pnpm, rien à configurer) : `pnpm -F site dev` au lieu de
   `pnpm --filter site dev`.

3. **Depuis le dossier de l'app** : `cd apps/site`, puis directement `pnpm dev`, `pnpm build`,
   `pnpm deploy:cf` (plus de filtre du tout).

> Alias **personnel** (hors repo, propre à ta machine) : dans `~/.bashrc`,
> `alias site='pnpm -F site'` → ensuite `site dev`, `site build`, `site deploy:cf`.

---

## 1. Le modèle mental (à lire une fois)

Avant, le repo **était** le site : un seul `package.json` à la racine, `next build` à la racine.

Maintenant le repo est un **monorepo** : un conteneur qui héberge **plusieurs projets indépendants**.
Trois briques font tourner la machine :

| Brique | Rôle | Où |
| --- | --- | --- |
| **pnpm workspaces** | Gère les dépendances de **tous** les projets avec **un seul** `node_modules` mutualisé et **un seul** lockfile racine (`pnpm-lock.yaml`). Relie les projets entre eux par symlink. | `pnpm-workspace.yaml` |
| **Turborepo** | Lance les scripts (`build`, `lint`, `dev`) à travers les projets, **en parallèle** et **avec un cache** : si rien n'a changé dans un projet, il ne le recompile pas. | `turbo.json` |
| **packages/ui** | La **charte graphique** (couleurs, polices Ubuntu + Lora, composants). **Source unique** : une couleur ou une police se change ici et nulle part ailleurs. | `packages/ui/` |

Conséquence clé, et c'est tout l'intérêt : **chaque app a son propre `package.json`, son propre
build, ses propres dépendances.** Les apps **ne s'importent jamais** l'une l'autre. Le **seul** point
commun entre elles est `packages/ui`. Donc :

- Tu peux compiler/lancer/casser une app **sans aucun effet** sur les autres.
- La **seule** chose qui, si tu la modifies, touche plusieurs apps à la fois, c'est `packages/ui`
  (c'est voulu : c'est la charte partagée).

```
thelocomotionlab/                  ← le monorepo (un seul repo git, un seul lockfile)
├─ apps/
│  ├─ site/       (name: "site")        ← le site actuel, Next + JS → Cloudflare Pages
│  └─ _template/  (name: "_template")   ← gabarit pour démarrer une nouvelle app (Next + TS)
├─ packages/
│  └─ ui/         (name: "@locomotionlab/ui")  ← LA charte partagée
├─ docs/          ← ce manuel, déploiement, secrets
├─ pnpm-workspace.yaml   ← « les projets sont dans apps/* et packages/* »
├─ turbo.json            ← définition des tâches build/lint/dev
└─ package.json          ← scripts racine (turbo) + packageManager: pnpm@10.x
```

> **`--filter` = la notion la plus importante de ce manuel.** `pnpm --filter <nom> <script>` veut
> dire « exécute ce script **uniquement** dans le projet qui porte ce `name`, ignore tous les
> autres ». Le `<nom>` est le champ `"name"` du `package.json` du projet (pas le nom du dossier — ils
> sont identiques pour `site` et `_template`, mais c'est bien le `name` qui compte).

---

## 2. Prérequis (installation initiale)

| Outil | Version | Vérifier |
| --- | --- | --- |
| Node.js | **≥ 22** | `node -v` |
| pnpm | **≥ 10** | `pnpm -v` |

pnpm est piloté par **corepack** (fourni avec Node). La version exacte (`pnpm@10.33.0`) est épinglée
dans le `package.json` racine (`packageManager`), donc tu n'as pas à l'installer à la main :

```bash
corepack enable        # une seule fois sur la machine
cd thelocomotionlab-website
pnpm install           # installe TOUT le workspace (site + template + ui)
```

`pnpm install` à la racine suffit **toujours** : il installe les dépendances de **tous** les projets
d'un coup et crée les symlinks entre eux (`@locomotionlab/ui` devient visible dans chaque app).
À refaire après chaque `git pull` qui touche un `package.json` ou le lockfile.

---

## 3. Travailler sur le site (le cas courant)

Toutes ces commandes se lancent **depuis la racine du repo** (pas besoin de `cd apps/site`) :

```bash
pnpm --filter site dev      # serveur de dev avec hot-reload → http://localhost:3000
pnpm --filter site build    # build de production (= l'ancien `next build`)
pnpm --filter site lint     # ESLint
pnpm --filter site start    # sert le build de prod en local (après un build)
```

C'est l'équivalent **exact** de ce que tu faisais avant la migration, juste préfixé par
`pnpm --filter site`. Le `next build` est identique ; seul l'emplacement du code a changé
(racine → `apps/site/`).

> Tu peux aussi `cd apps/site && pnpm dev` si tu préfères travailler depuis le dossier de l'app :
> pnpm retrouve quand même le workspace en remontant l'arborescence. Les deux marchent.

### Déployer le site sur Cloudflare Pages

Deux voies, selon que tu veux un déploiement **automatique** ou **manuel** :

**a) Automatique (recommandé) — via l'intégration Git de Cloudflare Pages.**
Tu pousses sur la branche de production, Cloudflare build et déploie tout seul. Ça suppose d'avoir
réglé **une seule fois** la config Cloudflare (surtout *Root directory = `apps/site`*). La procédure
complète + la checklist sont dans **[`docs/deploy-cloudflare.md`](./deploy-cloudflare.md)**.

**b) Manuel — depuis ton poste :**

```bash
pnpm --filter site deploy:cf
# = npx @cloudflare/next-on-pages          (adapte le build Next pour Cloudflare)
#   && npx wrangler pages deploy .vercel/output/static --project-name=thelocomotionlab-website
```

> ⚠️ Le script s'appelle **`deploy:cf`** (et non `deploy`) : `deploy` est une **commande interne de
> pnpm** (`pnpm deploy <dossier>`) qui prendrait le pas sur le script et planterait avec
> `ERR_PNPM_INVALID_DEPLOY_TARGET`. Le suffixe `:cf` évite la collision et laisse la place à d'autres
> cibles plus tard (p. ex. `deploy:vps` pour une app de calcul). Si tu tiens à garder un script nommé
> `deploy`, lance-le avec le mot-clé `run` : `pnpm --filter site run deploy`.

La première fois, `wrangler` ouvre un navigateur pour te connecter à Cloudflare (OAuth). **Aucun
token n'est stocké dans le repo** (cf. [`docs/secrets.md`](./secrets.md)).

---

## 4. Travailler sur une autre app **sans toucher au site**

C'est la question centrale. La réponse tient en une phrase : **tu cibles l'app avec `--filter`, et
comme les apps sont indépendantes, le site n'est jamais ni recompilé ni impacté.**

```bash
pnpm --filter _template dev      # lance UNIQUEMENT le gabarit
pnpm --filter _template build    # compile UNIQUEMENT le gabarit
```

Demain, avec une app `twin` :

```bash
pnpm --filter twin dev
pnpm --filter twin build
```

### Pourquoi le site n'est jamais affecté ?

- `--filter twin build` **n'exécute que** le script `build` du projet `twin`. Le script `build` du
  site **n'est jamais appelé**.
- Turbo a une règle `"dependsOn": ["^build"]` : avant de builder un projet, il build **ses
  dépendances**. Or une app ne dépend **que** de `@locomotionlab/ui`, **jamais** d'une autre app. Donc
  builder `twin` ne déclenche **jamais** le build de `site` (ce ne sont pas des dépendances l'une de
  l'autre, juste des voisines).
- Chaque app a son propre dossier de sortie (`apps/<app>/.next/`). Les builds ne se marchent pas
  dessus.

### La SEULE zone partagée : `packages/ui`

Si tu modifies `packages/ui` (la charte), **toutes les apps qui la consomment** voient le changement
(le site **et** les autres). C'est **voulu** — c'est exactement le but d'une charte unique. Donc :

- Changer une couleur/police/un composant dans `packages/ui` → **vérifie le site aussi**
  (`pnpm --filter site build`), pas seulement l'app sur laquelle tu travailles.
- À l'inverse, tout ce que tu fais **à l'intérieur** d'une app (`apps/twin/…`) reste confiné à cette
  app : impossible d'impacter le site.

### Ajouter une dépendance à une seule app

Pour ne **pas** polluer les autres projets, installe la dépendance **dans l'app ciblée** :

```bash
pnpm --filter twin add zod            # ajoute zod au package.json de twin uniquement
pnpm --filter twin add -D vitest      # dépendance de dev de twin uniquement
```

N'ajoute **jamais** une dépendance applicative à la racine. La racine ne porte que l'outillage du
monorepo (`turbo`).

---

## 5. Créer une nouvelle app (recette pas-à-pas)

Le dossier `apps/_template/` est un **gabarit** Next + **TypeScript** déjà câblé à la charte. Pour
démarrer une nouvelle app (exemple : `twin`) :

```bash
# 1. Copier le gabarit
cp -r apps/_template apps/twin

# 2. Renommer le projet : ouvre apps/twin/package.json et change la 1re ligne
#    "name": "_template"   →   "name": "twin"

# 3. Relier le nouveau projet au workspace
pnpm install

# 4. Lancer
pnpm --filter twin dev
```

Ce que le gabarit branche **déjà** pour toi (rien à refaire) :

| Fichier | Ce qu'il fait |
| --- | --- |
| `package.json` | dépend de `@locomotionlab/ui` en `workspace:*` (la charte, par symlink) |
| `next.config.ts` | `transpilePackages: ["@locomotionlab/ui"]` — Next compile la charte (TS + `next/font`) |
| `app/layout.tsx` | pose les polices de marque : `import { fontVariables } from "@locomotionlab/ui/fonts"` sur `<body>` (Ubuntu + Lora + Ubuntu Mono) |
| `app/globals.css` | `@import "tailwindcss"` + `@import "@locomotionlab/ui/theme.css"` (les tokens) + `@source "../../../packages/ui/src"` (scanne la charte pour générer ses classes) |

Conventions à respecter (cf. [`CLAUDE.md`](../CLAUDE.md)) :

- **Toute nouvelle app est en TypeScript** (le site reste en JS, lui, par exception historique).
- **On ne crée un `packages/<x>` que quand au moins deux apps en ont réellement besoin.** Tant qu'un
  bout de code ne sert qu'à une app, il **reste dans l'app**. Pas de package « au cas où ».
- La charte vient de `packages/ui` **et de nulle part ailleurs**.

---

## 6. Commandes à l'échelle du monorepo (turbo)

Depuis la racine, **sans `--filter`**, les scripts passent par Turborepo et s'appliquent à **tous**
les projets, en parallèle et avec cache :

```bash
pnpm build     # turbo run build  : build toutes les apps
pnpm lint      # turbo run lint   : lint tout le workspace
pnpm dev       # turbo run dev    : lance toutes les apps en parallèle (rarement utile)
```

Utile surtout en **vérification globale** (avant un merge) ou en **CI**. Au quotidien, préfère le
`--filter` ciblé : c'est plus rapide et ça évite de lancer des serveurs de dev dont tu n'as pas
besoin.

**Le cache turbo**, en deux mots : après un premier `pnpm build`, relance-le → les projets inchangés
affichent `cache hit, replaying logs` et ne sont **pas** recompilés. Pour repartir propre :

```bash
pnpm build --force          # ignore le cache turbo
rm -rf apps/*/.next .turbo   # nettoyage dur si quelque chose semble corrompu
```

### Choisir entre `pnpm --filter` et `turbo --filter`

- `pnpm --filter <app> <script>` → lance **juste** le script de l'app, **sans** cache turbo, **sans**
  construire ses dépendances. Simple et direct pour le dev d'une app.
- `turbo run <script> --filter=<app>` → pareil mais **avec** le cache turbo **et** la construction
  préalable des dépendances (`^build`). Pratique en CI ou si l'app dépend d'un package à builder.

Pour le site (qui ne dépend que de `ui`, lequel n'a pas d'étape de build), les deux reviennent au
même. Le `package.json` racine expose les variantes turbo (`pnpm build/lint/dev`).

---

## 7. Garde-fous (les règles d'or, à respecter à chaque tâche)

Reprises de [`CLAUDE.md`](../CLAUDE.md) — ce sont elles qui garantissent qu'on n'introduit pas de
régression :

1. **Ne jamais casser le site.** Il doit toujours builder et se déployer sur Cloudflare Pages.
   Avant de pousser : `pnpm --filter site build` **et** `pnpm --filter site lint` au vert.
2. **Travailler sur une branche**, par commits logiques. Vérifier `build` + `lint` avant de proposer
   un merge.
3. **Avant toute opération destructive** (suppression de fichiers, réécriture d'historique git,
   commande sur le VPS) : montrer le plan et demander validation.
4. **Aucun secret dans le repo.** Uniquement des références à des variables d'environnement
   (cf. [`docs/secrets.md`](./secrets.md)).
5. **Données utilisateur** : les archives d'entraînement sont supprimées immédiatement après analyse ;
   on ne garde que le rapport (le temps du SAV) et le minimum de métadonnées.

---

## 8. Dépannage rapide

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| `Cannot find module '@locomotionlab/ui'` | symlinks workspace pas créés | `pnpm install` à la racine |
| `command not found: pnpm` | corepack pas activé | `corepack enable`, rouvrir le terminal |
| Le build Cloudflare cherche un `package.json` à la racine | *Root directory* pas réglé sur `apps/site` | appliquer [`docs/deploy-cloudflare.md`](./deploy-cloudflare.md) |
| Déploiement Cloudflare KO : « inferred your workspace root » ou chemin dédoublé `apps/site/apps/site/.next` | Turbopack confine la racine sous next-on-pages en monorepo | déjà réglé : `build` en `--webpack` + `turbopack.root`/`outputFileTracingRoot` dans `next.config.mjs` (détails : [`docs/deploy-cloudflare.md`](./deploy-cloudflare.md)) |
| Une modif de charte ne se voit pas dans une app | cache `.next` / `@source` | relancer le `dev`, ou `rm -rf apps/<app>/.next` |
| `pnpm build` ne recompile rien alors que j'ai changé du code | cache turbo (faux positif rare) | `pnpm build --force` |
| J'ai ajouté un paquet et une autre app a un comportement bizarre | dépendance ajoutée à la racine au lieu de l'app | la déplacer : `pnpm --filter <app> add <paquet>` |
| Versions Node/pnpm douteuses | machine pas alignée | `node -v` ≥ 22, `pnpm -v` ≥ 10 |

---

## 8 bis. Habiller une photo de sortie (studio, onglet « Habillage photo »)

Une page de l'app, **entièrement côté navigateur** : on choisit une photo et le
GPX de la sortie, l'habillage se pose sur l'image, puis « Partager » (partage
natif du téléphone) ou « Enregistrer ». Même poste de travail que le carrousel
(barre en haut, rail à gauche, panneau, image au centre) : les deux ateliers
s'utilisent dans la même demi-heure, deux ergonomies auraient obligé à
réapprendre à chaque bascule.

**Deux habillages, deux formats**, au choix dans la barre du haut :

| | Silhouette | Chiffres |
| --- | --- | --- |
| Ce qu'on voit | le relief en bandeau pleine largeur, `distance · D+ ↑ · D− ↓` dessous | la distance en très grand, le D+ en ambre à côté, une ligne de trois mesures |
| Pour quoi | une sortie qu'on raconte par son relief | une sortie qu'on raconte par ses chiffres (la grammaire des écrans de montre, à la charte du labo) |

Les formats sont **Story 1080×1920** et **Publication 1080×1350**. La mise en
page est **ancrée sur le bas de la zone sûre** : changer de format ne redécide
rien, il déplace le point d'ancrage — donc rien ne peut passer sous l'interface
d'Instagram en story, et rien ne gâche de place en publication (une publication
n'est recouverte de rien). Les trois mesures de l'habillage « Chiffres » sont du
**texte libre avec une icône au choix** (le même vocabulaire que les planches) ;
chrono, D− et allure sont pré-remplis depuis le fichier.

Le profil de « Silhouette » reprend le modèle de l'ancien habillage Coros : **pleine largeur,
aucun filet sous la courbe**, un remplissage translucide surmonté d'une crête
franche. Le remplissage s'efface vers le bas plutôt que de s'arrêter sur une
base plate — chez Coros elle tombait hors du cadre donc invisible, ici elle
doit rester dans la zone sûre et un aplat s'y terminerait par une barre en
travers de la photo. Les flèches ↑ ↓ sont **tracées**, pas écrites : les fontes
du site sont des sous-ensembles latins et n'ont pas U+2191/U+2193.

- **Rien ne sort du téléphone** : pas de serveur, donc rien à stocker ni à
  purger. Le hors-ligne vient du service worker du studio (§8 ter) — un
  manifeste seul ne met rien en cache, ce que cette page a longtemps promis à
  tort.
- **La distance vient de la montre** quand le fichier la porte
  (`<gpxdata:distance>` chez Coros) : elle ne coïncide pas avec la géométrie du
  tracé (24,26 km annoncés pour 22,86 km de segments sur la Croix de
  Belledonne), et c'est bien le chiffre affiché au poignet qui doit être publié.
- **Les HEIC de l'iPhone sont acceptés** : décodage natif d'abord (Safari sait le
  faire, iOS convertit souvent en JPEG à la volée), décodeur de secours (1,3 Mo)
  chargé **à la demande** seulement si ça échoue — il ne pèse sur aucune autre
  page du site.
- **Les trois chiffres sont modifiables** : le D+ recalculé depuis les altitudes
  du fichier reste ~10 % sous celui qu'affiche la montre. On part du fichier, le
  dernier mot revient à l'auteur.
Le calcul (lecture du GPX, D+/D− par lissage + hystérésis) vit dans
`apps/site/lib/gpxStats.js`, la mise en page dans `apps/site/lib/habillage.js`
— les deux sont testés (`pnpm -F site test`).

---

## 8 ter. Le studio (`/studio`)

**L'espace de création des visuels du labo pour les réseaux.** Deux ateliers,
une seule page, deux onglets : **Carrousel** (l'itinéraire découpé en journées,
la fiche, la clôture…) et **Habillage photo** (§8 bis). Les anciennes URL
`/outils/habillage` et `/outils/carrousel` redirigent ici en 308.

- **Plein écran** : la navbar et le pied du SITE ne s'affichent pas sur
  `/studio` (`components/ChromeDuSite.jsx`, un garde d'une ligne sur le chemin —
  plutôt que deux layouts racines à tenir en phase). À leur place, la barre du
  studio : la **marque du labo, cliquable**, qui ramène au site, et les deux
  ateliers. C'est le geste de Canva — une icône pour sortir, rien d'autre.
- **Changer d'onglet ne perd rien** : les deux ateliers restent montés, celui
  qu'on ne regarde pas est simplement caché. Recharger un GPX de 6 Mo sur un
  téléphone n'est pas une broutille.
- **Le poste de travail du carrousel** (repris de Canva) : une **barre en haut**
  (nom du projet, format, thème, enregistrer, exporter), un **rail** d'onglets à
  gauche — Planche, Texte, Photo, Trace, Allure, Projet —, le **panneau** du
  réglage choisi à côté, la **planche** au centre et la **bande des vignettes**
  dessous. *Seul le panneau défile* : on voit toujours ce qu'on règle. Sur un
  téléphone la planche se colle sous la barre du studio, le rail passe en bande
  horizontale, et le panneau défile dessous.
  Chaque réglage n'existe **qu'à un seul endroit** : un accordéon replié cache
  un réglage aussi bien qu'une absence de réglage — c'est ce qui a fait croire
  que le filet sous le titre ne se dessinait pas alors que sa case était pliée
  (`lib/carrouselRendu.test.js` le vérifie maintenant sur les six gabarits).
  **Zoom** sous la planche (boutons, ou Ctrl/⌘ + molette) : « Ajuster » montre
  la composition, 100 % montre les pixels réels de l'export — un corps de 22 px
  ne se juge pas sur une vignette. Le plan de travail défile quand on zoome. La
  **bande des vignettes se rabat** (le bouton « N planches » sous la scène).
- **Cliquer DANS la planche ouvre le réglage** de ce qu'on a cliqué : le titre
  ouvre le champ du titre, le pied ouvre le pied, une case de la grille ouvre sa
  légende. Le rendu déclare ses **zones** au fil du dessin (`dessinerCartePartage`
  rend `{ boites, zones }`) et l'atelier les teste de la dernière à la première
  — la dernière dessinée est celle du dessus, donc celle qu'on croit cliquer.
  Deux règles qui évitent le « ça ne marche pas » : les **blancs entre blocs
  appartiennent au bloc du dessus** (cliquer entre un titre et son paragraphe
  ouvre le titre), et chaque gabarit a une **zone de repli** qui couvre tout
  l'espace utile — aucun point de la planche ne reste muet.
- **La composition** (onglet Texte) : **alignement** du texte — à gauche, centré,
  à droite : le filet ambre du surtitre et le filet sous le titre suivent, tout
  passe par le même calcul — et **inversion du titre et du surtitre**. Par
  défaut le surtitre ouvre (un filet, une catégorie, puis le titre) ; inversé,
  le titre devient l'accroche et le surtitre la range en dessous.
- **Ce qui se règle sur une planche** : les corps (titre 65, texte 38, filet
  ambre 10 — les valeurs des aperçus de reel), la **police de chaque rôle**
  (titre / surtitre / texte, parmi les trois familles de la charte : Ubuntu,
  Lora, Ubuntu Mono), les **espacements** (interligne, entre paragraphes,
  respiration d'une ligne sautée, entre points de liste, retrait de liste,
  **alinéa** de première ligne), les **dégradés** — intensité ET **distance**,
  en-tête et pied, y compris sur le gabarit Carte (`1` = le voile de la charte,
  `0` l'éteint) —, l'**ombre portée des textes** (flou, décalage, densité,
  couleur : elle fait le contraste sous les lettres au lieu d'assombrir toute
  la photo — et **sur quels textes** : titre, surtitre, texte, en-tête, pied,
  séparément ; un titre en très gros veut une ombre franche, la pagination du
  pied en 22 px n'en veut aucune), les couleurs, le filet sous le titre et les
  opacités. Une planche
  qui ne dit rien suit la charte ; le bouton « Appliquer cette allure aux N
  autres » diffuse.
- **Les gabarits** : Carte, Journées, Bandeau, Photo, Texte, Fiche, Clôture.
  - **Journées** découpe l'espace en N cases (1 ou 2 colonnes) : chaque case
    porte sa portion de trace, sa portion de profil et sa légende. La boucle
    entière et la silhouette entière reviennent dans CHAQUE case, en sourdine,
    avec la seule journée en couleur — c'est ce déplacement qui fait lire une
    progression, là où quatre vues recadrées se ressembleraient toutes.
  - **Clôture** peut faire passer le titre et/ou le surtitre **au-dessus** du
    logo (onglet **Texte**, groupe « La clôture ») : annoncé puis signé, ça se
    lit comme une fin ; l'inverse se lit comme un en-tête. Le bloc entier est
    mesuré avant d'être posé, donc il reste centré quel que soit l'ordre. Passer
    une planche EN clôture la centre : c'est le seul gabarit dont la mise en
    page est symétrique, et y arriver avec un texte aligné à gauche donnait une
    planche visiblement cassée alors que personne n'avait fait ce choix.
- **Le balisage du texte** : `*gras*`, `_italique_`, `~souligné~`, `[en ambre]`,
  `[bleu: mot]`, `:col:` (icône), `- ` (point de liste), `> ` (paragraphe
  décalé). Une ligne vide sépare, chaque ligne vide en plus aère. Dans les cases
  du gabarit Journées, chaque ligne tapée reste une ligne (une légende n'est pas
  un texte suivi).
  Il marche dans **tous** les textes, y compris les petites capitales — surtitre,
  en-tête, pied de page, libellés de fiche. C'étaient les seules à ne pas
  l'accepter : on pouvait poser `:balise:` dans un titre mais pas dans le
  surtitre juste au-dessus, ce qui se découvre en tapant et n'a aucune raison
  d'être. Une icône y compte comme une lettre, alignée sur le centre optique des
  capitales.
- **La ligne de chiffres** des gabarits Carte et Photo (sous le titre) est un
  TEXTE LIBRE. Vide, une carte affiche ce que la trace sait dire d'elle-même
  (« 188 km · 12 279 m D+ ») ; écris ce que tu veux à la place, ou un espace
  pour la faire disparaître — la distance n'est pas toujours ce qu'on a envie
  d'annoncer.
- **Ajouter une icône** au vocabulaire : `apps/site/lib/liveWaypointIcons.js`
  (une clé → un composant lucide). Ce que lucide n'a pas se dessine à la maison,
  au même trait, dans `apps/site/lib/iconesMaison.js` — c'est le cas de la
  sandale. Une clé sans géométrie disparaîtrait SILENCIEUSEMENT d'une planche :
  `lib/carrouselRendu.test.js` vérifie que chacune est traçable.
- **Sur le téléphone** : ouvrir `/studio`, puis « Ajouter à l'écran d'accueil ».
  Le studio a **son propre manifeste** (`public/studio.webmanifest`) et ses
  **icônes sombres** : ça pose une icône SÉPARÉE de celle du site, qui ouvre
  directement l'espace de création en plein écran. Deux icônes identiques
  seraient un problème d'usage — d'où `pnpm -F site build:icons`, qui produit
  désormais les deux familles.
- **Hors ligne** : `public/sw.js`, enregistré avec `scope: "/studio"` et
  seulement en production. Réseau d'abord pour les navigations (sinon un
  déploiement ne serait jamais vu), cache d'abord pour les assets hachés. Il
  n'intercepte **que** les pages du studio : un bug là-dedans ne peut pas
  servir une version périmée du site public. Les tuiles du fond de carte (autre
  origine) ne sont jamais mises en cache — le studio marche au bivouac, la
  carte topo non, et c'est annoncé dans l'interface.
- **Les projets** : le travail en cours est gardé tout seul dans **IndexedDB**
  (pas `localStorage`, qui plafonne vers 5 Mo et ne stocke que du texte — une
  photo de téléphone en base64 le remplirait). Fermer l'onglet ne coûte rien.
  Un projet **nommé** ne bouge, lui, que quand on l'enregistre. Photos comprises,
  en Blob. **Exporter** produit un `.json` autoportant : IndexedDB vit dans CE
  navigateur, et un « effacer les données du site » emporte tout.
- **Accès** : `noindex, nofollow` sur toute la branche, et **aucun lien** du
  site n'y mène (l'entrée « Filtre de partage » a quitté la navbar). Ce n'est
  **pas** un contrôle d'accès : qui a l'URL entre. Décision assumée — les deux
  ateliers ne portent ni donnée, ni secret, ni appel serveur. Si ça devait
  changer un jour, la bonne réponse est une règle **Cloudflare Access** sur
  `/studio*` (gratuit, zéro code, zéro secret dans le repo), pas un mot de
  passe dans le code.
- ⚠️ **On n'écrit pas `Disallow: /studio` dans `robots.txt`** : ce fichier est
  public et lu en premier par qui cherche les coins discrets d'un site. L'y
  mettre publierait le chemin au lieu de le cacher.

---

## 9. Aide-mémoire « je veux… → je tape »

| Je veux… | Commande |
| --- | --- |
| Tout installer / réinstaller | `pnpm install` |
| Lancer le site en local | `pnpm --filter site dev` |
| Compiler le site (vérif) | `pnpm --filter site build` |
| Déployer le site (manuel) | `pnpm --filter site deploy:cf` |
| Lancer une autre app | `pnpm --filter <app> dev` |
| Compiler une autre app sans toucher au site | `pnpm --filter <app> build` |
| Créer une nouvelle app | `cp -r apps/_template apps/<nom>` → renommer `name` → `pnpm install` |
| Ajouter une dépendance à une app | `pnpm --filter <app> add <paquet>` |
| Modifier la charte (couleur/police/composant) | éditer `packages/ui/`, **puis** rebuild le site et les apps concernées |
| Tout compiler / linter (CI, vérif globale) | `pnpm build` / `pnpm lint` |
| Habiller une photo de sortie | ouvrir `/studio` (§8 bis, §8 ter) — rien à taper |
| Fabriquer un carrousel | ouvrir `/studio` (§8 ter) — rien à taper |
| Fabriquer une carte de partage a posteriori | `pnpm -F site carte:partage -- --slug <slug> --texte "…"` |
