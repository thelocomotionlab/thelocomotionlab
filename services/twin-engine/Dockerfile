# syntax=docker/dockerfile:1
#
# Image du moteur Locomotion Twin (Python + FastAPI + TeXLive).
# CONTEXTE DE BUILD = RACINE DU MONOREPO (comme services/tracking-cache) :
#   docker build -f services/twin-engine/Dockerfile -t <image> .
# (c'est ce que fait .github/workflows/deploy-vps.yml).
#
# TeXLive est CHERRY-PIQUÉ : seulement les collections nécessaires au template
# (XeLaTeX + biber + langue FR + science/fonts/biblatex), pas texlive-full.

FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# --- Build : compile le wheel du service (deps scientifiques en wheels manylinux) ---
FROM base AS build
WORKDIR /build
RUN pip install build
COPY services/twin-engine/pyproject.toml services/twin-engine/README.md ./
COPY services/twin-engine/src ./src
RUN python -m build --wheel --outdir /dist

# --- Runner : TeXLive minimal + le wheel + ses dépendances ---
FROM base AS runner
# Paquets TeXLive strictement requis par le template (empiriquement) :
#   xetex            → XeLaTeX            | latex-extra → enumitem, titlesec, needspace, nicematrix…
#   fonts-recommended/fonts-extra → polices  | lang-french → babel french
#   science          → stmaryrd          | plain-generic → divers .sty génériques
#   bibtex-extra+biber → biblatex + backend biber
RUN apt-get update && apt-get install -y --no-install-recommends \
        texlive-xetex \
        texlive-latex-extra \
        texlive-fonts-recommended \
        texlive-fonts-extra \
        texlive-lang-french \
        texlive-science \
        texlive-plain-generic \
        texlive-bibtex-extra \
        biber \
    && rm -rf /var/lib/apt/lists/*

ENV DATA_DIR=/data \
    MPLCONFIGDIR=/tmp/matplotlib \
    HOME=/home/app

WORKDIR /app
COPY --from=build /dist/*.whl /tmp/
RUN pip install /tmp/*.whl && rm -f /tmp/*.whl

# Utilisateur non-root + point de montage du volume de données (droits AVANT de dropper root).
RUN useradd --create-home --uid 10001 app \
    && mkdir -p /data /tmp/matplotlib \
    && chown -R app:app /data /tmp/matplotlib
USER app

EXPOSE 8000
# API FastAPI servie par uvicorn (fabrique d'app : lit DATA_DIR à l'amorçage).
CMD ["uvicorn", "twin_engine.api:get_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
