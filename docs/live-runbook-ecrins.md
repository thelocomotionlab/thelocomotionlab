# Runbook — Le direct des Écrins (20–24 août 2026)

> **Le document d'exploitation du chantier 2.** À relire avant le test 24 h,
> à avoir sous la main (hors-ligne) pendant l'aventure. Une seule personne
> agit : Valentin. Pendant l'aventure, la règle est : **personne n'agit** —
> tout ce qui devait être fiabilisé l'a été avant le départ.
>
> Chaîne complète :
> `GL320M → Traccar (VPS) → tracking-cache → live-*.json → /live`
> `Telegram → live-journal → journal.json + médias + og.png → /live`

---

## 1. Mise en service initiale (UNE fois, avant le test 24 h)

Dans l'ordre — chaque étape se vérifie avant la suivante.

1. **Merger le chantier vers `main`** (décision Valentin) → la CI construit
   l'image `ghcr.io/thelocomotionlab/live-journal` (workflow `deploy-vps`).
   Le site se déploie sur Cloudflare Pages (`pnpm -F site deploy:cf`).
2. **DNS Cloudflare** (cf. `docs/cloudflare-vps.md`) : créer `api` et `live`
   → IP du VPS, **proxifiés** (nuage orange — seul 443 est nécessaire,
   contrairement à `tracking` qui reste DNS-only pour le port des balises).
3. **Secrets sur le VPS** — compléter `/opt/locomotionlab/infra/.env`
   (modèle : `infra/.env.example`) : `API_DOMAIN`, `LIVE_DOMAIN`,
   `LIVE_JOURNAL_IMAGE`, `TELEGRAM_BOT_TOKEN` (BotFather),
   `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`), `VALENTIN_CHAT_ID`.
4. **Déployer** :
   ```bash
   ssh vps "cd /opt/locomotionlab && git pull && cd infra && ./deploy.sh"
   ssh vps "cd /opt/locomotionlab/infra && docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile"
   ssh vps "cd /opt/locomotionlab/infra && docker compose ps"   # live-journal healthy ?
   ```
5. **Enregistrer le webhook** :
   ```bash
   ssh vps 'cd /opt/locomotionlab/infra && set -a && . ./.env && set +a && ../services/live-journal/scripts/set-webhook.sh'
   ```
6. **Vérifications de bout en bout** :
   - `curl https://api.thelocomotionlab.com/journal/healthz` → `ok: true`,
     `selfCheck.ok: true` ;
   - envoyer un TEXTE au bot → « ✓ Publié » + visible dans
     `https://api.thelocomotionlab.com/journal/journal.json` ;
   - un VOCAL → lisible depuis un iPhone ET un Android (le vrai test M4A) ;
   - `/supprimer` en réponse aux essais → journal propre ;
   - un message depuis « Laisse un mot » sur la préversion → arrive sur
     Telegram ;
   - `https://api.thelocomotionlab.com/journal/og.png` existe ;
   - `https://live.thelocomotionlab.com` → 301 vers `/live`.
7. **Partage réel** : partager `thelocomotionlab.com/live` sur WhatsApp →
   l'aperçu montre la carte OG. (Si un vieil aperçu colle : Sharing Debugger
   Meta → « Scrape again ».)

## 2. Checklist matériel — GL320M (à valider AVANT le test 24 h)

- [ ] **Store & forward ACTIVÉ** : le tracker met en mémoire hors réseau et
      renvoie tout au retour du signal (indispensable en zone blanche).
- [ ] **Intervalle d'émission 30–60 s** — mode adaptatif si le firmware le
      propose (plus fréquent en mouvement).
- [ ] **SIM M2M multi-opérateurs** insérée, data vérifiée en itinérance
      (tester loin de chez toi, pas seulement au salon).
