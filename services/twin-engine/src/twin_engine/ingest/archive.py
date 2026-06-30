"""Décompression & parcours d'archives → activités canoniques.

Gère : ``.gz`` (fichier unique compressé), ``.zip`` (Coros, Garmin, ou **Strava bulk
export** au contenu mixte ``.gpx`` / ``.fit.gz`` / ``.tcx.gz``). Tout est lu **en flux
mémoire** : on n'extrait jamais l'archive entière sur disque (cf. budget 75 Go du VPS).

Le bundle Strava est reconnu par la présence d'``activities.csv``, qui renseigne le
**type de sport** des traces GPX (lesquelles ne le portent pas).
"""

from __future__ import annotations

import csv
import gzip
import io
import posixpath
import zipfile

_ACTIVITY_EXTS = (".fit", ".tcx", ".gpx")


def is_gzip(name: str) -> bool:
    return name.lower().endswith(".gz")


def strip_gz(name: str) -> str:
    return name[:-3] if is_gzip(name) else name


def decompress_gz(data: bytes) -> bytes:
    return gzip.decompress(data)


def recognized(name: str) -> bool:
    """Le fichier (après éventuel ``.gz``) est-il une trace d'activité connue ?"""
    return strip_gz(name).lower().endswith(_ACTIVITY_EXTS)


def _strava_sport_map(zf: zipfile.ZipFile) -> dict[str, str]:
    """Mappe basename de fichier → type de sport, depuis activities.csv (Strava bulk)."""
    member = next(
        (n for n in zf.namelist() if posixpath.basename(n).lower() == "activities.csv"),
        None,
    )
    if member is None:
        return {}
    mapping: dict[str, str] = {}
    try:
        text = zf.read(member).decode("utf-8-sig", errors="replace")
        reader = csv.reader(io.StringIO(text))
        header = next(reader, None)
        if not header:
            return {}
        cols = {h.strip().lower(): i for i, h in enumerate(header)}
        i_type = next((cols[k] for k in cols if "type" in k), None)
        i_file = next((cols[k] for k in cols if "filename" in k or "file name" in k), None)
        if i_type is None or i_file is None:
            return {}
        for row in reader:
            if len(row) <= max(i_type, i_file):
                continue
            fname = row[i_file].strip()
            if fname:
                mapping[posixpath.basename(fname)] = row[i_type].strip()
    except (csv.Error, UnicodeError):
        return {}
    return mapping


def iter_zip_members(data: bytes):
    """Itère ``(basename, bytes, sport_hint)`` pour chaque trace d'activité du zip."""
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        sport_map = _strava_sport_map(zf)
        for name in zf.namelist():
            if name.endswith("/"):
                continue
            base = posixpath.basename(name)
            if not base or not recognized(base):
                continue
            hint = sport_map.get(base)
            yield base, zf.read(name), hint


__all__ = [
    "is_gzip",
    "strip_gz",
    "decompress_gz",
    "recognized",
    "iter_zip_members",
]
