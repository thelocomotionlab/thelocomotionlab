"""Adaptateur ``.fit`` (Garmin / Coros / Suunto) → schéma canonique.

Reprend l'extraction des champs d'extract_all2.py (cas de référence Coros) mais
produit une :class:`CanonicalActivity` au lieu d'agréger en dur. Lit depuis des
octets (flux mémoire) pour ne jamais exploser l'archive sur disque.
"""

from __future__ import annotations

import io
import warnings

import fitdecode
import numpy as np

from .canonical import CanonicalActivity

# semicercles FIT → degrés
_SEMICIRCLE = 180.0 / 2**31

# Désactive la vérification CRC : plus rapide (~25 %) et tolère les définitions de
# champ non standard de certaines montres (Coros émet des `invalid field size` que
# fitdecode signale mais sait gérer). Repli si l'API ne connaît pas l'option.
try:
    _READER_KW = {"check_crc": fitdecode.CrcCheck.DISABLED}
except AttributeError:  # pragma: no cover
    _READER_KW = {}


def _num(value) -> float:
    """Valeur numérique d'un champ FIT, ou ``NaN`` si absente/None."""
    if value is None:
        return np.nan
    try:
        return float(value)
    except (TypeError, ValueError):
        return np.nan


def parse_fit(data: bytes, source_name: str) -> CanonicalActivity:
    t: list = []
    dist: list[float] = []
    speed: list[float] = []
    hr: list[float] = []
    alt: list[float] = []
    lat: list[float] = []
    lon: list[float] = []
    sport = sub_sport = None
    start_time = None

    # Les `invalid field size` de fitdecode sont cosmétiques (champs non standard) :
    # on les tait pour ne pas noyer la sortie sur une archive de centaines de fichiers.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with fitdecode.FitReader(io.BytesIO(data), **_READER_KW) as reader:
            for frame in reader:
                if not isinstance(frame, fitdecode.FitDataMessage):
                    continue
                if frame.name in ("session", "sport"):
                    fields = {f.name: f.value for f in frame.fields}
                    sport = fields.get("sport", sport)
                    sub_sport = fields.get("sub_sport", sub_sport)
                    start_time = fields.get("start_time", start_time)
                elif frame.name == "record":
                    fields = {f.name: f.value for f in frame.fields}
                    ts = fields.get("timestamp")
                    if ts is None:
                        continue
                    t.append(ts)
                    dist.append(_num(fields.get("distance")))
                    speed.append(_num(fields.get("enhanced_speed", fields.get("speed"))))
                    hr.append(_num(fields.get("heart_rate")))
                    alt.append(_num(fields.get("enhanced_altitude", fields.get("altitude"))))
                    la = fields.get("position_lat")
                    lo = fields.get("position_long")
                    lat.append(la * _SEMICIRCLE if la is not None else np.nan)
                    lon.append(lo * _SEMICIRCLE if lo is not None else np.nan)

    if len(t) < 2:
        raise ValueError(f"FIT sans enregistrements exploitables: {source_name!r}")

    return CanonicalActivity.from_samples(
        timestamps=t,
        dist_m=dist,
        speed_ms=speed,
        hr=hr,
        alt_m=alt,
        lat=lat,
        lon=lon,
        sport=sport,
        sub_sport=sub_sport,
        start_time=start_time,
        source_format="fit",
        source_name=source_name,
    )


__all__ = ["parse_fit"]
