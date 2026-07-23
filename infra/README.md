# infra/

Infrastructure **as code** du Locomotion Lab : l'état cible du **VPS OVH** en tant qu'**hôte à
conteneurs** (reverse-proxy + apps), déployé depuis ce repo, HTTPS automatique.

> Règle d'or (cf. [`CLAUDE.md`](../CLAUDE.md)) : tout ce qui définit l'état du VPS vit ici et est
> versionné. **On n'édite jamais le VPS à la main.**
>
> Décision d'archi : [`docs/adr/0001-deploiement-vps.md`](../docs/adr/0001-deploiement-vps.md) ·
> Commandes serveur pas-à-pas : [`docs/runbook-vps.md`](../docs/runbook-vps.md) · Cloudflare devant
> le VPS : [`docs/cloudflare-vps.md`](../docs/cloudflare-vps.md).

## Ce que c'est (en bref)

Un seul reverse-proxy **Caddy** (HTTPS automatique via Let's Encrypt) route les sous-domaines vers
les conteneurs d'apps. Les images d'apps/services sont **construites par la CI** (GitHub Actions) et
poussées sur **GHCR** ; le VPS ne fait que les **tirer et (re)lancer** (`deploy.sh`). Traccar continue
de tourner sur l'hôte ; Caddy le **routera** (sans le migrer) lors d'une bascule ultérieure et réversible.

Le **back live-tracking** (`services/tracking-cache`) tourne aussi en conteneur : il produit les
`live-*.json` dans le volume `live_json` (servi par Caddy à la bascule) et se pilote par la commande
**`./track`** (cf. [`docs/live-tracking.md`](../docs/live-tracking.md)).

## Organisation

```
infra/
├─ compose.yml             # la stack : service `caddy` (proxy) + service `template` (app de test)
├─ .env.example            # modèle de variables/secrets → copier en .env (NON versionné)
├─ deploy.sh               # pull des images + (re)up des services (lancé sur le VPS)
└─ caddy/
   ├─ Dockerfile           # Caddy recompilé avec le plugin DNS Cloudflare (DNS-01)
   ├─ Caddyfile            # options globales (ACME DNS-01) + import de conf.d/*.caddy
   └─ conf.d/              # UNE route par fichier (un domaine = un fichier)
      ├─ template.caddy            # sous-domaine de test (ACTIF)
      ├─ tracking.caddy            # Traccar + live-*.json (ACTIF depuis la bascule)
      ├─ liste.caddy               # Listmonk (liste email)
      ├─ api.caddy                 # api.thelocomotionlab.com — /journal/* (live-journal)
      ├─ depot.caddy               # depot.thelocomotionlab.com — /twin/* (twin-depot, DNS gris)
      ├─ live-redirect.caddy       # live.thelocomotionlab.com → 301 /live du site
      └─ twin-engine.caddy.disabled # moteur Twin (DRAFT, ignoré tant que « .disabled »)
```

> **Fichiers liés hors `infra/`** (ils ne *peuvent* pas vivre ici, par nature) :
> `apps/_template/Dockerfile` (recette de build de l'app — comme son `package.json` ; son contexte de
> build est la racine du repo), le `.dockerignore` racine (emplacement du contexte Docker), et
> `.github/workflows/deploy-vps.yml` (emplacement imposé par GitHub). `infra/` garde
> l'**orchestration** (proxy, compose, déploiement).

## Deux modes (un seul jeu de fichiers, piloté par `.env`)

| Mode | Ports hôte de Caddy | Effet sur Traccar | Quand |
| --- | --- | --- | --- |
| **Validation** (défaut) | `8080:80`, `8443:443` | **aucun** (80/443 restent à nginx) | mise en place + test du template |
| **Bascule** | `80:80`, `443:443` | Caddy sert Traccar à la place de nginx | étape *gated* du runbook, après snapshot+backup+`nginx -T` |

On bascule en éditant `HTTP_PORT`/`HTTPS_PORT` dans `.env` : la route Traccar
(`conf.d/tracking.caddy`) et le montage du volume `live_json` (produit par le service
`tracking-cache`) sont déjà committés. La route reproduit fidèlement nginx : UI,
`/api/public/*` + Bearer (token via `.env`), CORS, 2 fichiers servis (`live-positions.json`,
`live-timer.json` — `live-stats.json` n'est plus servi), CSP. Détails et rollback : runbook étape 4.

## Déployer (sur le VPS)

```bash
cd infra
cp .env.example .env     # puis renseigner les valeurs (cf. docs/secrets.md / docs/cloudflare-vps.md)
./deploy.sh              # build caddy + pull des images + up -d
```

## Ajouter un futur sous-domaine d'app (ex. `twin`, `api`/moteur)

1. Conteneuriser l'app (un `apps/<app>/Dockerfile` à la `apps/_template/Dockerfile`) et la faire
   construire/pusher par la CI (ajouter un job dans `deploy-vps.yml`).
2. L'ajouter à `compose.yml` (service avec `expose: 3000`/`8000`, réseau `web`).
3. Créer `caddy/conf.d/<app>.caddy` :

   ```caddy
   twin.thelocomotionlab.com {
       encode zstd gzip
       reverse_proxy twin:3000
   }
   ```

4. `./deploy.sh`. Caddy obtient le certificat tout seul (DNS-01) ; ajouter l'enregistrement DNS
   Cloudflare proxifié (cf. `docs/cloudflare-vps.md`).

## Secrets

Jamais dans le repo. `infra/.env` (git-ignoré) porte `CF_API_TOKEN` (DNS-01), `TRACCAR_API_TOKEN`
(injection Bearer Traccar, utile seulement à la bascule) et les identifiants Listmonk
(`LISTMONK_DB_PASSWORD`, `LISTMONK_ADMIN_*`). Seul `infra/.env.example` (sans valeurs) est
versionné. Voir [`docs/secrets.md`](../docs/secrets.md).

## Sauvegardes

### Liste email (Listmonk)

La base Listmonk (`listmonk_db`) contient la **liste email** — des données personnelles dont on est
responsable et qu'on ne veut pas perdre. Sauvegarde simple (à lancer à la main après chaque campagne,
ou en cron hebdomadaire sur le VPS) :

```bash
cd infra && docker compose exec -T listmonk-db pg_dump -U listmonk listmonk | gzip \
  > ~/backups/listmonk-$(date +%F).sql.gz
```

Restauration : `gunzip -c fichier.sql.gz | docker compose exec -T listmonk-db psql -U listmonk listmonk`.
Le snapshot OVH couvre aussi ce volume, mais un dump ciblé est plus simple à restaurer.

### Journal du live (`live_journal_data`)

Le volume `live_journal_data` porte le **journal de bord et les médias de l'aventure en cours**
(y compris les sources originales dans `private/sources/`) : pendant l'aventure c'est un contenu
**irremplaçable** — un vocal perdu est perdu pour toujours. Sauvegarde (quotidienne en cron
**pendant l'aventure**, à la main pour le test 24 h ; le nom du volume est préfixé par le projet
compose `locomotionlab`) :

```bash
docker run --rm -v locomotionlab_live_journal_data:/data:ro -v ~/backups:/out alpine \
  tar czf /out/live-journal-$(date +%F).tar.gz -C /data .
```

Cron quotidien (à poser à J-1, à retirer au retour — cf. runbook du chantier 2, PR5) :

```cron
30 3 * * * docker run --rm -v locomotionlab_live_journal_data:/data:ro -v $HOME/backups:/out alpine tar czf /out/live-journal-$(date +\%F).tar.gz -C /data .
```

Restauration (service arrêté : `docker compose stop live-journal`) :

```bash
docker run --rm -v locomotionlab_live_journal_data:/data -v ~/backups:/in alpine \
  sh -c "rm -rf /data/* && tar xzf /in/live-journal-YYYY-MM-DD.tar.gz -C /data"
```

Les messages privés des visiteurs ne sont **jamais** dans ce volume (aucun stockage, transmission
directe vers Telegram) : la sauvegarde ne contient que le contenu publié par Valentin.

## Rollback express

```bash
cd infra && docker compose down      # arrête Caddy + apps
# puis, si on avait basculé Traccar : réactiver le site nginx et `systemctl start nginx`
```

Le filet le plus large reste le **snapshot OVH** (runbook étape 0.A).
