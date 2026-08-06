#!/usr/bin/env bash
#
# check-tracker.sh — diagnostic de bout en bout de la chaîne de positions.
#
#   tracker GL320MG ─▶ Traccar (:5004) ─▶ tracking-cache ─▶ Caddy ─▶ /live
#
# À lancer SUR LE VPS. Chaque maillon est testé dans l'ordre, et le PREMIER
# ❌ rencontré désigne le coupable — c'est tout l'intérêt : au lieu de « la
# carte est vide », on sait si c'est le tracker, le réseau, Traccar, le back
# ou le proxy.
#
#   cd /opt/locomotionlab && ./infra/scripts/check-tracker.sh
#
# Lecture seule : le script ne modifie RIEN (ni conteneur, ni pare-feu, ni
# chrono). On peut le lancer autant de fois qu'on veut, y compris en course.
#
# Réf. complète : docs/runbook-tracker-gl320mg.md

# Pas de `set -e` : on veut dérouler TOUS les tests, pas s'arrêter au premier.
set -uo pipefail

# --- Emplacement : on travaille depuis infra/ (compose.yml + .env y vivent) ---
SELF="$(readlink -f "$0")"
INFRA_DIR="$(dirname "$(dirname "$SELF")")"
cd "$INFRA_DIR" || exit 2

OK="✅"; KO="❌"; WARN="⚠️ "
FAILURES=0
step() { printf '\n\033[1m%s\033[0m\n' "── $* ──────────────────────────────"; }
ok()   { echo "  $OK $*"; }
ko()   { echo "  $KO $*"; FAILURES=$((FAILURES + 1)); }
warn() { echo "  $WARN $*"; }
fix()  { echo "      ↳ remède : $*"; }

# --- Lecture de .env (secrets du VPS, jamais versionnés) ---
if [ -f .env ]; then
  set -a; . ./.env; set +a
else
  echo "$KO infra/.env introuvable dans $INFRA_DIR — impossible de continuer."
  exit 2
fi

# L'API Traccar vue DEPUIS L'HÔTE. Attention : TRACCAR_API_URL de .env est la vue
# du CONTENEUR (host.docker.internal), inutilisable ici.
API="${TRACCAR_HOST_API_URL:-http://127.0.0.1:8082/api}"
TRACKING_DOMAIN="${TRACKING_DOMAIN:-tracking.thelocomotionlab.com}"

# deviceId effectif = override d'env, sinon la valeur versionnée du service.
CONFIG_JSON="$INFRA_DIR/../services/tracking-cache/tracking.config.json"
DEVICE="${DEVICE_ID:-}"
if [ -z "$DEVICE" ] && [ -f "$CONFIG_JSON" ]; then
  DEVICE="$(sed -n 's/.*"deviceId"[[:space:]]*:[[:space:]]*\([0-9]\+\).*/\1/p' "$CONFIG_JSON" | head -1)"
fi
DEVICE="${DEVICE:-0}"

# --- Lecteur JSON : jq si présent, sinon python3 (l'un des deux suffit) ---
if command -v jq >/dev/null 2>&1;   then JSON_READER=jq
elif command -v python3 >/dev/null 2>&1; then JSON_READER=python3
else JSON_READER=none
fi
# json_get <filtre jq> — lit le JSON sur stdin. Le filtre est traduit pour python3.
json_get() {
  case "$JSON_READER" in
    jq)      jq -r "$1" 2>/dev/null ;;
    python3) python3 -c "$2" 2>/dev/null ;;
    none)    echo "" ;;
  esac
}

echo "Diagnostic live-tracking · appareil Traccar #$DEVICE · $(date -Is)"
[ "$JSON_READER" = none ] && warn "ni jq ni python3 : les détails JSON seront omis (installe jq : sudo apt install jq)"

# =====================================================================
step "1. Traccar écoute-t-il les ports balises ?"
# =====================================================================
# 5004 = protocole gl200/Queclink (GL320MG) · 5055 = OsmAnd (app téléphone).
for entry in "5004:Queclink/gl200 (GL320MG)" "5055:OsmAnd (Traccar Client)"; do
  port="${entry%%:*}"; label="${entry#*:}"
  if ss -tln 2>/dev/null | grep -qE "[:.]$port[[:space:]]"; then
    ok "port $port en écoute — $label"
  else
    ko "port $port FERMÉ — $label"
    fix "Traccar tourne-t-il ? \`sudo systemctl status traccar\`. Le port 5004 est activé par défaut ; s'il manque, vérifier /opt/traccar/conf/traccar.xml"
  fi
done