- [ ] **Appareil déclaré dans Traccar** (uniqueid = IMEI) et **port du
      protocole Queclink ouvert** dans ufw sur le VPS — le port 5055 actuel
      est celui du protocole OsmAnd (téléphone) ; le GL320M parle le
      protocole **Queclink @Track** (« gl200 » dans Traccar, port **5004**
      par défaut, TCP). Ouvrir 5004/tcp dans ufw et configurer le tracker
      sur `tracking.thelocomotionlab.com:5004` (domaine DNS-only : la
      connexion TCP arrive en direct, c'est voulu).
      `DEVICE_ID` de `infra/.env` doit pointer sur le BON appareil.
- [ ] **Tracker en HAUT du sac**, rien au-dessus (ciel dégagé).
- [ ] **Autonomie réellement testée sur 24 h** : sortie longue, intervalle
      réel, noter le % batterie début/fin — pas la fiche constructeur.
- [ ] Une sortie d'essai complète : positions visibles sur /live via
      `./track start` → marche → `./track stop`.

## 3. Checklist logicielle J-1 (19 août)

- [ ] `healthz` : `ok: true`, `selfCheck.ok: true`, `og.lastGeneratedAt` récent.
- [ ] Webhook sain : le selfcheck l'a vérifié (sinon il t'aurait écrit).
- [ ] **Espace disque** : `ssh vps "df -h /"` → > 2 Go libres.
- [ ] **Sauvegarde** : dump manuel du volume (infra/README.md § Sauvegardes)
      + poser le **cron quotidien** pour la durée de l'aventure.
- [ ] **Épingler l'image** : `LIVE_JOURNAL_IMAGE=ghcr.io/...:sha-XXXXXXX`
      dans `.env` + `./deploy.sh` (pas de `:latest` surprise pendant 5 jours).
- [ ] Envoi test complet (texte + photo + vocal), puis nettoyage `/supprimer`.
- [ ] Batteries : tracker chargé, téléphone + batterie externe.
- [ ] `liveConfig.aventure.dateDebut` = la VRAIE heure de départ → déployer le
      site si elle a changé (elle pilote J-index, countdown, T0).
- [ ] L'auto-surveillance tourne (elle se taira TOUTE SEULE au `track start`).

## 4. Jour J (20 août, avant 06 h)

1. Tracker : ON, en haut du sac, LED de fix GPS vérifiée.
2. `ssh vps "cd /opt/locomotionlab && ./track start"`
3. `/live` bascule sur « En attente du premier signal — le départ est
   imminent. » puis la première position arrive → EN DIRECT.
4. Envoyer le premier message au journal (« Départ. ») — il fait J1 · 06 h 0x.
5. Ranger le téléphone. Marcher.

## 5. Pendant l'aventure : RIEN

- **Personne n'agit.** L'auto-surveillance est silencieuse (voulu), le
  healthcheck docker relance le service si besoin, la lecture de /live est
  servie par Caddy même si le service tombe.
- Depuis le terrain, tout passe par Telegram : envoyer texte/photo/vocal ;
  **corriger** = éditer le message ; **supprimer** = y répondre `/supprimer`.
- Une zone blanche s'affiche comme une information (sauge), pas une panne :
  le tracker renverra tout (store & forward) au retour du signal.
- En cas de doute au bivouac : ouvrir `/live` comme n'importe qui. C'est tout.

## 6. Fin d'aventure (24 août)

1. `ssh vps "cd /opt/locomotionlab && ./track stop"`
2. **Sauvegarder** : dernier dump du volume (README infra), retirer le cron.
3. **Exporter l'archive** (depuis le poste, dans le repo à jour) :
   ```bash
   pnpm -F @locomotionlab/live-journal build && pnpm -F @locomotionlab/live-journal export-archive -- \
     --positions https://tracking.thelocomotionlab.com/live-positions.json \
     --journal   https://api.thelocomotionlab.com/journal/journal.json \
     --media-base https://api.thelocomotionlab.com \
     --out apps/site/public/replays/tour-des-ecrins-2026 \
     --slug tour-des-ecrins-2026 --nom "Tour des Écrins en autonomie" \
     --date-debut 2026-08-20 --date-fin 2026-08-24 \
     --distance-km 194 --denivele-m 12000
   ```
   La commande VALIDE le contrat avant d'écrire et copie les médias.
