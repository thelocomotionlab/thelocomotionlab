"""Schéma canonique d'activité — le contrat unique du moteur.

Tous les formats sources (Garmin/Coros/Suunto ``.fit``, Strava bulk, Polar
``.tcx``/``.gpx``/``.json``…) sont normalisés par les adaptateurs vers UN seul
schéma, échantillonné à **1 enregistrement/seconde** (twin-theory §2.1). À partir
d'ici, **tout le reste du moteur ne consomme que ce schéma** — jamais « par marque ».

Canaux (longueur ``n`` = durée en secondes + 1) :
    ``t``        secondes depuis le début (0..n-1)
    ``dist_m``   distance cumulée (m), monotone non décroissante
    ``speed_ms`` vitesse (m/s)
    ``hr``       fréquence cardiaque (bpm) — ``NaN`` si absente (dégradation propre)
    ``alt_m``    altitude (m) — ``NaN`` si absente
    ``lat``,``lon`` position (deg) — ``NaN`` si absente
    ``cadence_spm``  cadence en pas par minute, DEUX pieds — ``NaN`` si absente
    ``dist_device_m`` distance cumulée calculée par la montre quand le format la porte à
                 côté de la position (GPX COROS) — ``NaN`` sinon ; ``dist_m`` reste celle
                 que le format donne d'ordinaire (haversine pour un GPX)
    ``gap_s``    durée de l'intervalle d'enregistrement source qui contient chaque seconde
                 (1 sur un fichier à la seconde, davantage dans un trou interpolé)

Les canaux absents sont remplis de ``NaN`` (jamais d'invention de données) ; l'aval
décide quoi en faire et **signale** la dégradation (ex. durabilité sans FC).

Horloge : les horodatages sources passent par :func:`repair_clock` (horodatage isolé
aberrant, recul d'horloge) avant le rééchantillonnage, qui exige un temps croissant ; les
réparations faites sont gardées dans ``clock_notes``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Sequence

import numpy as np

CANONICAL_VERSION = 2


class NotActivityData(Exception):
    """Le contenu n'est **pas** une trace d'activité exploitable (ni une erreur de parsing).

    Levée par un adaptateur quand un fichier reconnu par extension s'avère être une
    métadonnée ou un résumé sans données (ex. un ``.json`` Polar qui n'est pas une
    *training-session* avec échantillons). L'ingestion l'**ignore en silence** — pas de
    fichier « ignoré » à afficher, contrairement à une vraie trace qui échoue au parsing.
    """

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


def clean_token(raw: str | None) -> str | None:
    """Minuscule + nettoyage d'un libellé **sans le réécrire** (pas d'alias de sport).

    Pour ``sub_sport`` : on veut conserver « trail »/« ultra »/« generic »/« road » tels
    quels (utiles au diagnostic) alors que :func:`normalize_sport` les ramènerait à
    « running ». Seul ``sport`` est aliasé ; le sous-sport reste fidèle à la source.
    """
    if raw is None:
        return None
    key = str(raw).strip().lower().replace(" ", "_")
    return key or None


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


# Un pas d'horloge plus long que ceci, de part et d'autre d'un point dont les voisins se
# suivent, n'est pas une pause : c'est la montre qui a écrit un horodatage aberrant.
CLOCK_JUMP_S = 3600.0


def repair_clock(te: np.ndarray) -> tuple[np.ndarray, list[str]]:
    """Horodatages réparés et ce qui a été fait (règle de ``tools/analyses/nice_2026_descentes``).

    Deux accidents de montre, éventuellement enchaînés :

    * un point isolé dont l'horodatage saute de plus de ``CLOCK_JUMP_S`` par rapport à ses
      deux voisins, qui eux se suivent : il est remis au milieu de ses voisins ;
    * un recul d'horloge : tout ce qui précède est recalé linéairement entre le premier
      point et le point qui suit le recul, comme une dérive rattrapée d'un coup.

    Le premier et le dernier horodatage ne bougent jamais (départ et arrivée conservés).
    Un fichier sans accident est rendu tel quel, liste de notes vide.
    """
    t = np.asarray(te, dtype=float).copy()
    notes: list[str] = []
    for k in range(1, len(t) - 1):
        if (abs(t[k] - t[k - 1]) > CLOCK_JUMP_S and abs(t[k + 1] - t[k]) > CLOCK_JUMP_S
                and abs(t[k + 1] - t[k - 1]) < CLOCK_JUMP_S):
            notes.append(f"point {k} : horodatage aberrant ({t[k] - t[k - 1]:+.0f} s), interpolé")
            t[k] = (t[k - 1] + t[k + 1]) / 2
    for _ in range(50):
        recul = np.flatnonzero(np.diff(t) < 0)
        if not recul.size:
            break
        k = int(recul[0])
        cible = t[k + 1] - 1.0
        if cible <= t[0]:
            t[: k + 1] = np.minimum(t[: k + 1], cible)
            continue
        echelle = (cible - t[0]) / (t[k] - t[0])
        notes.append(f"point {k} : l'horloge recule de {t[k] - t[k + 1]:.0f} s, "
                     f"dérive rattrapée (×{echelle:.5f})")
        t[: k + 1] = t[0] + (t[: k + 1] - t[0]) * echelle
    if np.any(np.diff(t) < 0):
        # au-delà de cinquante reculs, le temps est rendu croissant sans autre correction
        notes.append("horloge encore décroissante après réparation : temps rendu croissant")
        t = np.maximum.accumulate(t)
    return t, notes


def _native_gap(tg: np.ndarray, te: np.ndarray) -> np.ndarray:
    """Pour chaque seconde de la grille, la durée de l'intervalle d'enregistrement source
    qui la contient : le « pas » d'un point source, porté sur la grille interpolée."""
    if te.size < 2:
        return np.ones(len(tg))
    j = np.clip(np.searchsorted(te, tg, side="left"), 1, te.size - 1)
    return te[j] - te[j - 1]


