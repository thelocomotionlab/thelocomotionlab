"""Dispatch d'ingestion : un chemin (fichier, archive ou dossier) → activités canoniques.

Point d'entrée unique du sous-paquet ingest. Le **parcours** du conteneur (zips imbriqués,
dossiers) est délégué au marcheur générique (:mod:`walker`) ; ici on **parse** chaque trace
découverte vers le schéma canonique, on agrège, et on collecte les fichiers ignorés (avec la
raison) — jamais d'exception qui ferait tomber toute une archive à cause d'un fichier brouillon.

Confidentialité : l'option ``purge_source`` supprime l'archive brute **dès la fin du
parsing** (garde-fou CLAUDE.md : on ne conserve que le rapport + métadonnées).
"""

from __future__ import annotations

import os
import posixpath
import shutil
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Callable, Iterator

from .archive import _ACTIVITY_EXTS, decompress_gz, is_gzip, recognized, strava_sport_map, strip_gz
from .canonical import CanonicalActivity, NotActivityData, normalize_sport
from .fit import parse_fit
from .gpx import parse_gpx
from .polar import parse_polar
from .tcx import parse_tcx
from .walker import walk_activity_files

_PARSERS = {"fit": parse_fit, "tcx": parse_tcx, "gpx": parse_gpx, "json": parse_polar}


def _safe_name(orig: str, idx: int) -> str:
    """Nom anonyme ``activity-NNNNN.ext`` : **efface toute PII** du nom d'origine.

    Les exports RGPD de Garmin nomment chaque fichier d'après l'e-mail de l'athlète
    (``athlete@example.com_12345.fit``). On ne conserve que l'extension reconnue (+ ``.gz``)
    pour que l'aval sache décompresser/dispatcher ; le nom d'origine n'est jamais stocké
    ni journalisé.
    """
    low = orig.lower()
    gz = ".gz" if low.endswith(".gz") else ""
    stem = low[: -len(gz)] if gz else low
    ext = next((e for e in _ACTIVITY_EXTS if stem.endswith(e)), "")
    return f"activity-{idx:05d}{ext}{gz}"


@dataclass
class IngestResult:
    """Résultat d'ingestion : activités exploitables + fichiers ignorés (raison)."""

    activities: list[CanonicalActivity] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)

    @property
    def running(self) -> list[CanonicalActivity]:
        return [a for a in self.activities if a.is_running]


def parse_bytes(data: bytes, name: str, *, sport_hint: str | None = None) -> CanonicalActivity:
    """Parse des octets d'une trace unique (après éventuelle décompression ``.gz``)."""
    base = name
    if is_gzip(base):
        data = decompress_gz(data)
        base = strip_gz(base)
    ext = base.lower().rsplit(".", 1)[-1]
    parser = _PARSERS.get(ext)
    if parser is None:
        raise ValueError(f"format non supporté: {name!r}")
    act = parser(data, base)
    if act.sport is None and sport_hint:
        act.sport = normalize_sport(sport_hint)
    return act


