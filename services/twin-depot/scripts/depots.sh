#!/usr/bin/env sh
# Dépôts de la cohorte Twin — lister, rapatrier, purger. À lancer DEPUIS TON POSTE.
#
#   ./depots.sh                       # ce qui attend sur le VPS
#   ./depots.sh get Crasse [dossier]  # rapatrie l'archive (défaut : dossier courant)
#   ./depots.sh purge <id>            # supprime le dépôt du VPS, APRÈS analyse
#
# Passe par SSH + docker (pas d'API ni de jeton à manipuler : le jeton de purge est
# lu dans infra/.env SUR le VPS et ne quitte jamais la machine). L'argument de `get`
# est un id OU un prénom (insensible à la casse) ; le nom de fichier et la
# vérification SHA-256 sont automatiques.
#
# Surcharges : LAB_VPS (défaut ubuntu@depot.thelocomotionlab.com), LAB_INFRA
# (défaut /opt/locomotionlab/infra).
#
# ⚠ Après analyse : `purge`. Règle du labo — l'archive d'un athlète ne survit pas à
# son analyse (CLAUDE.md § Données utilisateur).

set -eu

VPS="${LAB_VPS:-ubuntu@depot.thelocomotionlab.com}"
INFRA="${LAB_INFRA:-/opt/locomotionlab/infra}"

command -v jq >/dev/null 2>&1 || { echo "jq requis (apt install jq)." >&2; exit 1; }

# Exécute une commande DANS le conteneur twin-depot, à travers SSH.
dans_conteneur() {
  ssh "$VPS" "docker compose -f '$INFRA/compose.yml' exec -T twin-depot $1"
}

index() { dans_conteneur "cat /data/depots.json"; }

# Sélectionne un dépôt par id exact ou par prénom (insensible à la casse).
selectionner() {
  # jq -e sort non nul sur error() ; on relaie le message sans son préfixe technique.
  if ! trouve=$(index | jq -e --arg q "$1" '
    [.depots[] | select(.id == $q or (.prenom | ascii_downcase) == ($q | ascii_downcase))]
    | if length == 0 then error("aucun dépôt ne correspond à \($q)")
      elif length > 1 then error("\(length) dépôts correspondent à \($q) — précise son id")
      else .[0] end' 2>&1); then
    echo "$trouve" | sed 's/^jq: error.*): //' >&2
    exit 1
  fi
  printf '%s' "$trouve"
}

case "${1:-liste}" in
  liste)
    index | jq -r '
      if (.depots | length) == 0 then "Aucun dépôt en attente."
      else (.depots[] | "\(.reference)  \(.id)  \(.prenom) \(.nom) <\(.email)>\n"
            + "  \(.montre) · \(.nomFichier) · \((.taille/1048576)|round) Mo · \(.createdAt)"
            + (if .objectifs == "" then "" else "\n  « \(.objectifs) »" end)) end'
    ;;

  get)
    [ $# -ge 2 ] || { echo "usage : $0 get <id|prénom> [dossier]" >&2; exit 1; }
    meta=$(selectionner "$2")
    id=$(echo "$meta" | jq -r .id)
    nom=$(echo "$meta" | jq -r .nomFichier)
    sha=$(echo "$meta" | jq -r .sha256)
    dest="${3:-.}"
    mkdir -p "$dest"

    # Garde-fou doublon : l'ingestion du moteur ne dédoublonne pas (deux exports qui
    # se recouvrent = activités comptées deux fois, silencieusement).
    if [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
      echo "⚠ $dest n'est pas vide :" >&2
      ls -1 "$dest" >&2
      echo "  Le moteur ingère TOUT le dossier sans dédoublonner. Vide-le d'abord." >&2
      exit 1
    fi

    echo "→ $nom ($(echo "$meta" | jq -r '(.taille/1048576)|round') Mo) vers $dest/"
    dans_conteneur "cat '/data/archives/$id/$nom'" > "$dest/$nom"

    local_sha=$(sha256sum "$dest/$nom" | cut -d' ' -f1)
    if [ "$local_sha" = "$sha" ]; then
      echo "✓ SHA-256 conforme — archive intacte."
      echo "  Purge quand l'analyse est faite :  $0 purge $id"
    else
      echo "✗ SHA-256 DIFFÉRENT (transfert corrompu) — archive supprimée, relance." >&2
      rm -f "$dest/$nom"
      exit 1
    fi
    ;;

  purge)
    [ $# -ge 2 ] || { echo "usage : $0 purge <id|prénom>" >&2; exit 1; }
    meta=$(selectionner "$2")
    id=$(echo "$meta" | jq -r .id)
    # DELETE via l'API (le service supprime l'archive ET son entrée d'index — un `rm`
    # sur le volume laisserait depots.json incohérent). Jeton lu sur le VPS.
    ssh "$VPS" "cd '$INFRA' && set -a && . ./.env && set +a && \
      curl -sS -X DELETE -H \"Authorization: Bearer \$TWIN_DEPOT_ADMIN_TOKEN\" \
      \"https://\$DEPOT_DOMAIN/twin/depots/$id\""
    echo
    ;;

  *)
    echo "usage : $0 [liste] | get <id|prénom> [dossier] | purge <id|prénom>" >&2
    exit 1
    ;;
esac
