"""La Course du tableau de bord ↔ le ``RaceSpec`` du moteur, **sans perte**.

Le moteur ne voit que des ``RaceSpec`` et son format ne bouge pas. Le tableau de bord,
lui, range une Course avec des noms français et une forme qui se modifie à l'écran :
une liste de ravitaillements où chacun porte ses propres drapeaux, plutôt que quatre
listes d'index à tenir synchronisées à la main.

Ce module est le seul endroit où les deux se rencontrent. Il doit rendre **exactement**
la même chose dans les deux sens — c'est ce que `test_traduction` vérifie contre
``examples/nice-100m.json``, la course de référence.

Trois points où « sans perte » a demandé une décision :

* **La chaleur.** Le récapitulatif §3.2 écrit ``chaleur_pct`` ; le moteur attend des
  DEGRÉS (``heat_c``). Un pourcentage ne se convertit pas en °C. Le champ de la Course
  porte donc l'unité qu'il transporte : ``chaleur_c``.
* **Les phases.** Elles sont bornées en kilomètres côté Course, en index de
  ravitaillement côté moteur. Le rapport découpe par segments, donc une phase ne peut
  commencer qu'à un ravitaillement : l'éditeur aimante les bandes, et ici on relit un
  nombre exact au lieu d'arrondir.
* **Ce qui n'appartient pas à la Course.** Les notes d'assistance, la nutrition et
  l'objectif sont propres à UN athlète : ils vivent sur le Plan, et le moteur les reçoit
  au moment de la génération. La Course ne dit que ce qui est vrai pour tout le monde.
"""

from __future__ import annotations

from datetime import datetime

from .._dt import parse_iso
from ..course.spec import CrewAccess, Phase, RaceSpec, Reglage
from .objets import Course, Officiel, PhaseCourse, Ravitaillement, Soleil

# Deux kilomètres égaux à moins d'un mètre sont le même point. Les flottants d'un JSON
# relu ne reviennent pas toujours au bit près ; un mètre est très en dessous de ce qu'un
# ravitaillement distingue.
TOLERANCE_KM = 0.001


def _decalage_h(quand: datetime | None) -> float:
    """Le fuseau porté par l'horodatage lui-même, en heures."""
    if quand is None or quand.utcoffset() is None:
        return 0.0
    return quand.utcoffset().total_seconds() / 3600.0


def _index_du_km(kms: list[float], km: float) -> int:
    """Le ravitaillement qui EST ce kilomètre. Lève si aucun ne l'est.

    Volontairement strict : accepter le plus proche ferait glisser une phase en
    silence, et c'est précisément la perte qu'on refuse."""
    for index, valeur in enumerate(kms):
        if abs(valeur - km) <= TOLERANCE_KM:
            return index
    raise ValueError(
        f"phase bornée au km {km} : aucun ravitaillement ne s'y trouve "
        f"(une phase commence et finit sur un ravitaillement)"
    )


# --------------------------------------------------------------------------- #
# Course → RaceSpec : ce que le moteur reçoit
# --------------------------------------------------------------------------- #
def course_vers_racespec(course: Course) -> RaceSpec:
    """La Course, dans la langue du moteur.

    Ne porte QUE ce qui appartient à la course. Le Plan ajoute ensuite les notes
    d'assistance, la nutrition et l'objectif de son athlète."""
    ravitos = sorted(course.ravitaillements, key=lambda r: r.km)
    depart = parse_iso(course.depart_le) if course.depart_le else None

    phases = tuple(
        Phase(
            name=phase.nom,
            note=phase.note,
            from_aid_index=_index_du_km([r.km for r in ravitos], phase.du_km),
        )
        for phase in sorted(course.phases, key=lambda p: p.du_km)
    )

    return RaceSpec(
        name=course.nom or "Course",
        aid_km=tuple(float(r.km) for r in ravitos),
        aid_names=tuple(r.nom for r in ravitos),
        start_time=depart,
        lat=course.lat,
        lon=course.lon,
        tz_offset_h=_decalage_h(depart),
        major_base_indices=tuple(i for i, r in enumerate(ravitos) if r.base_majeure),
        # `crew_access_indices` est l'ancienne façon de dire l'assistance ; `crew` la
        # remplace et prime. On n'écrit que la neuve, pour n'en avoir qu'une à lire.
        crew=tuple(CrewAccess(aid_index=i) for i, r in enumerate(ravitos) if r.assistance),
        reglages=tuple(
            Reglage(aid_index=i, stop_min=r.arret_min)
            for i, r in enumerate(ravitos)
            if r.arret_min is not None
        ),
        phases=phases,
        official_dplus_m=course.officiel.dplus_m,
        technicity_pct=course.technicite_pct,
        heat_c=course.chaleur_c,
    )


# --------------------------------------------------------------------------- #
# RaceSpec → Course : l'import d'une spec écrite à la main
# --------------------------------------------------------------------------- #
def racespec_vers_course(spec: RaceSpec, *, id: str, slug: str = "",
                         edition: int | None = None) -> Course:
    """Une spec du CLI, rangée en Course.

    ``edition`` se déduit de l'année du départ quand elle n'est pas donnée — c'est ce
    que porte la référence d'un plan, et une spec n'a pas de champ pour elle."""
    kms = list(spec.aid_km)
    assistance = set(spec.crew_aid_indices) or set(spec.crew_access_indices)
    arrets = {r.aid_index: r.stop_min for r in spec.reglages if r.stop_min is not None}
    bases = set(spec.major_base_indices)

    ravitos = [
        Ravitaillement(
            index=i,
            nom=nom,
            km=float(km),
            base_majeure=i in bases,
            assistance=i in assistance,
            arret_min=arrets.get(i),
        )
        for i, (km, nom) in enumerate(zip(kms, spec.aid_names))
    ]

    # Une phase court jusqu'au début de la suivante, et la dernière jusqu'à l'arrivée.
    departs = [min(max(p.from_aid_index, 0), len(kms) - 1) for p in spec.phases]
    phases = [
        PhaseCourse(
            nom=p.name,
            note=p.note,
            du_km=float(kms[depart]),
            au_km=float(kms[departs[rang + 1]] if rang + 1 < len(departs) else kms[-1]),
        )
        for rang, (p, depart) in enumerate(zip(spec.phases, departs))
    ]

    annee = edition if edition is not None else (
        spec.start_time.year if spec.start_time else None
    )

    return Course(
        id=id,
        slug=slug,
        nom=spec.name,
        edition=annee,
        depart_le=spec.start_time.isoformat() if spec.start_time else "",
        lat=spec.lat,
        lon=spec.lon,
        officiel=Officiel(dplus_m=spec.official_dplus_m),
        ravitaillements=ravitos,
        technicite_pct=spec.technicity_pct,
        chaleur_c=spec.heat_c,
        phases=phases,
        soleil=Soleil(),
    )


__all__ = ["TOLERANCE_KM", "course_vers_racespec", "racespec_vers_course"]
