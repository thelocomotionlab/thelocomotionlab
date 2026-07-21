# atelier-api — inscriptions aux ateliers (page Pratiquer)

Service Node/TS (Fastify) qui tient le **décompte des places** des ateliers et
enregistre les **inscriptions** (et la liste d'attente) de la page
[/pratiquer](https://thelocomotionlab.com/pratiquer). Conteneurisé
(Docker → GHCR → VPS), derrière Caddy sur `api.thelocomotionlab.com/ateliers/*`
(cf. `infra/caddy/conf.d/api.caddy`).

## Modèle

- **Catalogue côté API** : `atelier-api.config.json` (versionné) — `id`,
  `capacity`, `status` (`open` | `full` forcé | `past`). ⚠ Les `id` restent en
  phase avec `apps/site/lib/ateliers.mjs` (contenu/SEO côté site).
- **Inscriptions** : `inscriptions.json` sur le volume `atelier_data`
  (écriture atomique tmp+rename, chargé en mémoire). Une inscription =
  `{ id, atelierId, prenom, email, waitlist, createdAt }`, dédupliquée par
  `(atelierId, email)`. Mono-instance + Node mono-thread → la vérification de
  capacité et l'insertion sont synchrones, pas de course.

## Endpoints

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/ateliers/healthz` | Vivacité (compose healthcheck). |
| GET | `/ateliers/places` | Décompte public `{ places: { [id]: { capacity, registered, remaining, full, status } } }` — CORS `*`, `no-store`. |
| POST | `/ateliers/inscriptions` | Inscription `{ atelierId, prenom, email, website (honeypot), waitlist? }`. Complet sans `waitlist:true` → **409** `{ error: "complet", places }` (le front bascule la carte). Atelier `past` → **410**. Même email → même réponse qu'une création (idempotent, pas d'énumération). CORS restreint aux origines du site. |
| GET | `/ateliers/inscriptions?atelier=<id>` | **Admin** (`Authorization: Bearer $ATELIER_ADMIN_TOKEN`) : listing pour préparer l'atelier. |
| DELETE | `/ateliers/inscriptions?atelier=<id>` | **Admin** : purge des données perso après l'atelier. |

Garde-fous (pattern `email-gateway`) : honeypot `website` (robot → faux
succès), limite de débit par IP en mémoire, validation email/prénom.

## Données personnelles

Prénom + email, c'est tout — conservés **le temps d'organiser l'atelier**,
purgés ensuite (`DELETE` admin ci-dessus). Le volume `atelier_data` n'a pas
besoin de sauvegarde longue durée.

## Emails (chantier suivant)

Le POST d'inscription porte un `TODO` où brancher la **confirmation
Listmonk/Brevo** (cf. `docs/email-setup.md`) quand la liste sera basculée.
En attendant, le site affiche la confirmation à l'écran.

## Dev local

```bash
pnpm --filter @locomotionlab/atelier-api test    # vitest
pnpm --filter @locomotionlab/atelier-api dev     # build + run sur :3000
curl -s localhost:3000/ateliers/places | jq
```

Côté site : `NEXT_PUBLIC_ATELIER_API=http://localhost:3000/ateliers pnpm -F site dev`.

## Déploiement

1. CI : `.github/workflows/deploy-vps.yml` construit et pousse
   `ghcr.io/thelocomotionlab/atelier-api` à chaque push sur `main`.
2. VPS : renseigner `ATELIER_ADMIN_TOKEN` dans `infra/.env`
   (`openssl rand -hex 24`), puis `cd infra && ./deploy.sh`.
3. Site : poser `NEXT_PUBLIC_ATELIER_API=https://api.thelocomotionlab.com/ateliers`
   dans `apps/site/.env.production` et rebuilder — sans cette variable, la page
   garde les compteurs statiques et le repli email (aucune casse).
