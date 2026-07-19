#!/usr/bin/env sh
#
# Assemble l'arbre static/ de listmonk + surcharges du Lab.
#
# POURQUOI : les modèles système de listmonk (dont l'email de double opt-in)
# sont EMBARQUÉS dans le binaire — l'image Docker ne contient aucun fichier
# de modèle, et un montage isolé est ignoré. La seule voie officielle est de
# fournir un arbre static/ COMPLET via `--static-dir` (cf. docs listmonk
# « Templating »). Ce script télécharge l'arbre officiel de la version
# ÉPINGLÉE (= tag de l'image dans compose.yml) puis copie nos fichiers
# versionnés par-dessus. `static-dist/` est git-ignoré (artefact assemblé) ;
# les surcharges, elles, vivent dans infra/listmonk/email-templates/.
#
# Usage : ./build-static.sh   (idempotent — appelé par deploy.sh ;
#         télécharge une seule fois, ré-applique les surcharges à chaque fois.
#         Montée de version listmonk : rm -rf static-dist puis relancer.)
set -eu
cd "$(dirname "$0")"

VERSION="6.2.0" # = listmonk/listmonk:v6.2.0 dans compose.yml — les deux évoluent ENSEMBLE

if [ ! -d static-dist ]; then
  echo ">> Téléchargement de l'arbre static listmonk v${VERSION}…"
  curl -fsSL "https://github.com/knadh/listmonk/archive/refs/tags/v${VERSION}.tar.gz" \
    | tar -xzf - "listmonk-${VERSION}/static"
  mv "listmonk-${VERSION}/static" static-dist
  rmdir "listmonk-${VERSION}"
fi

echo ">> Application des surcharges du Lab…"
cp email-templates/subscriber-optin.html static-dist/email-templates/subscriber-optin.html

echo "OK : infra/listmonk/static-dist prêt (monté sur /listmonk/static par compose)."
