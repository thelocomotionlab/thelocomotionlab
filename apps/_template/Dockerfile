# syntax=docker/dockerfile:1
#
# Image conteneur de l'app `_template` (Next.js, sortie standalone) pour le VPS.
# CONTEXTE DE BUILD = RACINE DU MONOREPO (pnpm workspace). On build donc avec :
#   docker build -f apps/_template/Dockerfile -t <image> .
# (c'est ce que fait le workflow .github/workflows/deploy-vps.yml).
#
# Le Dockerfile vit avec l'app (et non dans infra/) car c'est la recette de build PROPRE à
# l'app — comme son package.json. infra/ orchestre l'exécution des images, pas leur build.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# --- Build : installe le workspace depuis le lockfile, puis build le template en standalone ---
FROM base AS build
# Le .dockerignore (racine) garde les manifests du workspace mais exclut node_modules, .next,
# le contenu lourd du site, etc. → contexte léger.
COPY . .
# Installation reproductible (échoue si le lockfile n'est pas à jour).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
# Build uniquement le template (ne touche pas au site).
RUN pnpm --filter _template build

# --- Runner : image minimale ne contenant que la sortie standalone ---
FROM node:22-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
# Écoute sur toutes les interfaces pour être joignable par Caddy (autre conteneur du réseau).
ENV HOSTNAME=0.0.0.0

# `output: standalone` + outputFileTracingRoot = racine monorepo → l'arborescence standalone
# reproduit le repo : le serveur est à apps/_template/server.js, ses deps tracées sont incluses.
COPY --from=build /repo/apps/_template/.next/standalone ./
COPY --from=build /repo/apps/_template/.next/static ./apps/_template/.next/static
COPY --from=build /repo/apps/_template/public ./apps/_template/public

USER node
EXPOSE 3000
CMD ["node", "apps/_template/server.js"]
