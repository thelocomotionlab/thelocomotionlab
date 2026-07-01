# État de l'infra VPS — handoff (où on en est)

> **But de ce fichier** : qu'une nouvelle session (humaine ou IA) comprenne **précisément** l'état
> actuel du VPS et de la chaîne de déploiement, **sans rien re-découvrir ni rien casser**. C'est un
> instantané factuel. Pour les *pourquoi* pédagogiques : [`comprendre-infra-vps.md`](./comprendre-infra-vps.md).
> Pour les *commandes* : [`runbook-vps.md`](./runbook-vps.md). Pour la *décision* :
> [`adr/0001-deploiement-vps.md`](./adr/0001-deploiement-vps.md). Organisation de l'infra :
> [`../infra/README.md`](../infra/README.md).

## TL;DR

Le VPS OVH est devenu un **hôte à conteneurs** (Docker + reverse-proxy **Caddy**, HTTPS automatique).
Une app de test (`apps/_template`) y tourne **en conteneur**, servie en **HTTPS derrière Cloudflare**,
sur `template.thelocomotionlab.com`. Les images sont **construites en CI (GitHub Actions) → poussées
sur GHCR → tirées par le VPS** (`deploy.sh`). **Traccar (tracking GPS) est INTACT** : il tourne sur
l'hôte, toujours servi par l'**ancien nginx** sur `tracking.thelocomotionlab.com` — **pas encore migré
vers Caddy**. L'accès SSH est **blindé** (cloud-init désactivé). Le **site** marketing reste sur
**Cloudflare Pages** (hors VPS).

---

## 1. Repo

- Le travail d'infra est **mergé sur `main`** (fast-forward). Branche de dev historique :
  `claude/cool-turing-0nkgcx`.
- Fichiers clés ajoutés :
  - `infra/` : `compose.yml`, `deploy.sh`, `.env.example`, `caddy/{Dockerfile,Caddyfile,conf.d/}`,
    `README.md`.
  - `apps/_template/` : `Dockerfile` + `next.config.ts` en sortie **`standalone`** (+ `public/.gitkeep`).
  - `.github/workflows/deploy-vps.yml` (CI), `.dockerignore` (racine).
  - `docs/` : `runbook-vps.md` (avec **« étape 0 bis »** anti-lockout), `adr/0001-deploiement-vps.md`,
    `cloudflare-vps.md`, `comprendre-infra-vps.md`, ce fichier.
- **Le site** (`apps/site`) n'a **pas** été modifié par ce chantier (donc build Cloudflare Pages
  inchangé).

---

## 2. VPS — ce qui tourne (Ubuntu 24.04, IP `37.59.121.109`)

**En conteneurs** (projet compose `locomotionlab`, dossier **`/opt/locomotionlab/infra`**) :
- `locomotionlab-caddy-1` — image `locomotionlab/caddy:local` (Caddy + plugin `caddy-dns/cloudflare`,
  buildé sur place). Ports hôte **`8081→80`** et **`8443→443`** (mode **validation**, pour ne pas
  toucher 80/443).
- `locomotionlab-template-1` — image `ghcr.io/thelocomotionlab/template:latest` (Next standalone),
  écoute `3000` en interne (non publié ; joint par Caddy via le réseau `web`).
- `restart: unless-stopped` → les conteneurs **redémarrent au boot**.

**Sur l'hôte (PAS en conteneur, ne pas toucher sans précaution)** :
- **Traccar** (process `java`) : web/API sur **`127.0.0.1:8082`** (+ `0.0.0.0:8082` ouvert au pare-feu),
  port balises **`5055`** (OsmAnd, ouvert) ; autres ports `5xxx` à l'écoute mais **filtrés** (ufw).
- **nginx 1.24** : sert **`tracking.thelocomotionlab.com`** sur **443** → UI Traccar (`/`),
  `/api/public/*` (token injecté), et les **`/live-*.json`** lus sur disque (`/opt/traccar/`).
