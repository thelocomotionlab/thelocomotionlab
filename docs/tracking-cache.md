# Back live-tracking — `services/tracking-cache`

> Le back du live-tracking, **conteneurisé et versionné** (fini les scripts épars sur le VPS).
> Il interroge Traccar, filtre/corrige les positions, et écrit `live-positions.json` + le chrono
> dans un **volume partagé** que Caddy sert. Pilotage par une commande unique : **`./track`**.
>
> 👉 **Pour l'usage complet (front + back, balises `.md`, replays, appareil émetteur, changement de
> deviceId) : [`live-tracking-guide.md`](./live-tracking-guide.md).** Ce fichier-ci se concentre sur
> le service back et son déploiement.
>
> Archi : [`CLAUDE.md`](../CLAUDE.md) · ADR : [`docs/adr/0001-deploiement-vps.md`](./adr/0001-deploiement-vps.md)
> · Infra : [`infra/README.md`](../infra/README.md) · Runbook VPS : [`docs/runbook-vps.md`](./runbook-vps.md).

## Ce que c'est

```
Traccar (/api, hôte :8082)
   │  (Bearer token, lu depuis infra/.env — JAMAIS dans le repo)
   ▼
services/tracking-cache  (conteneur, boucle interne)
   │  fetch incrémental → dédup → cache brut → filtres + corrections
   ▼
volume `live_json`
   ├─ live-positions.json   ← carte + profil (contrat front inchangé)
   ├─ live-timer.json       ← chrono { running, startTime, stopTime }
   ├─ live-positions-cache.json  ← cache brut interne (positions Traccar)
   └─ live-control.json     ← fenêtre de collecte (interne)
   ▼
Caddy  →  tracking.thelocomotionlab.com/live-positions.json (à la bascule)
   ▼
www.thelocomotionlab.com (site) : embed inline via @locomotionlab/tracking
```

**Ce qui a été corrigé vs l'ancien `live-cache.mjs` :**
- **Plus de date en dur ni de hack `sed` sur le source.** La fenêtre de collecte est posée au
  **runtime** par `track start` (`live-control.json.windowStartIso`).
- **Fetch incrémental** (depuis le dernier point en cache) au lieu de re-télécharger toute la
  fenêtre à chaque passage → bien plus léger.
- **Boucle interne** au conteneur (remplace le timer systemd), **idle** tant qu'aucune session
  n'est active (zéro requête Traccar au repos).
- **Token hors-repo** : uniquement `TRACCAR_API_TOKEN` dans `infra/.env`. Les coefficients/seuils
  (non secrets) vivent dans `services/tracking-cache/tracking.config.json` (versionné).
