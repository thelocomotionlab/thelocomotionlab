# syntax=docker/dockerfile:1
#
# Image du service de dépôt d'archives de la cohorte Twin `twin-depot`.
# CONTEXTE DE BUILD = RACINE DU MONOREPO (pnpm workspace) :
#   docker build -f services/twin-depot/Dockerfile -t <image> .
# (c'est ce que fait .github/workflows/deploy-vps.yml.)
#
# Même chaîne qu'atelier-api : `pnpm deploy --prod` produit un paquet
# autonome (dist + node_modules de prod uniquement). Aucune dépendance
# native — l'image reste minimale.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# --- Build : installe le workspace, compile, extrait le paquet autonome ---
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @locomotionlab/twin-depot build
RUN pnpm --filter @locomotionlab/twin-depot --prod deploy --legacy /out

# --- Runner : Node + le paquet autonome, rien d'autre ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data

COPY --from=build /out/dist ./dist
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/twin-depot.config.json ./twin-depot.config.json

# Point de montage du volume (depots.json + archives/) : créé et donné à
# `node` AVANT de dropper les privilèges — un volume nommé VIDE hérite des
# permissions du dossier de l'image à sa création (sinon EACCES). Pas
# d'instruction VOLUME : compose monte le volume nommé explicitement.
RUN mkdir -p /data && chown node:node /data

USER node
CMD ["node", "dist/index.js"]
