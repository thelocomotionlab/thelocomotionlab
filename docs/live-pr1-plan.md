# Plan PR1 — Service `live-journal` + simulateur (chantier 2, à valider)

> **Statut : PLAN — aucune ligne de code écrite.** Point d'arrêt n°1 du protocole
> (`docs/live-brief.md` §0.2) : validation de Valentin requise avant implémentation.
> Base de travail : branche courante (= chantier 1 + brief + design commités).
> Les faits cités (formats, conventions, infra) ont été vérifiés dans le code du repo.

---

## 1. Ce que la PR1 livre

1. **`services/live-journal`** (Node 22 + TypeScript strict, conteneurisé) : webhook Telegram
   (texte / photo / vocal ; vidéo ingérée mais servie seulement si drapeau ON), traitement des
   médias (sharp + ffmpeg), publication de `journal.json` et de `/media/*`, `POST /message`
   (visiteur → Telegram privé), `GET /healthz`.
2. **`infra/`** : service dans `compose.yml` (healthcheck inclus), volume dédié, route Caddy
   `live.thelocomotionlab.com`, variables documentées dans `.env.example`, section
   « sauvegarde du volume » dans le README d'infra, ajout au matrix CI `deploy-vps.yml`.
3. **Mode simulation** (flag d'env, jamais actif en prod) : rejoue un GPX à vitesse accélérée
   au format de positions attendu par le front **et** publie un journal scripté (texte, photo
   factice, un vrai vocal court, une correction, une suppression) — l'outil de dev des PR2–PR4
   et de la recette.
4. **Tests unitaires** (ingestion Telegram + garde-fous du `POST /message`) et run local documenté.

Rien d'autre : pas de front (PR2), pas d'export d'archive (PR3), pas d'OG (PR4) — mais des
emplacements prévus pour ne pas se peindre dans un coin (cf. §10).

---

## 2. Décisions structurantes (avec justification)

### 2.1 Nom, domaine, routes

- **Service** : `services/live-journal`, package `@locomotionlab/live-journal` (private, 0.0.0),
  pattern `tracking-cache`.
- **Domaine proposé : `live.thelocomotionlab.com`** — fichier `infra/caddy/conf.d/live-journal.caddy`,
  variable `{$LIVE_JOURNAL_DOMAIN}`. Un sous-domaine dédié plutôt qu'un chemin sous
  `tracking.thelocomotionlab.com` : la conf tracking porte déjà l'UI Traccar (CSP spécifique,
  fallback reverse-proxy) et mélanger les préoccupations la fragiliserait. Contrairement à
  `tracking.` (DNS-only à cause du port 5055 des balises), `live.` n'a besoin que de 443 →
  **DNS Cloudflare proxifié** (comme `liste.`). Enregistrement DNS à créer par Valentin
  (cf. `docs/cloudflare-vps.md`). Alternative si le nom gêne : `journal.thelocomotionlab.com`.
- **Routes publiques** :

  | Route | Servie par | Méthodes | Cache | CORS |
  |---|---|---|---|---|
  | `/journal.json` | Caddy `file_server` (volume) | GET | `no-cache, no-store, must-revalidate` | `*` |
  | `/media/<fichier>` | Caddy `file_server` (volume) | GET | `public, max-age=31536000, immutable` | `*` |
  | `/telegram/webhook` | reverse_proxy → service | POST | — | — (Telegram only, `secret_token`) |
  | `/message` | reverse_proxy → service | POST, OPTIONS | — | allowlist gérée par le service |
  | `/healthz` | reverse_proxy → service | GET | no-store | — |
  | tout le reste | Caddy | — | — | `respond 404` |

  En-têtes identiques aux conventions existantes : `journal.json` = mêmes en-têtes que
  `live-*.json` de tracking (+ cache-buster côté client, pattern `useTrackingData`) ; médias
  immuables car **noms non devinables et jamais réécrits** (une correction de média = nouveau fichier).

