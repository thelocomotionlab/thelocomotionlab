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
from pathlib import Path
from typing import Callable

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

    def _add(
        self, base: str, data: bytes, sport_hint: str | None, *, running_only: bool = False
    ) -> None:
        try:
            act = parse_bytes(data, base, sport_hint=sport_hint)
        except NotActivityData:
            return  # conteneur reconnu mais non-activité (ex. json de métadonnée) : ignoré sans bruit
        except Exception as exc:  # noqa: BLE001 — robustesse: un fichier brouillon n'arrête rien
            self.skipped.append({"name": base, "reason": str(exc)})
            return
        # Filtre confidentialité/pertinence : on ne RETIENT que la course à pied, et le sport
        # est lu DANS le fichier (session/sport du FIT) — jamais d'après le nom ni un manifeste.
        if running_only and not act.is_running:
            self.skipped.append({"name": base, "reason": f"sport ignoré: {act.sport or 'inconnu'}"})
            return
        self.activities.append(act)


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


def ingest_path(
    path: str | os.PathLike[str],
    *,
    purge_source: bool = False,
    running_only: bool = False,
    progress: Callable[[int, str], None] | None = None,
) -> IngestResult:
    """Ingeste un fichier, une archive ``.zip`` (imbriquée ou non) ou un dossier.

    ``progress(n, name)`` est appelé après chaque fichier traité (n = total cumulé) —
    utile pour un indicateur sur une archive de centaines de fichiers. ``running_only``
    n'ajoute que les activités de course à pied (sport lu dans le fichier). Si
    ``purge_source`` est vrai, supprime l'entrée brute après parsing (archive/dossier inclus).

    Confidentialité : les noms d'origine (qui peuvent porter de la PII dans les exports RGPD)
    sont **anonymisés** en ``activity-NNNNN.ext`` ; le nom brut ne sert que, transitoirement,
    à retrouver l'extension et le repli de sport Strava, puis il est abandonné.
    """
    p = Path(path)
    result = IngestResult()

    # Cas d'un fichier unique non reconnu : on le signale explicitement (le marcheur, lui,
    # n'émet rien pour un format inconnu).
    if p.is_file() and p.suffix.lower() != ".zip" and not recognized(p.name):
        result.skipped.append({"name": p.name, "reason": "format non supporté"})
        if purge_source:
            _purge(p)
        return result

    source, sport_map = _prepare(p)
    for idx, (orig, data) in enumerate(walk_activity_files(source), start=1):
        hint = sport_map.get(posixpath.basename(orig))  # transitoire : orig jamais conservé
        safe = _safe_name(orig, idx)
        result._add(safe, data, hint, running_only=running_only)
        if progress:
            progress(len(result.activities) + len(result.skipped), safe)

    if purge_source:
        _purge(p)
    return result


def _prepare(p: Path) -> tuple[bytes | Path, dict[str, str]]:
    """Renvoie ``(source pour le marcheur, carte de sport Strava)``.

    Pour un ``.zip`` on lit les octets une seule fois : ils servent à la fois au manifeste
    Strava (repli de sport pour les ``.gpx`` nus) et au marcheur. Sinon, on passe le chemin.
    """
    if p.is_file() and p.suffix.lower() == ".zip":
        data = p.read_bytes()
        return data, strava_sport_map(data)
    return p, {}


def _purge(p: Path) -> None:
    try:
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
        elif p.exists():
            p.unlink()
    except OSError:
        pass


__all__ = ["IngestResult", "ingest_path", "parse_bytes"]
