"""Description d'une course cible (entrée fournie par l'athlète/le client).

C'est l'autre entrée du moteur, à côté de l'archive d'entraînement : la trace GPX du
parcours **plus** les métadonnées de course (points de découpage officiels, départ,
position pour le calcul solaire). Tout est **donnée**, jamais en dur dans le code —
chargeable depuis un JSON (cf. examples/nice-100m.json).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from .._dt import parse_iso


@dataclass(frozen=True)
class RaceSpec:
    """Course cible. ``aid_km``/``aid_names`` découpent le parcours aux ravitaillements
    (incluant 0 = départ et le dernier point = arrivée).

    **Ravitaillements optionnels** : si ``aid_km`` est vide, le module course bascule en
    mode « GPX-only » — la distance vient de la trace elle-même et le parcours est découpé
    automatiquement (pas régulier, cf. ``CourseParams.default_segment_km``).

    Champs de géométrie (module course) : ``aid_km``, ``aid_names``.
    Champs de logistique (module pacing) : ``start_time``, ``lat``, ``lon``,
    ``tz_offset_h``, ``major_base_indices`` (segments dont la FIN est une base majeure,
    arrêt rallongé).
    """

    name: str = "Course"
    aid_km: tuple[float, ...] = ()
    aid_names: tuple[str, ...] = ()
    start_time: datetime | None = None
    lat: float | None = None
    lon: float | None = None
    tz_offset_h: float = 0.0
    major_base_indices: tuple[int, ...] = ()
    official_dplus_m: float | None = None

    def __post_init__(self) -> None:
        if len(self.aid_km) != len(self.aid_names):
            raise ValueError("aid_km et aid_names doivent avoir la même longueur")
        if self.aid_km:  # ravitaillements fournis → validés ; vide = mode GPX-only (auto)
            if len(self.aid_km) < 2:
                raise ValueError("au moins le départ et l'arrivée sont requis")
            if list(self.aid_km) != sorted(self.aid_km):
                raise ValueError("aid_km doit être croissant (km cumulés officiels)")

    @property
    def has_aid_stations(self) -> bool:
        return bool(self.aid_km)

    @property
    def official_finish_km(self) -> float | None:
        return float(self.aid_km[-1]) if self.aid_km else None

    @property
    def n_segments(self) -> int:
        return max(len(self.aid_km) - 1, 0)

    # ------------------------------------------------------------------ #
    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "RaceSpec":
        start = d.get("start_time")
        return cls(
            name=str(d.get("name") or "Course"),
            aid_km=tuple(float(x) for x in d.get("aid_km", ())),
            aid_names=tuple(str(x) for x in d.get("aid_names", ())),
            start_time=parse_iso(start) if start else None,
            lat=d.get("lat"),
            lon=d.get("lon"),
            tz_offset_h=float(d.get("tz_offset_h", 0.0)),
            major_base_indices=tuple(int(i) for i in d.get("major_base_indices", ())),
            official_dplus_m=d.get("official_dplus_m"),
        )

    @classmethod
    def from_json(cls, path: str | Path) -> "RaceSpec":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


__all__ = ["RaceSpec"]