### 2.2 Lecture découplée de l'écriture (pattern `live_json` réutilisé)

Le service **écrit** dans un volume ; **Caddy sert** les GET statiques directement depuis ce
volume (montage `:ro`, racine limitée au sous-arbre `public/`). Conséquence précieuse en
aventure : si `live-journal` plante, **la lecture du journal et des médias reste en ligne** —
seuls l'ingest Telegram et les messages visiteurs sont indisponibles. C'est exactement le
pattern éprouvé `tracking-cache`/`live_json`, avec la même règle d'**écriture atomique**
(`tmp` + `rename`) pour que Caddy ne serve jamais un JSON tronqué.

### 2.3 Framework HTTP : Fastify (recommandé)

`tracking-cache` est un démon zéro-dépendance, mais il n'expose aucun HTTP. `live-journal`
expose deux POST publics sur Internet pendant 5 jours sans surveillance : je recommande
**Fastify 5** (routing, `bodyLimit`, validation de schéma JSON intégrée, logs pino) plutôt que
du `node:http` artisanal — le code de parsing/limites est précisément là où naissent les bugs.
Dépendances runtime totales : `fastify`, `sharp`. ffmpeg = binaire système du conteneur
(pas de wrapper npm). *Alternative si tu préfères la philosophie zéro-dépendance : routeur
`node:http` maison (~150 lignes de plus à tester) — à trancher.*

### 2.4 Jour (« J1, J2 ») et heures : calculés côté front

Le brief demande jour et heures « calculés en Europe/Paris depuis la date de départ de
`liveConfig` ». Or `liveConfig.js` vit dans le site et le brief impose que **tout paramètre
d'aventure vive là-bas**. Proposition : le service stocke des **timestamps UTC purs** (`ts`) et
reste 100 % agnostique de l'aventure ; le front (PR2) calcule `J2 · 15 h 04` via
`Intl.DateTimeFormat` (`timeZone: "Europe/Paris"`, zéro lib) depuis `liveConfig.dateDebut`.
Une seule source de vérité, pas de date de départ dupliquée dans l'env du VPS.

### 2.5 Deux modes Telegram : webhook (prod) + long-polling (dev)

En local, Telegram ne peut pas joindre `localhost` : le service supporte
`TELEGRAM_MODE=webhook` (prod, défaut) et `TELEGRAM_MODE=polling` (`getUpdates`, dev
uniquement) — la recette PR1 « depuis un bot de test, envoyer texte → photo → vocal →
correction → /supprimer » devient exécutable sur un poste de dev sans tunnel. Les deux modes
alimentent strictement le même pipeline d'ingestion.

### 2.6 Tests : Vitest (première brique de test JS du monorepo)

