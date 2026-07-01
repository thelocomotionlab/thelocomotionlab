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
import re
import zipfile

# Extensions de conteneurs d'activité que le marcheur surface pour le dispatch. « .json »
# est inclus pour l'export Polar (séances en JSON propriétaire) ; les json non-activité sont
# écartés en aval (par la taille, puis par le parseur qui lève NotActivityData).
_ACTIVITY_EXTS = (".fit", ".tcx", ".gpx", ".json")

# Une valeur de la colonne « chemin du fichier » d'activities.csv finit par une extension
# de trace (éventuellement .gz). Sert à repérer cette colonne PAR SES VALEURS (l'en-tête est
# localisé selon la langue du compte : « Nom du fichier »/« Filename »/« Dateiname »…).
_STRAVA_FILE_VALUE_RE = re.compile(r"\.(fit|tcx|gpx)(\.gz)?$", re.IGNORECASE)

# Étiquettes « course à pied » de la colonne type d'activities.csv. Strava LOCALISE aussi
# les valeurs → jeu multilingue (normalisé minuscule/trim). Toute autre valeur = non-course.
_STRAVA_RUN_LABELS = frozenset({
    "run", "trail run", "virtual run", "treadmill run", "running", "trail running",
    "course à pied", "trail", "course sur tapis", "course virtuelle",
    "laufen", "lauf", "traillauf", "trailrunning", "virtueller lauf",
    "corsa", "corsa su trail", "corsa virtuale",
    "carrera", "carrera de trail", "carrera por senderos", "carrera virtual",
    "hardlopen", "corrida", "correr", "løping", "løp", "juoksu", "bieganie", "bieg",
})


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
    """Mappe ``basename de fichier → sport`` depuis activities.csv (export *bulk* Strava).

    Robuste à la **localisation** : ni les noms de colonnes ni leur ordre ne sont supposés.
    La colonne « fichier » est celle dont les VALEURS ressemblent à des traces (*.fit/.gpx/.tcx
    éventuellement .gz) ; la colonne « type » est celle qui porte le plus d'étiquettes de course
    connues (départage la vraie colonne d'un éventuel autre champ « Type »). Une étiquette de
    course est ramenée au jeton canonique ``"running"`` ; les autres valeurs restent brutes (le
    dispatch les normalisera en sport non-course). Le dictionnaire liste **tous** les fichiers
    d'activités du CSV — il sert aussi de signal « c'est un export Strava » (périmètre activities/).
    """
    member = next(
        (n for n in zf.namelist() if posixpath.basename(n).lower() == "activities.csv"),
        None,
    )
    if member is None:
        return {}
    try:
        text = zf.read(member).decode("utf-8-sig", errors="replace")
        rows = list(csv.reader(io.StringIO(text)))
    except (csv.Error, UnicodeError):
        return {}
    data = [r for r in rows[1:] if r] if len(rows) > 1 else []
    if not data:
        return {}
    ncol = max(len(r) for r in data)

    def values(j: int) -> list[str]:
        return [r[j].strip() for r in data if j < len(r) and r[j].strip()]

    # colonne « fichier » : celle qui maximise le nombre de valeurs en forme de trace
    file_scores = {j: sum(bool(_STRAVA_FILE_VALUE_RE.search(v)) for v in values(j)) for j in range(ncol)}
    file_col = max(file_scores, key=file_scores.get, default=None)
    if file_col is None or file_scores[file_col] == 0:
        return {}

    # colonne « type » : celle (hors fichier) qui porte le plus d'étiquettes de course
    run_scores = {
        j: sum(v.lower() in _STRAVA_RUN_LABELS for v in values(j))
        for j in range(ncol) if j != file_col
    }
    type_col = max(run_scores, key=run_scores.get, default=None)
    has_type = type_col is not None and run_scores[type_col] > 0

    mapping: dict[str, str] = {}
    for r in data:
        if file_col >= len(r):
            continue
        fname = posixpath.basename(r[file_col].strip())
        if not fname:
            continue
        label = r[type_col].strip() if (has_type and type_col < len(r)) else ""
        mapping[fname] = "running" if label.lower() in _STRAVA_RUN_LABELS else label
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
