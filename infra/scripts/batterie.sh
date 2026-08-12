#!/usr/bin/env bash
#
# batterie.sh — courbe de batterie du tracker sur une fenêtre de temps, et
# combien de recharges prévoir pour une aventure de N jours.
#
#   cd /opt/locomotionlab && ./infra/scripts/batterie.sh                 # dernières 24 h
#   ./infra/scripts/batterie.sh --heures 12
#   ./infra/scripts/batterie.sh --du "2026-08-09T07:00Z" --au "2026-08-09T16:00Z"
#   ./infra/scripts/batterie.sh --du "2026-08-09T07:00Z" --au "2026-08-09T16:00Z" --jours 4
#
# POURQUOI CE SCRIPT — le site ne garde PAS l'historique de batterie. Le
# tracking-cache ne publie que la DERNIÈRE valeur connue (`stats.batteryPercent`,
# la pastille de /live), et l'archive d'une aventure n'en conserve pas
# davantage : impossible de mesurer la décharge après coup depuis nos données.
# L'historique, lui, existe en amont, dans Traccar, qui range le niveau sous
# `attributes.batteryLevel` de chaque position. C'est donc lui qu'on interroge.
#
# À lancer SUR LE VPS. Lecture seule : aucune écriture, aucun conteneur touché.
# On peut le lancer en pleine course.
#
# Réf. : docs/runbook-tracker-gl320mg.md

set -uo pipefail

SELF="$(readlink -f "$0")"
INFRA_DIR="$(dirname "$(dirname "$SELF")")"
cd "$INFRA_DIR" || exit 2

if [ -f .env ]; then
  set -a; . ./.env; set +a
else
  echo "❌ infra/.env introuvable dans $INFRA_DIR" >&2
  exit 2
fi

# Même vue que check-tracker.sh : TRACCAR_API_URL de .env est la vue DEPUIS le
# conteneur (host.docker.internal) ; depuis l'hôte, c'est 127.0.0.1.
API="${TRACCAR_HOST_API_URL:-http://127.0.0.1:8082/api}"
DEVICE="${DEVICE_ID:-}"

HEURES=24
DU=""; AU=""; JOURS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --heures) HEURES="$2"; shift 2 ;;
    --du)     DU="$2";     shift 2 ;;
    --au)     AU="$2";     shift 2 ;;
    --jours)  JOURS="$2";  shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$SELF" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
done

[ -z "$AU" ] && AU="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[ -z "$DU" ] && DU="$(date -u -d "-${HEURES} hours" +%Y-%m-%dT%H:%M:%SZ)"

if [ -z "${TRACCAR_API_TOKEN:-}" ]; then
  echo "❌ TRACCAR_API_TOKEN absent de infra/.env" >&2; exit 2
fi
if [ -z "$DEVICE" ]; then
  echo "❌ DEVICE_ID absent de infra/.env" >&2; exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 requis (il sert à lire le JSON et à calculer la pente)" >&2; exit 2
fi

echo "▶ Batterie du tracker · appareil $DEVICE"
echo "  fenêtre : $DU  →  $AU"

# La réponse passe par un FICHIER, jamais par argv : une journée de course
# pèse plusieurs Mo et Linux plafonne un argument à 128 Ko (MAX_ARG_STRLEN).
REPONSE="$(mktemp)"
trap 'rm -f "$REPONSE"' EXIT

curl -s -m 60 -H "Authorization: Bearer $TRACCAR_API_TOKEN" \
  "$API/positions?deviceId=$DEVICE&from=$DU&to=$AU" -o "$REPONSE" || {
  echo "❌ Traccar injoignable sur $API" >&2; exit 1; }

JOURS="$JOURS" python3 - "$REPONSE" <<'PY'
import json, math, os, sys
from datetime import datetime

try:
    with open(sys.argv[1], encoding="utf-8") as f:
        positions = json.load(f)
except Exception:
    print("❌ réponse Traccar illisible (token ou fenêtre invalide ?)"); sys.exit(1)
if not isinstance(positions, list) or not positions:
    print("❌ aucune position sur cette fenêtre."); sys.exit(1)

def niveau(p):
    a = p.get("attributes") or {}
    for cle in ("batteryLevel", "batteryPercentage"):
        v = a.get(cle)
        # Même garde-fou que compute.ts : Traccar range parfois des VOLTS sous
        # `battery`. On n'accepte que des pour-cent plausibles.
        if isinstance(v, (int, float)) and 0 <= v <= 100:
            return float(v)
    return None

def quand(p):
    t = p.get("fixTime") or p.get("deviceTime") or ""
    try:
        return datetime.fromisoformat(t.replace("Z", "+00:00"))
    except ValueError:
        return None

mesures = sorted(
    ((quand(p), niveau(p)) for p in positions),
    key=lambda m: m[0] or datetime.min.replace(tzinfo=None),
)
mesures = [(t, n) for t, n in mesures if t is not None and n is not None]

print(f"  positions : {len(positions)} · dont avec batterie : {len(mesures)}")
if len(mesures) < 2:
    print("\n⚠️  Pas assez de relevés pour une pente. Le tracker n'envoie peut-être")
    print("   pas son niveau à chaque position : élargis la fenêtre (--heures 48).")
    sys.exit(0)

t0, n0 = mesures[0]
t1, n1 = mesures[-1]
heures = (t1 - t0).total_seconds() / 3600
perdu = n0 - n1

print("\n── Courbe ──────────────────────────────")
pas = max(1, len(mesures) // 12)
apercu = mesures[::pas]
if apercu[-1] is not mesures[-1]:
    apercu.append(mesures[-1])
for t, n in apercu:
    barre = "█" * int(n / 4)
    print(f"  {t.strftime('%d/%m %H:%M')}  {n:5.1f} %  {barre}")

print("\n── Décharge ────────────────────────────")
print(f"  départ  : {n0:.0f} %  ({t0.strftime('%d/%m %H:%M')})")
print(f"  arrivée : {n1:.0f} %  ({t1.strftime('%d/%m %H:%M')})")
print(f"  durée   : {heures:.1f} h")

if heures <= 0 or perdu <= 0:
    print("\n  Aucune décharge mesurable sur cette fenêtre (tracker en charge, ou")
    print("  niveau constant). Relance sur une fenêtre de course.")
    sys.exit(0)

pente = perdu / heures
autonomie = 100 / pente
print(f"  perdu   : {perdu:.0f} points, soit {pente:.2f} %/h")
print(f"  → autonomie pleine charge : {autonomie:.1f} h")

jours = os.environ.get("JOURS", "")
if jours:
    try:
        j = float(jours)
    except ValueError:
        sys.exit(0)
    besoin = j * 24 * pente
    # On ne descend pas sous 20 % : en dessous l'électronique devient capricieuse,
    # et on ne joue pas une fin d'étape sur une marge de 3 %. La plage utile est
    # donc 100 → 20, soit 80 points par charge.
    utile = 80.0
    # −1 : on PART chargé, la première plage ne coûte pas de recharge.
    recharges = max(0, math.ceil(besoin / utile) - 1)
    print("\n── Pour une aventure de %g jours ──────" % j)
    print(f"  consommation prévue : {besoin:.0f} points ({besoin/100:.1f} charges pleines)")
    if recharges == 0:
        print("  → aucune recharge nécessaire si tu pars à 100 %.")
    else:
        print(f"  → {recharges} recharge(s), en visant une plage 100 % → 20 %")
        print(f"     (soit une recharge toutes les {utile/pente:.0f} h environ)")
PY
