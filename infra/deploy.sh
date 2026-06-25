#!/usr/bin/env bash
#
# Déploiement / mise à jour de la stack conteneurs du VPS (cf. docs/runbook-vps.md).
# Idempotent : (re)build le proxy, récupère les dernières images d'apps, (re)lance les services.
# À lancer SUR LE VPS, depuis le dossier infra/ :  ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "ERREUR : infra/.env absent. Fais  cp .env.example .env  puis renseigne-le (cf. runbook)." >&2
  exit 1
fi

# Sélectionne la commande compose disponible (plugin v2 « docker compose » de préférence).
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "ERREUR : ni « docker compose » ni « docker-compose » trouvés. Installe Docker (runbook étape 1)." >&2
  exit 1
fi

# (Optionnel) connexion GHCR si l'image template est privée.
# Exporte GHCR_USER et GHCR_TOKEN (PAT en lecture packages) avant de lancer ce script.
if [[ -n "${GHCR_TOKEN:-}" && -n "${GHCR_USER:-}" ]]; then
  echo ">> docker login ghcr.io (image privée)…"
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
fi

echo ">> (Re)build du reverse-proxy Caddy (plugin cloudflare)…"
"${DC[@]}" build caddy

echo ">> Récupération des images d'apps depuis GHCR…"
# --ignore-buildable : ne tente pas de « pull » le service caddy (construit localement).
"${DC[@]}" pull --ignore-buildable 2>/dev/null || "${DC[@]}" pull || true

echo ">> (Re)démarrage des services…"
"${DC[@]}" up -d --remove-orphans

echo ">> État courant :"
"${DC[@]}" ps