Fait vérifié : **aucun framework de test JS/TS n'existe dans le repo** (seul pytest côté
twin-engine). La PR1 introduit **Vitest** en devDependency du service uniquement (pas de
config racine). Tests hermétiques : API Telegram mockée, transcodeur injectable — pas de
réseau, pas de ffmpeg requis pour `pnpm test` (un test d'intégration média optionnel est
sauté si ffmpeg absent, exécuté dans l'image Docker).

---

## 3. Arborescence de la PR

```
services/live-journal/
├─ package.json                  # @locomotionlab/live-journal — scripts build/start/dev/test/sim
├─ tsconfig.json                 # strict, ES2022, CommonJS → dist (pattern tracking-cache)
├─ live-journal.config.json      # config NON secrète versionnée, surchargeable par env
├─ README.md                     # run local, mode polling, simulateur, tests, setWebhook
├─ Dockerfile                    # multi-stage node:22-alpine + ffmpeg, contexte = racine monorepo
├─ scripts/set-webhook.sh        # enregistrement du webhook (curl, lit les env) — exécuté par Valentin
├─ sim/
│  ├─ scenario.default.json      # journal scripté + trous de positions (zone blanche, T0)
│  ├─ fixture-photo.jpg          # photo factice (petite)
│  └─ fixture-audio.ogg          # VRAI vocal court (~3 s, opus) → exerce le transcodage réel
├─ src/
│  ├─ index.ts                   # entrée : config → serveur → mode telegram → (sim si flag)
│  ├─ config.ts                  # lecture config.json + surcharge env ; exit(2) si secret manquant
│  ├─ server.ts                  # instance Fastify, routes, bodyLimit
│  ├─ telegram/
│  │  ├─ types.ts                # sous-ensemble typé Update/Message (pas de SDK)
│  │  ├─ api.ts                  # sendMessage / getFile / téléchargement (fetch natif)
│  │  ├─ webhook.ts              # vérif secret_token + dispatch de la matrice §6
│  │  └─ polling.ts              # boucle getUpdates (dev)
│  ├─ journal/
│  │  ├─ types.ts                # schéma des entrées (contrat public §4)
│  │  ├─ store.ts                # log d'événements + tombstones + projection journal.json (atomique)
│  │  └─ ingest.ts               # Update → événement (le cœur testé unitairement)
│  ├─ media/
│  │  ├─ photo.ts                # sharp : ≤1600 px, EXIF retiré, WebP ; source conservée
│  │  ├─ audio.ts                # ffmpeg : → AAC/M4A + durée (ffprobe) ; source .oga conservée
│  │  └─ video.ts                # ingestion (≤20 Mo), transcodage H.264/AAC ; publication si flag
│  ├─ message.ts                 # POST /message + garde-fous §7 (aucun stockage de contenu)
│  ├─ ratelimit.ts               # limite par IP en mémoire (pattern email-gateway)
│  └─ sim/
│     ├─ positions.ts            # replay GPX → live-positions.json + live-timer.json
│     └─ journal.ts              # injecte de FAUX updates Telegram dans le VRAI pipeline
└─ test/
   ├─ ingest.test.ts             # matrice Telegram complète (texte/photo/vocal/edit/suppr/inconnus/dédup)
   ├─ store.test.ts              # projection, ids stables, tombstones, écriture atomique
   ├─ message.test.ts            # honeypot, rate-limit, longueurs, CORS, email optionnel
   └─ media.int.test.ts          # optionnel (sauté sans ffmpeg)

infra/
├─ compose.yml                   # + service live-journal + volume live_journal_data
├─ caddy/conf.d/live-journal.caddy
├─ .env.example                  # + LIVE_JOURNAL_DOMAIN / LIVE_JOURNAL_IMAGE
│                                #   + TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET / VALENTIN_CHAT_ID
└─ README.md                     # + § sauvegarde du volume live-journal

.github/workflows/deploy-vps.yml # + entrée matrix live-journal + path services/live-journal/**
docs/secrets.md                  # + les 3 nouvelles variables (doc, aucune valeur)
```

Aucun fichier supprimé, aucun fichier existant du site touché.

---

## 4. Schéma `journal.json` (contrat public, consommé par le front en polling)

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-21T13:04:12.000Z",   // heure de la dernière projection
  "count": 5,
  "entries": [                                  // tri chronologique CROISSANT par ts
    {
      "id": "01J5ZKQ8Z3W7...",                  // ULID maison (~15 lignes, zéro dépendance) :
                                                //   stable, jamais réutilisé, triable
      "ts": "2026-08-21T13:04:05.000Z",         // UTC pur — J-index + heure Paris calculés au front (§2.4)
      "type": "text",                           // "text" | "photo" | "audio" | "video"
      "text": "Col franchi, gros vent.",        // corps (text) ou légende (photo/audio/video) ; omis si vide
      "media": {                                // omis pour type "text"
        "url": "/media/au-3f9c0a7e8b2d.m4a",    // relatif au domaine du service
        "duration": 102,                        // s — audio/vidéo (le lecteur « une prise » affiche la durée)
        "width": 1600, "height": 1200           // px — photo/vidéo
      },
      "editedAt": "2026-08-21T13:10:00.000Z"    // présent si corrigée depuis le terrain
    }
  ]
}
```

- **Append-only, ids stables** : la source de vérité interne (`private/state.json`) est un **log
  d'événements** (`created` / `edited` / `deleted`) ; `journal.json` en est une **projection**
  régénérée atomiquement à chaque événement. Une entrée supprimée (`/supprimer`) disparaît de la
  projection (tombstone interne conservé) ; une entrée corrigée garde son `id` et gagne `editedAt`.
- **Vidéo & drapeau** : entrée vidéo toujours ingérée et transcodée, mais **absente de la
  projection tant que le drapeau est OFF** ; à l'activation, republication automatique.
- **Cohérence avec `docs/live-archive-schema.md`** : le contrat d'archive (`journal[]` :
  `{time, type: "texte"|"photo"|"audio", texte?, media}`) est plus pauvre (pas d'`id`, pas de
  `duration`/`width`/`height`, littéraux français, pas de type vidéo). Le mapping se fait **à
  l'export (PR3)** : `ts→time`, `text→texte`, `"text"→"texte"`, `media.url→` copie sous
  `journal/` de l'archive. Je proposerai en PR3 une **extension additive** du contrat (champs
  optionnels `duration`/`width`/`height`/`id`, type `"video"`) pour que l'état « Terminé » rende
  le lecteur audio sans perte — décision non bloquante pour la PR1, signalée dès maintenant.

---

## 5. Arborescence des médias (volume `live_journal_data`, monté `/data`)

```
/data
├─ public/                       ← SEUL sous-arbre exposé (Caddy : root /srv/journal/public)
│  ├─ journal.json
│  └─ media/
│     ├─ ph-<12 hex aléatoires>.webp    # photo affichée : sharp, largeur ≤1600 px, EXIF retiré, WebP q80
│     ├─ au-<...>.m4a                   # vocal transcodé AAC/M4A (lecture universelle iOS/Android)
│     └─ vi-<...>.mp4                   # vidéo H.264/AAC (servie seulement si drapeau ON)
└─ private/                      ← jamais servi
   ├─ state.json                 # log d'événements + tombstones + mapping (chat_id, message_id) → entry id
   │                             #   + anneau des derniers update_id traités (dédup des retries Telegram)
   ├─ sources/                   # ORIGINAUX conservés (brief) : photo pleine déf., voice .oga, vidéo source
   └─ tmp/                       # transcodage en cours → rename atomique vers public/media/