# Détection de l'unité de cadence. Les formats l'écrivent par pied (FIT, TCX RunCadence,
# extensions GPX, Polar : 75–100 en course, 45–65 en marche) ou, plus rarement, pour les
# deux pieds (150–200 et 90–130). Les plages ne se recouvrent pas à vitesse donnée : la
# médiane en course franche, ou à défaut en marche, tranche pour chaque activité.
_CADENCE_RUN_MS = 2.5          # vitesse au-dessus de laquelle on court sans ambiguïté
_CADENCE_RUN_MIN_S = 120
_CADENCE_RUN_SPLIT = 125.0     # médiane de course sous ce seuil : valeurs par pied
_CADENCE_WALK_MS = (0.7, 1.8)
_CADENCE_WALK_MIN_S = 300
_CADENCE_WALK_SPLIT = 80.0     # médiane de marche sous ce seuil : valeurs par pied


def _cadence_spm(cad: np.ndarray, dist_g: np.ndarray,
                 declared_per_foot: bool | None) -> tuple[np.ndarray, str | None]:
    """Cadence en pas par minute (deux pieds) et l'unité source retenue (« par_pied » ou
    « deux_pieds ») ; ``(NaN, None)`` sans cadence exploitable."""
    finite = np.isfinite(cad) & (cad > 0)
    if not finite.any():
        return np.full(len(cad), np.nan), None
    # vitesse sur 10 s, lue sur la distance (le canal vitesse ment pendant une pause)
    v = np.zeros(len(dist_g))
    if len(dist_g) > 10:
        v[5:-5] = (dist_g[10:] - dist_g[:-10]) / 10.0
    run = finite & (v >= _CADENCE_RUN_MS)
    walk = finite & (v >= _CADENCE_WALK_MS[0]) & (v < _CADENCE_WALK_MS[1])
    if run.sum() >= _CADENCE_RUN_MIN_S:
        per_foot = bool(np.median(cad[run]) < _CADENCE_RUN_SPLIT)
    elif walk.sum() >= _CADENCE_WALK_MIN_S:
        per_foot = bool(np.median(cad[walk]) < _CADENCE_WALK_SPLIT)
    else:
        per_foot = True if declared_per_foot is None else bool(declared_per_foot)
    out = np.where(np.isfinite(cad), cad * (2.0 if per_foot else 1.0), np.nan)
    return out, ("par_pied" if per_foot else "deux_pieds")