4. Vérifier l'archive (nb de positions/entrées, un vocal se lit en local),
   puis : `liveConfig.aventure.statut = "termine"` → commit archive + config
   → déployer le site. `/live` devient l'état « Terminé », autoporté.
5. Le service peut alors être éteint ou laissé tourner — la page n'en dépend
   plus. Garder le volume (sources originales) au moins le temps du récit.

## 7. Procédure du test 24 h (fin juillet) — LA recette finale du chantier

**Un dry-run complet SANS AUCUNE intervention manuelle** (brief §8) : sortie
longue avec le tracker, la chaîne réelle de bout en bout. À valider :

- [ ] Positions en continu sur /live pendant 24 h (intervalle réel noté).
- [ ] Un **vocal publié depuis le terrain**, lisible sur la page en **< 2 min**.
- [ ] Un **message privé** (demander à quelqu'un) reçu sur Telegram en **< 30 s**.
- [ ] **OG à jour** lors d'un partage WhatsApp pendant la sortie.
- [ ] **Zone blanche simulée** : tracker ÉTEINT 2 h en pleine sortie →
      la page affiche « Zone blanche probable » puis se rétablit, et le
      store & forward comble la trace au retour... (si le tracker est éteint
      il ne bufferise pas : couper le réseau ≠ couper le tracker — pour
      tester le buffering, préférer le mode avion d'une zone sans réseau ;
      éteint = test du trou pur).
- [ ] **Export d'archive propre au retour** (procédure §6 en conditions
      réelles, sortie du contrat validée) — puis remettre `statut: "avant"`.
- [ ] Batterie tracker consommée sur 24 h : notée ici → ______ %.
- [ ] Au passage : lecture iOS + Android, correction + /supprimer du terrain.

**Après le test 24 h : GEL.** Seuls les correctifs passent (brief §8) ;
options §9 du brief uniquement si le test est vert ET qu'il reste du temps.
Fenêtre de re-test : 8–9 août. Gel définitif le 10 août.

## 8. Pannes probables et remèdes

| Symptôme | Diagnostic | Remède |
|---|---|---|
| Plus de positions sur /live | Tracker (batterie/ciel) → Traccar (hôte) → tracking-cache | Attendre d'abord (zone blanche ≠ panne). Puis : UI Traccar (dernière position reçue ?) ; `./track status` ; `docker compose logs tracking-cache --tail 50` |
| Journal muet (messages sans « ✓ Publié ») | Webhook / service / Telegram | `curl …/journal/healthz` ; `docker compose logs live-journal --tail 50` ; relancer `set-webhook.sh` ; Telegram down → ça repartira seul (retries) |
| « ✗ Trop lourd pour l'API » | Vidéo/fichier > 20 Mo (limite Bot API) | Renvoyer plus court/compressé |
| /live reste sur « Avant » au départ | `track start` non lancé, ou timer KO | `./track start` ; `curl https://tracking…/live-timer.json` |
| Message privé : « n'est pas parti » | Telegram API ou service down | Le visiteur réessaie ; vérifier healthz si ça persiste |
| OG périmée au partage | scheduler / live-config injoignable | `docker compose logs live-journal | grep og` ; cache de la plateforme → Sharing Debugger |
| Disque plein | sauvegardes accumulées | `ssh vps "ls -lh ~/backups"` → supprimer les vieux tar |
| Service en crash-loop | secret manquant / volume | `docker compose logs live-journal` — il DIT ce qui manque. La lecture de /live reste servie par Caddy pendant ce temps |
| Régression après un déploiement | image `:latest` | Épingler `LIVE_JOURNAL_IMAGE` au sha précédent + `./deploy.sh` |
| Tout est cassé | — | Snapshot OVH (filet ultime, runbook VPS étape 0.A). La page /live retombe au pire sur « Avant » : jamais de page morte |

## 9. Après l'aventure

Export fait (§6), site en « Terminé », service éteint si souhaité, volume
sauvegardé. Les emails (annonce du récit) restent MANUELS via Listmonk —
hors du code de ce chantier. Le récit vient plus tard ; l'archive, elle,
est déjà éternelle.
