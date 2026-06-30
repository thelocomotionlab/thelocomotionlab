"""Ingestion multi-format → schéma canonique.

Le sous-paquet expose le schéma canonique (commit 1) ; les adaptateurs par format
et le dispatch sont ajoutés au commit 2.
"""

from __future__ import annotations

from .canonical import (
    CANONICAL_VERSION,
    CanonicalActivity,
    haversine_cumulative,
    normalize_sport,
)

__all__ = [
    "CANONICAL_VERSION",
    "CanonicalActivity",
    "haversine_cumulative",
    "normalize_sport",
]
