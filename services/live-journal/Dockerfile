# syntax=docker/dockerfile:1
#
# Image du journal de bord du live `live-journal`.
# CONTEXTE DE BUILD = RACINE DU MONOREPO (pnpm workspace) :
#   docker build -f services/live-journal/Dockerfile -t <image> .
# (c'est ce que fait .github/workflows/deploy-vps.yml).
#
# Contrairement à tracking-cache, le service a des dépendances runtime (fastify,
# sharp) → `pnpm deploy --prod` produit un paquet autonome (dist + node_modules
# de prod uniquement, binaires sharp linuxmusl résolus dans CETTE image alpine).
# ffmpeg vient du système (transcodage vocaux → AAC/M4A, vidéos → H.264).

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# --- Build : installe le workspace, compile, extrait le paquet autonome ---
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @locomotionlab/live-journal build
RUN pnpm --filter @locomotionlab/live-journal --prod deploy --legacy /out

# --- Runner : Node + ffmpeg + le paquet autonome, rien d'autre ---
FROM node:22-alpine AS runner
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data

COPY --from=build /out/dist ./dist
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/live-journal.config.json ./live-journal.config.json
# Fontes des cartes OG (src/og/render.ts lit /app/assets/fonts au runtime).
COPY --from=build /out/assets ./assets
# Fixtures du simulateur (mode dev/recette : LIVE_JOURNAL_SIMULATION=1).
COPY --from=build /out/sim ./sim

# Point de montage du volume (journal.json + médias) : créé et donné à `node`
# AVANT de dropper les privilèges — un volume nommé VIDE hérite des permissions
# du dossier de l'image à sa création (sinon EACCES). Pas d'instruction VOLUME :
# compose monte le volume nommé explicitement, et VOLUME jetterait ce chown.
RUN mkdir -p /data && chown node:node /data

USER node
CMD ["node", "dist/index.js"]