def iter_activities(
    path: str | os.PathLike[str],
    *,
    running_only: bool = False,
    progress: Callable[[int, str], None] | None = None,
    skipped: list[dict] | None = None,
) -> Iterator[CanonicalActivity]:
    """Ingestion en FLUX (E1) : yield chaque activité canonique puis la laisse mourir.

    Mémoire O(1 activité) au lieu de O(archive) — sur une archive de ~12 000 fichiers,
    matérialiser toutes les activités 1 Hz (7 canaux float64) coûtait plusieurs Go alors que
    l'aval (courbe record) n'a besoin que d'UNE activité à la fois. ``skipped`` (liste fournie
    par l'appelant) collecte les fichiers ignorés avec leur raison. Ne purge PAS la source :
    l'appelant purge après épuisement du flux (elle est encore lue pendant l'itération).

    Confidentialité : mêmes garanties que :func:`ingest_path` (noms anonymisés en
    ``activity-NNNNN.ext``, sport lu DANS le fichier, jamais d'après le nom).
    """
    p = Path(path)
    # fichier unique non reconnu : signalé explicitement (le marcheur n'émet rien pour lui)
    if p.is_file() and p.suffix.lower() != ".zip" and not recognized(p.name):
        if skipped is not None:
            skipped.append({"name": p.name, "reason": "format non supporté"})
        return

    source, sport_map, scope = _prepare(p)
    count = 0
    for idx, (orig, data) in enumerate(walk_activity_files(source, path_filter=scope), start=1):
        hint = sport_map.get(posixpath.basename(orig))  # transitoire : orig jamais conservé
        safe = _safe_name(orig, idx)
        try:
            act = parse_bytes(data, safe, sport_hint=hint)
        except NotActivityData:
            continue  # conteneur reconnu mais non-activité : ignoré sans bruit
        except Exception as exc:  # noqa: BLE001 — un fichier brouillon n'arrête rien
            if skipped is not None:
                skipped.append({"name": safe, "reason": str(exc)})
            count += 1
            if progress:
                progress(count, safe)
            continue
        count += 1
        if running_only and not act.is_running:
            if skipped is not None:
                skipped.append({"name": safe, "reason": f"sport ignoré: {act.sport or 'inconnu'}"})
            if progress:
                progress(count, safe)
            continue
        if progress:
            progress(count, safe)
        yield act


def purge_path(path: str | os.PathLike[str]) -> None:
    """Supprime l'entrée brute (fichier/dossier) — à appeler après épuisement du flux."""
    _purge(Path(path))


def ingest_path(
    path: str | os.PathLike[str],
    *,
    purge_source: bool = False,
    running_only: bool = False,
    progress: Callable[[int, str], None] | None = None,
) -> IngestResult:
    """Ingeste un fichier, une archive ``.zip`` (imbriquée ou non) ou un dossier — version
    MATÉRIALISÉE de :func:`iter_activities` (liste complète en mémoire ; préférer le flux
    pour les grosses archives).

    ``progress(n, name)`` est appelé après chaque fichier traité (n = total cumulé).
    ``running_only`` n'ajoute que les activités de course à pied (sport lu dans le fichier).
    Si ``purge_source`` est vrai, supprime l'entrée brute après parsing.
    """
    result = IngestResult()
    result.activities.extend(
        iter_activities(path, running_only=running_only, progress=progress,
                        skipped=result.skipped)
    )
    if purge_source:
        _purge(Path(path))
    return result


def _activities_scope(path: str) -> bool:
    """Vrai si ``path`` est sous un dossier ``activities`` — périmètre d'un export Strava.

    Écarte ``media/``, ``routes/``, ``clubs/`` et les CSV racine **avant lecture** (on ne
    charge jamais les photos ni les routes sauvegardées en mémoire).
    """
    return "activities" in PurePosixPath(path).parts[:-1]


def _prepare(p: Path) -> tuple[bytes | Path, dict[str, str], Callable[[str], bool] | None]:
    """Renvoie ``(source pour le marcheur, carte de sport Strava, périmètre)``.

    Pour un ``.zip`` on lit les octets une seule fois : ils servent à la fois au manifeste
    Strava (repli de sport pour les ``.gpx`` nus) et au marcheur. La présence d'``activities.csv``
    (carte non vide) marque un export Strava → on limite l'ingestion à ``activities/``. Sinon
    (Garmin, Polar, dossier, fichier), aucun périmètre : comportement inchangé.
    """
    if p.is_file() and p.suffix.lower() == ".zip":
        data = p.read_bytes()
        sport_map = strava_sport_map(data)
        scope = _activities_scope if sport_map else None
        return data, sport_map, scope
    return p, {}, None


def _purge(p: Path) -> None:
    try:
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
        elif p.exists():
            p.unlink()
    except OSError:
        pass


__all__ = ["IngestResult", "ingest_path", "iter_activities", "purge_path", "parse_bytes"]