# =====================================================================
step "2. Le pare-feu laisse-t-il entrer le tracker ?"
# =====================================================================
if command -v ufw >/dev/null 2>&1 && sudo -n ufw status >/dev/null 2>&1; then
  UFW="$(sudo -n ufw status 2>/dev/null)"
  if echo "$UFW" | grep -q "Status: inactive"; then
    ok "ufw inactif — rien ne bloque (le pare-feu OVH Manager reste à vérifier côté dashboard)"
  else
    for port in 5004 5055; do
      if echo "$UFW" | grep -qE "^${port}(/tcp)?[[:space:]]+ALLOW"; then
        ok "ufw : $port/tcp autorisé"
      else
        ko "ufw : $port/tcp NON autorisé"
        fix "sudo ufw allow ${port}/tcp"
      fi
    done
  fi
else
  warn "état ufw non lisible sans mot de passe sudo — à vérifier à la main : sudo ufw status"
fi

# =====================================================================
step "3. L'appareil est-il déclaré dans Traccar, et a-t-il parlé ?"
# =====================================================================
if [ -z "${TRACCAR_API_TOKEN:-}" ]; then
  ko "TRACCAR_API_TOKEN absent de infra/.env"
  fix "UI Traccar → compte \`public\` → générer un token → le coller dans infra/.env → ./deploy.sh"
else
  DEVICES="$(curl -s -m 15 -H "Authorization: Bearer $TRACCAR_API_TOKEN" "$API/devices" 2>/dev/null)"
  if [ -z "$DEVICES" ]; then
    ko "API Traccar injoignable sur $API"
    fix "\`sudo systemctl status traccar\` ; l'API écoute-t-elle bien sur 8082 ?"
  elif echo "$DEVICES" | grep -q "Unauthorized\|<html"; then
    ko "API Traccar : token refusé (401/403)"
    fix "régénérer le token du compte \`public\` et le remettre dans infra/.env (cf. docs/live-tracking.md §10.2)"
  else
    LINE="$(echo "$DEVICES" | json_get \
      ".[] | select(.id==$DEVICE) | \"\(.name)|\(.uniqueId)|\(.status)|\(.lastUpdate)\"" \
      "
import json,sys
for d in json.load(sys.stdin):
    if d.get('id')==$DEVICE:
        print('%s|%s|%s|%s' % (d.get('name'),d.get('uniqueId'),d.get('status'),d.get('lastUpdate')))
")"
    if [ -z "$LINE" ]; then
      ko "aucun appareil d'id $DEVICE dans Traccar (ou non partagé au compte du token)"
      # Cas typique de la mise en service : l'appareil vient d'être créé dans
      # l'UI, qui n'affiche NULLE PART son id numérique. On le donne ici — il
      # existe dès la création, sans attendre la moindre émission.
      echo "      ↳ appareils visibles par le token (le # est le DEVICE_ID à poser) :"
      echo "$DEVICES" | json_get \
        '.[] | "        #\(.id) · \(.name) · uniqueId=\(.uniqueId) · \(.status // "jamais connecté")"' \
        '
import json,sys
for d in json.load(sys.stdin):
    print("        #%s · %s · uniqueId=%s · %s"
          % (d.get("id"), d.get("name"), d.get("uniqueId"), d.get("status") or "jamais connecté"))
