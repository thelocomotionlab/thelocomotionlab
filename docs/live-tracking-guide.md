# Guide du live-tracking — back **et** front (note unique)

> Comment fonctionne le suivi GPS en direct du Locomotion Lab, de l'appareil sur le terrain
> jusqu'à la carte affichée dans un article du site. Tout est ici : démarrer un suivi, l'afficher,
> faire un replay, configurer Traccar, changer d'appareil, régler le mobile émetteur, et les pièges.
>
> Voisins utiles : [`tracking-cache.md`](./tracking-cache.md) (détails du service back) ·
> [`runbook-vps.md`](./runbook-vps.md) (commandes VPS) · [`../infra/README.md`](../infra/README.md).

---

## 0. Vue d'ensemble (le chemin complet de la donnée)

```
[Appareil émetteur]  (téléphone Traccar Client / tracker GPS)
      │  positions GPS, protocole OsmAnd, port 5055
      ▼
[Traccar]  (sur l'hôte VPS, :8082 web/API, :5055 balises)  ── appareil = deviceId 8
      │  API /positions  (Bearer token)
      ▼
[services/tracking-cache]  (conteneur)  ── piloté par la commande `track`
      │  fetch incrémental → filtres anti-dérive → corrections → écrit dans le volume
      ▼
[volume live_json]  live-positions.json + live-timer.json
      │  servis en lecture seule
      ▼
[Caddy]  tracking.thelocomotionlab.com/live-positions.json  (+ /live-timer.json, UI, /api/public/*)
      │  poll toutes les 10 s, CORS *
      ▼
[Site www.thelocomotionlab.com]  carte + profil inline dans l'article  (package @locomotionlab/tracking)
```

Trois briques, trois rôles :
- **Traccar** = reçoit et stocke les positions de l'appareil. On n'y touche que pour gérer les appareils/utilisateurs.
- **tracking-cache** = transforme les positions brutes en `live-positions.json` propre (filtré, corrigé). Piloté par `track`.
- **Le site** = affiche ce JSON, en direct (`<livetracking>`) ou en rejeu (`<postlivetracking>`).

---

## 1. Sur le terrain — l'appareil émetteur

L'appareil envoie ses positions à Traccar via le **protocole OsmAnd**, sur le **port 5055**.

**Application recommandée : Traccar Client** (Android/iOS — c'est l'appli officielle, elle parle l'OsmAnd protocol).

Réglages dans Traccar Client :
| Réglage | Valeur |
|---|---|
| **Server URL** | `http://tracking.thelocomotionlab.com:5055` |
| **Device identifier** | l'identifiant unique de l'appareil — **doit correspondre** à un appareil déclaré dans Traccar (cf. §5) |
| **Location accuracy** | High (haute) |
| **Frequency** | intervalle d'envoi, ex. **20–30 s** |
| **Distance / Angle** | ex. distance **25 m**, angle pour capter les virages |

> Pourquoi `:5055` et pas le HTTPS du site ? Parce que c'est le port « balises » de Traccar (protocole
> OsmAnd, pas du web). C'est aussi pour ça que le DNS `tracking` est en **DNS-only** côté Cloudflare
> (cf. §6) : le proxy Cloudflare ne relaie que 80/443, donc le `:5055` doit joindre le VPS **en direct**.

Quand l'appareil émet, ses points apparaissent dans l'UI Traccar (`https://tracking.thelocomotionlab.com`).

---

## 2. Démarrer / arrêter un suivi — la commande `track`

Sur le VPS (ou en SSH depuis ton téléphone via Termux). Le script vit à la racine : `/opt/locomotionlab/track`.

```bash
cd /opt/locomotionlab
./track start     # ouvre une session : chrono ON + fenêtre de collecte = MAINTENANT
./track status    # état : chrono, durée, distance, D+/D-, nb points, dernier fix
./track stop      # arrête le chrono ; la donnée reste figée (consultable / replay)
./track reset     # remet à zéro : chrono neutre, cache + sortie vidés
./track logs      # suit les logs du conteneur en direct
```

