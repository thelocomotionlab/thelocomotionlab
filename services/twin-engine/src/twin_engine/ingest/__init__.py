"""Ingestion multi-format → schéma canonique.

Adaptateurs PAR FORMAT (``.fit``/``.tcx``/``.gpx``, décompression ``.gz``/``.zip``,
bundle Strava) normalisés vers :class:`CanonicalActivity`. Point d'entrée :
:func:`ingest_path`. Tout l'aval ne consomme que le schéma canonique.
"""

from __future__ import annotations

from .canonical import (
    CANONICAL_VERSION,
    CanonicalActivity,
    haversine_cumulative,
    normalize_sport,
)
from .fit import parse_fit
from .gpx import parse_gpx
from .registry import IngestResult, ingest_path, iter_activities, parse_bytes, purge_path
from .tcx import parse_tcx

__all__ = [
    "CANONICAL_VERSION",
    "CanonicalActivity",
    "haversine_cumulative",
    "normalize_sport",
    "IngestResult",
    "ingest_path",
    "iter_activities",
    "purge_path",
    "parse_bytes",
    "parse_fit",
    "parse_tcx",
    "parse_gpx",
]
