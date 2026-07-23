# Plan staging — tout câbler « comme en prod » sans lancer thelocomotionlab.com

> **Le document de référence de la mise en service.** Établi le 2026-07-22 après analyse
> complète du dépôt (site, services, infra, CI, docs). Il répond à trois questions :
> **(1)** comment tout déployer et finir les chantiers en suspens SANS toucher au domaine
> public `thelocomotionlab.com` ; **(2)** la liste exhaustive des chantiers, avec l'état
> réel de chacun ; **(3)** la stratégie pour les templates d'email.
>
> Procédures détaillées existantes (ce plan les référence, il ne les remplace pas) :
> [`live-runbook-ecrins.md`](./live-runbook-ecrins.md) · [`runbook-vps.md`](./runbook-vps.md) ·
> [`email-setup.md`](./email-setup.md) · [`cloudflare-vps.md`](./cloudflare-vps.md) ·
> [`deploy-cloudflare.md`](./deploy-cloudflare.md).

---

## 0. L'idée directrice (le déclic qui débloque tout)

**Une seule chose doit rester « non lancée » : l'apex `thelocomotionlab.com` (et `www`).**
Tout le reste peut — et devrait — être déployé **en configuration définitive dès maintenant** :

| Brique | Où elle vit | Dépend du lancement du site ? |
| --- | --- | --- |
| Services VPS (tracking, journal, ateliers, dépôt Twin, Listmonk) | sous-domaines `api.*`, `tracking.*`, `liste.*`, `depot.*`, `live.*` | **NON** — des sous-domaines n'affectent pas l'apex |
| Passerelle email (Worker Cloudflare) | `email-gateway.<compte>.workers.dev` | **NON** |
| Relais d'envoi Brevo + authentification SPF/DKIM du domaine | enregistrements DNS dédiés | **NON** — indépendant du site web |
| Le site Next.js lui-même | Cloudflare Pages | **OUI — et c'est le SEUL morceau.** On le met sur une **URL de staging Pages**. |

Conséquence : on câble tous les services à leurs **URL définitives**, le site de staging
pointe vers ces mêmes URL définitives, et **le jour du lancement il n'y a RIEN à recâbler**
— un seul geste : déployer le site en production (§7).

```
                AUJOURD'HUI (phase staging)                      LANCEMENT (jour J)
   staging.thelocomotionlab-website.pages.dev              thelocomotionlab.com (apex)
                      │                                              │
                      ▼                                              ▼
        ┌──────────────────────────────┐               (exactement les mêmes flèches,
        │  email-gateway (Worker CF)   │──► liste.thelocomotionlab.com (Listmonk → Brevo)
        │  api.thelocomotionlab.com    │──► live-journal + atelier-api (VPS)
        │  tracking.thelocomotionlab.com│──► Traccar + tracking-cache (VPS)
        │  depot.thelocomotionlab.com  │──► twin-depot (VPS, DNS gris)
        └──────────────────────────────┘
```

Ce qui différencie staging et prod se réduit à **3 réglages**, tous réversibles :
1. l'URL sur laquelle le site est servi (alias de branche Pages vs domaine apex) ;
2. `SITE_BASE` dans `infra/.env` (live-journal lit `{SITE_BASE}/live-config.json` pour la carte OG) ;
3. les origines staging ajoutées aux allowlists CORS (déjà committées — à retirer au lancement).

---

## 1. Le site en staging — la réponse à « comment déployer sans lancer ? »

### 1.1 La solution retenue : un déploiement de branche sur le projet Pages existant

Le projet Cloudflare Pages s'appelle **`thelocomotionlab-website`**. Chaque projet Pages
sert **deux environnements** : *Production* (la branche de prod + le domaine apex) et
*Preview* (toute autre branche, servie sur `https://<branche>.<projet>.pages.dev`).
Déployer sur une branche nommée `staging` ne touche **jamais** le domaine public.

Un script est maintenant dans le repo (`apps/site/package.json`) :

```bash
pnpm -F site deploy:staging
# = npx @cloudflare/next-on-pages
#   && npx wrangler pages deploy .vercel/output/static
#        --project-name=thelocomotionlab-website --branch=staging
```

→ URL stable : **`https://staging.thelocomotionlab-website.pages.dev`**
(chaque déploiement reçoit AUSSI une URL `<hash>.thelocomotionlab-website.pages.dev` —
utilise toujours l'alias `staging.…`, c'est LUI qui est dans les allowlists CORS).

