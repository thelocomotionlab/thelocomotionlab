"""Marcheur de conteneur **générique** : découvre les traces d'activité dans une archive.

Ouvre une archive (octets, fichier ``.zip`` ou dossier), **déballe récursivement** les zips
imbriqués (zip-dans-zip, comme l'export RGPD « Exporter toutes vos données » de Garmin) et
**découvre** les traces ``.fit`` / ``.tcx`` / ``.gpx`` (éventuellement ``.gz``) où qu'elles
soient, en ignorant tout le reste (JSON, PNG, CSV de service, dossiers de sauvegarde…).

Volontairement **sans aucune logique propre à une marque** : ce marcheur servira tel quel à
Garmin, Polar et Strava. Deux principes :

* **Ne dépend JAMAIS des noms de fichiers.** Les exports RGPD de Garmin incluent l'e-mail de
  l'athlète dans le nom de chaque fichier (PII). La sélection se fait par **extension** et par
  **taille** uniquement ; le *sport* est ensuite lu **dans** le fichier par les parseurs.
* **Pré-filtre de taille à coût nul.** ``zipfile`` expose la taille décompressée de chaque
  entrée (``ZipInfo.file_size``) sans la lire : on écarte d'emblée les fichiers de bruit
  (monitoring / HRV / réglages de Garmin font quelques centaines d'octets) sans jamais les
  décompresser — une vraie séance pèse des dizaines de Ko au minimum.

Confidentialité & coût disque : tout est lu **en flux mémoire** ; on n'extrait jamais l'archive
entière sur disque (budget 75 Go du VPS).
"""

from __future__ import annotations

import io
import os
import posixpath
import zipfile
from pathlib import Path
from typing import Iterator

from .archive import recognized

# Sous ce seuil, un fichier ne peut pas contenir de séance exploitable : les fichiers
# « monitoring / settings / HRV » de l'export Garmin font quelques centaines d'octets.
# Appliqué à ``ZipInfo.file_size`` (taille décompressée), donc sans lire l'entrée.
DEFAULT_MIN_BYTES = 1024
# Garde-fou anti-boucle (archive piégée) : la profondeur d'imbrication réelle est de 2–3.
DEFAULT_MAX_DEPTH = 8


def _is_zip(name: str) -> bool:
    return name.lower().endswith(".zip")


def walk_activity_files(
    source: bytes | bytearray | str | os.PathLike[str],
    *,
    min_bytes: int = DEFAULT_MIN_BYTES,
    max_depth: int = DEFAULT_MAX_DEPTH,
) -> Iterator[tuple[str, bytes]]:
    """Itère ``(basename, raw_bytes)`` pour chaque trace d'activité du conteneur.

    ``source`` : octets d'un zip, chemin d'un ``.zip``, chemin d'une trace, ou dossier.
    Les fichiers ``.gz`` sont restitués **tels quels** (nom + octets compressés) — la
    décompression appartient au parseur en aval (``parse_bytes``). Récursion bornée par
    ``max_depth`` ; un zip illisible est ignoré (jamais d'exception qui tombe l'archive).
    """
    if isinstance(source, (bytes, bytearray)):
        yield from _walk_zip(bytes(source), min_bytes, max_depth, 0)
        return

    p = Path(source)
    if p.is_dir():
        for f in sorted(p.rglob("*")):
            if not f.is_file():
                continue
            if _is_zip(f.name):
                yield from _walk_zip(f.read_bytes(), min_bytes, max_depth, 0)
            elif recognized(f.name) and f.stat().st_size >= min_bytes:
                yield f.name, f.read_bytes()
    elif _is_zip(p.name):
        yield from _walk_zip(p.read_bytes(), min_bytes, max_depth, 0)
    elif recognized(p.name):
        yield p.name, p.read_bytes()


def _walk_zip(
    data: bytes, min_bytes: int, max_depth: int, depth: int
) -> Iterator[tuple[str, bytes]]:
    if depth > max_depth:
        return
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return
    with zf:
        for zi in zf.infolist():
            if zi.is_dir():
                continue
            base = posixpath.basename(zi.filename)
            if not base:
                continue
            if _is_zip(base):
                # Un zip imbriqué peut être petit une fois compressé : on ne le filtre
                # pas par taille, on descend dedans.
                try:
                    nested = zf.read(zi)
                except (zipfile.BadZipFile, RuntimeError, OSError):
                    continue
                yield from _walk_zip(nested, min_bytes, max_depth, depth + 1)
            elif recognized(base):
                # Pré-filtre SANS lecture (taille décompressée dans l'en-tête du zip).
                if zi.file_size < min_bytes:
                    continue
                try:
                    yield base, zf.read(zi)
                except (zipfile.BadZipFile, RuntimeError, OSError):
                    continue


__all__ = ["walk_activity_files", "DEFAULT_MIN_BYTES", "DEFAULT_MAX_DEPTH"]
