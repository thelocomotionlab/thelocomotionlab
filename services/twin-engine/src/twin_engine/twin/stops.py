"""Arrêts et temps de mouvement d'une activité, en base DISTANCE.

Le canal vitesse ment pendant une pause de montre : interpolé à travers le trou
d'enregistrement, il reste à ~3 m/s alors que la distance fait un plateau (revue C2,
DIAGNOSTIC §9.2). Le masque « en mouvement » se lit donc sur les incréments de distance
à 1 Hz. C'est la règle qu'applique ``record.py`` (temps de mouvement, découplage en base
moving) ; elle est exposée ici comme fonction pure pour que la mesure des arrêts, le
futur modèle d'arrêts et le comptage du moteur partagent un seul et même masque.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np


def moving_mask(dist_m: np.ndarray, threshold_ms: float) -> np.ndarray:
    """Masque booléen (longueur n) : True là où l'incrément de distance de la seconde
    dépasse ``threshold_ms``. Le premier échantillon n'a pas d'incrément → False."""
    d = np.asarray(dist_m, dtype=float)
    if d.size == 0:
        return np.zeros(0, dtype=bool)
    return np.concatenate([[False], np.diff(d) > threshold_ms])


@dataclass(frozen=True)
class Stop:
    """Un plateau de distance : indices [start_s, end_s) du masque, en secondes."""

    start_s: int
    end_s: int

    @property
    def duration_s(self) -> int:
        return self.end_s - self.start_s


def detect_stops(mask: np.ndarray, min_stop_s: float) -> list[Stop]:
    """Arrêts = suites contiguës d'échantillons NON en mouvement d'au moins ``min_stop_s``.

    L'échantillon 0 (sans incrément) est ignoré : un arrêt ne peut commencer qu'à la
    première seconde mesurée."""
    m = np.asarray(mask, dtype=bool)
    if m.size < 2:
        return []
    stopped = ~m[1:]
    edges = np.diff(stopped.astype(np.int8), prepend=0, append=0)
    starts = np.flatnonzero(edges == 1) + 1
    ends = np.flatnonzero(edges == -1) + 1
    return [Stop(int(a), int(b)) for a, b in zip(starts, ends) if b - a >= min_stop_s]


@dataclass(frozen=True)
class StopStats:
    """Écoulé = mouvement + arrêts, mesuré sur UNE activité.

    ``stopped_s`` compte TOUTES les secondes sans mouvement (définition du moteur, seuil
    de vitesse) ; ``in_stops_s`` ne compte que celles des plateaux d'au moins
    ``min_stop_s`` — les « vrais » arrêts (ravitos, pauses), pas la marche très lente."""

    elapsed_s: float
    moving_s: float
    stopped_s: float
    min_stop_s: float
    n_stops: int
    n_stops_5min: int
    in_stops_s: float
    longest_stop_s: float

    @property
    def stopped_pct(self) -> float:
        return 100.0 * self.stopped_s / self.elapsed_s if self.elapsed_s > 0 else 0.0

    @property
    def stopped_min_per_hour(self) -> float:
        return (self.stopped_s / 60.0) / (self.elapsed_s / 3600.0) if self.elapsed_s > 0 else 0.0

    @property
    def in_stops_min_per_hour(self) -> float:
        return (self.in_stops_s / 60.0) / (self.elapsed_s / 3600.0) if self.elapsed_s > 0 else 0.0

    def to_dict(self) -> dict:
        d = asdict(self)
        d.update(stopped_pct=round(self.stopped_pct, 2),
                 stopped_min_per_hour=round(self.stopped_min_per_hour, 2),
                 in_stops_min_per_hour=round(self.in_stops_min_per_hour, 2))
        return d


def stop_stats(dist_m: np.ndarray, threshold_ms: float, *, min_stop_s: float = 60.0) -> StopStats:
    """Statistiques d'arrêts d'une activité 1 Hz (mêmes conventions que ``record.py`` :
    écoulé = dernière seconde de la grille, mouvement = secondes du masque)."""
    d = np.asarray(dist_m, dtype=float)
    n = d.size
    elapsed = float(n - 1) if n else 0.0
    mask = moving_mask(d, threshold_ms)
    moving = float(np.count_nonzero(mask))
    stops = detect_stops(mask, min_stop_s)
    durations = [s.duration_s for s in stops]
    return StopStats(
        elapsed_s=elapsed,
        moving_s=moving,
        stopped_s=max(elapsed - moving, 0.0),
        min_stop_s=float(min_stop_s),
        n_stops=len(stops),
        n_stops_5min=sum(1 for x in durations if x >= 300),
        in_stops_s=float(sum(durations)),
        longest_stop_s=float(max(durations)) if durations else 0.0,
    )


__all__ = ["moving_mask", "Stop", "detect_stops", "StopStats", "stop_stats"]