'
      echo "        (liste vide = appareil non PARTAGÉ au compte du token, cf. runbook §2.2)"
      fix "poser DEVICE_ID=<le # ci-dessus> dans infra/.env, puis ./deploy.sh"
    else
      IFS='|' read -r D_NAME D_UID D_STATUS D_LAST <<<"$LINE"
      ok "appareil #$DEVICE trouvé : « $D_NAME » · uniqueId=$D_UID"
      # Le signal QUI COMPTE est `lastUpdate`, pas la chaîne `status` : selon la
      # version, Traccar affiche « offline » (et non « unknown ») pour un appareil
      # qui n'a JAMAIS émis. Or les deux cas envoient chercher à des endroits
      # opposés — d'où ce tri sur « a-t-il déjà parlé une fois ? ».
      case "${D_LAST:-}" in
        "" | null | None | undefined) JAMAIS=1 ;;
        *) JAMAIS=0 ;;
      esac
      if [ "$JAMAIS" = 1 ]; then
        warn "statut Traccar : ${D_STATUS:-inconnu} · JAMAIS connecté (aucun contact enregistré)"
        echo "      ↳ attendu tant que le tracker n'est pas allumé ET configuré."
        echo "        S'il est allumé et censé émettre, la chaîne s'arrête ICI : IMEI,"
        echo "        APN/SIM, ou serveur:port du tracker (runbook §3)."
      else
        case "$D_STATUS" in
          online) ok "statut Traccar : online · dernier contact $D_LAST" ;;
          *)      warn "statut Traccar : ${D_STATUS:-inconnu} · dernier contact $D_LAST"
                  echo "      ↳ il a DÉJÀ parlé au moins une fois → la config du tracker est BONNE."
                  echo "        Cherche du côté réseau (zone blanche) ou batterie, pas du côté réglages." ;;
        esac
      fi
    fi

    # Positions des dernières 24 h : c'est LA preuve que des points arrivent.
    FROM="$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)"
    TO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if [ -n "$FROM" ]; then
      POS="$(curl -s -m 20 -H "Authorization: Bearer $TRACCAR_API_TOKEN" \
        "$API/positions?deviceId=$DEVICE&from=$FROM&to=$TO" 2>/dev/null)"
      NB="$(echo "$POS" | json_get 'length' 'import json,sys; print(len(json.load(sys.stdin)))')"
      if [ "${NB:-0}" -gt 0 ] 2>/dev/null; then
        TRACCAR_LASTFIX="$(echo "$POS" | json_get '.[-1].fixTime' \
          'import json,sys; d=json.load(sys.stdin); print(d[-1].get("fixTime"))')"
        ok "$NB position(s) sur les dernières 24 h · dernier fix $TRACCAR_LASTFIX"

        # ⚠ « des positions » ≠ « des positions EXPLOITABLES ». Un tracker qui n'a
        # pas vu le ciel émet quand même : Traccar stocke des points invalides ou
        # à (0,0). Sans ce tri, on croit la chaîne bonne et on cherche la panne
        # au mauvais endroit pendant des heures.
        NBVALID="$(echo "$POS" | json_get \
          '[.[] | select(.valid == true and ((.latitude // 0) != 0 or (.longitude // 0) != 0))] | length' \
          '
import json,sys
d = json.load(sys.stdin)
print(sum(1 for p in d
          if p.get("valid") is True and ((p.get("latitude") or 0) != 0 or (p.get("longitude") or 0) != 0)))
')"
        if [ "${NBVALID:-0}" -gt 0 ] 2>/dev/null; then
          ok "dont $NBVALID avec un vrai fix GPS (valid, coordonnées non nulles)"
        else
          ko "AUCUNE n'a de fix GPS valide : le tracker émet, mais sans position"
          echo "      ↳ le lien réseau est bon (les points arrivent) — c'est le GPS qui n'accroche pas."
          fix "le sortir DEHORS, ciel dégagé, immobile 15 min (premier fix à froid). En intérieur, il peut ne jamais accrocher."
        fi

        # Batterie : le tracker la publie dans +RESP:GTINF (piloté par Info Report
        # Enable/Interval de GTCFG) ; Traccar la range dans les attributs de la
        # position. Le nom du champ varie selon la version, d'où le balayage.
        # `battery` est EXCLU : chez Traccar c'est une tension en volts, pas un
        # pourcentage. Et on remonte la trace, car les messages d'événement
        # (extinction…) ne portent pas la charge.
        BATT="$(echo "$POS" | json_get \
          '[.[] | .attributes // {} | (.batteryLevel // .batteryPercentage // empty)] | last // empty' \
          '
import json,sys
val = None
for p in json.load(sys.stdin):
    a = p.get("attributes") or {}
    for k in ("batteryLevel", "batteryPercentage"):
        if a.get(k) is not None:
            val = a[k]
print(val if val is not None else "")
')"
        if [ -n "${BATT:-}" ]; then
          echo "  🔋 batterie rapportée : $BATT"
        else
          warn "aucune donnée de batterie dans les positions"
          echo "      ↳ le rapport d'état (+RESP:GTINF) est-il activé ? AT+GTCFG champs 14/15."
        fi
      else
        warn "aucune position sur les dernières 24 h"
        echo "      ↳ si le tracker émet depuis moins longtemps que ça, c'est normal ; sinon la chaîne s'arrête ICI (tracker/SIM/réseau), pas plus loin."
      fi
    fi
  fi
fi

# =====================================================================
step "4. Le back tracking-cache tourne-t-il, et que voit-il ?"
# =====================================================================
if docker compose version >/dev/null 2>&1; then DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then DC=(docker-compose)
else DC=(); fi