- **cloudflared** : un **tunnel Cloudflare** est actif (usage **à confirmer** — probablement
  code-server). À connaître : tout l'ingress public ne passe pas forcément par Caddy.
- **code-server** : VS Code web sur **`127.0.0.1:8080`** → **c'est pourquoi Caddy est sur 8081**, pas
  8080.
- Pare-feu **ufw** actif : ouverts = `22, 80, 443, 8082, 5055` (+ on a ajouté **`8443`** pour la
  validation Cloudflare→origine).

**Accès SSH (IMPORTANT — lire avant de toucher à l'accès)** :
- **cloud-init est DÉSACTIVÉ** (`/etc/cloud/cloud-init.disabled`). Raison : il re-verrouillait le mot
  de passe `ubuntu` à chaque reboot → **lockout**. **NE PAS réactiver** sans filet.
- `ubuntu` a **mot de passe** (régénéré, ASCII) **+ clé SSH** (`~/.ssh/authorized_keys`).
- **3 règles d'or** (cf. runbook « étape 0 bis ») : snapshot OVH avant toute opération risquée ;
  garder le double accès (mdp + clé) ; **reboot-test** après tout changement d'accès.

---

## 3. Caddy — configuration actuelle

- Construit depuis `infra/caddy/Dockerfile` (`caddy:2` + module `caddy-dns/cloudflare` via xcaddy).
- **HTTPS automatique** par **Let's Encrypt en DNS-01 Cloudflare** (secret `CF_API_TOKEN`). Marche
  derrière le proxy Cloudflare et sans port 80 libre.
- `infra/caddy/Caddyfile` : options globales (ACME DNS-01) + `import /etc/caddy/conf.d/*.caddy`.
- `infra/caddy/conf.d/` :
  - **`template.caddy`** — **ACTIF** : `template.thelocomotionlab.com` → `reverse_proxy template:3000`.
  - **`tracking.caddy.disabled`** — **PRÉPARÉ mais INACTIF** (suffixe `.disabled` = non importé) :
    reproduit fidèlement la conf nginx de Traccar (UI, `/api/public/*` + Bearer `{$TRACCAR_API_TOKEN}`,
    CORS, les 3 `live-*.json`, CSP). **Sera activé à la bascule** (Phase 3 / runbook étape 4).
- Joint les conteneurs par **nom de service** ; joint l'hôte (Traccar) via **`host.docker.internal`**
  (`extra_hosts: host-gateway`).

---

## 4. Cloudflare — configuration actuelle

- Zone **`thelocomotionlab.com`**.
- **DNS** : `template` → IP VPS, **Proxied** (orange). `tracking` → IP VPS (servi **directement par
  nginx** aujourd'hui ; statut proxy à confirmer — le `curl` renvoyait nginx en direct, HTTP/1.1).
- **SSL/TLS** : **Full (strict)** (Caddy présente un vrai cert LE).
- **Bots / IA** : **désactivés** (Bot Fight Mode + Block AI bots = OFF) — exigence du projet.
- **Origin Rule** : `template.thelocomotionlab.com` → **Destination Port = 8443** (parce que Caddy est
  sur la « porte de service » 8443 en mode validation). **À retirer** quand Caddy passera sur 443.
- **Site marketing** (`www`/apex) = **Cloudflare Pages** (build de `apps/site`), **séparé du VPS**.

---

## 5. CI/CD + GHCR (le flux de déploiement)

- **`.github/workflows/deploy-vps.yml`** : sur **push `main`** (paths `apps/_template/**`,
  `packages/ui/**`, `infra/**`, le workflow) → job **`build-template`** : build l'image Docker du
  template et la **pousse sur GHCR** (`ghcr.io/thelocomotionlab/template:latest` + tag `sha-…`). Job
  **`deploy`** (SSH) = **inerte** (gardé derrière le secret `VPS_SSH_HOST`, absent → `skipped`).
- **Image GHCR `template`** : **privée**. Le VPS a un **`docker login ghcr.io`** (token GitHub
  `read:packages`, stocké dans `~/.docker/config.json` sur le VPS) pour la tirer.
- **Flux complet, validé de bout en bout** :
  `git push main` → CI build → GHCR → sur le VPS `cd /opt/locomotionlab/infra && ./deploy.sh`
  (`docker compose pull` + `up -d`).

---

## 6. Secrets

- **Jamais dans le repo.** Vivent dans **`/opt/locomotionlab/infra/.env`** (sur le VPS, **non
  versionné**). Modèle versionné : `infra/.env.example`.
- Contenu de `.env` : `CF_API_TOKEN` (DNS-01), `ACME_EMAIL`, `HTTP_PORT=8081`, `HTTPS_PORT=8443`,
  `TEMPLATE_IMAGE`, `TEMPLATE_DOMAIN`, `TRACKING_DOMAIN`, et `TRACCAR_API_TOKEN` (pour la **future**
  route Caddy de Traccar — **pas encore utilisé**, le bloc tracking est `.disabled`).
- **Secrets qui ont fuité (collés en clair en cours de route) → considérés compromis** : 2 tokens
  Traccar + 1 PAT GitHub. **À régénérer** côté fournisseur (le PAT GitHub a été régénéré ; **vérifier
  que les tokens Traccar le sont aussi**).

---

## 7. Ce qui N'EST PAS encore fait (pending)

- **Bascule de Traccar de nginx → Caddy** : la route Caddy est **prête** (`tracking.caddy.disabled`),
  la procédure est dans le **runbook étape 4** (gated, snapshot d'abord). **nginx sert toujours
  `tracking.*`.** Traccar **pas** conteneurisé (volontairement — c'est un autre chantier).
- **Refonte du live-tracking** (front en `packages/tracking` + back conteneurisé) : un prompt détaillé
  est prêt (voir l'historique / `docs/prompts/` si committé). Le **backend tracking** (`live-cache.mjs`
  + chrono + scripts `~/live-tracking/`) est **sur le VPS, PAS dans le repo** → à rapatrier.
- **Grand rebuild tout-conteneurs** (conteneuriser Traccar + sa base, nettoyer la machine, choix
  tunnel/direct, code-server, base H2 vs MySQL) : **4 questions non tranchées**, reporté.

---

## 8. Pièges & leçons (à NE PAS refaire)

- **cloud-init** verrouillait le mot de passe à chaque reboot → lockout. Désactivé. **Toujours
  snapshot + reboot-test avant de toucher à l'accès.**
- **Port 8080 pris par code-server** → Caddy validation est sur **8081** (HTTP) / **8443** (HTTPS).
- **nginx possède 80/443** → en validation Caddy est sur 8081/8443 ; la **bascule** (Phase 3) libère
  80/443 pour Caddy.
- **Le mode validation** (ports alternatifs + Origin Rule 8443) permet de tout tester **sans toucher
  Traccar/nginx**. C'est le pattern à reprendre pour déployer toute nouvelle app **avant** une bascule.
- **Build local vs CI** : on a d'abord buildé l'image du template **localement sur le VPS** pour
  valider, puis basculé sur l'image **GHCR** (la vraie). `deploy.sh` fait `pull` (échoue en silence
  `|| true` si l'image n'est pas accessible → vérifier le `docker login` GHCR).

---

## 9. Commandes utiles (exécutées par le mainteneur sur le VPS)

```bash
# Déployer / mettre à jour la stack (après un push CI qui a poussé une nouvelle image)
cd /opt/locomotionlab && git pull && cd infra && ./deploy.sh

# État / logs
docker compose ps
docker compose logs -f caddy

# Repère mental : Caddy=portier(HTTPS), template=app de test, Traccar+nginx=legacy intact
```