@dataclass
class CanonicalActivity:
    """Une activité normalisée à 1 Hz. Transitoire : produite à l'ingestion puis
    purgée avec l'archive brute ; seuls les agrégats du jumeau sont conservés."""

    # --- métadonnées ---
    start_time: datetime | None
    sport: str | None
    sub_sport: str | None
    source_format: str  # "fit" | "tcx" | "gpx" | "polar"
    source_name: str    # nom du fichier d'origine (jamais un chemin absolu)

    # --- canaux 1 Hz (longueur n) ---
    t: np.ndarray
    dist_m: np.ndarray
    speed_ms: np.ndarray
    hr: np.ndarray
    alt_m: np.ndarray
    lat: np.ndarray
    lon: np.ndarray
    # canaux facultatifs : absents d'une construction directe, ils valent NaN (cadence,
    # distance de la montre) ou un pas d'une seconde (intervalle source)
    cadence_spm: np.ndarray | None = None
    dist_device_m: np.ndarray | None = None
    gap_s: np.ndarray | None = None
    cadence_unit: str | None = None          # unité trouvée à la source : par_pied | deux_pieds
    clock_notes: tuple[str, ...] = ()        # réparations d'horloge (repair_clock)

    def __post_init__(self) -> None:
        n = len(self.t)
        if self.cadence_spm is None:
            self.cadence_spm = np.full(n, np.nan)
        if self.dist_device_m is None:
            self.dist_device_m = np.full(n, np.nan)
        if self.gap_s is None:
            self.gap_s = np.ones(n)

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
    def has_cadence(self) -> bool:
        return bool(np.isfinite(self.cadence_spm).any())

    @property
    def has_device_distance(self) -> bool:
        return bool(np.isfinite(self.dist_device_m).any())

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
        cadence: Sequence | None = None,
        cadence_per_foot: bool | None = None,
        dist_device_m: Sequence | None = None,
    ) -> "CanonicalActivity":
        """Construit une activité 1 Hz à partir d'échantillons bruts irréguliers.

        Logique de remplissage (commune à tous les formats, reprise d'extract_all2) :
          * horodatages : réparés (:func:`repair_clock`) avant tout rééchantillonnage ;
          * distance : interpolée puis rendue **monotone** ; à défaut, intégrée depuis
            la vitesse ; à défaut, calculée par haversine sur lat/lon ;
          * vitesse : interpolée ; à défaut, dérivée de la distance ;
          * FC / altitude / position : interpolées, ``NaN`` si totalement absentes ;
          * cadence : interpolée, ramenée en pas par minute pour les deux pieds (unité de
            la source lue sur les données, ``cadence_per_foot`` départage les cas muets) ;
          * distance de la montre (``dist_device_m``) : gardée à part, monotone, partant de 0.
        """
        te = _seconds_from(timestamps)
        te, clock_notes = repair_clock(te)
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

        # --- distance de la montre, quand le format la porte à côté de la position ---
        device_g = _resample(tg, te, dist_device_m)
        if np.isfinite(device_g).any():
            device_g = np.maximum.accumulate(device_g)
            device_g = device_g - device_g[0]

        # --- cadence, en pas par minute pour les deux pieds ---
        cadence_g, cadence_unit = _cadence_spm(
            _resample(tg, te, cadence),
            device_g if np.isfinite(device_g).any() else dist_g,
            cadence_per_foot,
        )

        return cls(
            start_time=start_time,
            sport=normalize_sport(sport),
            sub_sport=clean_token(sub_sport),
            source_format=source_format,
            source_name=source_name,
            t=tg,
            dist_m=dist_g,
            speed_ms=speed_g,
            hr=_resample(tg, te, hr),
            alt_m=_resample(tg, te, alt_m),
            lat=_resample(tg, te, lat),
            lon=_resample(tg, te, lon),
            cadence_spm=cadence_g,
            dist_device_m=device_g,
            gap_s=_native_gap(tg, te),
            cadence_unit=cadence_unit,
            clock_notes=tuple(clock_notes),
        )


__all__ = [
    "CANONICAL_VERSION",
    "CLOCK_JUMP_S",
    "NotActivityData",
    "CanonicalActivity",
    "normalize_sport",
    "clean_token",
    "haversine_cumulative",
    "repair_clock",
]
