"""Dispatch d'ingestion : un chemin (fichier, archive ou dossier) → activités canoniques.

Point d'entrée unique du sous-paquet ingest. Dispatche **par format** vers le bon
adaptateur, agrège les activités et collecte les fichiers ignorés (avec la raison) —
jamais d'exception qui ferait tomber toute une archive à cause d'un fichier brouillon.

Confidentialité : l'option ``purge_source`` supprime l'archive brute **dès la fin du
parsing** (garde-fou CLAUDE.md : on ne conserve que le rapport + métadonnées).
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from .archive import decompress_gz, is_gzip, iter_zip_members, recognized, strip_gz
from .canonical import CanonicalActivity, normalize_sport
from .fit import parse_fit
from .gpx import parse_gpx
from .tcx import parse_tcx

_PARSERS = {"fit": parse_fit, "tcx": parse_tcx, "gpx": parse_gpx}


@dataclass
class IngestResult:
    """Résultat d'ingestion : activités exploitables + fichiers ignorés (raison)."""

    activities: list[CanonicalActivity] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)

    @property
    def running(self) -> list[CanonicalActivity]:
        return [a for a in self.activities if a.is_running]

    def _add(self, base: str, data: bytes, sport_hint: str | None) -> None:
        try:
            self.activities.append(parse_bytes(data, base, sport_hint=sport_hint))
        except Exception as exc:  # noqa: BLE001 — robustesse: un fichier brouillon n'arrête rien
            self.skipped.append({"name": base, "reason": str(exc)})


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


def ingest_path(path: str | os.PathLike[str], *, purge_source: bool = False) -> IngestResult:
    """Ingeste un fichier, une archive ``.zip``/``.gz`` ou un dossier → :class:`IngestResult`.

    Si ``purge_source`` est vrai, supprime l'entrée brute après parsing (archive/dossier
    inclus).
    """
    p = Path(path)
    result = IngestResult()

    if p.is_dir():
        for f in sorted(p.rglob("*")):
            if f.is_file() and (recognized(f.name) or f.suffix.lower() == ".zip"):
                _ingest_file(f, result)
    else:
        _ingest_file(p, result)

    if purge_source:
        _purge(p)
    return result


def _ingest_file(p: Path, result: IngestResult) -> None:
    suffix = p.suffix.lower()
    if suffix == ".zip":
        data = p.read_bytes()
        for base, member_bytes, hint in iter_zip_members(data):
            result._add(base, member_bytes, hint)
    elif recognized(p.name):
        result._add(p.name, p.read_bytes(), None)
    else:
        result.skipped.append({"name": p.name, "reason": "format non supporté"})


def _purge(p: Path) -> None:
    try:
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
        elif p.exists():
            p.unlink()
    except OSError:
        pass


__all__ = ["IngestResult", "ingest_path", "parse_bytes"]
