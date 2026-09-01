# Déploiement du site sur Cloudflare Pages (après passage en monorepo)

> **TL;DR** — Le code du site est passé de la racine du repo à `apps/site/`. Le seul réglage à
> changer côté Cloudflare Pages est le **répertoire racine du build = `apps/site`**. Rien d'autre ne
> change : même projet, même domaine, même sortie `.vercel/output/static`.
>
> ⚠️ Ce document est une **procédure pour toi** : Claude n'a rien modifié sur Cloudflare.

## Ce qui change

| Avant (repo = site) | Après (monorepo) |
| --- | --- |
| `package.json`, `app/`… à la racine | tout sous `apps/site/` |
| gestionnaire : npm (`package-lock.json`) | pnpm workspaces (`pnpm-lock.yaml` à la racine) |
| build lancé à la racine | build lancé dans `apps/site/` |

Le **projet Cloudflare Pages** (`thelocomotionlab-website`), le **domaine** et le mécanisme
`@cloudflare/next-on-pages` → `.vercel/output/static` restent identiques.

---

## Réglage recommandé (intégration Git Cloudflare Pages)

Dashboard Cloudflare → **Workers & Pages** → projet `thelocomotionlab-website` →
**Settings** → **Builds & deployments** → **Build configuration** → *Edit* :

| Champ | Valeur |
| --- | --- |
| **Framework preset** | `Next.js` (ou *None* — la commande ci‑dessous suffit) |
| **Build command** | `npx @cloudflare/next-on-pages` |
| **Build output directory** | `.vercel/output/static` |
| **Root directory** *(Advanced)* | `apps/site` |

Puis **Settings → Variables and Secrets** (build) :

| Variable | Valeur | Pourquoi |
| --- | --- | --- |
| `NODE_VERSION` | `22` | aligne le build sur l'environnement local (Node 22) |

