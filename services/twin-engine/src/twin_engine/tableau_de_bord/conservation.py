"""Combien de temps les données d'un athlète de la cohorte sont gardées.

Deux échéances, lues sur la fiche de l'athlète et la configuration ``cohorte`` :

* **l'archive** (chiffrée, sur le service de dépôt) : sous un consentement à la
  conservation (``cohorte.versions_conservation``), ``conservation_jours`` après le
  consentement ; sous le texte d'avant, qui promettait la suppression après analyse, dès
  qu'elle est ingérée ;
* **le reste** (jumeau, calibration, plans, pages) : ``conservation_jours`` après le
  consentement, quelle que soit la version.

``cohorte.prolonger_apres_course`` recule les deux échéances jusqu'à
``prolongation_jours`` après la course visée la plus tardive. Sans date de consentement
lisible, la date de réception de l'archive en tient lieu.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from ..config import Config
from .cycle import depart_du_plan, instant


def _jour(quand: str | None) -> date | None:
    lu = instant(quand)
    return None if lu is None else lu.astimezone(timezone.utc).date()


def debut(athlete: dict) -> date | None:
    """Le jour du consentement, à défaut celui de la réception de l'archive."""
    return (_jour(athlete.get("consentement_le")) or _jour(athlete.get("consent_at"))
            or _jour((athlete.get("archive") or {}).get("recue_le")))


def conserve(athlete: dict, cfg: Config) -> bool:
    """Le consentement de l'athlète autorise-t-il la conservation de son archive ?"""
    return (athlete.get("consentement_version") or "") in cfg.cohorte.versions_conservation


def derniere_course(plans: list[dict], courses: dict[str, dict]) -> date | None:
    """Le jour de la course visée la plus tardive parmi les plans de l'athlète."""
    jours = []
    for p in plans:
        depart = depart_du_plan(p, courses.get(p.get("course_id") or ""))
        if depart is not None:
            jours.append(depart.astimezone(timezone.utc).date())
    return max(jours) if jours else None


def echeance(athlete: dict, plans: list[dict], courses: dict[str, dict], cfg: Config) -> date | None:
    """L'échéance des données de l'athlète (jumeau, plans, pages) ; None sans date de début."""
    d = debut(athlete)
    if d is None:
        return None
    fin = d + timedelta(days=int(cfg.cohorte.conservation_jours))
    if cfg.cohorte.prolonger_apres_course:
        course = derniere_course(plans, courses)
        if course is not None:
            fin = max(fin, course + timedelta(days=int(cfg.cohorte.prolongation_jours)))
    return fin


def echeance_archive(athlete: dict, plans: list[dict], courses: dict[str, dict],
                     cfg: Config) -> date | None:
    """L'échéance de l'archive : celle des données sous un consentement à la conservation,
    le jour de l'ingestion sinon (None tant qu'elle n'est pas ingérée)."""
    if conserve(athlete, cfg):
        return echeance(athlete, plans, courses, cfg)
    ingestion = athlete.get("ingestion") or {}
    return _jour(ingestion.get("le")) if ingestion.get("statut") == "ingere" else None


def etat(athlete: dict, plans: list[dict], courses: dict[str, dict], cfg: Config,
         aujourdhui: date | None = None) -> dict:
    """Ce que le tableau de bord montre : les deux échéances, les jours qui restent, et les
    plans dont la course tombe après l'échéance des données (alerte)."""
    jour = aujourdhui or datetime.now(timezone.utc).date()
    fin = echeance(athlete, plans, courses, cfg)
    fin_archive = echeance_archive(athlete, plans, courses, cfg)
    apres = []
    if fin is not None:
        for p in plans:
            depart = depart_du_plan(p, courses.get(p.get("course_id") or ""))
            if depart is not None and depart.astimezone(timezone.utc).date() > fin:
                apres.append(p.get("id") or p.get("reference") or "")
    return {
        "jusquau": None if fin is None else fin.isoformat(),
        "archive_jusquau": None if fin_archive is None else fin_archive.isoformat(),
        "jours_restants": None if fin is None else (fin - jour).days,
        "conservation": conserve(athlete, cfg),
        "courses_apres_echeance": apres,
    }


__all__ = ["conserve", "debut", "derniere_course", "echeance", "echeance_archive", "etat"]
