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
- **Moteur** : **Python + FastAPI**. Calcul scientifique (`numpy`, `matplotlib`,
  `fitdecode`) ; rendu du rapport en **LaTeX (XeLaTeX + biber)** dans un conteneur.
- **Déploiement** :
  - le **site** → **Cloudflare Pages** (pour l'instant ; `@cloudflare/next-on-pages` + `wrangler`) ;
  - les apps qui **calculent** (twin) + le **moteur** → **VPS OVH** (conteneurs Docker).

## Arborescence (règle d'or : un dossier par module, pas de dossiers partout)

```
thelocomotionlab/
├─ apps/
│  ├─ _template/             # app modèle (Next + TS + charte ui) — point de départ des
│  │                         #   nouvelles apps ; image Docker de test de la chaîne CI→VPS
│  ├─ site/                  # site public (Next + JS, App Router), CF Pages
│  │  ├─ app/                     # IA refonte 2026 : comprendre (la science, type "article"),
│  │  │                           #   explorer (le terrain : récits + projets fusionnés),
│  │  │                           #   quete (ex-manifeste), outils/twin (teaser), live (hub),
│  │  │                           #   about, contact, soutenir, recherche ; /articles /projets
│  │  │                           #   → 308 (générées au build, lib/legacyRedirects.mjs) ;
│  │  │                           #   /labo et /manifeste → 308 en dur dans next.config.mjs
│  │  └─ lib/contentRoutes.mjs    # source unique slug/type→pilier + collision de slugs
│  └─ (twin/ — PRÉVU, n'existe pas encore : app Next + TS de vente/dépôt du
│     Locomotion Twin ; appellera le moteur /preview, Stripe checkout/webhook)
├─ packages/
│  ├─ ui/                    # LA charte partagée (tokens + preset + composants)
│  │  └─ src/
│  │     ├─ tailwind-preset.js    # preset (plugin typography)
│  │     ├─ styles/theme.css      # tokens @theme (couleurs, typo, ombres)
│  │     ├─ fonts.ts              # Ubuntu + Lora (next/font)
│  │     └─ components/           # Button, Field, PageShell
│  └─ tracking/              # live-tracking partagé (carte, replay, useTrackingData)
├─ services/                # services backend conteneurisés (Docker → GHCR → VPS)
│  ├─ tracking-cache/       # back live-tracking (Node/TS)
│  ├─ email-gateway/        # Worker CF : formulaires site → Listmonk (double opt-in)
│  ├─ live-journal/         # journal de bord du live (Node/TS + Fastify) : webhook Telegram
│  │                        #   → journal.json + médias (volume servi par Caddy), messages
│  │                        #   privés visiteurs, cartes OG, export archive.json
│  └─ twin-engine/          # moteur Locomotion Twin (Python/FastAPI + TeXLive)
│     ├─ src/twin_engine/        # ingest (multi-format → canonique), course, twin,
│     │                          #   calibration, predict, sufficiency, pacing,
│     │                          #   report (figures + LaTeX), jobs (SQLite), api, cli
│     ├─ twin.config.json        # constantes scientifiques (règles fixes, twin-theory §8)
│     ├─ examples/nice-100m.json # carnet de route de référence (golden test)
│     ├─ Dockerfile              # Python + TeXLive (contexte de build = racine)
│     └─ compose.local.yml       # lancement local pour tester l'API
├─ infra/                    # docker-compose VPS (Caddy, tracking-cache, live-journal,
│                            #   twin-engine, Listmonk+Postgres = liste email auto-hébergée),
│                            #   déploiement
├─ docs/                     # plans, ADR (décisions d'archi), runbooks
├─ pnpm-workspace.yaml
└─ turbo.json
```

## Docs internes

- `docs/manuel-monorepo.md` — **mode d'emploi** : compiler/déployer le site, travailler sur une autre
  app sans casser le site, créer une app, dépannage. (Point d'entrée pour l'usage quotidien.)
- `docs/deploy-cloudflare.md` — réglages Cloudflare Pages après passage en monorepo.
- `docs/secrets.md` — gestion des secrets (aucune valeur dans le repo).

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


## Protocole de changement du moteur (services/twin-engine)

Le moteur est validé empiriquement — tout changement suit ce protocole :

- **Golden intact ou re-capturé.** Les tests déterministes committés (`test_golden.py`,
  `test_twin.py`, `test_config.py`, `test_montagnhard_robustness.py`) restent verts. Le golden
  RÉEL Nice (`pytest -k nice`, archive réelle via `TWIN_NICE_ARCHIVE`/`TWIN_NICE_GPX`) ne tourne
  QUE chez Valentin ; s'il sort de ses tolérances, on ARRÊTE et on décide de re-capturer les
  références (twin-theory §12), on ne les « force » pas.
- **Tout changement de comportement passe derrière un flag de config** (défaut = comportement
  actuel), comme `maximality_mode`/`terrain_term`. Aucune constante ni chemin en dur.
- **Preuve obligatoire avant merge** : `pytest` (suite committée) + `PYTHONPATH=src python -m
  tools.ab_montagnhard` (tableau σ/MAE/interp/extrap). On colle les chiffres réels, on ne les
  suppose jamais.
- **Le fixture `genuine_ultras_montagnhard.fixture.json` ne contient QUE des agrégats dérivés**
  (pas de trace brute). Un changement qui touche le calcul des *features* (D+, vga…) est INVISIBLE
  au fixture : son effet réel ne se mesure qu'en regénérant le fixture depuis l'archive réelle
  (Valentin, DIAGNOSTIC §8) ou via le golden réel. Ne jamais présenter un A/B inchangé comme
  « preuve que le correctif marche » dans ce cas.
- **`DIAGNOSTIC.md` est le carnet de labo** : chaque correctif y est consigné avec sa preuve A/B ;
  une approche testée et écartée y est documentée avec sa raison (à ne pas re-tenter).