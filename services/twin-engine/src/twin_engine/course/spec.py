"""Description d'une course cible (entrée fournie par l'athlète/le client).

C'est l'autre entrée du moteur, à côté de l'archive d'entraînement : la trace GPX du
parcours **plus** les métadonnées de course (points de découpage officiels, départ,
position pour le calcul solaire). Tout est **donnée**, jamais en dur dans le code —
chargeable depuis un JSON (cf. examples/nice-100m.json).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

from .._dt import parse_duration_h, parse_iso


@dataclass(frozen=True)
class CrewAccess:
    """Un point où l'assistance a le DROIT d'être (règlement de course), et ce qu'elle y prépare.

    ``aid_index`` indexe ``RaceSpec.aid_names`` : 0 = le départ, n = le n-ième point de passage.
    ``note`` est libre — vide, la feuille imprime une case à remplir au stylo."""

    aid_index: int
    note: str = ""


@dataclass(frozen=True)
class Nutrition:
    """Débits DÉCLARÉS par l'athlète. Rien n'est deviné : sans les deux, les colonnes eau et
    ravito du tableau de marche sortent vides, prêtes à être remplies à la main."""

    water_l_per_h: float | None = None
    carbs_g_per_h: float | None = None

    @property
    def declared(self) -> bool:
        return self.water_l_per_h is not None and self.carbs_g_per_h is not None


@dataclass(frozen=True)
class Phase:
    """Une partie de la course dans la langue de l'athlète. ``from_aid_index`` indexe
    ``aid_names`` : la partie commence à ce point de passage (0 = le départ)."""

    name: str
    note: str = ""
    from_aid_index: int = 0


# Un nom de ravitaillement BOUCHON : « AS3 », « AS3 km28.9 », « PC 12 », ou le kilomètre répété
# dans le nom. Un plan dont les lieux n'ont pas de nom n'est pas vendable — on ne laisse pas
# partir un rapport où l'athlète cherche « AS7 » sur le terrain.
_PLACEHOLDER_AID = re.compile(r"^\s*(AS|PC|CP|R)\s*\d+\b|\bkm\s*\d+([.,]\d+)?\s*$", re.I)


def placeholder_aid_names(race: "RaceSpec") -> list[str]:
    """Les noms de ravitaillement qui ressemblent à des bouchons (liste vide = tout va bien)."""
    return [n for n in race.aid_names if n and _PLACEHOLDER_AID.search(n)]


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
    arrêt rallongé), ``crew_access_indices`` (segments dont la FIN est accessible à
    l'assistance : la fiche d'assistance, le calendrier et les points GPX du rapport v2 s'y
    calent ; vide = les bases majeures, et sans base majeure tous les points de passage).
    Champ de TERRAIN : ``technicity_pct`` — majoration de coût DÉCLARÉE pour la technicité
    (pierriers, chaos, mains courantes, single technique). Le moteur ne la mesure pas : le GPX
    ne porte que la géométrie, et Minetti convertit la PENTE en coût métabolique en supposant
    un sol roulant. Deux parcours de même D+/km ne se courent pas à la même vitesse si l'un
    est une piste et l'autre une arête. 0 = terrain comparable aux courses de référence de
    l'athlète (défaut : le moteur se tait plutôt que de deviner).

    Champ d'INTENTION (mode objectif, ADR 0002) : ``target_hours`` — la durée VISÉE par
    l'athlète. Optionnel ; absent, le moteur se comporte exactement comme avant. Présent,
    il n'écrase jamais la prédiction : il ouvre un second rendu (plan ancré sur la cible +
    verdict de faisabilité, cf. ``twin_engine.feasibility``).
    """

    name: str = "Course"
    aid_km: tuple[float, ...] = ()
    aid_names: tuple[str, ...] = ()
    start_time: datetime | None = None
    lat: float | None = None
    lon: float | None = None
    tz_offset_h: float = 0.0
    major_base_indices: tuple[int, ...] = ()
    crew_access_indices: tuple[int, ...] = ()
    # points d'assistance du RÈGLEMENT (rapport v3) : ils priment sur crew_access_indices,
    # qui reste lu pour les specs écrites avant
    crew: tuple[CrewAccess, ...] = ()
    nutrition: Nutrition = Nutrition()
    # parties de course nommées par l'athlète ; vide → le moteur coupe en deux à la moitié du
    # temps prévu (report/context.py)
    phases: tuple[Phase, ...] = ()
    official_dplus_m: float | None = None
    target_hours: float | None = None
    technicity_pct: float = 0.0
    # température moyenne ATTENDUE (°C), déclarée — sert au terme d'environnement
    # (``prediction.environment_term=declared``) ; None = non déclarée, aucun coût de chaleur
    heat_c: float | None = None

    def __post_init__(self) -> None:
        if len(self.aid_km) != len(self.aid_names):
            raise ValueError("aid_km et aid_names doivent avoir la même longueur")
        if self.target_hours is not None and self.target_hours <= 0:
            raise ValueError("target_hours doit être strictement positif")
        if not 0.0 <= self.technicity_pct <= 100.0:
            raise ValueError("technicity_pct doit être entre 0 et 100 (majoration en %)")
        if self.aid_km:  # ravitaillements fournis → validés ; vide = mode GPX-only (auto)
            if len(self.aid_km) < 2:
                raise ValueError("au moins le départ et l'arrivée sont requis")
            if list(self.aid_km) != sorted(self.aid_km):
                raise ValueError("aid_km doit être croissant (km cumulés officiels)")

    @property
    def crew_aid_indices(self) -> tuple[int, ...]:
        """Les points d'assistance, en index de ``aid_names`` (vide = non déclarés)."""
        return tuple(c.aid_index for c in self.crew)

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
            crew_access_indices=tuple(int(i) for i in d.get("crew_access_indices", ())),
            crew=tuple(
                CrewAccess(aid_index=int(c["aid_index"]), note=str(c.get("note") or ""))
                for c in d.get("crew", ())
            ),
            nutrition=Nutrition(
                water_l_per_h=_optional_float((d.get("nutrition") or {}).get("water_l_per_h")),
                carbs_g_per_h=_optional_float((d.get("nutrition") or {}).get("carbs_g_per_h")),
            ),
            phases=tuple(
                Phase(name=str(f["name"]), note=str(f.get("note") or ""),
                      from_aid_index=int(f.get("from_aid_index", 0)))
                for f in d.get("phases", ())
            ),
            official_dplus_m=d.get("official_dplus_m"),
            # "31h", "31h30", "31:00:00" ou un nombre d'heures (illisible → ValueError :
            # mieux vaut refuser que caler un plan sur la mauvaise durée)
            target_hours=parse_duration_h(d.get("target_hours")),
            technicity_pct=float(d.get("technicity_pct") or 0.0),
            heat_c=None if d.get("heat_c") is None else float(d["heat_c"]),
        )

    @classmethod
    def from_json(cls, path: str | Path) -> "RaceSpec":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


def _optional_float(value) -> float | None:
    """Nombre déclaré, ou None — une clé absente, nulle ou vide n'invente pas de valeur."""
    if value is None or value == "":
        return None
    return float(value)


def stops_policy_min(n_segments: int, major_base_indices, cfg) -> np.ndarray:
    """Politique d'arrêts du plan, en minutes par segment : ``default_stop_min`` à chaque
    point de passage, ``major_base_extra_min`` de plus aux bases majeures, rien à l'arrivée.
    Partagée par le plan (qui la retranche du temps prédit en modèle ``carved``) et par la
    prédiction (arrêts de la cible en modèle ``spec``)."""
    stops_min = np.full(int(n_segments), float(cfg.pacing.default_stop_min))
    for k in major_base_indices:
        if 0 <= k < n_segments:
            stops_min[k] += float(cfg.pacing.major_base_extra_min)
    if n_segments:
        stops_min[-1] = 0.0
    return stops_min


__all__ = ["CrewAccess", "Nutrition", "Phase", "RaceSpec", "placeholder_aid_names",
           "stops_policy_min"]
