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

pnpm --filter site deploy     # 5. déployer le site sur Cloudflare Pages (manuel)
pnpm build                    # 6. tout compiler (turbo) — utile en vérif globale / CI
```

Remplace `site` par le nom d'une autre app (`_template`, demain `twin`, …) pour faire la même chose
**sur cette app uniquement**, sans toucher au site. Tout le reste de ce document explique *pourquoi*
et *comment* ça reste cloisonné.

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
pnpm --filter site deploy
# = npx @cloudflare/next-on-pages          (adapte le build Next pour Cloudflare)
#   && npx wrangler pages deploy .vercel/output/static --project-name=thelocomotionlab-website
```

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
| `app/layout.tsx` | importe les polices de marque : `import { ubuntu, lora } from "@locomotionlab/ui/fonts"` |
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
| Une modif de charte ne se voit pas dans une app | cache `.next` / `@source` | relancer le `dev`, ou `rm -rf apps/<app>/.next` |
| `pnpm build` ne recompile rien alors que j'ai changé du code | cache turbo (faux positif rare) | `pnpm build --force` |
| J'ai ajouté un paquet et une autre app a un comportement bizarre | dépendance ajoutée à la racine au lieu de l'app | la déplacer : `pnpm --filter <app> add <paquet>` |
| Versions Node/pnpm douteuses | machine pas alignée | `node -v` ≥ 22, `pnpm -v` ≥ 10 |

---

## 9. Aide-mémoire « je veux… → je tape »

| Je veux… | Commande |
| --- | --- |
| Tout installer / réinstaller | `pnpm install` |
| Lancer le site en local | `pnpm --filter site dev` |
| Compiler le site (vérif) | `pnpm --filter site build` |
| Déployer le site (manuel) | `pnpm --filter site deploy` |
| Lancer une autre app | `pnpm --filter <app> dev` |
| Compiler une autre app sans toucher au site | `pnpm --filter <app> build` |
| Créer une nouvelle app | `cp -r apps/_template apps/<nom>` → renommer `name` → `pnpm install` |
| Ajouter une dépendance à une app | `pnpm --filter <app> add <paquet>` |
| Modifier la charte (couleur/police/composant) | éditer `packages/ui/`, **puis** rebuild le site et les apps concernées |
| Tout compiler / linter (CI, vérif globale) | `pnpm build` / `pnpm lint` |
