# ADR 0001 — Mode de déploiement des conteneurs sur le VPS

- **Statut** : accepté
- **Date** : 2026-06-25
- **Décideurs** : mainteneur (Valentin) + Claude
- **Contexte technique** : [`CLAUDE.md`](../../CLAUDE.md), [`infra/README.md`](../../infra/README.md),
  [`docs/runbook-vps.md`](../runbook-vps.md)

## Contexte

Le VPS OVH (Ubuntu) héberge déjà **Traccar** (sur `127.0.0.1:8082`) derrière **nginx** + Let's
Encrypt sur `tracking.thelocomotionlab.com`. Le front du site (déployé, lui, sur Cloudflare Pages) en
dépend en production via `apps/site/components/LiveTracking.jsx`.

On veut faire du VPS un **hôte propre à conteneurs** pour les futurs services qui ont besoin d'un vrai
backend (moteur du twin, app twin, app tracking), avec :

1. un **déploiement automatique depuis ce repo** (git → image → run) ;
2. un **HTTPS automatique** (certs gérés et renouvelés sans intervention) ;
3. **sans casser Traccar** ;
4. une exigence **non négociable** (cf. `CLAUDE.md`) : **toute la config de déploiement vit dans le
   repo** (infra-as-code) ; on n'édite jamais le VPS à la main ; aucun secret en clair.

Contrainte opérationnelle : le mainteneur exécute lui-même les commandes serveur (l'assistant n'a pas
de SSH).

## Options envisagées

### (a) Coolify (PaaS auto-hébergé : git-push-to-deploy + Traefik + HTTPS auto)

Coolify s'installe sur le VPS et fournit une UI + un reverse-proxy Traefik + de l'ACME automatique. On
peut lui faire déployer un `docker-compose` présent dans le repo.

- ➕ git-push-to-deploy **natif**, UI agréable, HTTPS auto intégré, gestion multi-apps.
- ➖ **« Config dans le repo » seulement partielle** : si le `compose` peut venir du repo, le **routage,
  les domaines, les variables d'env et l'état** vivent dans la **base de données + l'UI de Coolify**,
  pas dans le repo. L'exigence non négociable n'est donc pas pleinement satisfaite.
- ➖ **Empreinte lourde sur un serveur déjà en prod** : Coolify installe et veut « posséder » sa propre
  stack (son Docker, Traefik, Postgres, Redis, service temps réel…). Plus de surface = plus de risque
  d'interférence avec Traccar et nginx, et une cible de maintenance/sécurité plus large.
- ➖ **Réversibilité coûteuse** : désinstaller proprement Coolify est invasif.

### (b) GitHub Actions → image sur GHCR → `infra/deploy.sh` + reverse-proxy **Caddy** (HTTPS auto) — **RETENU**

CI (GitHub Actions) **construit** l'image applicative et la **pousse sur GHCR** ; le VPS ne fait que
`docker compose pull && up -d` (script `infra/deploy.sh`). Le reverse-proxy est **Caddy**, dont l'ACME
(Let's Encrypt) est automatique. Tout — Caddyfile, `compose`, `deploy.sh`, workflow CI — est un
**fichier texte versionné**.

- ➕ **100 % config dans le repo** : routes, domaines (via Caddyfile), orchestration (`compose`),
  livraison (`deploy.sh` + workflow) — rien d'état caché. Satisfait l'exigence non négociable.
- ➕ **Empreinte minimale** sur le VPS : 1 petit conteneur Caddy + les conteneurs d'apps. N'« avale »
  pas le serveur ; cohabite proprement avec Traccar.
- ➕ **Réversibilité triviale** : `docker compose down` + réactivation de nginx = retour arrière simple
  (cf. runbook).
- ➕ **Transparence** : le Caddyfile est lisible (et plus simple que des labels Traefik pour reproduire
  la route Traccar : réécriture `/api/public/*`, injection du Bearer, CORS).
- ➕ **HTTPS auto** via Caddy en **DNS-01 Cloudflare** : fonctionne **derrière le proxy Cloudflare** et
  **sans exiger le port 80 libre** → permet de **valider sans toucher 80/443** (donc sans toucher
  Traccar).
- ➖ git-push-to-deploy **non natif** : on le **reconstruit** avec GitHub Actions (build → GHCR) ; le
  pull côté VPS est manuel (`deploy.sh`) par défaut, avec une automatisation SSH **optionnelle** (job
  CI inerte tant que le secret n'est pas fourni).
- ➖ Image Caddy à **recompiler** pour embarquer le plugin `caddy-dns/cloudflare` (résolu par un petit
  Dockerfile `infra/caddy/Dockerfile`, versionné).

## Décision

On retient **(b) Caddy + GitHub Actions → GHCR + `infra/deploy.sh`**.

Sur un serveur qui porte **déjà un service critique** (Traccar), la combinaison **légèreté +
réversibilité + « 100 % config dans le repo »** prime sur le confort d'UI de Coolify. Le seul vrai
manque de (b) — le git-push-to-deploy clé en main — est **reconstruit** par GitHub Actions, sans rien
sacrifier de l'infra-as-code.

### Conséquences

- **Architecture cible** : Caddy (conteneur) = unique reverse-proxy, HTTPS auto (ACME **DNS-01
  Cloudflare**). Il **route** Traccar (sans le migrer) et les futurs sous-domaines d'apps. Cloudflare
  reste **devant** en proxy/CDN (TLS origine *Full strict*, blocage IA/bots **désactivé**).
- **Livraison** : `apps/*` → image construite en CI → **GHCR** → `docker compose pull && up -d` sur le
  VPS. Le VPS reste un **hôte propre** (pas de toolchain de build dessus).
- **Mise en route non disruptive** : on valide d'abord `apps/_template` sur un **sous-domaine de test**
  via Caddy mappé sur **ports alternatifs 8080/8443** (+ une *Origin Rule* Cloudflare → 8443), **sans
  libérer 80/443** ni toucher Traccar. La **bascule** de Traccar derrière Caddy (80/443) est une étape
  **séparée, réversible et *gated*** (snapshot + sauvegarde + `nginx -T` complet d'abord).
- **Secrets** : `CF_API_TOKEN` (DNS-01) et `TRACCAR_API_TOKEN` (injection Bearer) vivent dans
  `infra/.env` **non versionné** ; seul `infra/.env.example` (sans valeurs) est commité (cf.
  [`docs/secrets.md`](../secrets.md)).
- **Exceptions à « tout dans `infra/` »** assumées et documentées : le `Dockerfile` d'une app vit avec
  l'app (`apps/<app>/Dockerfile`, son contexte de build est le repo) et le workflow CI vit sous
  `.github/workflows/` (imposé par GitHub) ; le `.dockerignore` est à la racine (emplacement du
  contexte Docker). `infra/` garde l'**orchestration** (proxy, compose, déploiement).
- **Pas encore** de base de données ni de stockage objet : ils arriveront avec le moteur du twin
  (étape C1), quand le besoin sera réel (cf. convention « pas de package/service au cas où »).

### Révisions possibles

Si un jour le besoin d'une UI multi-utilisateurs / multi-projets ou d'un git-push-to-deploy plus riche
l'emporte, on pourra **réévaluer Coolify** (ou Dokploy) — mais seulement après avoir pesé la perte de
contrôle sur l'infra-as-code. De même, si GHCR pose problème, le build pourra être fait sur le VPS
(au prix d'un hôte moins « propre »).