if [ ${#DC[@]} -eq 0 ]; then
  ko "Docker Compose introuvable"
  fix "cf. docs/runbook-vps.md (installation Docker)"
else
  STATE="$("${DC[@]}" ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep '^tracking-cache ')"
  if echo "$STATE" | grep -q running; then
    ok "conteneur tracking-cache : running"
    TRACK_STATUS="$("${DC[@]}" exec -T tracking-cache node dist/cli.js status 2>/dev/null)"
    echo "  ── ./track status ──"
    echo "$TRACK_STATUS" | sed 's/^/     /'
    # Un chrono à l'arrêt n'est pas une panne : c'est le mode idle (pas de session).
    if ! echo "$TRACK_STATUS" | grep -q "EN COURS"; then
      warn "aucune session ouverte → le back est en IDLE, il ne collecte RIEN (c'est voulu)"
      echo "      ↳ pour collecter : ./track start"
    else
      # Session ouverte mais 0 point alors que Traccar en a : le piège classique de
      # la mise en service. `track start` n'ouvre la fenêtre qu'à partir de
      # MAINTENANT — les positions ANTÉRIEURES sont volontairement ignorées. Si le
      # dernier fix est plus vieux que l'ouverture, il n'y a rien à collecter et le
      # back a raison de ne rien remonter.
      PTS="$(echo "$TRACK_STATUS" | sed -n 's/^Points *: *\([0-9]\+\).*/\1/p' | head -1)"
      # Premier jeton non blanc : l'horodatage ISO, ou « — » si pas de session
      # (auquel cas `date -d` échouera et le diagnostic sera simplement sauté).
      WSTART="$(echo "$TRACK_STATUS" | sed -n 's/^Début *: *\([^[:space:]]\{1,\}\).*/\1/p' | head -1)"
      if [ "${PTS:-0}" = "0" ] && [ -n "${TRACCAR_LASTFIX:-}" ] && [ -n "$WSTART" ]; then
        FIX_MS="$(date -d "$TRACCAR_LASTFIX" +%s 2>/dev/null)"
        WIN_MS="$(date -d "$WSTART" +%s 2>/dev/null)"
        if [ -n "$FIX_MS" ] && [ -n "$WIN_MS" ] && [ "$FIX_MS" -lt "$WIN_MS" ]; then
          ko "0 point collecté alors que Traccar en a : la FENÊTRE a été ouverte APRÈS le dernier fix"
          echo "      ↳ ouverture $WSTART · dernier fix $TRACCAR_LASTFIX"
          echo "        \`track start\` ne collecte qu'à partir de son instant d'ouverture :"
          echo "        tout ce qui précède est ignoré, par construction."
          fix "obtenir d'abord des positions FRAÎCHES (tracker dehors), PUIS ./track reset && ./track start"
        else
          warn "session ouverte mais 0 point collecté, sans cause évidente"
          echo "      ↳ regarder ./track logs (HTTP 401/403 = token ; sinon appareil ou fenêtre)"
        fi
      fi
    fi
  else
    ko "conteneur tracking-cache absent ou arrêté (${STATE:-introuvable})"
    fix "cd infra && ./deploy.sh ; puis \`docker compose logs tracking-cache\` (un TRACCAR_API_TOKEN manquant le fait redémarrer en boucle)"
  fi
fi

# =====================================================================
step "5. Caddy sert-il les fichiers que la page /live consomme ?"
# =====================================================================
for f in live-timer.json live-positions.json; do
  URL="https://$TRACKING_DOMAIN/$f"
  # UN SEUL GET, dont on garde les en-têtes (-D -) et on jette le corps.
  # ⚠ Surtout PAS `curl -I` ici : ça enverrait un HEAD, que tracking.caddy
  # refuse volontairement en 403 (`not method GET`) — donc sans en-tête CORS.
  # On croirait à une CORS manquante alors que le GET du navigateur, lui, va bien.
  HEADERS="$(curl -s -m 15 -D - -o /dev/null "$URL" 2>/dev/null)"
  CODE="$(printf '%s' "$HEADERS" | awk 'NR==1{print $2}')"
  if [ "$CODE" = "200" ]; then
    CORS="$(printf '%s' "$HEADERS" | grep -ci 'access-control-allow-origin')"
    if [ "${CORS:-0}" -gt 0 ]; then
      ok "$URL → 200, CORS présent"
    else
      ko "$URL → 200 mais SANS en-tête CORS (le navigateur bloquera la page /live)"
      fix "vérifier infra/caddy/conf.d/tracking.caddy puis ./deploy.sh"
    fi
  else
    ko "$URL → HTTP ${CODE:-échec}"
    fix "Caddy tourne-t-il en 80/443 (HTTP_PORT/HTTPS_PORT dans .env) ? Le DNS \`tracking\` doit rester DNS-only (nuage GRIS)."
  fi
done

# =====================================================================
echo
if [ "$FAILURES" -eq 0 ]; then
  echo "$OK Chaîne complète : aucun maillon en défaut."
  echo "   Rappel : sans \`./track start\`, la page /live reste en « Avant » et la carte est vide — c'est normal."
else
  echo "$KO $FAILURES point(s) en défaut — traite le PREMIER ❌ de la liste : les suivants en découlent souvent."
  echo "   Détail des remèdes : docs/runbook-tracker-gl320mg.md"
fi
exit $((FAILURES > 0))
