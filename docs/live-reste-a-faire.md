# Chantier 2 — ce qu'il reste à faire (checklist Valentin)

> Compilation au 2026-07-08, code-complet (PR1→PR5 livrées, 89 tests verts).
> Les procédures serveur détaillées vivent dans `docs/live-runbook-ecrins.md`
> (référencé « runbook » ci-dessous). Ce document est TA liste — coche au fur
> et à mesure. La section §6 est la procédure de test locale de A à Z.

## 1. Mise en service (VPS + Cloudflare) — runbook §1

- [ ] **Merger la branche `claude/live-brief-docs-ur6fhf` vers `main`** (ta
      décision) → la CI construit l'image `live-journal` (⚠️ premier vrai
      `docker build` de cette image : surveiller le run Actions) et le site
      se redéploie.
- [ ] **DNS Cloudflare** : `api` et `live` → IP du VPS, **proxifiés** (orange).
- [ ] **Secrets** dans `/opt/locomotionlab/infra/.env` : `API_DOMAIN`,
      `LIVE_DOMAIN`, `LIVE_JOURNAL_IMAGE`, `TELEGRAM_BOT_TOKEN`,
      `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`), `VALENTIN_CHAT_ID`.
- [ ] `git pull` + `./deploy.sh` + `caddy validate` + `docker compose ps`.
- [ ] `set-webhook.sh` (le bot passe du polling local au webhook prod).
- [ ] Vérifs de bout en bout (runbook §1.6) + **partage WhatsApp réel**.

## 2. Contenus que toi seul peux fournir

- [ ] **GPX définitif des Écrins** → `pnpm -F site build:track public/tracks/<fichier>.gpx`
      + mettre à jour `referenceTrack` dans `apps/site/lib/liveConfig.js`.
- [ ] **Waypoints `{nom, km, altitude}`** (Sarenne, Lautaret, Arsine, Aup
      Martin, Vauze/Muzelle…) dans `liveConfig.live.waypoints` → active les
      repères du profil ET « Dernière étape franchie » (OG + story).
