# Locomotion Lab — Monorepo

Monorepo du **Locomotion Lab** : plusieurs apps web indépendantes qui partagent une charte
graphique unique, plus (à venir) un moteur de calcul Python. Voir [`CLAUDE.md`](./CLAUDE.md) pour le
contexte complet.

## Stack

- **Gestionnaire** : [pnpm](https://pnpm.io) workspaces + [Turborepo](https://turbo.build).
- **Apps web** : Next.js (App Router). Le **site** est en JavaScript ; toute nouvelle app est en TypeScript.
- **Charte** : Tailwind v4. Tokens, preset, polices (Ubuntu + Lora) et primitives vivent **uniquement**
  dans `packages/ui`.

## Arborescence

```
├─ apps/
│  ├─ site/        # le site actuel (Next + JS) → Cloudflare Pages
│  └─ _template/   # gabarit d'app Next + TS qui consomme packages/ui
├─ packages/
│  └─ ui/          # LA charte partagée (tokens + preset + fonts + composants)
├─ infra/          # infra-as-code (à venir)
└─ docs/           # plans, runbooks, déploiement, secrets
```

## Commandes

Prérequis : Node ≥ 22, pnpm ≥ 10 (via `corepack enable`).

```bash
pnpm install               # installe tout le workspace

pnpm --filter site dev     # lance le site en local
pnpm --filter site build   # build du site (identique à avant)

pnpm --filter _template dev # lance le gabarit

pnpm dev                   # turbo : lance toutes les apps
pnpm build                 # turbo : build toutes les apps
pnpm lint                  # turbo : lint tout le workspace
```

## Déploiement

Le site reste déployé sur **Cloudflare Pages**. Réglages à appliquer après la migration monorepo :
voir [`docs/deploy-cloudflare.md`](./docs/deploy-cloudflare.md).

## Secrets

Aucun secret n'est versionné. La liste des secrets attendus est dans
[`docs/secrets.md`](./docs/secrets.md).