> **pnpm** : l'image de build Cloudflare (v2) lit le champ `packageManager` du `package.json`
> **racine** (`pnpm@10.33.0`) via corepack et installe avec pnpm. Le `pnpm-lock.yaml` (racine) doit
> rester **committé et à jour** (il l'est). Comme Cloudflare clone **tout** le repo, `pnpm install`
> lancé depuis `apps/site/` remonte au `pnpm-workspace.yaml` racine et installe **tout le workspace**
> → la dépendance `@locomotionlab/ui` est résolue (symlink). Si jamais Cloudflare retombait sur npm,
> voir l'option B.

### Compatibility flags (inchangé)

`@cloudflare/next-on-pages` génère des Functions qui requièrent le flag **`nodejs_compat`**. Si c'était
déjà configuré, **ne touche à rien**. Sinon : **Settings → Functions → Compatibility flags** → ajouter
`nodejs_compat` pour *Production* **et** *Preview*.

---

## Build du site dans le monorepo : webpack + racine par phase (`next.config.mjs`)

Next 16 compile par défaut avec **Turbopack**. Mais sous le builder Vercel utilisé par
`@cloudflare/next-on-pages` (qui lance `vercel build` **dans** `apps/site/`), Turbopack **infère mal
la racine** du workspace pnpm : il se confine à `apps/site/` et ne peut plus suivre les symlinks vers
les `node_modules` hoistés à la racine → échec « *inferred your workspace root… couldn't find
next/package.json* ». Deux réglages, déjà committés, règlent ça :

| Réglage | Fichier | Pourquoi |
| --- | --- | --- |
| `build` = **`next build --webpack`** | `apps/site/package.json` | webpack ne confine pas la résolution à une racine → il suit les symlinks pnpm. `next dev`, lui, reste sur Turbopack (rapide). |
| **Racine du workspace choisie par _phase_** (`turbopack.root` **=** `outputFileTracingRoot`) | `apps/site/next.config.mjs` | Next 16 impose ces deux racines **identiques**. La config est donc une **fonction de la phase** : racine = **monorepo** en `dev` (Turbopack doit suivre le symlink `next`), racine = **app** en `build` (sinon le builder Vercel, lancé dans `apps/site`, **dédouble** le chemin de sortie → `apps/site/apps/site/.next`, ENOENT). |

> Pourquoi une fonction et pas deux valeurs fixes ? `next dev` (Turbopack) exige la racine
> **monorepo** pour résoudre `next` (symlink pnpm), alors que le build a besoin de la racine **app**
> pour ne pas dédoubler le chemin — et Next **refuse que les deux racines diffèrent**. Choisir la
> racine selon la phase satisfait les deux cas **sans** le warning « *must have the same value* », et
> sans casser `next dev`.

> Conséquence pratique : `pnpm --filter site build` et le déploiement utilisent **le même bundler
> (webpack)** — ce que tu valides en local correspond à ce qui part sur Cloudflare. Si un jour
> `next-on-pages` gère proprement les builds Turbopack en monorepo, on pourra retirer `--webpack` et
> simplifier ce réglage.

---

## Option B — alternative robuste (si la détection pnpm/workspace pose problème)

Garder **Root directory = (vide / racine du repo)** et viser `apps/site` depuis la commande :

| Champ | Valeur |
| --- | --- |
| **Build command** | `pnpm install && cd apps/site && npx @cloudflare/next-on-pages` |
| **Build output directory** | `apps/site/.vercel/output/static` |
| **Root directory** | *(vide)* |

Avantage : Cloudflare voit le `pnpm-lock.yaml` et le `packageManager` **à la racine** sans ambiguïté,
installe tout le workspace, puis ne fait que `cd` pour builder le site.

---

## Déploiement manuel depuis le local (inchangé)

Le script `deploy:cf` du site fonctionne toujours, lancé **dans le contexte du package `site`** :

```bash
pnpm install
pnpm --filter site deploy:cf
# = npx @cloudflare/next-on-pages && npx wrangler pages deploy .vercel/output/static \
#     --project-name=thelocomotionlab-website
```

`wrangler` te demandera de te connecter au compte Cloudflare la première fois (jamais de token dans le
repo — cf. `docs/secrets.md`).

---

## Checklist de migration (à faire une seule fois)

- [ ] Mettre **Root directory = `apps/site`** (option A) **ou** adapter la build command (option B).
- [ ] Vérifier **Build command** = `npx @cloudflare/next-on-pages` et **Output** = `.vercel/output/static`.
- [ ] Ajouter la variable de build **`NODE_VERSION=22`**.
- [ ] Vérifier que **`nodejs_compat`** est présent (Production + Preview).
- [ ] Lancer un déploiement (push sur la branche de prod ou *Retry deployment*) et vérifier le rendu.
- [ ] Confirmer que le `pnpm-lock.yaml` racine est bien committé.

> Tant que ces réglages ne sont pas appliqués, **un push casserait le build Cloudflare** (il
> chercherait `package.json` à la racine, qui n'y est plus). Applique la checklist **avant** de pousser
> la branche de production.

---

## Livrer une branche de dév, en une commande

Le cycle « je récupère la branche, je fusionne dans `main`, je pousse, je déploie » tient dans :

```bash
pnpm ship                       # la branche courante
pnpm ship claude/ma-branche     # une branche nommée
pnpm ship --deploy              # …et déploie depuis ici, sans passer par la CI
```

`scripts/ship.sh` refuse de tourner sur un arbre sale, et fusionne en
**fast-forward seulement** : si `main` a bougé de son côté, il s'arrête au lieu de fabriquer un
commit de merge qu'on n'a pas demandé.

### …et sans le déploiement manuel du tout

`.github/workflows/deploy-site.yml` déploie le site à chaque push sur `main` qui touche
`apps/site/`, `packages/ui/`, `packages/tracking/` ou le lockfile — après `lint` **et** `test`, pour
que rien de cassé ne parte en ligne. C'est le pendant Pages de `deploy-vps.yml`, et le
« git-push-to-deploy » de l'[ADR 0001](adr/0001-deploiement-vps.md).

**Tant que ses deux secrets ne sont pas posés, le job se saute** : il ne casse rien, et
`pnpm -F site deploy:cf` reste la voie manuelle. Pour l'activer, dans GitHub →
**Settings → Secrets and variables → Actions** :

| Secret | Où le trouver |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | dashboard Cloudflare → My Profile → API Tokens → *Create Token*, permission **Cloudflare Pages: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | dashboard Cloudflare, colonne de droite de la page d'accueil du compte |

Aucune valeur ne descend dans le repo (cf. [`secrets.md`](secrets.md)).

> **L'autre voie** — l'intégration Git de Cloudflare Pages (section précédente) fait la même chose
> sans secret GitHub, mais construit sur l'image Cloudflare et ne passe ni le lint ni les tests
> avant de publier. Les deux ensemble déploieraient deux fois : n'en garde qu'une.
