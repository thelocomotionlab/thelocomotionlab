#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# ========= Paramètres =========
MAX_DIM=3840      # largeur/hauteur max en pixels
QUALITY=98        # qualité WebP (0-100)
SUBDIR="compressed"  # sous-dossier de sortie
OVERWRITE=true    # true: réécrit si le fichier existe déjà ; false: saute

# ========= Détection ImageMagick =========
IM_CMD=""
if command -v magick >/dev/null 2>&1; then
  IM_CMD="magick"
elif command -v convert >/dev/null 2>&1; then
  IM_CMD="convert"
else
  echo "ImageMagick introuvable. Installe-le (ex: sudo apt install imagemagick)."
  exit 1
fi

# ========= Fonction taille portable (Linux/macOS) =========
filesize() {
  if stat --version >/dev/null 2>&1; then
    # GNU stat (Linux)
    stat -c%s -- "$1"
  else
    # BSD stat (macOS)
    stat -f%z -- "$1"
  fi
}

# ========= Dossier courant et sortie =========
SRC_DIR="$(pwd)"
OUT_DIR="${SRC_DIR%/}/${SUBDIR}"
mkdir -p "$OUT_DIR"

echo "Source : $SRC_DIR"
echo "Sortie : $OUT_DIR"
echo "Max dimension : ${MAX_DIM}px  |  Qualité WebP : ${QUALITY}"
echo

# ========= Recherche des fichiers =========
# Extensions gérées (insensible à la casse)
shopt -s nullglob nocaseglob
mapfile -t FILES < <(printf '%s\0' ./*.{jpg,jpeg,png} 2>/dev/null | xargs -0 -I{} bash -c 'if [ -f "{}" ]; then printf "%s\n" "{}"; fi')

if [ ${#FILES[@]} -eq 0 ]; then
  echo "Aucune image .jpg/.jpeg/.png trouvée dans ce dossier."
  exit 0
fi

total_before=0
total_after=0
processed=0

for src in "${FILES[@]}"; do
  # Ignore le script lui-même s'il matche le pattern
  [ "$(basename "$src")" = "$(basename "$0")" ] && continue

  base="$(basename "$src")"
  name="${base%.*}"
  dst="${OUT_DIR}/${name}.webp"

  if [ -f "$dst" ] && [ "$OVERWRITE" = false ]; then
    echo "[skip] $base (existe déjà)"
    continue
  fi

  size_before=$(filesize "$src")

  # Conversion avec redimensionnement conditionnel (>)
  # -strip supprime les métadonnées
  if [ "$IM_CMD" = "magick" ]; then
    magick "$src" \
      -resize "${MAX_DIM}x${MAX_DIM}>" \
      -strip \
      -sampling-factor 4:2:0 \
      -quality "$QUALITY" \
      "$dst" 2>/dev/null
  else
    convert "$src" \
      -resize "${MAX_DIM}x${MAX_DIM}>" \
      -strip \
      -sampling-factor 4:2:0 \
      -quality "$QUALITY" \
      "$dst" 2>/dev/null
  fi

  if [ ! -f "$dst" ]; then
    echo "[erreur] Échec conversion : $base"
    continue
  fi

  size_after=$(filesize "$dst")
  saved_pct=0
  if [ "$size_before" -gt 0 ]; then
    saved_pct=$(( (100 * (size_before - size_after)) / size_before ))
  fi

  printf "[ok] %-40s → %6d -> %6d octets (%+d%%)\n" "$base" "$size_before" "$size_after" "$saved_pct"

  total_before=$(( total_before + size_before ))
  total_after=$(( total_after + size_after ))
  processed=$(( processed + 1 ))
done

echo
echo "Fichiers traités : $processed"
echo "Total avant : $total_before octets"
echo "Total après : $total_after octets"
if [ "$total_before" -gt 0 ]; then
  total_saved=$(( (100 * (total_before - total_after)) / total_before ))
  echo "Gain total : ${total_saved}%"
fi