⚠️ **Règle d'or de la phase staging : ne JAMAIS lancer `deploy:cf` (ni `deploy:site`)
avant le jour J.** `deploy:cf` sans `--branch` déploie la branche de production → le
domaine public serait mis à jour. `deploy:staging` est le seul geste autorisé d'ici là.

### 1.2 À faire une fois côté Cloudflare (dashboard) — 5 min

1. **Vérifier le flag `nodejs_compat` en Preview** : dashboard → **Workers & Pages →
   thelocomotionlab-website → Settings → Runtime / Functions → Compatibility flags**.
   Le flag `nodejs_compat` doit être présent pour **Production ET Preview** (c'est
   documenté dans `deploy-cloudflare.md` ; sans lui, la préversion rend une erreur 500).
2. **Rien d'autre.** Pas de nouveau projet, pas de DNS, pas de certificat : l'URL
   `*.pages.dev` est servie en HTTPS par Cloudflare automatiquement.

**Contingence** (peu probable) : si `wrangler pages deploy` refuse avec une erreur du type
*« this project is connected to a Git repository »*, c'est que la suspension des
déploiements automatiques a laissé l'intégration Git branchée en mode « direct upload
interdit ». Deux sorties, au choix :
- **a)** dashboard → thelocomotionlab-website → **Settings → Builds & deployments** →
  déconnecter l'intégration Git (« Manage » → disconnect). Les déploiements deviennent
  100 % manuels (`deploy:staging` / `deploy:cf`) — c'est déjà le mode de travail actuel ;
- **b)** créer un projet dédié : `npx wrangler pages project create thelocomotionlab-staging
  --production-branch staging`, ajouter le flag `nodejs_compat` (même écran Settings que
  ci-dessus, sur le nouveau projet), puis déployer avec
  `npx wrangler pages deploy .vercel/output/static --project-name=thelocomotionlab-staging`.
  L'URL devient `https://thelocomotionlab-staging.pages.dev` (elle est AUSSI déjà dans
  les allowlists CORS committées — les deux variantes sont couvertes).

### 1.3 Visibilité de la préversion

