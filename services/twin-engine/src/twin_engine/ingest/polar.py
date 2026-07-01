"""Adaptateur Polar Flow (« Export your data », RGPD) → schéma canonique.

Un export Polar est un **dossier plat de centaines de ``.json``** (aucun ``.fit/.tcx/.gpx``,
aucun zip imbriqué). Le marcheur de conteneur générique les découvre ; ce module fournit le
**parseur de format** pour la seule catégorie utile : les *training-sessions* qui portent des
échantillons seconde-par-seconde.

Structure exploitée (le reste est ignoré, cf. confidentialité ci-dessous) :

* ``sport.id``            identifiant de sport (``"1"`` = course) — **peut être chaîne ou entier** ;
* ``startTime``          horodatage ISO de départ ;
* ``exercises[].samples.samples``  canaux parallèles ``{type, intervalMillis, values[]}`` de même
  longueur (``HEART_RATE`` bpm, ``SPEED`` **km/h**, ``DISTANCE`` m cumulée, ``ALTITUDE`` m, …),
  à reconstruire sur une base de temps commune (``i · intervalMillis``) ;
* ``exercises[].routes.route.wayPoints``  trace GPS séparée ``{latitude, longitude, altitude,
  elapsedMillis}`` — **fusionnée** sur la timeline des échantillons par interpolation.

Cas gérés : séance en **résumé seul** (pas d'échantillons) → :class:`NotActivityData` (ignorée) ;
**tapis / intérieur** (0 wayPoint) → conservée via distance/vitesse (le schéma canonique sait
intégrer) ; sports non-course → laissés au filtre de sport en aval.

Confidentialité (garde-fous CLAUDE.md) : on ne lit **que** les canaux et wayPoints nécessaires.
``deviceId``, ``physicalInformation``, coordonnées de départ, notes, etc. **ne sont jamais lus ni
journalisés** ; le nom de fichier (déjà anonymisé par la couche d'ingestion) n'entre pas en jeu.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import numpy as np

from .canonical import CanonicalActivity, NotActivityData

# Identifiants de sport Polar → jeton lisible (seul « running » est exploité par le jumeau ;
# les autres servent juste à une raison d'exclusion parlante). Comparaison robuste au type.
_POLAR_SPORT = {
    "1": "running",
    "2": "cycling",
    "83": "indoor",
    "34": "hiit",
}

# Canaux Polar → champ canonique (+ facteur d'unité). SPEED est en km/h → m/s.
_CHANNELS: dict[str, tuple[str, float]] = {
    "HEART_RATE": ("hr", 1.0),
    "SPEED": ("speed_ms", 1.0 / 3.6),
    "DISTANCE": ("dist_m", 1.0),
    "ALTITUDE": ("alt_m", 1.0),
}


def _sport_token(session: dict) -> str | None:
    """Jeton de sport depuis ``sport.id`` (chaîne **ou** entier) ; ``None`` si absent."""
    sport = session.get("sport")
    raw = sport.get("id") if isinstance(sport, dict) else sport
    if raw is None:
        return None
    key = str(raw).strip()
    return _POLAR_SPORT.get(key, f"polar_{key}")


def _first_exercise_with_samples(session: dict) -> dict | None:
    for ex in session.get("exercises") or []:
        if isinstance(ex, dict) and ((ex.get("samples") or {}).get("samples")):
            return ex
    return None


def _float_array(values: Any) -> np.ndarray:
    """Convertit une liste de valeurs (avec None/absences) en tableau float (NaN si non numérique)."""
    out = np.full(len(values), np.nan, dtype=float)
    for i, v in enumerate(values):
        if isinstance(v, (int, float)):
            out[i] = float(v)
    return out


def _parse_start(session: dict, exercise: dict) -> datetime | None:
    for src in (exercise.get("startTime"), session.get("startTime")):
        if isinstance(src, str) and src:
            try:
                return datetime.fromisoformat(src)
            except ValueError:
                continue
    return None


def parse_polar(data: bytes, source_name: str) -> CanonicalActivity:
    """Parse une *training-session* Polar (JSON) → :class:`CanonicalActivity`.

    Lève :class:`NotActivityData` si le contenu n'est pas une séance avec échantillons
    (métadonnée, résumé seul, autre json) — l'ingestion l'ignore alors sans bruit.
    """
    try:
        session = json.loads(data)
    except (ValueError, UnicodeDecodeError) as exc:
        raise NotActivityData(f"json illisible: {source_name!r}") from exc
    if not isinstance(session, dict):
        raise NotActivityData(f"json non-objet: {source_name!r}")

    exercise = _first_exercise_with_samples(session)
    if exercise is None:
        raise NotActivityData(f"pas une training-session Polar (aucun échantillon): {source_name!r}")

    # --- canaux échantillonnés → base de temps commune (i · intervalMillis) ---
    channels = exercise["samples"]["samples"]
    kw: dict[str, np.ndarray] = {}
    n_max = 0
    interval_ms = 1000.0
    for ch in channels:
        if not isinstance(ch, dict):
            continue
        mapping = _CHANNELS.get(ch.get("type"))
        values = ch.get("values")
        if mapping is None or not isinstance(values, list) or not values:
            continue
        field, factor = mapping
        arr = _float_array(values)
        if factor != 1.0:
            arr = arr * factor
        kw[field] = arr
        n_max = max(n_max, len(arr))
        try:
            interval_ms = float(ch.get("intervalMillis") or interval_ms)
        except (TypeError, ValueError):
            pass

    if not kw or n_max < 2:
        raise NotActivityData(f"training-session sans canal exploitable: {source_name!r}")

    # timeline des échantillons (secondes). Canaux plus courts complétés par NaN à droite.
    step_s = interval_ms / 1000.0
    t = np.arange(n_max, dtype=float) * step_s
    for field, arr in list(kw.items()):
        if len(arr) < n_max:
            kw[field] = np.concatenate([arr, np.full(n_max - len(arr), np.nan)])

    # --- GPS (wayPoints) fusionné par interpolation sur la timeline des échantillons ---
    lat, lon, gps_alt = _waypoint_tracks(exercise, t)
    if lat is not None:
        kw["lat"], kw["lon"] = lat, lon
        if "alt_m" not in kw and gps_alt is not None:
            kw["alt_m"] = gps_alt

    # Sans aucune donnée de locomotion (distance, vitesse ou GPS), la séance n'est pas
    # représentable dans le schéma canonique : cardio FC-seule (intérieur, HIIT). Ce n'est
    # pas une erreur → NotActivityData (ignorée en silence, comme un résumé-seul).
    has_dist = "dist_m" in kw and bool(np.isfinite(kw["dist_m"]).any())
    has_speed = "speed_ms" in kw and bool(np.isfinite(kw["speed_ms"]).any())
    if not (has_dist or has_speed or lat is not None):
        raise NotActivityData(f"séance sans donnée de locomotion (FC seule): {source_name!r}")

    return CanonicalActivity.from_samples(
        timestamps=t,
        source_format="polar",
        source_name=source_name,
        sport=_sport_token(session),
        start_time=_parse_start(session, exercise),
        **kw,
    )


def _waypoint_tracks(
    exercise: dict, t: np.ndarray
) -> tuple[np.ndarray | None, np.ndarray | None, np.ndarray | None]:
    """Interpole lat/lon/alt des wayPoints (base ``elapsedMillis``) sur la timeline ``t``.

    Renvoie ``(None, None, None)`` si aucun GPS (ex. tapis) → la distance viendra des canaux.
    """
    routes = exercise.get("routes")
    route = routes.get("route") if isinstance(routes, dict) else None
    waypoints = route.get("wayPoints") if isinstance(route, dict) else None
    if not waypoints:
        return None, None, None

    tw, la, lo, al = [], [], [], []
    for wp in waypoints:
        if not isinstance(wp, dict):
            continue
        lat_v, lon_v = wp.get("latitude"), wp.get("longitude")
        ems = wp.get("elapsedMillis")
        if lat_v is None or lon_v is None or ems is None:
            continue
        tw.append(float(ems) / 1000.0)
        la.append(float(lat_v))
        lo.append(float(lon_v))
        al.append(float(wp["altitude"]) if isinstance(wp.get("altitude"), (int, float)) else np.nan)
    if len(tw) < 2:
        return None, None, None

    tw_a = np.asarray(tw)
    lat_i = np.interp(t, tw_a, np.asarray(la))
    lon_i = np.interp(t, tw_a, np.asarray(lo))
    alt_arr = np.asarray(al)
    alt_i = np.interp(t, tw_a, alt_arr) if np.isfinite(alt_arr).any() else None
    return lat_i, lon_i, alt_i


__all__ = ["parse_polar"]
