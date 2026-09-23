#!/usr/bin/env bash
#
# LE DOSSIER DE COURSE — fabriquer, publier, recommencer.
#
#   pnpm course init nice        crée la fiche de la course et TIRE SA RÉFÉRENCE
#   pnpm course rapport nice     (re)fabrique rapport, feuille, fiches, ICS, GPX, annexe
#   pnpm course publier nice     importe le plan dans le tableau de bord
#   pnpm course nice             rapport puis publier
#   pnpm course liste            les courses déclarées
#
# LA RÉFÉRENCE EST TIRÉE UNE SEULE FOIS, à l'init, et gardée dans la fiche. C'est
# elle qui fait le QR code imprimé sur le rapport et l'adresse de la page en ligne.
# Refabriquer le dossier ne la change pas : le QR d'une feuille déjà imprimée reste
# valable, et la page en ligne se met à jour au même endroit. C'est tout l'intérêt
# d'une fiche : sans elle, chaque run tirerait une adresse neuve.
#
# Le QR porte aussi la CLÉ privée de la page : pour qu'il ouvre quelque chose, le
# rapport doit être fabriqué avec TWIN_KEYS_SECRET dans l'environnement, la même
# valeur que sur le serveur. Sans elle, le CLI le dit.
#
# La fiche vit dans local-data/courses/<nom>.conf — hors du dépôt, comme les
# rapports (un rapport est une donnée d'athlète).
#
# Rien de ce que produit ce script ne va dans le dépôt : le dossier porte le jumeau,
# la calibration et les résumés d'activité. Il s'IMPORTE dans le tableau de bord,
# par l'API, avec les documents et l'annexe que la page de l'athlète affiche : le
# plan fabriqué ici entre alors comme s'il y était né — publiable, envoyable,
# amendable. « Publier » se fait ensuite depuis l'écran Plan. Sans TWIN_ADMIN_TOKEN
# dans l'environnement, publier dit ce qu'il aurait envoyé et ne touche à rien.
set -euo pipefail

racine="$(git rev-parse --show-toplevel)"
cd "$racine"

FICHES="local-data/courses"
SORTIES="local-data/out"
MOTEUR="services/twin-engine"
SITE="https://www.thelocomotionlab.com/services/twin/plan"
# Le tableau de bord et son jeton, hors du dépôt : cf. docs/secrets.md.
API="${TWIN_API:-https://api.thelocomotionlab.com}"
JETON="${TWIN_ADMIN_TOKEN:-}"

# ── de quoi parler ──────────────────────────────────────────────────────────────
rouge() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
titre() { printf '\n\033[1m→ %s\033[0m\n' "$*" >&2; }
info()  { printf '  %s\n' "$*" >&2; }

python_moteur() {
  if [ -x "$MOTEUR/.venv/bin/python" ]; then echo "$MOTEUR/.venv/bin/python"
  elif command -v python3 >/dev/null; then echo python3
  else rouge "✗ aucun Python trouvé (ni $MOTEUR/.venv, ni python3)"; exit 1; fi
}