- [ ] **Bornes altimétriques réelles** (`elevationMin`/`elevationMax`,
      aujourd'hui `700/3200 À REMPLACER`).
- [ ] **Heure de départ réelle** dans `aventure.dateDebut` (pilote J-index,
      compte à rebours, « premier signal »).
- [ ] **Tes textes** : l'intention de l'état Avant (`aventure.intention`,
      actuellement `[PREMIER JET]`) et les descriptions meta `[PROVISOIRE]`
      de `apps/site/app/live/page.jsx`.

## 3. Matériel GL320M — runbook §2

- [ ] Store & forward **activé** · intervalle 30–60 s (adaptatif si dispo).
- [ ] SIM M2M multi-opérateurs, data testée **en itinérance**.
- [ ] ⚠️ **Traccar** : déclarer l'appareil (IMEI) ; le port 5055 actuel est
      celui du protocole OsmAnd (téléphone) — le GL320M parle **Queclink**
      (port Traccar dédié, généralement 5023) : ouvrir le port dans ufw et
      vérifier `DEVICE_ID` dans `.env`.
- [ ] **Autonomie mesurée sur 24 h réelles** ; tracker en haut du sac.
- [ ] Une sortie d'essai complète : `./track start` → positions sur /live.

## 4. Tests restants

- [ ] **Test local de A à Z** (§6 ci-dessous) — refais-le après chaque
      correctif important.
- [ ] **Mobile réel iOS + Android** dès le déploiement : page /live, lecteur
      vocal (LE test M4A), photos, message privé.
- [ ] **Partage WhatsApp/Instagram réel** (OG + story) — impossible avant le
      déploiement (les scrapers ont besoin d'une URL publique).
- [ ] **LE TEST 24 H** (runbook §7 — c'est la recette finale du chantier) :
      dry-run sans intervention, positions 24 h, vocal < 2 min, message
      < 30 s, OG à jour, zone blanche 2 h, export propre au retour.
- [ ] Re-test éventuel 8–9 août après correctifs.

## 5. Calendrier (brief §11) et suite

- Tu es **en avance** : PR1→PR5 livrées le 8 juillet (jalon initial : 26/07).
- **Test 24 h : fin juillet** → puis GEL (seuls correctifs) → re-test 8–9/08
  → **gel définitif le 10/08** → départ le 20/08.
- Options SI test 24 h vert ET temps restant (brief §9, dans l'ordre) :
  ① vidéo ON (`VIDEO_ENABLED=1` + redéploiement — les vidéos déjà ingérées
  se republient seules) ; ② météo Open-Meteo par entrée ; ③ compteur de
  suiveurs anonyme. (④ micro-edge Cloudflare pour l'OG : avis défavorable,
  discuté — seulement si frustration réelle constatée au test.)
- Hors chantier : câblage Listmonk/Brevo (`docs/email-setup.md`) pour l'envoi
  MANUEL de l'annonce.

---

## 6. LE TEST LOCAL DE A À Z (ordi + Telegram + mobile, ~45 min)

> Tout se passe chez toi, rien sur le VPS. Trois pièges connus, une fois pour
> toutes : ① chaque commande avec variables tient sur UNE SEULE ligne ;
> ② deux terminaux (chacun reste ouvert, aucun ne « rend la main ») ;
> ③ le simulateur boucle son GPX en ~18 min puis passe « Terminé » —
> relance-le (Ctrl-C, ↑, Entrée) pour repartir à zéro.

### Phase 0 — Préparation (5 min)

```bash
git checkout claude/live-brief-docs-ur6fhf && git pull
pnpm install
pnpm test          # tout doit être vert
ffmpeg -version    # requis (transcodage des vocaux)
ip a | grep "inet "   # note ton IP locale, ex. 192.168.1.42 → appelée <IP> ci-dessous
```

Ton téléphone doit être sur le **même Wi-Fi** que l'ordi.

### Phase 1 — Les trois états au simulateur (10 min)

**Terminal 1** (le simulateur — autorise l'ordi ET le téléphone) :

```bash
DATA_DIR=/tmp/lj-test PORT=3999 ALLOWED_ORIGINS="http://localhost:3000,http://<IP>:3000" pnpm -F @locomotionlab/live-journal sim
```

✅ Attendu : `[sim] positions : … pts GPX` puis `live-journal démarré : port 3999 … mode SIMULATION`.

**Terminal 2** (le site, accessible depuis le téléphone) :

```bash
NEXT_PUBLIC_TRACKING_PROXY=http://<IP>:3999 NEXT_PUBLIC_JOURNAL_API=http://<IP>:3999 pnpm -F site dev -- -H 0.0.0.0
```

✅ Attendu : `▲ Next.js … Local: http://localhost:3000`. (S'il dit « using
port 3001 instead », libère le 3000 : `fuser -k 3000/tcp`, relance.)

Sur **http://localhost:3000/live**, chrono depuis le lancement du terminal 1 :

| Chrono | ✅ à voir |
|---|---|
| 0–20 s | badge EN DIRECT + « En attente du premier signal — le départ est imminent. » |
| ~20 s | itinéraire pointillé brun, trace ambre qui avance, marqueur pulsant, « Dernière position il y a 0 min », fonds de carte topo |
| t+5→80 s | le journal tombe : texte → photo → **vocal** → correction (« corrigé ») → un texte apparaît puis disparaît |
| en continu | Progression (%, barre, km, D+, temps) + profil qui s'ambre |
| ~5 min | « **Zone blanche probable** — dernière position il y a 1 h » (montagne, ton calme) pendant ~2 min, puis retour normal |

Gestes : lire le vocal (écoulé/durée, pas de scrubbing), basculer
Topo/Satellite, réduire la fenêtre à ~390 px (une colonne) puis plein écran
(deux colonnes, journal qui scrolle, message compact).

### Phase 2 — Telegram réel, aller-retour complet (10 min)

Coupe le terminal 1 (Ctrl-C) et relance-le en mode **bot réel** (ton bot,
celui de l'aventure — assure-toi de lui avoir déjà envoyé `/start`) :

```bash
TELEGRAM_MODE=polling TELEGRAM_BOT_TOKEN='<token>' VALENTIN_CHAT_ID='<ton-id>' DATA_DIR=/tmp/lj-bot PORT=3999 ALLOWED_ORIGINS="http://localhost:3000,http://<IP>:3000" pnpm -F @locomotionlab/live-journal dev
```

✅ Attendu : `[polling] démarrage (mode dev)` + `live-journal démarré : … mode polling`.
(⚠️ En polling il n'y a PAS de positions simulées : /live affichera l'état
« Avant » — normal, on teste ici le JOURNAL ; recharge
`http://localhost:3000/live` n'est pas nécessaire, on vérifie via l'URL du
journal ci-dessous.)

Depuis **ton téléphone, dans Telegram**, envoie au bot — et vérifie chaque
étape dans `http://localhost:3999/journal/journal.json` (recharge la page) :

1. un **texte** → bot : « ✓ Publié » ;
2. une **photo avec légende** → « ✓ Publié (photo) » ;
3. un **vocal** ~5 s → « ✓ Publié (vocal, 5 s) » ;
4. **édite** ton texte dans Telegram → pas de réponse, mais `editedAt` apparaît ;
5. réponds **`/supprimer`** au vocal → « 🗑 Supprimé », l'entrée disparaît ;
6. le **message privé**, dans l'autre sens — depuis l'ordi :
   ```bash
   curl -X POST http://localhost:3999/journal/message -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"message":"Test A-Z : ça marche !","prenom":"Valentin"}'
   ```
   ✅ `{"ok":true}` et le message **arrive dans Telegram**, envoyé par le bot.

### Phase 3 — Mobile sur le réseau local (10 min)

Reviens au simulateur (Ctrl-C sur le terminal 1, relance la commande de la
**Phase 1**). Sur le téléphone : **http://<IP>:3000/live**

- [ ] La page vit (badge, carte, journal qui tombe).
- [ ] **Le vocal se lit** (c'est LE test iOS/Android du M4A) ; coupe le Wi-Fi
      5 s en pleine lecture → la lecture reprend (reprise robuste).
- [ ] La photo s'affiche ; « Laisse un mot » : envoie → « Remis. Il le lira
      ce soir au bivouac. » (en simulation, la transmission s'affiche dans le
      terminal 1 : `réponse bot : 💬 Message de …`).

### Phase 4 — Cartes de partage (5 min)

Toujours sur le simulateur (avec le terminal 2 ouvert — le service lit la
config d'aventure sur le site local si tu ajoutes `SITE_BASE=http://localhost:3000`
à la commande du terminal 1 ; sinon carte « neutre », c'est normal) :

- [ ] `http://localhost:3999/journal/og.png` → carte EN DIRECT, la
      progression change d'une régénération à l'autre (3 min) ;
- [ ] `http://localhost:3999/journal/story.png` → story 1080×1920.

### Phase 5 — Export + état « Terminé » (5 min)

Laisse le scénario tourner ~2 min (3 entrées), puis depuis un 3e terminal :

```bash
pnpm -F @locomotionlab/live-journal export-archive -- --positions http://localhost:3999/live-positions.json --journal http://localhost:3999/journal/journal.json --media-base http://localhost:3999 --out apps/site/public/replays/tour-des-ecrins-2026 --slug tour-des-ecrins-2026 --nom "Tour des Écrins en autonomie" --date-debut 2026-08-20 --date-fin 2026-08-24 --distance-km 194 --denivele-m 12000
```

✅ `archive.json écrite … chat vide.` Puis : coupe le terminal 1 (**service
mort**), coupe le terminal 2 et relance-le avec le statut forcé :

```bash
NEXT_PUBLIC_LIVE_STATUT=termine pnpm -F site dev
```

Sur `http://localhost:3000/live` : bandeau « Aventure bouclée », stats, carte
de la trace, journal complet **avec le vocal qui se lit** — service éteint.

**Nettoyage** (données simulées, à ne JAMAIS committer) :

```bash
rm -rf apps/site/public/replays/tour-des-ecrins-2026 /tmp/lj-test /tmp/lj-bot
git status   # doit être propre
```

Si les 5 phases passent : la chaîne logicielle est validée de bout en bout —
il ne reste que le monde réel (déploiement §1, GL320M §3, test 24 h).
