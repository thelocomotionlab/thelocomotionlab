# CLAUDE.md — Locomotion Lab (monorepo)

> Fichier de contexte lu par Claude Code à chaque session. Garde-le court et à jour.

## Ce que c'est

Monorepo du **Locomotion Lab**. Plusieurs apps web **indépendantes** qui partagent une charte
graphique et peuvent s'interconnecter, plus un **moteur de calcul Python**. Objectif : pouvoir
développer chaque app sans casser les autres, tout en gardant une identité visuelle unique.

## Stack

- **Gestionnaire** : `pnpm` workspaces + **Turborepo** (cache de build).
- **Apps web** : **Next.js** (App Router).
  - le **site** existant est en **JavaScript** (on le laisse en JS) ;
  - **toute nouvelle app/package est en TypeScript**.
- **Charte** : Tailwind v4. Les tokens (couleurs, typo, radius, spacing) vivent **uniquement** dans
  `packages/ui` (source unique). **Police = Ubuntu** (sans + titres) et **Lora** (serif d'accent).
  ⚠️ **PAS Geist.**
- **Moteur** : **Python + FastAPI**. Calcul scientifique (`numpy`, `scipy`, `matplotlib`,
  `fitdecode`) ; rendu du rapport en **LaTeX (XeLaTeX + biber)** dans un conteneur.
- **Déploiement** :
  - le **site** → **Cloudflare Pages** (pour l'instant ; `@cloudflare/next-on-pages` + `wrangler`) ;
  - les apps qui **calculent** (twin) + le **moteur** → **VPS OVH** (conteneurs Docker).

## Arborescence (règle d'or : un dossier par module, pas de dossiers partout)

```
thelocomotionlab/
├─ apps/
│  ├─ site/                  # site actuel, migré tel quel (Next + JS), reste sur CF Pages
│  └─ twin/                  # Locomotion Twin (Next + TS) — app indépendante
│     └─ app/
│        ├─ page.tsx              # dépôt archive d'entraînement + champs course cible
│        ├─ resultat/page.tsx     # verdict de suffisance/éligibilité
│        ├─ offres/page.tsx       # formules / prix
│        └─ api/
│           ├─ eligibilite/route.ts   # appelle le moteur /preview
│           ├─ checkout/route.ts      # crée la session Stripe
│           └─ webhook/route.ts       # reçoit Stripe → demande un job au moteur
├─ packages/
│  └─ ui/                    # LA charte partagée (tokens + preset + composants)
│     ├─ tailwind-preset.js       # couleurs, typo, radius, spacing
│     ├─ globals.css              # variables CSS (@theme tokens)
│     ├─ fonts.ts                 # Ubuntu + Lora (next/font)
│     └─ components/              # Button, Card, PageShell, Prose…
├─ engine/                   # moteur Python (FastAPI) — nos scripts d'analyse, durcis
├─ infra/                    # docker-compose VPS, reverse-proxy, scripts de déploiement
├─ docs/                     # plans, ADR (décisions d'archi), runbooks
├─ pnpm-workspace.yaml
└─ turbo.json
```

## Conventions

- **Un `packages/<x>` n'est créé QUE quand au moins deux apps s'en servent réellement.** Sinon le
  code reste dans l'app. (Pas de package « au cas où » : on garde le repo lisible.)
- **TypeScript** pour tout nouveau code. Le site reste en JS jusqu'à une éventuelle migration.
- La charte vient de `packages/ui` **et de nulle part ailleurs**. Une couleur/police se change à un
  seul endroit.
- **L'infra est du CODE.** Tout ce qui définit l'état du VPS (Dockerfile, `docker-compose`, config du
  reverse-proxy, scripts de déploiement) vit dans `infra/` et est versionné. **On n'édite jamais le
  VPS à la main.**

## Garde-fous (à respecter à chaque tâche)

- **Ne jamais casser le site** : il doit continuer à builder et à se déployer sur Cloudflare Pages.
- Travailler **sur une branche**, par **commits logiques**, et **vérifier (`build` + `lint`)** avant
  de proposer un merge.
- Avant toute **opération destructive** (suppression de fichiers, réécriture d'historique git,
  commande sur le VPS) : **montrer le plan et demander validation.**
- **Aucun secret dans le repo** (variables d'environnement / secrets uniquement).
- **Données utilisateur** : les archives d'entraînement sont **supprimées immédiatement après
  analyse**. On ne conserve que le rapport (le temps du SAV) et le minimum de métadonnées.


## Le moteur (Locomotion Twin), en deux lignes

À partir de l'archive d'entraînement d'un·e athlète + la trace GPX d'une course, le moteur estime un
« jumeau » physiologique (vitesse critique, exposant d'endurance, durabilité), le confronte au coût de
la pente le long du parcours (Minetti → distance équivalente), prédit un temps d'arrivée **validé par
validation croisée sur les propres courses de l'athlète**, et produit un **plan de pacing par segment
avec fenêtres horaires**. La méthode complète est dans `docs/twin-theory.md`.
