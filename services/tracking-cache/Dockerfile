# syntax=docker/dockerfile:1
#
# Image du back live-tracking `tracking-cache`.
# CONTEXTE DE BUILD = RACINE DU MONOREPO (pnpm workspace) :
#   docker build -f services/tracking-cache/Dockerfile -t <image> .
# (c'est ce que fait .github/workflows/deploy-vps.yml).
#
# Le service n'a AUCUNE dépendance runtime (Node 22 : fetch global ; seulement
# fs/path natifs) → l'image finale ne contient que `dist/` + la config.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# --- Build : installe le workspace, compile le service en JS ---
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @locomotionlab/tracking-cache build

# --- Runner : Node + la sortie compilée, rien d'autre ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data

COPY --from=build /repo/services/tracking-cache/dist ./dist
COPY --from=build /repo/services/tracking-cache/tracking.config.json ./tracking.config.json

# Point de montage du volume partagé (live-*.json) : on le crée et on le donne à
# l'utilisateur `node` AVANT de dropper les privilèges. Un volume nommé VIDE hérite
# des permissions du dossier de l'image à sa création → le conteneur (USER node)
# peut y écrire. Sans ça : EACCES sur /data (root-owned par défaut).
# (Pas de `VOLUME ["/data"]` : compose monte le volume nommé explicitement, et
# l'instruction VOLUME jetterait justement ce chown.)
RUN mkdir -p /data && chown node:node /data

USER node
# Boucle de collecte. Le contrôle (start/stop/reset/status) se fait via
# `docker compose exec tracking-cache node dist/cli.js <cmd>` (script `track`).
CMD ["node", "dist/index.js"]
