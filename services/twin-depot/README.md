# twin-depot — dépôt d'archives de la cohorte Locomotion Twin

Service Node/TS (Fastify) qui reçoit les **archives d'entraînement** des
athlètes test de la page
[/outils/twin/cohorte](https://thelocomotionlab.com/outils/twin/cohorte) et
les pose sur le **volume du VPS** avec leurs métadonnées, en attendant leur
analyse (calibration du moteur Twin) puis leur **purge**. Conteneurisé
(Docker → GHCR → VPS), derrière Caddy sur `depot.thelocomotionlab.com/twin/*`
(cf. `infra/caddy/conf.d/depot.caddy`).

> ⚠ **Pourquoi un sous-domaine dédié, en DNS-only (nuage GRIS) ?** Le proxy
> Cloudflare (plan free) plafonne les corps de requête à ~100 Mo ; une archive
> Garmin/Strava en fait couramment plusieurs centaines. `depot.*` doit donc
> pointer **directement** sur le VPS (pas de nuage orange), sinon les gros
> dépôts meurent en 413 à la bordure Cloudflare. Le certificat reste émis par
> Caddy en DNS-01, comme les autres sous-domaines.

## Modèle

- **Constantes côté service** : `twin-depot.config.json` (versionné) —
  origines CORS, débit, `maxArchiveMo` (2 Go), `montres` acceptées. ⚠ Les ids
  de `montres` et `maxArchiveMo` restent en phase avec
  `apps/site/lib/twinCohorte.mjs`, et `maxArchiveMo` avec la borne
  `request_body` de `depot.caddy`.
- **Dépôts** : métadonnées dans `depots.json` (écriture atomique tmp+rename,
  chargé en mémoire) + l'archive dans `archives/<id>/<nomFichier>` sur le
  volume `twin_depot_data`. L'archive est **streamée** vers le volume (jamais
  en mémoire), SHA-256 calculé au fil de l'eau, rename atomique une fois le
  formulaire validé ; tout échec purge le temporaire, et les tmp orphelins
  d'un crash sont purgés au démarrage. Un dépôt =
  `{ id, reference (LL-TWIN-<année>-<seq>), prenom, nom, email, montre,
  objectifs, consent, nomFichier, taille, sha256, createdAt, ip }`.

## Endpoints

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/twin/healthz` | Vivacité (compose healthcheck) + état notification. |
| POST | `/twin/depots` | Dépôt multipart `{ prenom*, nom, email*, montre*, objectifs, consent*="oui", website (honeypot), archive* (fichier) }` → `{ ok, reference }`. Trop gros → **413**, formulaire incomplet → **400** `{ error }`, débit → **429**. CORS restreint aux origines du site. |
| GET | `/twin/depots` | **Admin** (`Authorization: Bearer $TWIN_DEPOT_ADMIN_TOKEN`) : listing des dépôts (métadonnées). |
| GET | `/twin/depots/:id/archive` | **Admin** : téléchargement de l'archive (stream). |
| DELETE | `/twin/depots/:id` | **Admin** : purge du dépôt analysé (archive + métadonnées). |

Garde-fous (pattern `atelier-api`/`email-gateway`) : honeypot `website`
(robot → faux succès, rien d'écrit), limite de débit par IP en mémoire
(basse : les uploads sont lourds), montre validée contre la config, nom de
fichier nettoyé (pas de traversée de chemin).

À chaque dépôt, une **notification email** part vers
`TWIN_DEPOT_NOTIFY_EMAIL` (même relais SMTP Brevo que le reste, variables
`SMTP_*` d'`infra/.env`) — **best-effort** : son échec n'annule jamais le
dépôt (logs pour rattrapage via le listing admin).

## Données personnelles (règle du labo)

Une archive d'entraînement est une donnée personnelle **volumineuse et
sensible** (positions GPS, fréquence cardiaque). Cycle de vie strict :
déposée → téléchargée pour analyse → **supprimée immédiatement après**
(`DELETE` admin ci-dessus). On ne conserve que le rapport (le temps du SAV)
et le minimum de métadonnées. Pas de sauvegarde du volume — il ne doit
jamais rien contenir de durable — mais **surveiller l'espace disque** tant
que des dépôts attendent l'analyse.

## Rapatrier un dépôt (côté Valentin)

**La voie normale**, depuis ton poste — ni jeton ni URL à manipuler (SSH + docker,
le jeton de purge est lu dans `infra/.env` sur le VPS et n'en sort jamais) :

```bash
services/twin-depot/scripts/depots.sh                 # ce qui attend
services/twin-depot/scripts/depots.sh get Crasse \
  services/twin-engine/_seed/cas_validation/Crasse/archives
# … analyse (DIAGNOSTIC §8 / golden réel), puis :
services/twin-depot/scripts/depots.sh purge <id>
```

`get` accepte un id **ou** un prénom, résout le nom de fichier tout seul, vérifie le
SHA-256 après transfert (et supprime la copie si elle diffère). Hôte et chemin
surchargeables par `LAB_VPS` / `LAB_INFRA`.

> ⚠ **`get` refuse un dossier de destination non vide**, et c'est volontaire :
> `twin_engine.ingest` déballe tout le dossier **sans dédoublonner** — deux exports
> qui se recouvrent = activités comptées deux fois, courbe record et durabilité
> faussées en silence. Un athlète = une archive à la fois.

Où vivent les données, si tu dois y aller à la main : volume Docker
`locomotionlab_twin_depot_data`, soit `/data/depots.json` (index) et
`/data/archives/<id>/<nomFichier>` vus du conteneur.

**Voie de secours** (depuis n'importe où, sans SSH) — l'API admin :

```bash
TOKEN=...   # TWIN_DEPOT_ADMIN_TOKEN d'infra/.env
BASE=https://depot.thelocomotionlab.com/twin
curl -s -H "Authorization: Bearer $TOKEN" $BASE/depots | jq
curl -H "Authorization: Bearer $TOKEN" -OJ $BASE/depots/<id>/archive
curl -X DELETE -H "Authorization: Bearer $TOKEN" $BASE/depots/<id>
```

## Dev local

```bash
pnpm --filter @locomotionlab/twin-depot test    # vitest
pnpm --filter @locomotionlab/twin-depot dev     # build + run sur :3000
curl -s localhost:3000/twin/healthz | jq
```

Côté site : `NEXT_PUBLIC_TWIN_DEPOT_API=http://localhost:3000/twin pnpm -F site dev`.

## Déploiement

1. CI : `.github/workflows/deploy-vps.yml` construit et pousse
   `ghcr.io/thelocomotionlab/twin-depot` à chaque push sur `main`.
2. DNS : créer `depot.thelocomotionlab.com` → IP du VPS, **DNS only (nuage
   gris)** — cf. l'avertissement ci-dessus.
3. VPS : renseigner `TWIN_DEPOT_ADMIN_TOKEN` (`openssl rand -hex 24`) et
   `TWIN_DEPOT_NOTIFY_EMAIL` dans `infra/.env`, puis `cd infra && ./deploy.sh`.
4. Site : poser `NEXT_PUBLIC_TWIN_DEPOT_API=https://depot.thelocomotionlab.com/twin`
   dans l'environnement de build Cloudflare Pages et rebuilder — sans cette
   variable, la page s'affiche mais l'envoi renvoie vers /contact (aucune casse).