- `live-stats.json` **déprécié** (n'était plus consommé par le front) : plus produit, plus servi.

Le contrat de sortie (`live-positions.json`, `live-timer.json`) est **identique** à l'ancien :
rien à changer côté front.

## Exploitation quotidienne — la commande `track`

Depuis le VPS, à la racine du repo (`/opt/locomotionlab`) :

| Commande | Effet |
| --- | --- |
| `./track start` | Démarre le chrono **et** ouvre la fenêtre de collecte = maintenant. La boucle se met à collecter. |
| `./track stop` | Arrête le chrono ; la donnée reste **figée** (consultation / replay). |
| `./track reset` | Remet tout à zéro : chrono neutre, cache brut + sortie vidés. |
| `./track status` | Affiche l'état : chrono, durée, distance, D+/D−, nb points, dernier fix. |
| `./track logs` | Suit les logs du conteneur en direct. |

**Depuis le téléphone (Termux), en SSH** — une seule ligne :

```bash
ssh vps "cd /opt/locomotionlab && ./track start"
```

ou, plus pratique, une fonction dans le `~/.bashrc` de Termux :

```bash
track() { ssh vps "cd /opt/locomotionlab && ./track $*"; }
# puis simplement :  track start | track status | track stop
```

> **Workflow type d'une aventure** : `track start` au départ → la carte du site se remplit en
> direct → `track stop` à l'arrivée (le replay reste consultable). `track reset` seulement pour
> repartir d'une trace vierge.

## Déploiement sur le VPS

### Phase 2 — additif (l'ancien système n'est PAS touché)

Le nouveau back écrit dans son **propre volume** ; ton `live-cache.mjs` + systemd + nginx continuent
de tourner **intacts** sur `/opt/traccar`. On valide en parallèle, sans risque.

```bash
# sur le VPS, dans /opt/locomotionlab
git pull
cd infra
nano .env        # renseigne le NOUVEAU TRACCAR_API_TOKEN (régénéré côté Traccar — l'ancien a fuité)
                 # TRACCAR_API_URL peut rester http://host.docker.internal:8082/api
./deploy.sh      # build + pull des images + up -d  → le conteneur tracking-cache démarre (idle)
docker compose ps
```

**Validation** (sans rien servir publiquement) :

```bash
cd /opt/locomotionlab
./track start
./track status                 # doit passer 🟢 EN COURS
sleep 30 && ./track status     # nb points / distance qui montent si l'appareil émet
docker compose -f infra/compose.yml exec tracking-cache cat /data/live-positions.json | head -40
# Compare au fichier servi par l'ancien système :
curl -s https://tracking.thelocomotionlab.com/live-positions.json | head -40
./track stop                   # (ou laisse tourner pour une vraie aventure de test)
```

> Tant que la **Phase 3** n'est pas faite, c'est **l'ancien système** qui sert le live en prod
> (nginx → `/opt/traccar`). Le conteneur ne fait que produire la même donnée dans son volume, pour
> validation.

### Phase 3 — bascule + nettoyage ⚠️ RISQUÉ (snapshot d'abord, validation explicite)

Voir [`docs/runbook-vps.md`](./runbook-vps.md) étape 4. En résumé :

1. **Snapshot OVH** + sauvegarde Traccar (runbook étape 0).
2. Côté repo, c'est DÉJÀ committé : la route `infra/caddy/conf.d/tracking.caddy` est active et
   le montage `live_json:/srv/live:ro` est en place dans `infra/compose.yml`. Rien à renommer.
3. `git pull` sur le VPS, passer `HTTP_PORT=80 / HTTPS_PORT=443` dans `.env`, `sudo systemctl stop nginx && sudo systemctl disable nginx`, `./deploy.sh`.
4. Vérifier : UI Traccar, `/api/public/*` + token, `live-positions.json` / `live-timer.json` (servis
   depuis le volume), CSP. **Le site continue de poller la MÊME URL** `tracking.thelocomotionlab.com/live-positions.json`
   → il bascule sur la nouvelle donnée **sans changement côté site**.
5. **Rollback** si besoin : `docker compose down` + `sudo systemctl enable --now nginx` (cf. runbook 4.5).

À partir de là, **`track` devient l'outil quotidien** (l'ancien chrono shell n'est plus utilisé).

#### Nettoyage `/opt/traccar` (APRÈS bascule validée + snapshot)

Fichiers devenus inutiles (l'inventaire a confirmé qu'ils sont remplacés par le conteneur) — à
supprimer **seulement** une fois la Phase 3 validée :

```
# Anciennes versions du script (cruft)
live-cache_old_old.mjs   live-cache_old.mjs   live-cache_three_files.mjs   live-cache_without_interp.mjs
live-reset_old.sh

# Remplacés par services/tracking-cache + la commande track
live-cache.mjs           live-cache.config.json   (⚠️ contient l'ANCIEN token — à détruire en priorité)
live-reset.sh            start-live.sh   start-timer.sh   stop-timer.sh   reset-timer.sh   reset-live.sh
backup-live-tracking.sh

# Artefacts obsolètes
live-profile.json        live-stats.json          (déprécié)

# Unités systemd (désactiver puis supprimer)
sudo systemctl disable --now live-cache.timer live-cache.service
```

> Les fichiers **runtime** historiques (`live-positions.json`, `live-positions-cache.json`,
> `live-timer.json` sous `/opt/traccar`) ne sont plus utilisés après bascule : Caddy sert désormais
> ceux du volume `live_json`. Garde le `.tar.gz` de sauvegarde le temps de valider, puis archive-le
> hors VPS.

## Configuration

`services/tracking-cache/tracking.config.json` (versionné, **sans secret**) — surchargeable par env :

| Clé | Env | Défaut | Rôle |
| --- | --- | --- | --- |
| `deviceId` | `DEVICE_ID` | `8` | Appareil Traccar suivi. |
| `apiUrl` | `TRACCAR_API_URL` | `http://host.docker.internal:8082/api` | API Traccar (local par défaut). |
| `intervalSeconds` | `INTERVAL_SECONDS` | `15` | Période de la boucle. |
| `fetchWindowHours` | `FETCH_WINDOW_HOURS` | `50` | Plancher de la fenêtre de fetch (filet). |
| `maxPointsPerFetch` | `MAX_POINTS_PER_FETCH` | `10000` | Plafond de points par requête Traccar. |
| `samplingCorrection` | `SAMPLING_CORRECTION` | `1.03` | Correction distance (échantillonnage). |
| `elevationPlusCorrection` / `elevationMinusCorrection` | `ELEVATION_PLUS/MINUS_CORRECTION` | `0.95` | Corrections D+/D−. |
| `minDistanceThreshold` | `MIN_DISTANCE_THRESHOLD` | `8` | Anti-dérive GPS statique (m). |
| `minElevationPlusThreshold` / `minElevationMinusThreshold` | `MIN_ELEVATION_PLUS/MINUS_THRESHOLD` | `0` / `1` | Anti-bruit altimétrique (m). |

Le **token** (`TRACCAR_API_TOKEN`) vit UNIQUEMENT dans `infra/.env`. À régénérer côté Traccar — l'ancien a fuité.
