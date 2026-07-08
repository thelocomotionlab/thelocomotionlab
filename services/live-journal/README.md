# services/live-journal

Journal de bord du live (chantier 2) : Valentin alimente la page `/live` **depuis le
terrain via Telegram** (texte, photo, vocal — vidéo derrière drapeau), les visiteurs
lui laissent un **mot privé** (jamais public, jamais stocké). Plan et décisions :
[`docs/live-pr1-plan.md`](../../docs/live-pr1-plan.md) · brief : [`docs/live-brief.md`](../../docs/live-brief.md).

## Architecture (décision validée au plan)

Le service Node **ne fait que l'API** ; la lecture est servie par Caddy depuis le
volume — si le service tombe pendant l'aventure, le journal et les médias restent
en ligne.

```
Telegram ─▶ POST /journal/telegram/webhook (secret_token) ─▶ ingestion ─▶ /data
Visiteur ─▶ POST /journal/message ─▶ sendMessage → Telegram Valentin (AUCUN stockage)
Caddy    ─▶ GET  /journal/journal.json + /journal/media/*  (volume, lecture seule)
           GET  /journal/healthz (proxifié — compose healthcheck + PR5)
```

Disposition du volume (`DATA_DIR=/data`) :

```
/data
├─ public/            ← SEUL sous-arbre exposé par Caddy (root /srv/journal/public)
│  ├─ journal.json         # projection publique (cache court)
│  └─ media/               # ph-*.webp · au-*.m4a · vi-*.mp4 (noms non devinables, cache long)
└─ private/           ← jamais servi
   ├─ state.json           # log d'événements append-only (source de vérité) + dédup update_id
   ├─ sources/             # originaux Telegram conservés (photo pleine déf., .oga, vidéo)
   └─ tmp/                 # transcodage en cours (rename atomique vers public/)
```

- **`journal.json`** : `{schemaVersion, generatedAt, count, entries[]}` ; entrée =
  `{id (ULID), ts (UTC pur), type: text|photo|audio|video, text?, media?{url,duration,width,height},
  editedAt?, mediaGroupId?}`. Le J-index (« J2 · 15 h 04 ») est calculé **côté front**
  depuis `liveConfig` (fuseau forcé Europe/Paris) — le service est agnostique de l'aventure.
- **Édition** : éditer le message dans Telegram (`edited_message`) → texte corrigé, id stable.
- **Suppression** : répondre `/supprimer` à sa propre entrée.
- **Vidéo** : toujours ingérée/transcodée ; publiée seulement si `VIDEO_ENABLED=1`
  (l'activation reprojette automatiquement les vidéos en attente).
- **Messages privés** : honeypot, rate-limit par IP (5/min, 30/h), longueurs bornées,
  CORS allowlist ; **le contenu n'est ni stocké ni loggé** (compteurs anonymes seulement).
  L'IP vient de `CF-Connecting-IP` (domaine proxifié Cloudflare) puis `X-Forwarded-For`
  (posé par Caddy) — chaîne de confiance : Cloudflare → Caddy → service.

## Configuration

Non-secret : [`live-journal.config.json`](./live-journal.config.json) (versionné),
surchargeable par env. Secrets (env UNIQUEMENT, cf. `infra/.env.example` et
`docs/secrets.md`) : `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (mode webhook),
`VALENTIN_CHAT_ID`. Hors simulation, le service **refuse de démarrer** s'ils manquent.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DATA_DIR` | `/data` | volume journal + médias |
| `PORT` | `3000` | port d'écoute (interne au réseau compose) |
| `TELEGRAM_MODE` | `webhook` | `polling` = getUpdates (dev, pas d'URL publique requise) |
| `VIDEO_ENABLED` | `0` | drapeau vidéo du brief (décision après le test 24 h) |
| `LIVE_JOURNAL_SIMULATION` | `0` | mode simulation (voir ci-dessous) |
| `SIM_GPX` / `SIM_SCENARIO` / `FFMPEG_PATH` / `FFPROBE_PATH` | — | surcharge des chemins |

## Run local

```bash
pnpm install

# 1) SIMULATION (aucun bot requis) — l'outil de dev des PR2-PR4 :
#    GPX des Écrins rejoué (allure 6 km/h ×120) + journal scripté (texte, photo,
#    vocal RÉEL transcodé par ffmpeg, correction, suppression), zone blanche au
#    km 60, premier signal différé de 20 s. ffmpeg requis sur le poste.
DATA_DIR=/tmp/live-journal-data pnpm sim
#   → http://localhost:3000/journal/journal.json   (+ /journal/media/*)
#   → http://localhost:3000/live-positions.json    (+ /live-timer.json)
#   Front local : NEXT_PUBLIC_TRACKING_PROXY=http://localhost:3000 — une seule base URL.

# 2) BOT DE TEST RÉEL sans URL publique (recette PR1) — long-polling :
TELEGRAM_MODE=polling TELEGRAM_BOT_TOKEN=... VALENTIN_CHAT_ID=... \
  DATA_DIR=/tmp/live-journal-data pnpm dev

# Tests (le test d'intégration média se saute si ffmpeg est absent) :
pnpm test
```

En dev/simulation le service sert lui-même `journal.json` et les médias (avec
Range — l'audio iOS l'exige) ; **en production ces routes n'existent pas**, Caddy
sert le volume (cf. `infra/caddy/conf.d/api.caddy`).

## Auto-surveillance (PR5)

Toutes les 30 min **hors aventure** (`live-timer.running === false` — donc à
J-1 aussi), le service vérifie : disque, volume inscriptible, tracking et site
joignables, webhook Telegram sain (`getWebhookInfo`), og.png générée — et
**écrit à Valentin via le bot** en cas de problème (une fois par bascule,
rappel max toutes les 6 h, message ✅ au rétablissement). **Pendant l'aventure :
silence total** (personne n'agit — brief §8). État visible sur `/journal/healthz`
(`selfCheck`). Config : `selfCheck` dans `live-journal.config.json`
(`SELF_CHECK_*` en env).

## Déploiement

Image construite par la CI (`.github/workflows/deploy-vps.yml`, contexte racine) →
GHCR → `infra/compose.yml` (service `live-journal`, volume `live_journal_data`,
healthcheck). Routes : `api.thelocomotionlab.com/journal/*` (+ redirection 301
`live.thelocomotionlab.com` → `/live` du site). **Pendant l'aventure, épingler
l'image** (`LIVE_JOURNAL_IMAGE=...:sha-xxxxxxx` dans `infra/.env`).

Après le premier déploiement (DNS `api` + `live` créés, `.env` posé) :
[`scripts/set-webhook.sh`](./scripts/set-webhook.sh) enregistre le webhook
(secret + `allowed_updates` limité). Sauvegarde du volume : `infra/README.md`
§ Sauvegardes.

## La matrice Telegram (résumé — détail : plan §6, tests : `test/ingest.test.ts`)

texte → `text` · photo/album → une entrée par photo (caption = légende de sa photo) ·
vocal → `.oga` transcodé AAC/M4A + durée · vidéo ≤ 20 Mo → ingérée, publiée si drapeau ·
document `image/*` → photo · `edited_message` → correction (id stable, `editedAt`) ·
`/supprimer` en réponse → tombstone · inconnus → « Type non géré » · chat ≠ Valentin →
ignoré en silence · `update_id` dupliqué → idempotent · échec → « renvoie-le ».
Chaque cas répond au terrain (doigts gelés : le retour « ✓ Publié » compte).