```

- Noms non devinables : `crypto.randomBytes` (12 hex) préfixé par type — et l'énumération est de
  toute façon impossible (Caddy ne liste pas les répertoires, `file_server` sans `browse`).
- Bornes : photo source ≤ 10 Mo, vocal ≤ 20 Mo, vidéo ≤ 20 Mo — **20 Mo = limite dure de
  `getFile` de l'API Bot standard**, ce qui motive le drapeau vidéo du brief.
- Les cartes de partage PR4 (`og.png`, `story.png`) iront dans `public/` — emplacement réservé,
  aucune route ajoutée en PR1.

---

## 6. Matrice des cas Telegram (webhook et polling → même pipeline)

Pré-filtres communs, dans l'ordre : ① `secret_token` invalide → **403** (compteur, rien d'autre) ;
② `update_id` déjà traité → **200** silencieux (idempotence des retries Telegram) ;
③ `chat.id ≠ VALENTIN_CHAT_ID` → **200** silencieux + compteur anonyme (rien n'est jamais publié).
Traitement **synchrone** (download + transcodage ≤ quelques s), puis réponse Telegram de
confirmation — le retour terrain « c'est publié » compte avec des doigts gelés.

| Update reçu | Traitement | Réponse bot |
|---|---|---|
| `message` texte | entrée `text` | « ✓ Publié » |
| `message` photo (+ caption) | plus grande taille ≤ 20 Mo → getFile → sharp → entrée `photo`, caption = légende | « ✓ Publié (photo) » |
| `message` voice (`.oga` opus) | getFile → ffmpeg AAC/M4A + durée → entrée `audio` | « ✓ Publié (vocal, 1 min 42) » |
| `message` audio (fichier son) | même pipeline que voice | idem |
| `message` video / video_note ≤ 20 Mo | ingérée + transcodée ; **publiée seulement si drapeau ON** | « ✓ Reçue (publiée quand la vidéo sera activée) » / « ✓ Publié (vidéo) » |
| vidéo > 20 Mo | refus propre (getFile échouerait) | « ✗ Trop lourd pour l'API (> 20 Mo) » |
| `document` de mime `image/*` (photo « sans compression ») | pipeline photo | « ✓ Publié (photo) » |
| album (media_group) de N photos | **N entrées** (une par photo) ; la caption unique de l'album lègende la première | un seul « ✓ Publié (N photos) » |
| `edited_message` (texte ou caption) | retrouve l'entrée via mapping `message_id` → met à jour `text` + `editedAt`, reprojette | silencieuse (l'édition se voit dans Telegram) |
| réponse `/supprimer` à sa propre entrée | tombstone via mapping du message cité → reprojette sans l'entrée | « 🗑 Supprimé » |
| `/supprimer` sans réponse à un message | rien | « Réponds à l'entrée à supprimer avec /supprimer » |
| `/start`, `/aide` | rien | mini-aide (3 lignes) |
| sticker, position, sondage, document non-image, inconnu | rien publié | « Type non géré — rien n'a été publié » |
| échec de download/transcodage | rien publié, erreur loggée (sans contenu) | « ✗ Échec du traitement, renvoie-le » |

---

## 7. `POST /message` — messages privés des visiteurs

Payload JSON : `{ message: string, prenom?: string, email?: string, website?: string }`.

Garde-fous (pattern `email-gateway`, adapté au VPS) :

1. **Honeypot** `website` rempli → faux succès `200 {ok:true}` (rien n'est transmis).
2. **Limite de débit par IP** : 5/min et 30/h, en mémoire (service mono-instance — suffisant).
   IP = `CF-Connecting-IP` (domaine proxifié Cloudflare) sinon premier `X-Forwarded-For` posé
   par Caddy — chaîne de confiance documentée dans le README du service.
3. **Longueurs** : `message` 1–1000, `prenom` ≤ 50, `email` ≤ 254 (format vérifié seulement s'il
   est fourni — il est facultatif). `bodyLimit` Fastify : 16 Ko.
4. **CORS restreint** au site : allowlist d'origines dans la config (`thelocomotionlab.com`,
   `www.`, `localhost:3000` en dev), `OPTIONS` → 204, `Vary: Origin` — géré par le service
   (Caddy proxifie tel quel).
5. **Aucun stockage du contenu** : transmission directe `sendMessage` (HTML échappé) vers
   `VALENTIN_CHAT_ID` — « 💬 *Prénom* : message / ✉️ email ou “non fourni” ». Les logs ne
   contiennent **que des compteurs anonymes** (acceptés, honeypot, rate-limit, upstream KO).
   Échec Telegram → `502 {ok:false, error:"service_indisponible"}` (pas de file d'attente :
   pas de stockage). Erreurs en français, codes du pattern email-gateway
   (`corps_invalide`, `message_invalide`, `trop_de_requetes`, `service_indisponible`).

Les 4 réponses (200 / 400 / 429 / 502) donnent au front PR2 ses états envoi / confirmation
(« Remis. Il le lira ce soir au bivouac. ») / erreur.

---

## 8. Plan `infra/`

- **`compose.yml`** — nouveau service :
  ```yaml
  live-journal:
    image: ${LIVE_JOURNAL_IMAGE:-ghcr.io/thelocomotionlab/live-journal:latest}
    restart: unless-stopped
    env_file: .env
    environment:
      DATA_DIR: /data
    expose: ["3000"]
    volumes:
      - live_journal_data:/data
    networks: [web]
    healthcheck:            # premier healthcheck applicatif de la stack (préfigure l'auto-surveillance PR5)
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
  ```
  + volume nommé `live_journal_data`, monté côté Caddy : `live_journal_data:/srv/journal:ro`.
- **`caddy/conf.d/live-journal.caddy`** : cf. table §2.1 — `file_server` racine
  `/srv/journal/public` pour `/journal.json` + `/media/*` (GET only, 403 sinon),
  `reverse_proxy live-journal:3000` pour `/telegram/webhook`, `/message`, `/healthz`, 404 pour
  le reste, `encode zstd gzip`.
- **`.env.example`** (sans valeurs) : `LIVE_JOURNAL_DOMAIN=live.thelocomotionlab.com`,
  `# LIVE_JOURNAL_IMAGE=ghcr.io/thelocomotionlab/live-journal:sha-XXXXXXX` (épinglage pendant
  l'aventure), `TELEGRAM_BOT_TOKEN=`, `TELEGRAM_WEBHOOK_SECRET=`, `VALENTIN_CHAT_ID=` —
  chacune commentée (BotFather, génération du secret, @userinfobot). `docs/secrets.md` mis à jour.
- **Config non secrète versionnée** `live-journal.config.json` (surchargeable par env) : port,
  limites de taille et de débit, largeur photo max, origines CORS, `videoEnabled: false`.
- **CI** : entrée matrix `live-journal` + `services/live-journal/**` dans les `paths` de
  `deploy-vps.yml` (contexte racine, tags `latest` + `sha-`, cache GHA scopé — pattern à l'identique).
- **Dockerfile** : multi-stage `node:22-alpine` épinglé, `pnpm --filter … deploy --prod`
  (node_modules embarqués : sharp), `apk add --no-cache ffmpeg` au runner, `chown node:node /data`
  **avant** `USER node`, volontairement **pas** d'instruction `VOLUME` (gotcha connu du repo).
- **Sauvegarde du volume** (nouveau § du README d'infra) : commande manuelle + cron quotidien
  pendant l'aventure —
  `docker run --rm -v locomotionlab_live_journal_data:/data:ro -v ~/backups:/out alpine tar czf /out/live-journal-$(date +%F).tar.gz -C /data .`
  + procédure de restauration. (Aujourd'hui, seul Listmonk a une sauvegarde outillée — le
  journal est le premier volume précieux et irremplaçable pendant l'aventure.)
- **Rien n'est exécuté sur le VPS dans cette PR** : le déploiement réel (DNS, `.env`, `deploy.sh`,
  `set-webhook.sh`) est une opération listée, présentée et exécutée par Valentin (règle §0.6).

---

## 9. Simulateur (`LIVE_JOURNAL_SIMULATION=1`, jamais en prod)

- **Positions** : rejoue un GPX (`SIM_GPX`, défaut `apps/site/public/tracks/tour-des-ecrins_temp.gpx`)
  à vitesse `SIM_SPEED` (défaut 60×) et produit **exactement** le contrat front vérifié dans
  `packages/tracking/src/types.ts` : `live-positions.json`
  (`{meta:{pointCount,updatedAt}, stats:{distance,dplus,dminus,durationSeconds,lastFixTime}, profile:[{idx,fixTime,latitude,longitude,alt,distMeters,distKm,dPlus,dMinus}]}`,
  haversine cumulée) + `live-timer.json` (`{running,startTime,stopTime}`).
- **En mode sim, le service sert lui-même** `GET /live-positions.json` et `GET /live-timer.json`
  → en local, **une seule base URL** : `NEXT_PUBLIC_TRACKING_PROXY=http://localhost:3000` et la
  page /live (PR2) tourne sans VPS ni tracker.
- **Journal scripté** : `sim/scenario.default.json` décrit des événements relatifs au démarrage
  (t+10 s texte, t+40 s photo fixture, t+70 s vocal fixture **réel** `.ogg` — qui traverse le
  vrai transcodage ffmpeg —, t+100 s correction, t+130 s suppression). Le simulateur fabrique de
  **faux updates Telegram** et les injecte dans le **vrai pipeline d'ingestion** (seul le
  téléchargement est remplacé par la lecture des fixtures) : chaque run de sim re-teste le chemin
  de production de bout en bout.
- **Scénarios de recette des PR suivantes**, pilotés par le fichier : `gaps` de positions
  (ex. 90 min sans point → « zone blanche » PR2), `firstFixDelay` (timer démarré, aucune
  position → cas « premier signal » PR2), fin de GPX → `running:false` (état « Terminé » PR3).

---

## 10. Tests et vérifications avant le point d'arrêt n°2

- **Unités (Vitest)** : `ingest.test.ts` (toute la matrice §6, y compris dédup `update_id`,
  chat étranger, types inconnus), `store.test.ts` (projection, ids stables, tombstones,
  atomicité), `message.test.ts` (honeypot, rate-limit, longueurs, CORS, email facultatif),
  `media.int.test.ts` (optionnel, sauté sans ffmpeg).
- **Typecheck strict** + build TS ; **`docker build`** du service (contexte racine).
- **Site intact** : `pnpm -F site build` + `pnpm -F site lint` + build `@cloudflare/next-on-pages`
  (la PR1 ne touche pas le site — vérifié quand même, règle §0.5).
- **Recette PR1** (brief §4) rejouée en local via `TELEGRAM_MODE=polling` + bot de test :
  texte → photo → vocal → correction → `/supprimer` reflétés dans `journal.json` ;
  `POST /message` reçu sur le Telegram de Valentin ; simulateur produisant positions + journal
  exploitables. Résultats collés dans le résumé du point d'arrêt n°2.

---

## 11. Écarts et manques constatés (à connaître, non bloquants pour la PR1)

1. **Design** : le dossier `docs/design/live-v2/` contient **un seul HTML** (canvas bundlé
   dc-runtime), pas « 3 HTML + screenshots » — mais **les 3 états y sont bien couverts**
   (7 écrans : mobile En cours/Avant/Terminé, desktop En cours, composants, cartes de partage,
   mini-spec). Manquent : desktop Avant/Terminé, états envoi/confirmation/erreur du module
   message, cas « premier signal » de la fraîcheur. → Concerne surtout PR2/PR3 ; pour PR1,
   seuls les codes de réponse de `POST /message` en découlent (§7).
2. **Contrat d'archive** plus pauvre que le journal vivant → proposition d'extension additive
   en PR3 (§4).
3. **`liveConfig.js`** devra gagner en PR2 : `dateDebut` (heure de départ pour J-index/T0),
   endpoint du journal, intervalle de polling du journal, seuil zone blanche, drapeau vidéo —
   listé ici pour mémoire, rien à faire en PR1.

---

## 12. Questions ouvertes pour Valentin (avant la première ligne de code)

1. **Branche** : le brief prévoit `live/pr1-journal-service`, mais cette session est contrainte
   à `claude/live-brief-docs-ur6fhf` (pas de push ailleurs sans permission explicite).
   → Je livre la PR1 sur quelle branche ?
2. **Domaine** : `live.thelocomotionlab.com` (DNS proxifié à créer) — OK, ou tu préfères
   `journal.` ?
3. **Fastify** (recommandé §2.3) ou zéro-dépendance `node:http` ?
4. **Vitest** comme premier framework de test JS du monorepo — OK ?
5. **J-index/heure calculés côté front** depuis `liveConfig` (service agnostique, ts UTC purs,
   §2.4) — OK ?
6. **Album multi-photos = une entrée par photo** (caption sur la première) — OK ?
