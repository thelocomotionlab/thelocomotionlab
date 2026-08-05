# Live-tracking — le guide unique

> **Le seul document du live.** Il couvre tout : préparer une aventure, lancer,
> tenir le carnet de bord, recevoir les messages, arrêter, archiver, dépanner —
> et le back qui alimente la carte. Les autres docs live ont été fusionnés ici.
>
> Sources de vérité (le code prime toujours sur cette page) :
> `apps/site/lib/liveConfig.js` (la config d'une aventure) ·
> `apps/site/components/LiveHub.jsx` (la bascule des états) ·
> `services/tracking-cache/tracking.config.json` (réglages du back) ·
> `services/live-journal/` (journal + messages) · `infra/` (déploiement VPS).
>
> Voisins : [`plan-staging.md`](./plan-staging.md) (mise en service d'ensemble) ·
> [`runbook-tracker-gl320mg.md`](./runbook-tracker-gl320mg.md) (première mise en
> service du tracker + SIM) · [`runbook-vps.md`](./runbook-vps.md) (opérations VPS) ·
> [`../infra/README.md`](../infra/README.md).

---

## 1. Vue d'ensemble — deux chaînes indépendantes

La page `/live` agrège **deux flux qui ne se parlent pas** : les **positions**
(la carte) et le **carnet de bord** (le journal + les messages). L'un peut
tomber sans l'autre ; les deux sont servis par Caddy, donc `/live` reste
lisible même si un service redémarre.

```
CARTE (positions)
  téléphone Traccar Client / tracker GPS
      │  positions GPS (protocole OsmAnd :5055, ou Queclink :5004)
      ▼
  Traccar (hôte VPS, :8082 web/API, ports balises)  ── appareil = deviceId 8
      │  API /positions (Bearer token)
      ▼
  services/tracking-cache (conteneur)  ── piloté par la commande ./track
      │  fetch incrémental → filtres/corrections → écrit dans le volume
      ▼
  volume live_json : live-positions.json + live-timer.json
      │  Caddy → tracking.thelocomotionlab.com/… (CORS *)
      ▼
  /live : carte + profil (poll 10 s)

CARNET (journal + messages)
  Valentin, dans Telegram ──▶ webhook ──▶ services/live-journal (conteneur)
                                            ├─▶ journal.json + /media/*  ──▶ /live (poll 30 s)
                                            ├─▶ og.png / story.png       ──▶ aperçus de partage
                                            └─◀ POST /journal/message (visiteur) ─▶ Telegram de Valentin (privé)
```

---

## 2. Les quatre états de `/live` (et ce qui les pilote)

`LiveHub.jsx` choisit l'état à afficher à partir de **deux entrées seulement** :
le champ `aventure.statut` de `liveConfig.js`, et le chrono `live-timer.json`
posé par `./track`.

| État affiché | Condition | D'où il vient |
| --- | --- | --- |
| **Repos** | `statut === "repos"` | tu l'as posé à la main quand **aucune aventure n'est prévue**. « Pas de direct en ce moment ». |
| **En cours** | `statut === "avant"` **et** le chrono a un `startTime` | `./track start` l'a posé. **Vivant** tant que le tracker tourne ; **figé avec le badge TERMINÉ** dès `./track stop` — et il le reste. |
| **Avant** | tout le reste | jamais démarré, ou après `./track reset`. Compte à rebours vers `dateDebut`. |

> ### Il n'y a plus d'état « Terminé »
>
> Une aventure finie **reste affichée figée** (En cours + badge TERMINÉ), jusqu'à
> ce qu'un `./track reset` prépare la suivante. Quand tu décides de la raconter,
> elle devient un **replay dans une page projet** (balise `<postlivetracking>`,
> §11) — ce qui rendait la page « Terminé » redondante : deux façons de raconter
> la même sortie, c'était une de trop.
>
> Retiré avec elle : `LiveTermine.jsx`, `lib/useArchive.js`, le champ `archive`
> de `liveConfig`, et deux formateurs de `liveTime.js` sans autre appelant.
> `statut` ne prend plus que **`avant`** ou **`repos`**.

---

## 3. Préparer une aventure — `liveConfig.js`

Le **seul** fichier à éditer pour lancer une aventure : `apps/site/lib/liveConfig.js`.

**En 3 gestes :**

1. Dépose la trace GPX dans `apps/site/public/tracks/` (ex. `mon-tour.gpx`).
2. Génère la trace légère :
   ```bash
   pnpm -F site build:track public/tracks/mon-tour.gpx
   ```
   → **distance, D+, altitudes et profil sont CALCULÉS** depuis le GPX complet
   (avant simplification) : tu ne recopies **rien** à la main. Sortie :
   `public/tracks/mon-tour.track.json`.
3. Renseigne les champs, puis déploie (§12).

Les champs de `aventure` :

| Champ | Rôle |
| --- | --- |
| `nom` | titre affiché en grand. |
| `dateDebut` | date + heure + fuseau (`+02:00` l'été). Pilote le compte à rebours **et** le numéro de jour du journal (J1, J2…, en Europe/Paris). |
| `dates` | période affichée sur la carte de partage. |
| `intention` | phrase en Lora italique sous le titre. |
| `trace` | le `.track.json` généré au geste 2. |
| `waypoints` | repères de cols sur le profil : `[{ nom, km }]`. `[]` pour aucun. |
| `statut` | `avant` en temps normal (y compris pendant et après le direct) ; `repos` quand aucune aventure n'est prévue. Surchargé au build par `NEXT_PUBLIC_LIVE_STATUT`. |

Réglages techniques (`liveReglages`, rarement touchés) : `positionsPollMs`
(10 s), `journalPollMs` (30 s), `zoneBlancheMinutes` (60 — délai sans position
avant l'affichage « zone blanche »).

Les endpoints (`trackingApiBase`, `journalApiBase`) sont fixés au build par
`NEXT_PUBLIC_TRACKING_PROXY` / `NEXT_PUBLIC_JOURNAL_API` (défaut : domaines de
prod).

### 3.1 Voir les cinq états en local — `live:preview`

Pour retravailler les pages sans toucher au VPS (ni abîmer une vraie session) :

```bash
pnpm -F site live:preview -- --etat encours     # avant | encours | fige
```

Le simulateur sert les **mêmes fichiers que la prod** (`live-timer.json`,
`live-positions.json`, `journal.json`), fabriqués dans l'état demandé à partir de
la trace réellement configurée — et affiche la commande à lancer dans un second
terminal. Options : `--avance <%>` (où placer le coureur), `--sans-journal`,
`--port`. Il répond aussi au `POST /journal/message` du formulaire « Laisse un
mot » (contenu jeté), pour pouvoir travailler ses états succès/erreur.

| État de `/live` | Simulateur | Variable de build |
| --- | --- | --- |
| **Avant** (compte à rebours) | `--etat avant` | `NEXT_PUBLIC_LIVE_STATUT=avant` |
| **En cours** (direct) | `--etat encours` | `NEXT_PUBLIC_LIVE_STATUT=avant` |
| **En cours figé** (badge TERMINÉ) | `--etat fige` | `NEXT_PUBLIC_LIVE_STATUT=avant` |
| **Repos** | inutile | `NEXT_PUBLIC_LIVE_STATUT=repos` |

> ⚠️ `.env.local` est lu par `next build` et **gagne** sur ces variables : s'il y
> définit `NEXT_PUBLIC_LIVE_STATUT`, même vide, c'est lui qui s'applique.

---

## 4. L'appareil qui émet

L'appareil envoie ses positions à Traccar. Deux options :

### Option téléphone — Traccar Client (recommandée, zéro config serveur)
Application officielle Android/iOS, parle le **protocole OsmAnd** sur le
**port 5055** (déjà ouvert ; l'appareil `deviceId 8` existe déjà).

| Réglage Traccar Client | Valeur |
| --- | --- |
| **Server URL** | `http://tracking.thelocomotionlab.com:5055` |
| **Device identifier** | l'identifiant d'un appareil déclaré dans Traccar (§10.3) |
| **Location accuracy** | High |
| **Frequency** | 20–30 s |
| **Distance / Angle** | ex. 25 m + angle pour capter les virages |

### Option tracker GL320MG — Queclink @Track (la vraie répétition matériel)
Le GL320MG parle le protocole **Queclink** (« gl200 » dans Traccar), port
**5004** par défaut (TCP), **pas** le 5055 du téléphone. En résumé :
- déclarer l'appareil dans Traccar (`uniqueid` = IMEI) et le **partager au compte
  `public`** ;
- ouvrir le port : `sudo ufw allow 5004/tcp` (+ pare-feu OVH Manager si actif) ;
- pointer le tracker sur `tracking.thelocomotionlab.com:5004` ;
- **store & forward ON** (bufferise hors réseau, renvoie tout au retour du
  signal), intervalle 30–60 s, tracker en haut du sac (ciel dégagé) ;
- vérifier `DEVICE_ID` dans `infra/.env` (§10.3) ;
- **autonomie testée sur une vraie sortie longue** (pas la fiche constructeur).

> 📓 **Première mise en service (SIM Simbase incluse) : le pas-à-pas complet est
> dans [`runbook-tracker-gl320mg.md`](./runbook-tracker-gl320mg.md)** — activation
> de la SIM, config @Track du tracker, ordre de montage, recette de sortie
> d'essai, pannes probables. Diagnostic en une commande, sur le VPS :
> `./infra/scripts/check-tracker.sh` (teste les 5 maillons et désigne le coupable).

> **Pourquoi `:5055`/`:5004` et pas le HTTPS du site ?** Ce sont les ports
> « balises » de Traccar, pas du web. C'est aussi pourquoi le DNS `tracking`
> reste **DNS-only (nuage gris)** côté Cloudflare : le proxy CF ne relaie que
> 80/443, la connexion balise doit joindre le VPS **en direct**.

---

## 5. Lancer / suivre / arrêter — la commande `track`

Sur le VPS, à la racine `/opt/locomotionlab` (ou en SSH depuis Termux) :

| Commande | Effet |
| --- | --- |
| `./track start` | démarre le chrono **et** ouvre la fenêtre de collecte = maintenant. La boucle se met à collecter. |
| `./track stop` | arrête le chrono ; la donnée reste **figée** (consultation / replay). |
| `./track reset` | remet tout à zéro : chrono neutre, cache brut + sortie vidés. |
| `./track status` | état : chrono, durée, distance, D+/D−, nb points, dernier fix. |
| `./track logs` | suit les logs du conteneur en direct. |

**Depuis le téléphone (Termux)**, une seule ligne :
```bash
ssh vps "cd /opt/locomotionlab && ./track start"
```
ou une fonction dans `~/.bashrc` de Termux :
```bash
track() { ssh vps "cd /opt/locomotionlab && ./track $*"; }
# puis :  track start | track status | track stop
```

**Déroulé type :** `reset` (repartir propre) → `start` (au départ → `/live`
bascule En cours) → `status` en route → `stop` (à l'arrivée → figé). Voir §9
pour transformer la sortie en archive définitive.

> Entre deux sessions (aucun `start` actif), `live-positions.json` est **vide**
> → la carte n'affiche 0 point. C'est **normal** : le live n'a de sens que
> pendant une session. Les sorties passées se montrent en **replay** (§11).

---

## 6. Le carnet de bord par Telegram

**Oui — ce que tu postes dans Telegram est publié directement dans le carnet.**
Ton message part à Telegram → le webhook réveille `live-journal` → l'entrée est
écrite dans `journal.json` (servi par Caddy). Le bot te répond « ✓ Publié » ;
la page l'affiche au prochain rafraîchissement (≤ 30 s). **Seul TON chat**
(`VALENTIN_CHAT_ID`) alimente le journal — tout autre est ignoré.

Depuis le terrain, dans Telegram, tu envoies simplement :

| Tu envoies… | Réponse du bot | Dans le carnet |
| --- | --- | --- |
| un **texte** | « ✓ Publié » | entrée texte |
| une **photo** (légende possible) | « ✓ Publié (photo) » | photo recompressée (EXIF retiré) |
| un **vocal** | « ✓ Publié (vocal, Xs) » | audio transcodé (lecture iOS + Android) |
| une **vidéo** (≤ 20 Mo) | « ✓ Publié (vidéo) » si le drapeau vidéo est ON, sinon « ✓ Reçue… » | publiée seulement si `VIDEO_ENABLED=1` |

**Corriger / supprimer / purger :**

- **Corriger** une entrée : **édite ton message** dans Telegram → l'entrée se
  met à jour (marquée « corrigé »). Pas de réponse du bot (c'est déjà visible).
- **Supprimer une entrée** : **réponds `/supprimer`** au message d'origine →
  « 🗑 Supprimé ».
- **Purger TOUT le carnet** : envoie **`/purger`** → le bot demande confirmation ;
  envoie **`/purger confirmer`** → « 🧹 Carnet vidé — N entrées supprimées. »
  C'est **irréversible côté site** : `journal.json` repart vide. (Tes messages
  restent dans ton historique Telegram — la purge ne touche que le carnet
  publié.) Idéal pour nettoyer après un test.

> Envoie `/aide` (ou n'importe quelle commande inconnue) pour recevoir ce
> mémo directement dans Telegram.

---

## 7. Les messages des visiteurs — « Laisse un mot à Valentin »

**Oui — un message qu'on t'envoie arrive instantanément sur ton Telegram.**
Le formulaire poste sur `POST /journal/message` ; `live-journal` le transmet
**tout de suite** à ton chat (`sendMessage`, ou `sendMedia` s'il y a une pièce
jointe). Si Telegram ou le service est indisponible, le visiteur voit « le
message n'est pas parti, réessaie » (502) — donc c'est bien direct, pas de file
d'attente.

- **Rien n'est stocké ni public.** Le contenu transite en mémoire de la requête
  vers Telegram, puis est jeté (logs = compteurs anonymes uniquement).
- **Pièces jointes** possibles : **photo / vidéo / vocal** (enregistré au micro
  du navigateur), **20 Mo max**. Une image > 10 Mo part en document. Types
  refusés (pdf, exécutables…) → rejet propre.
- Garde-fous : honeypot invisible, limite de débit par IP (`CF-Connecting-IP`),
  CORS restreint aux origines du site, longueurs bornées.
- Confirmation affichée au visiteur : « Remis. Il le lira ce soir au bivouac. »

---

## 8. Les cartes de partage (OG + story)

`live-journal` régénère périodiquement une image d'aperçu qui montre l'état
vivant de l'aventure :

- **`og.png`** (1200×630) : l'aperçu quand tu partages `/live` sur WhatsApp,
  Messenger, etc. `og:image` de la page pointe dessus avec un cache-buster.
- **`story.png`** (1080×1920) : le bouton **« Partager l'aventure »** sous
  l'encart message. Il utilise l'**API Web Share** : sur mobile, il ouvre le
  partage natif (Instagram, etc.) avec l'image ; sinon il l'ouvre dans un
  onglet.
- Pour que l'aperçu montre la **vraie progression** en phase staging, poser
  `SITE_BASE=https://staging.thelocomotionlab-website.pages.dev` dans
  `infra/.env` (live-journal y lit `{SITE_BASE}/live-config.json`). À retirer
  au lancement.

> Vieil aperçu qui colle après partage ? Passer l'URL dans le **Sharing
> Debugger** de Meta → « Scrape again ».

---

## 9. Archiver une aventure

La page `/live` **ne se bascule plus** : elle reste figée sur les dernières
données. Ce qui reste à faire est de **sauver ces données avant qu'un
`./track reset` ne les efface**. Une commande, depuis un **ordinateur** (pas le
VPS), une fois `./track stop` fait et le VPS encore en ligne :

```bash
pnpm -F site live:archiver -- --slug mon-tour
# option : --nom "Mon Grand Tour"   (défaut : le nom courant de liveConfig)
```

Elle enchaîne : ① build du service → ② **export** du journal, des médias et de
`archive.json` vers `apps/site/public/replays/<slug>/` → ③ copie des
**positions brutes** (`live-positions.json`, celles que lit la balise de replay)
→ ④ affiche les gestes de publication, que tu lances toi-même.

`chat[]` reste **vide par construction** : les messages privés n'entrent JAMAIS
dans une archive publique.

> ### ⚠️ L'ordre SÛR à la fin d'une aventure
> 1. `./track stop` (le VPS gèle et sert encore les données) ;
> 2. **`pnpm -F site live:archiver -- --slug …`** puis commit + `deploy:cf` ;
> 3. **seulement ensuite** : `./track reset` et/ou `/purger confirmer` pour
>    repartir propre. La commande **lit** les positions et **copie** les médias
>    depuis le VPS : purger ou reset AVANT effacerait ce qu'elle archive.

Le récit, lui, se publie quand tu le décides : une page projet + la balise
`<postlivetracking positions="/replays/<slug>/live-positions.json" />` (§11).

---

## 10. Le back — `services/tracking-cache`

Conteneur qui interroge Traccar, filtre/corrige les positions, et écrit
`live-positions.json` + `live-timer.json` dans le volume `live_json` que Caddy
sert. Idle tant qu'aucune session n'est active (zéro requête Traccar au repos).

### 10.1 Réglages — `services/tracking-cache/tracking.config.json`
Versionné, **sans secret**, surchargeable par variable d'env (`infra/.env`).
**Les valeurs par défaut vivent dans ce fichier** (ne pas les recopier ici,
elles dériveraient) ; les leviers :

| Clé | Env (override) | Rôle |
| --- | --- | --- |
| `deviceId` | `DEVICE_ID` | l'appareil Traccar suivi. |
| `apiUrl` | `TRACCAR_API_URL` | API Traccar (locale par défaut). |
| `intervalSeconds` | `INTERVAL_SECONDS` | période de la boucle. |
| `fetchWindowHours` | `FETCH_WINDOW_HOURS` | plancher de la fenêtre de fetch. |
| `bufferLookbackMinutes` | `BUFFER_LOOKBACK_MINUTES` | recul de la borne basse, pour rattraper les points **bufferisés** (store & forward) renvoyés en retard par le tracker. À monter si tu attends des coupures réseau plus longues. |
| `maxPointsPerFetch` | `MAX_POINTS_PER_FETCH` | plafond de points par requête. |
| `samplingCorrection` | `SAMPLING_CORRECTION` | correction distance. |
| `elevationPlusCorrection` / `…MinusCorrection` | `ELEVATION_PLUS/MINUS_CORRECTION` | corrections D+/D−. |
| `minDistanceThreshold` | `MIN_DISTANCE_THRESHOLD` | anti-dérive GPS statique (m). |
| `elevationSmoothingWindow` | `ELEVATION_SMOOTHING_WINDOW` | points de la moyenne glissante sur les altitudes (écrête les pics GNSS). |
| `elevationHysteresisM` | `ELEVATION_HYSTERESIS_M` | écart minimal (m) avant de compter du dénivelé. **C'est LE réglage anti-dérive** (cf. encadré). |

> ### Pourquoi le D+ dérivait, et ce qui le tient maintenant
>
> L'altitude GNSS oscille de quelques mètres en permanence, même à l'arrêt. Le
> calcul additionnait **chaque** variation positive entre deux points : sur des
> centaines de points, ce bruit devenait des centaines de mètres. Mesuré sur la
> sortie des Vouillands (5 août 2026) : **1 431 m affichés pour 419 m réels**.
> Un seuil par segment n'y pouvait rien — il laisse passer la moitié du bruit à
> chaque pas, et le total croît avec le nombre de points.
>
> Le calcul lisse désormais la série d'altitudes, puis n'accumule qu'au-delà de
> `elevationHysteresisM` d'écart à une référence mobile. Un bruit qui reste sous
> le seuil ne s'accumule **jamais**, quel que soit le nombre de points.
>
> Vérifié en rejouant la trace réelle des Vouillands avec trois niveaux de bruit :
>
> | Bruit d'altitude | Ancien calcul | Nouveau |
> | --- | --- | --- |
> | ±2 m | +66 % | **−5 %** |
> | ±3 m | +109 % | **−2 %** |
> | ±5 m | +200 % | **+5 %** |
>
> Les coefficients `elevationPlus/MinusCorrection` sont repassés à **1.0** : ils
> compensaient la dérive de l'ancien calcul, qui n'existe plus.

Changement **permanent** : éditer le JSON → commit → merge `main` → CI rebuild
→ `./deploy.sh`. Changement **ponctuel** : poser la variable d'env dans
`infra/.env` → `./deploy.sh`.

> ### Recaler les stats sur la montre, EN COURS d'aventure
>
> Oui, et c'est **rétroactif** : le cache brut ne contient que les positions
> Traccar telles quelles ; corrections et filtres sont **recalculés depuis ce
> brut à chaque tick** (`compute.ts`), jamais figés. Changer un coefficient
> corrige donc **toute la trace depuis le départ**, pas seulement la suite.
>
> ```bash
> # infra/.env, puis ./deploy.sh — effet en moins de 15 s
> SAMPLING_CORRECTION=1.05          # distance
> ELEVATION_PLUS_CORRECTION=0.92    # D+
> ELEVATION_MINUS_CORRECTION=0.92   # D−
> ```
>
> Méthode : comparer `./track status` à la montre au même instant, puis
> multiplier le coefficient courant par `montre / affiché`. Exemple : affiché
> 47,0 km pour 49,3 km à la montre, coefficient courant 1,03 →
> `1,03 × 49,3 / 47,0 ≈ 1,08`.
>
> ⚠️ `./track reset` **efface le cache brut** : après lui, plus rien à recaler.

### 10.2 Le token Traccar
- Vit **uniquement** dans `infra/.env` → `TRACCAR_API_TOKEN`. **Jamais** dans le
  repo. Sans lui, le conteneur redémarre en boucle.
- Sert à deux choses : tracking-cache lit `/positions`, **et** Caddy l'injecte
  sur `/api/public/*`.
- **Régénérer** : UI Traccar → compte **`public`** → générer un token → coller
  dans `infra/.env` → `cd infra && ./deploy.sh` (régénérer invalide l'ancien).
  Le compte `public` doit avoir l'appareil **partagé** pour lire ses positions.

### 10.3 Changer d'appareil émetteur
1. UI Traccar → **Paramètres → Appareils → +** → identifiant unique. Note le
   `deviceId` numérique attribué.
2. Partage l'appareil au compte `public`.
3. Mobile/tracker : pointe sur ce nouvel identifiant.
4. Back : `DEVICE_ID=<n>` dans `infra/.env` (`./deploy.sh`) — ou permanent dans
   `tracking.config.json`.
5. `./track reset` puis `./track start` pour repartir propre.

### 10.4 Hygiène Traccar
Inscription publique **décochée** (Paramètres → Serveur), sinon des bots créent
des comptes en masse. Port balise (`5055`/`5004`) laissé **ouvert** dans `ufw`.

---

## 11. Les replays dans les pages projets

Distinct de `/live` : les **pages projets** (`apps/site/public/projets/<slug>.md`)
peuvent embarquer une carte via une balise, rendue inline par le package
`@locomotionlab/tracking` (pas d'iframe).

- **`<postlivetracking positions="/replays/<slug>/live-positions.json" … />`** —
  rejoue une trace **figée** depuis un JSON statique. C'est ce qu'utilisent les
  récits Réunion, Chartreuse, saison trail. Le composant lit deux formats
  historiques (brut Traccar ou format tracking-cache) via `normalizeReplayData`.
- **`<livetracking referenceGpx="…" … />`** — variante live (poll de
  `live-positions.json`), pour afficher une sortie en direct dans un article.

Attributs utiles : `totalDistance`, `elevationMin`/`Max`, `referenceGpx`,
`title`, `mapHeight`, `initialMapStyle` (`osm`·`topo`·`satellite`), et pour les
vieux replays au format brut, les correcteurs `distanceFactor`/`ascentFactor`/
`descentFactor` (à **1** ou absents pour le format tracking-cache, déjà corrigé).
Un paragraphe en *italique* juste après la balise devient sa légende.

> Pour fabriquer un replay à la main sans passer par `live:archiver` : récupérer
> `curl -s https://tracking.thelocomotionlab.com/live-positions.json` **avant**
> tout `reset`, le déposer en `public/replays/<slug>/live-positions.json`, poser
> la balise, committer, déployer.

---

## 12. Déploiement & mise en service

### 12.1 Les services (VPS)
Les images sont construites par la CI (`.github/workflows/deploy-vps.yml`) au
merge sur `main`, puis déployées à la main :
```bash
ssh vps "cd /opt/locomotionlab && git pull && cd infra && ./deploy.sh"
ssh vps "cd /opt/locomotionlab/infra && docker compose ps"     # tout healthy ?
curl -s https://api.thelocomotionlab.com/journal/healthz        # ok:true, selfCheck.ok:true
```

**Secrets `infra/.env`** (jamais dans le repo — cf. `docs/secrets.md`) :
`API_DOMAIN`, `LIVE_DOMAIN`, `LIVE_JOURNAL_IMAGE`, `TELEGRAM_BOT_TOKEN`
(BotFather), `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`),
`VALENTIN_CHAT_ID` (@userinfobot), `TRACCAR_API_TOKEN` ; en staging
`SITE_BASE=…pages.dev` (§8).

**Enregistrer le webhook** (une fois, ou après changement de secret/domaine) :
```bash
ssh vps 'cd /opt/locomotionlab/infra && set -a && . ./.env && set +a && ../services/live-journal/scripts/set-webhook.sh'
```

**DNS Cloudflare** : `api` **proxifié (orange)**, `live` proxifié (301 → `/live`),
`tracking` et `depot` **DNS-only (gris)**.

**Épingler l'image pendant une aventure** : `LIVE_JOURNAL_IMAGE=…:sha-XXXXXXX`
dans `.env` (pas de `:latest` surprise) → `./deploy.sh`.

### 12.2 Le site
- **Staging** (tant que le domaine public n'est pas lancé) :
  `pnpm -F site deploy:staging` → `https://staging.thelocomotionlab-website.pages.dev`.
- **Production** (jour du lancement) : `pnpm -F site deploy:cf`.

Détails de la stratégie staging : [`plan-staging.md`](./plan-staging.md).

---

## 13. Recette de bout en bout (avant une sortie)

À dérouler une fois le déploiement fait, pour partir serein :

- [ ] `curl …/journal/healthz` → `ok:true`, `selfCheck.ok:true`, `og` récent.
- [ ] **Positions** : `./track reset && ./track start`, l'appareil émet →
      points sur `/live` en < 1 min ; `./track status` monte.
- [ ] **Carnet** : au bot, un **texte**, une **photo**, un **vocal** → chacun
      « ✓ Publié » et visible sur `/live` ; **édite** un message (→ corrigé) ;
      **`/supprimer`** en réponse (→ retiré).
- [ ] **Vocal lisible sur iPhone ET Android** (le vrai test du transcodage).
- [ ] **Message visiteur** depuis `/live` (texte, puis avec une **photo/vocal**)
      → arrive sur ton Telegram en < 30 s.
- [ ] **Partage** : ouvrir `/live` sur WhatsApp → l'aperçu montre la carte OG
      avec la progression ; **« Partager l'aventure »** produit la story.
- [ ] **Zone blanche** : couper le réseau/tracker un moment → « zone blanche
      probable » (ton calme, pas une alerte), puis rétablissement.
- [ ] **Nettoyage du test** : `/purger confirmer` (carnet) + `./track reset`
      (positions) → `/live` revient à « Avant » propre.

---

## 14. Pannes probables & remèdes

> **Réflexe n°1 pour tout ce qui touche aux positions** : sur le VPS,
> `./infra/scripts/check-tracker.sh` teste les 5 maillons dans l'ordre et désigne
> le coupable (lecture seule, sans risque, même en pleine aventure).

| Symptôme | Diagnostic | Remède |
| --- | --- | --- |
| Plus de positions sur `/live` | tracker (batterie/ciel) → Traccar → tracking-cache | attendre d'abord (zone blanche ≠ panne) ; `./infra/scripts/check-tracker.sh` ; `./track status` ; `./track logs` (cherche `HTTP 401/403` = token) |
| Trous dans la trace qui ne se comblent jamais | points bufferisés par le tracker renvoyés hors de la fenêtre de rattrapage | `BUFFER_LOOKBACK_MINUTES` plus large que la coupure attendue (§10.1) ; store & forward bien activé côté tracker |
| `/live` reste sur « Avant » au départ | `track start` non lancé, ou timer KO | `./track start` ; `curl …/live-timer.json` |
| Carnet muet (pas de « ✓ Publié ») | webhook / service / Telegram | `curl …/journal/healthz` ; relancer `set-webhook.sh` ; `docker compose logs live-journal` ; Telegram down → repart seul (retries) |
| « ✗ Trop lourd pour l'API » | vidéo/fichier > 20 Mo (limite Bot API) | renvoyer plus court / compressé |
| Message visiteur « n'est pas parti » | Telegram API ou service down | le visiteur réessaie ; vérifier `healthz` si ça persiste |
| Bouton « Partager » sans effet | image `story.png` injoignable / navigateur sans Web Share | vérifier `…/journal/story.png` ; sinon l'onglet de repli s'ouvre |
| Aperçu OG périmé au partage | cache de la plateforme | Sharing Debugger Meta → « Scrape again » |
| Service en crash-loop | secret manquant / volume | `docker compose logs live-journal` **dit** ce qui manque ; `/live` reste servi par Caddy pendant ce temps |
| Régression après un déploiement | image `:latest` | épingler `LIVE_JOURNAL_IMAGE` au sha précédent + `./deploy.sh` |
| Disque plein | sauvegardes/artefacts accumulés | `ssh vps "df -h /"` puis nettoyer les vieux tar |

---

## 15. Contrat d'archive — `archive.json` (v1)

Produit par `export-archive` (via `live:archiver`, §9). **Plus aucune page ne le
rend** depuis le retrait de l'état « Terminé » : c'est désormais un fichier de
travail — l'index autoportant du journal et des médias d'une aventure, la
matière première pour en écrire le récit. Le replay d'une page projet, lui, lit
`live-positions.json` (§11).

**Principes :** `schemaVersion` obligatoire (un lecteur refuse poliment une
version inconnue) ; champs optionnels **vides plutôt qu'absents** ; `chat`
existe mais reste **vide** (les messages privés ne sont JAMAIS archivés).

```jsonc
{
  "schemaVersion": 1,
  "meta": {
    "slug": "mon-tour",              // identifiant stable (dossier, URL)
    "nom": "Mon Grand Tour",
    "dateDebut": "2026-08-20",       // ISO 8601 (déduit des données)
    "dateFin": "2026-08-24",
    "distanceKm": 194,               // déduit
    "denivelePositifM": 12000        // déduit
  },
  "positions": [                     // forme du profil de tracking-cache
    { "idx": 0, "fixTime": "…", "latitude": 44.9, "longitude": 6.3,
      "altitude": 1450, "distance": 0, "batteryLevel": 98 }
  ],
  "stats": { "distance": 194230, "dplus": 12040, "dminus": 12080,
             "durationSeconds": 375600, "lastFixTime": "…" },
  "journal": [                       // alimenté depuis Telegram
    // { "time": "…", "type": "texte"|"photo"|"audio"|"video",
    //   "texte": "…", "media": "journal/img-0012.webp",
    //   "id": "01J5…", "duree": 102, "largeur": 1600, "hauteur": 1200, "edite": true }
  ],
  "chat": []                         // VIDE par construction (privé jamais archivé)
}
```

> Les replays **antérieurs** à ce schéma (`public/replays/*` : Réunion 2025,
> Chartreuse/Vercors/Monts du Lyonnais 2026) restent des pièces v1 exposées
> telles quelles — aucune migration rétroactive. `packages/tracking` sait lire
> ces formats historiques (§11).