**Confort (à faire une fois)** — pour taper `track …` depuis n'importe où :
```bash
# option a) fonction shell
echo 'track() { ( cd /opt/locomotionlab && ./track "$@" ); }' >> ~/.bashrc && source ~/.bashrc
# option b) symlink (après un git pull récent)
sudo ln -s /opt/locomotionlab/track /usr/local/bin/track
```
**Depuis Termux** (sans se connecter à la main) :
```bash
track() { ssh vps "cd /opt/locomotionlab && ./track $*"; }   # puis : track start | track status | track stop
```

**Déroulé type d'une aventure :**
1. `track start` au départ → la carte du site se remplit en direct.
2. (course…) `track status` pour vérifier que ça monte.
3. `track stop` à l'arrivée → la trace reste figée (pour la regarder / en faire un replay, cf. §4).
4. `track reset` seulement quand tu veux repartir d'une trace **vierge** pour la prochaine sortie.

> **Important :** entre deux sessions (aucun `track start` actif), `live-positions.json` est **vide**
> → la carte live d'un article affiche 0 point. C'est **normal** : le live n'a de sens que pendant une
> session active. Les sorties passées se montrent en **replay** (§4), pas en live.

---

## 3. Afficher le live dans un article — la balise `<livetracking>`

Dans le `.md` d'un projet (`apps/site/public/projets/<slug>.md`), on écrit une balise. Le site la rend
en **carte interactive inline** (pas d'iframe), via le package `@locomotionlab/tracking`.

```html
<livetracking
  referenceGpx="/tracks/mdl-65km_off.gpx"
  totalDistance="65"
  elevationMax="860"
  title="Suivi en direct"
  pollIntervalMs="10000"
  initialMapStyle="osm"
/>
```

Attributs (tous optionnels) :
| Attribut | Rôle | Défaut |
|---|---|---|
| `referenceGpx` | trace de référence (pointillés bleus) + bouton télécharger. Fichier dans `apps/site/public/tracks/`. | `/tracks/reunion-r2_temp.gpx` |
| `totalDistance` | distance totale prévue (km) → borne l'axe du profil | auto |
| `elevationMin` / `elevationMax` | bornes d'altitude du profil (m) | 400 / 860 |
| `title` | titre du bloc | « Suivi en direct » |
| `pollIntervalMs` | fréquence de rafraîchissement (ms) | 10000 |
| `initialMapStyle` | `osm` · `topo` · `satellite` | `osm` |
| `mapHeight` | hauteur de la carte (px) | 500 |
| `apiBase` | base du proxy live (URL, **jamais de token**) | domaine de prod, ou `NEXT_PUBLIC_TRACKING_PROXY` |

> **Légende** : un paragraphe en *italique* juste après la balise devient automatiquement la légende.
>
> **Quel `apiBase` ?** En général **ne le mets pas** : le site utilise `NEXT_PUBLIC_TRACKING_PROXY`
> (s'il est défini, cf. `apps/site/.env.example`), sinon le domaine de prod
> `https://tracking.thelocomotionlab.com`. Le client ne reçoit **qu'une URL**, jamais le token Traccar.

La carte poll `apiBase/live-positions.json` et `apiBase/live-timer.json`, dessine la trace live (orange),
le marqueur coureur, le profil altimétrique (dépliable) et le chrono. Le **chrono** vient de
`live-timer.json` (donc de tes `track start`/`stop`).

---

## 4. Les replays (post-course) — la balise `<postlivetracking>`

Un replay rejoue une trace **figée** depuis un fichier JSON **statique** (pas de live, pas de token,
un seul chargement). Les fichiers vivent dans `apps/site/public/replays/<slug>/`.

```html
<postlivetracking
  positions="/replays/traversee-reunion/live-positions.json"
  totalDistance="85.50"
  referenceGpx="/tracks/reunion-r2_temp.gpx"
  elevationMax="3100"
  title="Replay de la traversée de la Réunion 2025"
/>
```

Attributs :
| Attribut | Rôle |
|---|---|
| `positions` | **(requis)** chemin du JSON statique dans `/replays/…` |
| `totalDistance` | distance totale (km) pour l'axe du profil |
| `referenceGpx` · `elevationMin` · `elevationMax` · `title` · `mapHeight` | comme le live |
| `distanceFactor` · `ascentFactor` · `descentFactor` | **corrections côté client** (voir ci-dessous) |

**Deux formats acceptés** (gérés automatiquement) :
- **Nouveau** (produit par tracking-cache) : `{ meta, stats, profile, debug }` — **déjà corrigé** côté
  serveur → laisse `distanceFactor`/`ascentFactor`/`descentFactor` **à 1** (ou ne les mets pas).
- **Ancien** (tableau brut de positions Traccar) : le composant recalcule distance/D+/D− côté client,
  d'où les `*Factor` pour ajuster (les vieux replays Réunion utilisent ex. `1.3` / `1.22` / `1.29`).

### Transformer une session live en replay
Après une aventure, **avant** de faire un `track start` ou `track reset` suivant :
```bash
# récupère la trace figée (format nouveau, déjà corrigé) :
curl -s https://tracking.thelocomotionlab.com/live-positions.json > traversee-2026.json
# (ou : docker compose -f /opt/locomotionlab/infra/compose.yml exec tracking-cache cat /data/live-positions.json)
```
Puis, dans le repo du site :
1. place le fichier en `apps/site/public/replays/<slug>/live-positions.json` ;
2. ajoute une balise `<postlivetracking positions="/replays/<slug>/live-positions.json" … />` dans l'article
   (facteurs à **1**, le nouveau format est déjà corrigé) ;
3. commit + déploiement Cloudflare Pages (`pnpm -F site deploy:cf`).

> Rappel du piège §2 : si tu fais `track start` (nouvelle session) avant d'avoir récupéré le fichier,
> la fenêtre repart à « maintenant » et `live-positions.json` ne montrera plus l'ancienne trace.

---

## 5. Configurer le back (Traccar + tracking-cache)

### 5.1 Paramètres du back — `services/tracking-cache/tracking.config.json`
Versionné, **sans secret**. Surchargeable par variables d'env (dans `infra/.env`).

| Clé (config) | Env (override) | Défaut | Rôle |
|---|---|---|---|
| `deviceId` | `DEVICE_ID` | 8 | l'appareil Traccar suivi |
| `apiUrl` | `TRACCAR_API_URL` | `http://host.docker.internal:8082/api` | API Traccar (locale par défaut) |
| `intervalSeconds` | `INTERVAL_SECONDS` | 15 | période de la boucle |
| `fetchWindowHours` | `FETCH_WINDOW_HOURS` | 50 | plancher de la fenêtre de fetch (filet) |
| `samplingCorrection` | `SAMPLING_CORRECTION` | 1.03 | correction distance (sous-échantillonnage GPS) |
| `elevationPlusCorrection` / `…MinusCorrection` | `ELEVATION_PLUS/MINUS_CORRECTION` | 0.95 | corrections D+/D− |
| `minDistanceThreshold` | `MIN_DISTANCE_THRESHOLD` | 8 | anti-dérive GPS statique (m) |
| `minElevationPlusThreshold` / `…MinusThreshold` | `MIN_ELEVATION_PLUS/MINUS_THRESHOLD` | 0 / 1 | anti-bruit altimétrique (m) |

Changer un paramètre **permanent** : éditer `tracking.config.json` → commit → merge `main` → CI rebuild →
`./deploy.sh` sur le VPS. Changement **ponctuel** sans commit : poser la variable d'env dans `infra/.env`
puis `./deploy.sh`.

### 5.2 Le token Traccar
- Vit **uniquement** dans `/opt/locomotionlab/infra/.env` → `TRACCAR_API_TOKEN`. **Jamais** dans le repo.
- Sert à deux choses : tracking-cache lit `/positions`, **et** Caddy l'injecte sur `/api/public/*`.
- **Le régénérer** : UI Traccar → connecte-toi au compte **`public`** → génère un token → colle-le dans
  `infra/.env` → `cd infra && ./deploy.sh`. (Régénérer invalide l'ancien — fais-le si un token a fuité.)
- Le compte `public` doit avoir l'**appareil partagé** pour pouvoir lire ses positions.

### 5.3 Changer d'appareil émetteur (nouveau `deviceId`)
1. Dans l'UI Traccar : **Paramètres → Appareils → +** → crée l'appareil avec un **identifiant unique**
   (celui que tu mettras dans Traccar Client). Note le **deviceId** numérique attribué.
2. Partage cet appareil au compte `public` (pour que le token puisse le lire).
3. Sur le mobile : Traccar Client → **Device identifier** = l'identifiant créé, **Server URL** =
   `http://tracking.thelocomotionlab.com:5055`.
4. Pointe le back sur ce nouveau deviceId :
   - ponctuel : `infra/.env` → `DEVICE_ID=<n>` puis `./deploy.sh` ;
   - permanent : `services/tracking-cache/tracking.config.json` → `"deviceId": <n>` → commit → deploy.
5. `./track reset` puis `./track start` pour repartir propre avec le nouvel appareil.

### 5.4 Hygiène Traccar
- **Inscription** : Paramètres → Serveur → **décoché** (sinon des bots créent des comptes en masse).
- Comptes indésirables : suppression possible via l'API admin (demande le script si besoin).

---

## 6. Pièges & points non évidents

- **Carte live vide entre les sorties** : normal — il faut une session `track start` active. Les sorties
  passées se montrent en **replay**.
- **DNS `tracking` en DNS-only** (Cloudflare, nuage gris) : volontaire. Le proxy Cloudflare ne relaie que
  80/443 ; le **port 5055** (balises) doit joindre le VPS en direct. Ne le passe **pas** en proxifié,
  sinon l'appareil ne peut plus émettre.
- **Le port 5055 doit rester ouvert** dans `ufw` (`sudo ufw status` → 5055 autorisé).
- **Corrections : deux endroits différents.** En **live**, elles sont appliquées **côté serveur**
  (tracking-cache, `tracking.config.json`) → le front n'applique rien. En **replay ancien format**,
  elles sont appliquées **côté client** via les `*Factor` de la balise. Ne pas cumuler les deux.
- **HTTPS du tracking** : c'est **Caddy** (port 443) qui sert `tracking.*`, avec un certificat Let's
  Encrypt obtenu en **DNS-01** (token Cloudflare dans `infra/.env`). nginx a été décommissionné.
- **CORS / CSP** : Caddy met `Access-Control-Allow-Origin: *` sur les `live-*.json` (pour que le site
  Cloudflare puisse les poller) et une CSP uniquement sur l'UI Traccar — reproduction fidèle de l'ancien
  nginx.
- **Débogage rapide** :
  ```bash
  ./track status                                   # vue d'ensemble
  ./track logs                                     # logs live ; cherche "fresh=… retained=… stats=…"
  # PAS de "Erreur tick … HTTP 401/403" → token OK
  curl -s https://tracking.thelocomotionlab.com/live-positions.json | head
  ```
- **Le conteneur a besoin du token au démarrage** : si `TRACCAR_API_TOKEN` manque dans `.env`, le
  conteneur redémarre en boucle. Mets le token, `./deploy.sh`.
- **Mettre à jour le back** : modifier `services/tracking-cache/**` → commit → merge `main` → la CI
  reconstruit l'image → `cd /opt/locomotionlab && git pull && cd infra && ./deploy.sh`.
```
