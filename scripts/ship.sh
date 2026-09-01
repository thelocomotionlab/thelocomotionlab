#!/usr/bin/env bash
#
# LIVRER UNE BRANCHE DE DÉV — les six commandes du cycle, en une.
#
#   pnpm ship                          # la branche courante
#   pnpm ship claude/ma-branche        # une branche nommée
#   pnpm ship --deploy                 # …et déploie depuis ici (sans la CI)
#
# Fait, dans l'ordre : fetch, fast-forward de `main` sur la branche, push. Le
# déploiement, lui, appartient à `deploy-site.yml` dès que ses secrets sont
# posés — d'où le `--deploy` explicite, qui reste la voie manuelle.
#
# FAST-FORWARD SEULEMENT. Si `main` a bougé de son côté, la fusion s'arrête au
# lieu de fabriquer un commit de merge qu'on n'a pas demandé : on veut le savoir,
# pas le découvrir dans l'historique.
set -euo pipefail

DEPLOIE=0
BRANCHE=""
for arg in "$@"; do
  case "$arg" in
    --deploy) DEPLOIE=1 ;;
    -*) echo "option inconnue : $arg" >&2; exit 2 ;;
    *) BRANCHE="$arg" ;;
  esac
done

racine="$(git rev-parse --show-toplevel)"
cd "$racine"

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ des modifications ne sont pas commitées — commit ou stash d'abord." >&2
  git status --short >&2
  exit 1
fi

BRANCHE="${BRANCHE:-$(git rev-parse --abbrev-ref HEAD)}"
if [ "$BRANCHE" = "main" ]; then
  echo "✗ « $BRANCHE » est la branche d'arrivée : donne la branche de dév à livrer." >&2
  exit 1
fi

echo "→ fetch"
git fetch origin "$BRANCHE" main

echo "→ main ← $BRANCHE"
git checkout main
git merge --ff-only "origin/$BRANCHE"

echo "→ push"
git push origin main

if [ "$DEPLOIE" = "1" ]; then
  echo "→ déploiement Cloudflare Pages"
  pnpm -F site deploy:cf
else
  echo "✓ poussé. Le déploiement suit sur GitHub Actions (deploy-site.yml),"
  echo "  ou lance : pnpm -F site deploy:cf"
fi