- **Oui, l'URL de staging est publique** : quiconque possède le lien peut l'ouvrir (pas
  d'authentification). Mais elle n'est liée nulle part, absente des moteurs (aucun lien
  entrant), donc en pratique seuls les gens à qui tu la donnes la voient. Et le site ne
  contient aucun secret côté client (uniquement des URL publiques) : au pire, quelqu'un
  découvre la refonte en avance.
- **Ne PAS activer Cloudflare Access dessus** pendant la phase de tests : les scrapers
  WhatsApp/Meta (test des cartes OG du live) doivent pouvoir lire la page sans
  authentification.
- **Au lancement, on ne la supprime PAS : on la verrouille et on la garde.** Elle devient
  la préversion permanente (le réflexe sain : `deploy:staging` pour vérifier, PUIS
  `deploy:cf`). Le verrou : dashboard → **Workers & Pages → thelocomotionlab-website →
  Settings → General → Access policy → Enable** — cela protège les URL `*.pages.dev` du
  projet (previews) derrière un code à usage unique envoyé par email, SANS toucher au
  domaine de production. En complément, le retrait des origines staging des allowlists
  CORS (§7.3) neutralise de toute façon les formulaires depuis la préversion.
- Si l'indexation t'inquiète (quelques semaines seulement), on pourra ajouter un en-tête
  `X-Robots-Tag: noindex` conditionné au staging — dis-le-moi, petit chantier de 10 lignes.

### 1.4 Les variables du build staging — `apps/site/.env.production`

Le build est **local** (les builds Git Cloudflare sont suspendus), donc les variables
sont lues dans `apps/site/.env.production` (git-ignoré) au moment de `deploy:staging`.
Créer ce fichier avec les **URL définitives** (elles servent telles quelles au lancement) :

```bash
# apps/site/.env.production — valeurs RÉELLES (aucun secret, uniquement des URL publiques)
NEXT_PUBLIC_TRACKING_PROXY=https://tracking.thelocomotionlab.com
NEXT_PUBLIC_JOURNAL_API=https://api.thelocomotionlab.com
NEXT_PUBLIC_ATELIER_API=https://api.thelocomotionlab.com/ateliers
NEXT_PUBLIC_TWIN_DEPOT_API=https://depot.thelocomotionlab.com/twin
NEXT_PUBLIC_EMAIL_ENDPOINT=https://email-gateway.<TON-SOUS-DOMAINE>.workers.dev/subscribe
# NEXT_PUBLIC_LIVE_STATUT=   ← vide en temps normal ("avant") ; "termine" après l'aventure
```

(`<TON-SOUS-DOMAINE>` : l'URL exacte s'affiche à la fin de `npx wrangler deploy` de la
passerelle, chantier C2. Tant que la passerelle n'est pas déployée, laisse la ligne
`NEXT_PUBLIC_EMAIL_ENDPOINT` en commentaire : les formulaires retombent proprement sur
l'ancien Worker `send-email`.)

⚠️ **Piège Next.js** : `.env.local` est aussi lu par `next build` et **gagne** sur
`.env.production`. Si ton `.env.local` définit une de ces variables (même vide !), elle
écrasera la valeur de prod. Garde `.env.local` pour le dev uniquement, et n'y laisse
aucune de ces clés définie-mais-vide.

### 1.5 CORS et `SITE_BASE` — déjà préparés dans ce commit

Les services ne répondent qu'aux origines connues. Les deux origines staging possibles
sont désormais dans les allowlists versionnées (à retirer au lancement, §7) :

- `services/email-gateway/wrangler.toml` → `ALLOWED_ORIGINS`
- `services/atelier-api/atelier-api.config.json` → `allowedOrigins`
- `services/twin-depot/twin-depot.config.json` → `allowedOrigins`
- `services/live-journal/live-journal.config.json` → `allowedOrigins`

(Les JSON du live-tracking — `live-positions.json`, `live-timer.json` — sont servis par
Caddy en `Access-Control-Allow-Origin: *` : rien à faire.)

**Prise d'effet** : ces valeurs sont embarquées dans les images Docker → il faut que la
CI ait reconstruit les images **depuis `main`** (merge de cette branche) avant le
`./deploy.sh` sur le VPS. Pour la passerelle : re-`wrangler deploy`. En dépannage rapide,
les mêmes listes sont surchargeables sans rebuild via `infra/.env` :
`ATELIER_ALLOWED_ORIGINS`, `TWIN_DEPOT_ALLOWED_ORIGINS`, `ALLOWED_ORIGINS` (live-journal),
en CSV.

Enfin, pour que la **carte OG du live** montre la vraie progression pendant la phase
staging : dans `infra/.env`, poser `SITE_BASE=https://staging.thelocomotionlab-website.pages.dev`
(documenté dans `.env.example` ; live-journal y lit `live-config.json`). À retirer au jour J.

---

## 2. Phase 0 — l'état des lieux (15 min, à faire AVANT tout chantier)

Le repo dit ce qui est *écrit*, pas ce qui *tourne*. Trois zones d'ombre à lever — colle-moi
les sorties, elles décident des branches du plan.

**Depuis ton poste :**

```bash
# 1) La bascule Caddy (runbook étape 4) est-elle faite ?  "Caddy" = faite ; "nginx" = pas faite.
curl -sI https://tracking.thelocomotionlab.com | grep -i '^server:'

# 2) Listmonk est-il déployé et servi ?  (200/302 = oui ; timeout/NXDOMAIN = non)
curl -sI https://liste.thelocomotionlab.com/admin | head -3

# 3) Les nouveaux sous-domaines existent-ils déjà en DNS ?
for h in api live depot liste; do echo "— $h —"; dig +short $h.thelocomotionlab.com; done

# 4) Les services répondent-ils ?
curl -s https://api.thelocomotionlab.com/journal/healthz
curl -s https://api.thelocomotionlab.com/ateliers/healthz
curl -s https://depot.thelocomotionlab.com/twin/healthz
```

**Sur le VPS** (`ssh vps`, alias documenté ; sinon `ssh ubuntu@37.59.121.109`) :

```bash
cd /opt/locomotionlab && git log -1 --oneline        # le VPS est-il à jour de main ?
cd infra && grep -E '^(HTTP|HTTPS)_PORT' .env        # 8081/8443 = validation ; 80/443 = bascule faite
docker compose ps                                    # quels conteneurs tournent, healthy ?
grep -cE '^(TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|VALENTIN_CHAT_ID|TRACCAR_API_TOKEN|SMTP_HOST|ATELIER_ADMIN_TOKEN|TWIN_DEPOT_ADMIN_TOKEN|TWIN_DEPOT_NOTIFY_EMAIL|LISTMONK_DB_PASSWORD)=.+' .env
# ↑ compte les secrets DÉJÀ renseignés (9 = tout y est ; ne colle jamais leurs valeurs)
```

**Sur GitHub :** onglet **Actions → deploy-vps** : le dernier run sur `main` est-il vert ?
(Il construit les 6 images GHCR : template, tracking-cache, twin-engine, live-journal,
atelier-api, twin-depot.) Si un doute : **Actions → deploy-vps → Run workflow → main**.

Indice encourageant relevé dans le repo : la liste Listmonk « Le Lab » (id 3) a été créée
le **2026-07-19** (commentaire de `wrangler.toml`) → Listmonk semble déjà déployé et
partiellement configuré (§C2 en tient compte).

---

## 3. Chantier C1 — le live-tracking, prêt pour ton test en conditions réelles (J+2)

> Objectif : la chaîne **GL320M/téléphone → Traccar → tracking-cache → /live (staging)**
> ET **Telegram → live-journal → /live (staging)**, testée de bout en bout.
> Réfs : `live-runbook-ecrins.md` §1-2, `live-reste-a-faire.md`, `tracking-cache.md`.

État du code : **terminé et mergé dans `main`** (PR1→PR5, 89 tests verts). Tout ce qui
reste est de la mise en service. Dans l'ordre :

### C1.a — Pré-requis VPS (selon Phase 0)

1. **Si la bascule n'est pas faite** (`server: nginx` au test 1) : c'est LE préalable —
   Caddy doit prendre 80/443 pour servir `api.*` et les JSON du live. Suivre
   [`runbook-vps.md` étape 4](./runbook-vps.md) **avec ses garde-fous** (snapshot OVH
   0.A + sauvegarde Traccar 0.B d'abord ; rollback documenté en 4.5). Résumé :
   `git pull` → `.env` : `HTTP_PORT=80`, `HTTPS_PORT=443` + `TRACCAR_API_TOKEN` (le
   NOUVEAU, régénéré) → `sudo systemctl stop nginx && sudo systemctl disable nginx` →
   `./deploy.sh` → vérifs 4.4.
2. **DNS Cloudflare** (dashboard → thelocomotionlab.com → **DNS → Records**) — créer si
   absents (test 3 de la Phase 0) :
   | Name | Type | Contenu | Proxy |
   | --- | --- | --- | --- |
   | `api` | A | IP du VPS | **Proxied (orange)** |
   | `live` | A | IP du VPS | **Proxied (orange)** |
   | `liste` | A | IP du VPS | **Proxied (orange)** — si pas déjà là |
   | `depot` | A | IP du VPS | **DNS only (GRIS)** ⚠ (uploads > 100 Mo) |
   | `tracking` | A | IP du VPS | reste **DNS only (GRIS)** ⚠ (port balise en TCP direct) |
3. **Secrets `infra/.env`** (sur le VPS) : `API_DOMAIN`, `LIVE_DOMAIN` (présents dans
   `.env.example`), `TELEGRAM_BOT_TOKEN` (BotFather), `TELEGRAM_WEBHOOK_SECRET`
   (`openssl rand -hex 32`), `VALENTIN_CHAT_ID` (bot @userinfobot), `TRACCAR_API_TOKEN`.
   Phase staging : `SITE_BASE=https://staging.thelocomotionlab-website.pages.dev` (§1.5).
4. **Déployer + webhook** :
   ```bash
   ssh vps "cd /opt/locomotionlab && git pull && cd infra && ./deploy.sh"
   ssh vps "cd /opt/locomotionlab/infra && docker compose ps"          # tout healthy ?
   ssh vps 'cd /opt/locomotionlab/infra && set -a && . ./.env && set +a && ../services/live-journal/scripts/set-webhook.sh'
   curl -s https://api.thelocomotionlab.com/journal/healthz            # ok:true, selfCheck.ok:true
   ```

### C1.b — Le site sur l'URL de staging

```bash
# depuis ton poste, repo à jour (branche main une fois ce plan mergé)
#   1) créer apps/site/.env.production (§1.4)  2) puis :
pnpm install && pnpm -F site deploy:staging
```
Ouvre `https://staging.thelocomotionlab-website.pages.dev/live` → état « Avant » propre.

### C1.c — L'appareil qui émet

Deux options pour ton test de J+2 :
- **Option téléphone (zéro config serveur, recommandée si le GL320M n'est pas prêt)** :
  app **Traccar Client**, protocole OsmAnd, serveur `http://tracking.thelocomotionlab.com:5055`
  — le port 5055 est déjà ouvert et l'appareil existe déjà dans Traccar (`DEVICE_ID=8` par
  défaut ; s'il s'agit d'un autre appareil, `DEVICE_ID=<id>` dans `infra/.env` + `./deploy.sh`).
- **Option GL320M (la vraie répétition matériel)** : runbook Écrins §2 — déclarer l'IMEI
  dans Traccar (protocole « gl200 »), **ouvrir le port** : `sudo ufw allow 5004/tcp`
  (+ pare-feu OVH Manager si actif), pointer le tracker sur
  `tracking.thelocomotionlab.com:5004`, store & forward ON, intervalle 30–60 s.

### C1.d — Le test lui-même

```bash
ssh vps "cd /opt/locomotionlab && ./track reset && ./track start"
```
puis check-list (runbook §1.6 + §7) : positions sur `/live` en < 1 min ; texte + photo +
vocal au bot → publiés (vocal lisible iOS ET Android) ; « Laisse un mot » depuis la page
staging → arrive sur Telegram ; partage WhatsApp de l'URL staging → aperçu = carte OG
avec la progression ; `./track stop` au retour. Ensuite `./track reset` pour repartir
propre (ou exporte la trace d'essai avant si tu veux la garder).

**Contenus qui restent à fournir par toi** (bloquent le réalisme, pas le test) :
GPX définitif des Écrins (`pnpm -F site build:track …` + `referenceTrack` dans
`lib/liveConfig.js`), waypoints, bornes altimétriques (`700/3200 À REMPLACER`),
vraie `dateDebut`, texte d'intention (`[PREMIER JET]`) — cf. `live-reste-a-faire.md` §2.

---

## 4. Les autres chantiers, un par un

### C2 — Le socle email : Listmonk + Brevo + passerelle (à faire tôt, tout le reste s'y adosse)

Réf. pas-à-pas : [`email-setup.md`](./email-setup.md). État déduit du repo : liste
« Le Lab » (id 3) créée le 19/07 → §1-2 au moins entamés. Reste, dans l'ordre :

1. **Brevo** (§3) : compte gratuit → SMTP & API → générer la **clé SMTP** → la renseigner
   dans **Listmonk → Settings → SMTP** (`smtp-relay.brevo.com:587`, STARTTLS) → « Test
   connection » + email d'essai.
2. **SPF/DKIM** (§6 — à faire MAINTENANT, pas « avant la première campagne » : ça ne
   coûte rien et améliore l'aboutissement de TOUS les envois, opt-in et transactionnels) :
   Brevo → **Senders & Domains → Domains → thelocomotionlab.com → Authenticate** → copier
   les enregistrements proposés (DKIM `mail._domainkey`, etc.) dans Cloudflare → DNS.
   Ils n'interfèrent en rien avec le site.
3. **Même relais pour les transactionnels** : dans `infra/.env` → `SMTP_HOST=smtp-relay.brevo.com`,
   `SMTP_PORT=587`, `SMTP_USER=<login Brevo>`, `SMTP_PASS=<clé SMTP>`,
   `SMTP_FROM="The Locomotion Lab <contact@thelocomotionlab.com>"` → `./deploy.sh`.
   ⚠ `contact@thelocomotionlab.com` doit exister comme **expéditeur validé** chez Brevo
   (Senders & Domains → Senders) — sinon les envois partent en erreur.
4. **Passerelle** (§4) : dans Listmonk, créer l'utilisateur API `email-gateway` avec les
   DEUX rôles (User role `subscribers:get+manage` ET List role « Le Lab » en Manage), puis :
   ```bash
   cd services/email-gateway
   npx wrangler secret put LISTMONK_API_USER && npx wrangler secret put LISTMONK_API_TOKEN
   npx wrangler deploy        # note l'URL affichée → NEXT_PUBLIC_EMAIL_ENDPOINT (§1.4)
   ```
5. **Bascule côté site (staging)** : décommente `NEXT_PUBLIC_EMAIL_ENDPOINT` dans
   `.env.production` → `pnpm -F site deploy:staging` → inscris-toi avec une vraie adresse
   depuis la page staging → email de confirmation (template du Lab) → clic → contact dans
   Listmonk avec `attribs.source`. C'est le test de TOUS les points de capture (home,
   comprendre, quete, twin, live, soutenir, pratiquer-trail).
6. **Import du Google Sheet existant** (§5) : Subscribers → Import, `source: legacy`,
   « Mark as confirmed ».

### C3 — Ateliers (inscription + PDF + email) : **le code est FINI, il ne manque que la config**

Découverte de l'analyse : la chaîne complète existe et est testée — inscription avec fiche
structurée, référence `LL-ATL-…`, **PDF templaté rendu par twin-engine** (XeLaTeX,
`fiche_participant.tex.j2`), **email de confirmation avec le PDF en pièce jointe**
(nodemailer → Brevo), routes admin (listing + purge RGPD), compteurs de places live.
Reste :

1. `infra/.env` : `ATELIER_ADMIN_TOKEN` (`openssl rand -hex 24`) + le SMTP du C2.3 →
   `./deploy.sh` (le healthz doit dire `pdf: "actif"`, `email: "actif"` :
   `curl -s https://api.thelocomotionlab.com/ateliers/healthz`).
2. Site : `NEXT_PUBLIC_ATELIER_API=https://api.thelocomotionlab.com/ateliers` (§1.4, déjà
   dans le modèle) → `deploy:staging`.
3. **Contenu à fournir** : le vrai premier atelier (remplacer `atelier-test-2026-XX-XX`)
   dans **les deux fichiers en phase** : `services/atelier-api/atelier-api.config.json`
   (source du décompte + PDF) et `apps/site/lib/ateliers.mjs` (contenu/SEO) ; la photo de
   couverture ; et les **placeholders assurance** (`"assureur": "à compléter"`,
   `"numero": "à compléter"` dans `atelier-api.config.json` — ils s'impriment sur le PDF).
4. Test de bout en bout depuis le staging : inscription réelle → 200 + référence → email
   reçu avec `fiche-LL-ATL-….pdf` → admin :
   `curl -H "Authorization: Bearer $TOKEN" https://api.thelocomotionlab.com/ateliers/inscriptions?atelier=<id>`.

Écart fonctionnel assumé (chantier futur, pas bloquant) : **aucun email automatique de
liste d'attente** — quand une place se libère, tu préviens à la main (listing admin).

Les gestes du quotidien (lister les inscrits, ajouter/retirer quelqu'un — désistement
individuel par `DELETE /ateliers/inscriptions/<id>` —, purger après l'atelier) sont
détaillés dans [`docs/runbook-ateliers.md`](./runbook-ateliers.md).

### C4 — Dépôt Twin (cohorte) : config + UN petit dev à faire

Le service est complet (upload streamé 2 Go, honeypot, rate-limit, admin
listing/téléchargement/purge, notification « nouveau dépôt » à toi). Reste :

1. DNS `depot` **gris** (C1.a-2), `infra/.env` : `TWIN_DEPOT_ADMIN_TOKEN`
   (`openssl rand -hex 24`) + `TWIN_DEPOT_NOTIFY_EMAIL=<ton adresse>` → `./deploy.sh` →
   `curl -s https://depot.thelocomotionlab.com/twin/healthz` → `notification: "active"`.
2. Site : `NEXT_PUBLIC_TWIN_DEPOT_API=https://depot.thelocomotionlab.com/twin` (§1.4) →
   `deploy:staging` → la page `/outils/twin/cohorte` passe de « dépôt pas encore ouvert »
   au vrai formulaire. Test : déposer une archive réelle de quelques centaines de Mo
   (c'est LE test du DNS gris), suivre la barre de progression, vérifier la notification.
3. ✅ **Fait (2026-07-22)** : l'email de **confirmation au déposant** est codé —
   même pattern best-effort que la notification (nodemailer → Brevo), texte reprenant
   mot pour mot les promesses de l'écran de succès (archive bien arrivée, référence
   `LL-TWIN-…`, suppression après analyse). Il s'active dès que `SMTP_HOST` est posé
   (aucune variable en plus) ; `healthz` expose `confirmation: active|non_configuree`.

### C5 — Le formulaire de contact : ✅ rapatrié dans la passerelle (2026-07-23)

`ContactForm.jsx` postait **en dur** vers l'ancien Worker `send-email` (hors repo).
Fait : endpoint `POST /contact` dans `services/email-gateway` (relai via l'**API
transactionnelle Brevo**, `Reply-To` = le visiteur, honeypot, mêmes CORS/rate-limit),
et `ContactForm` bascule dessus quand `NEXT_PUBLIC_CONTACT_ENDPOINT` est défini
(sinon : repli sur l'ancien flux, comportement historique intact).

Mise en service :
1. Brevo → **Settings → SMTP & API → onglet API Keys** → *Generate a new API key*
   (nom : `email-gateway`) — ⚠️ c'est une clé **API v3**, distincte de la clé SMTP.
2. `git pull` puis `cd services/email-gateway && npx wrangler secret put BREVO_API_KEY
   && npx wrangler deploy`.
3. `apps/site/.env.production` :
   `NEXT_PUBLIC_CONTACT_ENDPOINT=https://email-gateway.thelocomotionlab.workers.dev/contact`
   → `pnpm -F site deploy:staging`.
4. Test : page contact du staging → le message arrive sur `contact@` (routé vers la
   boîte Gmail) → « Répondre » écrit directement au visiteur (Reply-To).
5. Quand tout est basculé (subscribe + contact) et le lancement fait : mettre l'ancien
   Worker send-email et l'Apps Script Google Sheet à la retraite (`email-setup.md` §7.3).

### C6 — Durcissements (passerelle + services) — optionnel, non bloquant

La revue de juillet avait laissé 5 constats ouverts sur `email-gateway` (C085–C090 dans
`revue-integrale-2026-07/constats.md`). ✅ Traités avec C5 (2026-07-23) : C085 (wrangler
épinglé en devDependency), C086 (body `null`/non-objet → 400 `corps_invalide`), C087
(borne mémoire du rate-limiter déplacée sur la branche qui fait grossir la Map), C090
(longueur testée avant la regex). Restent assumés : C088 (sources `footer`/`manifeste`
tolérées volontairement) et C089 (restriction d'origine = CORS seul, par design —
honeypot + double opt-in en aval).

Constaté le 2026-07-22 en conditions réelles : derrière le proxy Cloudflare (hôtes
orange : `api.*`), l'IP vue par les services est celle du **bord Cloudflare**
(ex. `172.70.x.x` dans la `preuve.ip` d'une fiche), pas celle du visiteur.
✅ **Corrigé le 2026-07-23** : atelier-api lit désormais `CF-Connecting-IP` (repli
X-Forwarded-For puis req.ip), pour le rate-limit ET la preuve de la fiche — même
helper que live-journal, qui l'avait déjà. Non concernés : la passerelle Worker
(utilisait déjà `CF-Connecting-IP`), twin-depot (`depot.*` en DNS gris → IP réelle
déjà vue), et `story.png` (seau de débit global volontairement sans IP).

### C7 — Modalités transverses (à savoir, rien à faire)

- **Auto-déploiement VPS (optionnel)** : le workflow `deploy-vps.yml` sait déployer en
  SSH après chaque build si on pose les secrets GitHub `VPS_SSH_HOST/USER/KEY` +
  `VPS_INFRA_DIR` (Settings → Secrets and variables → Actions). Aujourd'hui : volontairement
  dormant, déploiement manuel (`git pull && ./deploy.sh`). Je conseille de le laisser
  manuel jusqu'à après l'aventure.
- **Épinglage pendant l'aventure** : `LIVE_JOURNAL_IMAGE=…:sha-XXXXXXX` dans `infra/.env`
  (runbook §3) — pas de `:latest` surprise.
- **Branche `feat/course-gpx-only`** : porte un vrai travail twin-engine (mode GPX-only,
  ravitos optionnels, découpage auto 10 km) mais sur un historique git cassé (rebase de
  tout l'ancien historique). À statuer plus tard : cherry-pick du commit utile ou abandon.
  Rien d'urgent.

---

## 5. Les templates d'email — panorama et stratégie (ta question 3)

**Principe recommandé** (déjà celui du repo, on le généralise) :
- **Transactionnel** (déclenché par une action utilisateur) → **dans le repo**, avec le
  code du service qui l'envoie : versionné, testé, déployé avec le service.
- **Campagnes** (annonces, parutions — rédigées à la main, envoyées à la liste) → **dans
  l'UI Listmonk**, MAIS avec le HTML de base versionné dans le repo
  (`infra/listmonk/campaign-templates/`, à créer) et collé/importé une fois dans
  Campaigns → Templates. Listmonk stocke ses templates de campagne en base : l'UI est
  le bon endroit d'édition, le repo garde la source de vérité du design.

L'inventaire complet :

| # | Email | Canal d'envoi | Où vit le template | État |
| --- | --- | --- | --- | --- |
| 1 | **Double opt-in** (confirmation d'inscription à la liste) | Listmonk (auto) | `infra/listmonk/email-templates/subscriber-optin.html` (surcharge versionnée, montée via `--static-dir`) | ✅ fait, aux couleurs du Lab |
| 2 | **Confirmation d'inscription atelier + fiche PDF** | atelier-api → nodemailer → Brevo | texte dans `services/atelier-api/src/mailer.ts` ; PDF `fiche_participant.tex.j2` (twin-engine) | ✅ fait (option : version HTML brandée plus tard) |
| 3 | **Notification « nouveau dépôt Twin »** (pour toi) | twin-depot → nodemailer → Brevo | `services/twin-depot/src/mailer.ts` | ✅ fait |
| 4 | **Confirmation de dépôt au déposant** | twin-depot → nodemailer → Brevo | `services/twin-depot/src/mailer.ts` | ✅ fait (2026-07-22) |
| 5 | **Relai du formulaire de contact** | email-gateway `/contact` → API Brevo (Reply-To = visiteur) | `services/email-gateway/src/index.ts` | ✅ fait (2026-07-23) — reste la mise en service (C5) |
| 6 | **Template de campagne « Le Lab »** (annonce Écrins, parutions) | Listmonk (manuel) | `infra/listmonk/campaign-templates/le-lab.html` (source) + UI Listmonk | ✅ gabarit prêt (2026-07-23) — à coller dans l'UI (procédure en tête du fichier) |
| 7 | **Liste d'attente atelier « une place s'est libérée »** | manuel aujourd'hui | — | 💤 chantier futur, optionnel |
| 8 | **Rapport Twin prêt** (quand le produit payant existera, `apps/twin`) | futur | — | 💤 hors périmètre actuel |

L'objet de l'email d'opt-in vient de la traduction système FR de Listmonk (choix assumé,
`email-setup.md` §2.4). Expéditeur unique partout : `contact@thelocomotionlab.com`.

---

## 6. L'ordre de marche proposé (récapitulatif)

| Quand | Quoi | Réf |
| --- | --- | --- |
| **J0 (aujourd'hui)** | Phase 0 (état des lieux) → merger cette branche → CI verte | §2 |
| **J0–J1** | C1.a VPS (bascule si besoin, DNS, secrets, deploy, webhook) | §3 |
| **J1** | C1.b site staging + C1.c appareil → mini-test à la maison | §3 |
| **J+2** | 🎯 **ton test tracking en conditions réelles** (C1.d) | §3 |
| ensuite | C2 (socle email) → C3 (ateliers) → C4 (dépôt Twin + dev confirmation) | §4 |
| ensuite | C5 (contact, décision) + C6 (durcissements) + templates de campagne (§5.6) | §4-5 |
| fin juillet | test 24 h du live (runbook §7) → gel | runbook |
| **jour J du lancement** | §7 ci-dessous | §7 |

---

## 7. Le jour du lancement officiel (pour mémoire — on y reviendra)

La récompense de l'architecture : **une demi-heure, zéro recâblage.**

1. `pnpm -F site deploy:cf` (déploiement **production** du projet Pages → l'apex sert la
   refonte). Vérifier `https://thelocomotionlab.com`.
2. `infra/.env` : retirer `SITE_BASE=…` (retour au défaut prod) → `./deploy.sh`.
3. Retirer les deux origines staging des 4 allowlists CORS (commit inverse de celui-ci)
   → merge → images reconstruites → `./deploy.sh` + `wrangler deploy` (passerelle).
4. Si souhaité : réactiver les déploiements automatiques Pages (ou rester en manuel).
5. Garde l'URL staging : elle devient ta préversion permanente pour tester avant chaque
   mise en prod (`deploy:staging` d'abord, `deploy:cf` ensuite — le réflexe à prendre).
