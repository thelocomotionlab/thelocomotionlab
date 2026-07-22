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
| GET | `/ateliers/healthz` | Vivacité (compose healthcheck) + état pdf/email. |
| GET | `/ateliers/places` | Décompte public `{ places: { [id]: { capacity, registered, remaining, full, status } } }` — CORS `*`, `no-store`. |
| POST | `/ateliers/inscriptions` | **Liste d'attente** : `{ atelierId, prenom, email, website, waitlist: true }`. **Inscription complète** (page `/pratiquer/inscription/[slug]`) : `{ atelierId, website, fiche, contenu }` — validation serveur des coches obligatoires (→ **400** `{ error: "fiche_incomplete", champs }`), complet → **409**, passé → **410**, même email → idempotent (`fiche: "deja_inscrit"`, pas de renvoi d'email). CORS restreint aux origines du site. |
| GET | `/ateliers/inscriptions?atelier=<id>` | **Admin** (`Authorization: Bearer $ATELIER_ADMIN_TOKEN`) : listing (avec fiches) pour préparer l'atelier. |
| DELETE | `/ateliers/inscriptions?atelier=<id>` | **Admin** : purge des données perso après l'atelier. |

Garde-fous (pattern `email-gateway`) : honeypot `website` (robot → faux
succès), limite de débit par IP en mémoire, validation email/prénom.

## Fiche PDF + email récapitulatif

À chaque inscription complète, le service :

1. tire une **référence de dossier** (`LL-ATL-<année>-<seq>`, compteur
   persistant jamais réutilisé), horodate (Europe/Paris), relève l'IP et
   calcule l'**empreinte SHA-256** des données soumises (même canonisation
   que `twin_engine.fiche` — le PDF la porte, le store la garde) ;
2. demande le **PDF** à twin-engine (`POST {TWIN_ENGINE_URL}/fiche`, réseau
   docker interne — TeXLive et la classe `locomotionreport` vivent là-bas) ;
3. envoie l'**email récapitulatif** avec le PDF en pièce jointe (SMTP Brevo,
   variables `SMTP_*` d'`infra/.env` — cf. `docs/email-setup.md` §3).

PDF et email sont **best-effort** : leur échec n'annule jamais l'inscription
(statut `fiche` dans la réponse : `envoyee`, `envoyee_sans_pdf`,
`email_echec`, `email_non_configure` — et logs pour rattrapage manuel).

Le **contenu** de la fiche (consignes de sécurité, questions de santé) est
émis par la page du site (`apps/site/lib/inscriptionContent.mjs`, source
unique) et traverse ce service sans y être dupliqué : modifier la page
suffit, le PDF suit.

## Données personnelles

Coordonnées + contact d'urgence + fiche de consentement validée (preuve,
conservée 10 ans — prescription en dommage corporel), stockées sur le volume
`atelier_data`. Le commentaire santé libre est purgé avec l'atelier
(`DELETE` admin ci-dessus, après export de la fiche si besoin). Prévoir la
sauvegarde du volume tant que des fiches actives y vivent.

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
