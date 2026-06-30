"""Schéma canonique d'activité — le contrat unique du moteur.

Tous les formats sources (Garmin/Coros/Suunto ``.fit``, Strava bulk, Polar
``.tcx``/``.gpx``…) sont normalisés par les adaptateurs (commit 2) vers UN seul
schéma, échantillonné à **1 enregistrement/seconde** (twin-theory §2.1). À partir
d'ici, **tout le reste du moteur ne consomme que ce schéma** — jamais « par marque ».

Canaux (longueur ``n`` = durée en secondes + 1) :
    ``t``        secondes depuis le début (0..n-1)
    ``dist_m``   distance cumulée (m), monotone non décroissante
    ``speed_ms`` vitesse (m/s)
    ``hr``       fréquence cardiaque (bpm) — ``NaN`` si absente (dégradation propre)
    ``alt_m``    altitude (m) — ``NaN`` si absente
    ``lat``,``lon`` position (deg) — ``NaN`` si absente

Les canaux absents sont remplis de ``NaN`` (jamais d'invention de données) ; l'aval
décide quoi en faire et **signale** la dégradation (ex. durabilité sans FC).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Sequence

import numpy as np

CANONICAL_VERSION = 1

# Normalisation des libellés de sport vers des jetons canoniques. Seul "running"
# est exploité par le jumeau ; les autres sont conservés mais ignorés en aval.
_SPORT_ALIASES: dict[str, str] = {
    "run": "running",
    "running": "running",
    "trail": "running",
    "trail_running": "running",
    "treadmill": "running",
    "walk": "walking",
    "walking": "walking",
    "hike": "hiking",
    "hiking": "hiking",
    "bike": "cycling",
    "biking": "cycling",
    "cycling": "cycling",
    "ride": "cycling",
    "virtualride": "cycling",
}


def normalize_sport(raw: str | None) -> str | None:
    """Ramène un libellé de sport brut à un jeton canonique (ou ``None`` si inconnu)."""
    if raw is None:
        return None
    key = str(raw).strip().lower().replace(" ", "_")
    if not key:
        return None
    return _SPORT_ALIASES.get(key, key)


def haversine_cumulative(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Distance horizontale cumulée (m) le long d'une trace lat/lon (haversine)."""
    R = 6_371_000.0
    phi = np.radians(lat)
    lam = np.radians(lon)
    dphi = np.diff(phi)
    dlam = np.diff(lam)
    a = np.sin(dphi / 2) ** 2 + np.cos(phi[:-1]) * np.cos(phi[1:]) * np.sin(dlam / 2) ** 2
    seg = 2 * R * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
    return np.concatenate([[0.0], np.cumsum(seg)])


def _seconds_from(timestamps: Sequence) -> np.ndarray:
    """Convertit des timestamps (datetime OU secondes) en secondes depuis le 1er point."""
    if len(timestamps) == 0:
        return np.zeros(0)
    first = timestamps[0]
    if isinstance(first, datetime):
        t0 = first
        return np.array([(t - t0).total_seconds() for t in timestamps], dtype=float)
    te = np.asarray(timestamps, dtype=float)
    return te - te[0]


def _resample(tg: np.ndarray, te: np.ndarray, values, *, fill_empty: float = np.nan) -> np.ndarray:
    """Interpole un canal sur la grille 1 Hz, en n'utilisant que les points finis.

    Renvoie ``fill_empty`` partout si aucun point fini (canal totalement absent).
    """
    if values is None:
        return np.full(len(tg), fill_empty, dtype=float)
    v = np.asarray(values, dtype=float)
    mask = np.isfinite(v)
    if mask.sum() == 0:
        return np.full(len(tg), fill_empty, dtype=float)
    return np.interp(tg, te[mask], v[mask])


