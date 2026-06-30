"""Reconnaissance de formats & manifeste de sport Strava.

Le **parcours** des conteneurs (zip, zip-dans-zip, dossiers) vit dans ``walker.py`` —
volontairement générique et sans logique de marque. Ce module garde :

* les helpers de format (``.gz`` simple, reconnaissance d'extension d'activité) ;
* le **manifeste Strava** : un export *bulk* Strava porte un ``activities.csv`` qui
  renseigne le **type de sport** des traces ``.gpx`` (lesquelles ne le portent pas).
  C'est une logique propre à Strava (le sport n'est pas dans le fichier de trace), donc
  elle reste ici, jamais dans le marcheur générique.

Tout est lu **en flux mémoire** : on n'extrait jamais l'archive entière sur disque
(cf. budget 75 Go du VPS).
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


def strava_sport_map(data: bytes) -> dict[str, str]:
    """Carte ``basename -> sport`` d'un export Strava *bulk* (vide si pas un bundle Strava).

    Lue depuis ``activities.csv`` au niveau racine de l'archive. Ne sert QUE de repli pour
    les traces qui ne portent pas leur sport (``.gpx`` nu) : pour Garmin/Coros le sport est
    lu **dans** le fichier ``.fit`` et cette carte reste vide.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            return _strava_sport_map(zf)
    except zipfile.BadZipFile:
        return {}


__all__ = [
    "is_gzip",
    "strip_gz",
    "decompress_gz",
    "recognized",
    "strava_sport_map",
]