usage() {
  sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# ── la fiche d'une course ───────────────────────────────────────────────────────
fiche() { echo "$FICHES/$1.conf"; }

charger() {
  local f; f="$(fiche "$1")"
  [ -f "$f" ] || { rouge "✗ pas de fiche pour « $1 ». Lance : pnpm course init $1"; exit 1; }
  ATHLETE=""; TRAINING=""; COURSE=""; RACE=""; TARGET=""; TOLERANCE=""; TECHNICITE=""; REF=""
  ATHLETE_ID=""; COURSE_ID=""
  # shellcheck disable=SC1090
  . "$f"
  local manque=0
  for v in ATHLETE TRAINING COURSE REF; do
    [ -n "${!v}" ] || { rouge "✗ $f : $v est vide"; manque=1; }
  done
  [ "$manque" = 0 ] || exit 1
  for chemin in "$TRAINING" "$COURSE" ${RACE:+"$RACE"}; do
    [ -e "$chemin" ] || { rouge "✗ introuvable : $chemin (chemin relatif à $racine)"; exit 1; }
  done
}

cmd_init() {
  local nom="$1" f; f="$(fiche "$nom")"
  [ -f "$f" ] && { rouge "✗ $f existe déjà — édite-la, ou supprime-la pour repartir."; exit 1; }
  mkdir -p "$FICHES"
  # la part aléatoire de la référence : c'est elle, et elle seule, qui rend
  # l'adresse de l'annexe non devinable
  local alea; alea="$($(python_moteur) -c 'from secrets import token_hex; print(token_hex(3).upper())')"
  local slug; slug="$(printf '%s' "$nom" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9' | cut -c1-6)"
  cat > "$f" <<CONF
# Fiche de course — lue par scripts/course.sh. Chemins RELATIFS à la racine du dépôt.
ATHLETE="à remplir"

# L'archive d'entraînement (.zip Strava/Garmin/Polar, ou un dossier), la trace du
# parcours, et le carnet de route JSON (facultatif : sans lui, découpage auto).
TRAINING=""
COURSE=""
RACE=""

# Mode OBJECTIF : la durée visée. Vide = le plan suit la prédiction du moteur.
# TOLERANCE = demi-largeur de la fenêtre de passage, en % du temps CUMULÉ.
# Une cible de 30 h à 3.34 % donne une fenêtre de 29 h 00 à 31 h 00 à l'arrivée.
TARGET=""
TOLERANCE=""

# Majoration de coût DÉCLARÉE pour la technicité du terrain, en % (vide = aucune).
TECHNICITE=""

# Tirée à l'init, ne change plus : c'est le QR du rapport et l'adresse en ligne.
REF="LL-${slug:-COURSE}-${alea}"

# Facultatifs : l'athlète et la course du tableau de bord auxquels rattacher le plan
# importé (leurs identifiants se lisent dans l'adresse de leurs écrans).
ATHLETE_ID=""
COURSE_ID=""
CONF
  titre "fiche créée"
  info "$f"
  info "référence : $(grep -o 'LL-[A-Z0-9-]*' "$f")"
  info ""
  info "Remplis ATHLETE, TRAINING, COURSE, RACE (et TARGET si tu vises une durée),"
  info "puis : pnpm course rapport $nom"
}

cmd_rapport() {
  local nom="$1"; charger "$nom"
  local out="$SORTIES/$nom"
  titre "rapport « $nom » — référence $REF"
  mkdir -p "$out"
  local py; py="$(python_moteur)"
  local -a opts=(full
    --training "$TRAINING" --course "$COURSE" --athlete "$ATHLETE"
    --ref "$REF" --out "$out")
  [ -n "$RACE" ]       && opts+=(--race "$RACE")
  [ -n "$TARGET" ]     && opts+=(--target "$TARGET")
  [ -n "$TOLERANCE" ]  && opts+=(--set "target.tolerance_pct=$TOLERANCE")
  [ -n "$TECHNICITE" ] && opts+=(--technicity "$TECHNICITE")
  "$py" -m twin_engine.cli "${opts[@]}"
  titre "à imprimer"
  for f in rapport.pdf feuille.pdf fiches.pdf; do
    [ -f "$out/$f" ] && info "$out/$f"
  done
  info ""
  info "Page en ligne (après import puis « Publier ») : $SITE/$REF"
}

# L'import du plan dans le tableau de bord : le dossier, plus les documents que
# l'athlète emporte. Le moteur ne recalcule rien — c'est le dossier qui fait foi.
importer_le_plan() {
  local out="$1" nom="$2" source="$out/dossier.json"
  if [ ! -f "$source" ]; then
    info "pas de dossier dans la sortie — ce rapport date d'avant la boucle d'amendement"
    info "(refais-le : pnpm course rapport $nom)"
    return 0
  fi
  if [ -z "$JETON" ]; then
    info "TWIN_ADMIN_TOKEN n'est pas posé — le plan reste ici. Pour l'importer à la main :"
    info ""
    info "  TWIN_ADMIN_TOKEN=… pnpm course publier $nom"
    return 0
  fi

  local args=(--fail --silent --show-error -X POST
    -H "Authorization: Bearer $JETON"
    -F "dossier=@$source;type=application/json")
  [ -n "$ATHLETE_ID" ] && args+=(-F "athlete_id=$ATHLETE_ID")
  [ -n "$COURSE_ID" ] && args+=(-F "course_id=$COURSE_ID")
  local f
  for f in rapport.pdf feuille.pdf fiches.pdf plan.ics plan.gpx annexe.json; do
    [ -f "$out/$f" ] && args+=(-F "documents=@$out/$f")
  done

  if curl "${args[@]}" "$API/twin/tableau-de-bord/plans/import" > /dev/null; then
    info "importé : $REF"
  else
    rouge "✗ import refusé — le plan reste ici, rien n'est perdu"
    return 1
  fi
}

cmd_publier() {
  local nom="$1" force="${2:-}"; charger "$nom"
  local dossier="$SORTIES/$nom/dossier.json"
  [ -f "$dossier" ] || { rouge "✗ $dossier manque — lance d'abord : pnpm course rapport $nom"; exit 1; }

  titre "import du plan dans le tableau de bord"
  info "$dossier ($(du -h "$dossier" | cut -f1)) et ses documents"
  info "  → ${JETON:+$API}${JETON:-<TWIN_ADMIN_TOKEN non posé>}/twin/tableau-de-bord/plans/import"
  if [ "$force" != "--oui" ] && [ -n "$JETON" ]; then
    printf '  Importer ? [o/N] ' >&2
    read -r reponse
    case "$reponse" in [oO]*) ;; *) rouge "✗ annulé."; exit 1 ;; esac
  fi
  importer_le_plan "$SORTIES/$nom" "$nom"

  titre "ensuite"
  info "Écran Plan du tableau de bord → « Publier » : la page répond à ses deux liens."
  info "$SITE/$REF"
}

cmd_liste() {
  [ -d "$FICHES" ] || { info "aucune fiche (local-data/courses/)"; return 0; }
  for f in "$FICHES"/*.conf; do
    [ -e "$f" ] || continue
    local nom ref; nom="$(basename "$f" .conf)"
    ref="$(sed -n 's/^REF="\(.*\)"$/\1/p' "$f")"
    printf '  %-16s %s\n' "$nom" "$ref"
  done
}

# ── aiguillage ──────────────────────────────────────────────────────────────────
[ $# -ge 1 ] || usage 2
case "$1" in
  -h|--help|aide) usage 0 ;;
  liste)   cmd_liste ;;
  init)    [ $# -eq 2 ] || usage 2; cmd_init "$2" ;;
  rapport) [ $# -eq 2 ] || usage 2; cmd_rapport "$2" ;;
  publier) [ $# -ge 2 ] || usage 2; cmd_publier "$2" "${3:-}" ;;
  *)       [ $# -le 2 ] || usage 2; cmd_rapport "$1"; cmd_publier "$1" "${2:-}" ;;
esac