@dataclass
class CanonicalActivity:
    """Une activité normalisée à 1 Hz. Transitoire : produite à l'ingestion puis
    purgée avec l'archive brute ; seuls les agrégats du jumeau sont conservés."""

    # --- métadonnées ---
    start_time: datetime | None
    sport: str | None
    sub_sport: str | None
    source_format: str  # "fit" | "tcx" | "gpx"
    source_name: str    # nom du fichier d'origine (jamais un chemin absolu)

    # --- canaux 1 Hz (longueur n) ---
    t: np.ndarray
    dist_m: np.ndarray
    speed_ms: np.ndarray
    hr: np.ndarray
    alt_m: np.ndarray
    lat: np.ndarray
    lon: np.ndarray

    # ------------------------------------------------------------------ #
    @property
    def n(self) -> int:
        return int(len(self.t))

    @property
    def duration_s(self) -> float:
        return float(self.t[-1]) if self.n else 0.0

    @property
    def has_hr(self) -> bool:
        return bool(np.isfinite(self.hr).any())

    @property
    def has_altitude(self) -> bool:
        return bool(np.isfinite(self.alt_m).any())

    @property
    def is_running(self) -> bool:
        return self.sport == "running"

    # ------------------------------------------------------------------ #
    @classmethod
    def from_samples(
        cls,
        *,
        timestamps: Sequence,
        source_format: str,
        source_name: str,
        dist_m: Sequence | None = None,
        speed_ms: Sequence | None = None,
        hr: Sequence | None = None,
        alt_m: Sequence | None = None,
        lat: Sequence | None = None,
        lon: Sequence | None = None,
        sport: str | None = None,
        sub_sport: str | None = None,
        start_time: datetime | None = None,
    ) -> "CanonicalActivity":
        """Construit une activité 1 Hz à partir d'échantillons bruts irréguliers.

        Logique de remplissage (commune à tous les formats, reprise d'extract_all2) :
          * distance : interpolée puis rendue **monotone** ; à défaut, intégrée depuis
            la vitesse ; à défaut, calculée par haversine sur lat/lon ;
          * vitesse : interpolée ; à défaut, dérivée de la distance ;
          * FC / altitude / position : interpolées, ``NaN`` si totalement absentes.
        """
        te = _seconds_from(timestamps)
        if te.size == 0 or te[-1] <= 0:
            raise ValueError(f"activité vide ou de durée nulle: {source_name!r}")

        if start_time is None and len(timestamps) and isinstance(timestamps[0], datetime):
            start_time = timestamps[0]
        if start_time is not None and start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)

        tg = np.arange(0.0, np.floor(te[-1]) + 1.0, 1.0)

        # --- distance ---
        if dist_m is not None and np.isfinite(np.asarray(dist_m, dtype=float)).any():
            dist_g = _resample(tg, te, dist_m, fill_empty=0.0)
        elif speed_ms is not None and np.isfinite(np.asarray(speed_ms, dtype=float)).any():
            v_g = _resample(tg, te, speed_ms, fill_empty=0.0)
            dist_g = np.concatenate([[0.0], np.cumsum(v_g[1:] * np.diff(tg))])
        elif lat is not None and lon is not None:
            lat_s = _resample(tg, te, lat)
            lon_s = _resample(tg, te, lon)
            dist_g = haversine_cumulative(lat_s, lon_s)
        else:
            raise ValueError(
                f"activité sans distance exploitable (ni dist, ni vitesse, ni GPS): {source_name!r}"
            )
        dist_g = np.maximum.accumulate(np.nan_to_num(dist_g, nan=0.0))

        # --- vitesse ---
        if speed_ms is not None and np.isfinite(np.asarray(speed_ms, dtype=float)).any():
            speed_g = _resample(tg, te, speed_ms, fill_empty=0.0)
        else:
            speed_g = np.gradient(dist_g, tg)
        speed_g = np.clip(speed_g, 0.0, None)

        return cls(
            start_time=start_time,
            sport=normalize_sport(sport),
            sub_sport=normalize_sport(sub_sport) if sub_sport else None,
            source_format=source_format,
            source_name=source_name,
            t=tg,
            dist_m=dist_g,
            speed_ms=speed_g,
            hr=_resample(tg, te, hr),
            alt_m=_resample(tg, te, alt_m),
            lat=_resample(tg, te, lat),
            lon=_resample(tg, te, lon),
        )


__all__ = [
    "CANONICAL_VERSION",
    "CanonicalActivity",
    "normalize_sport",
    "haversine_cumulative",
]
