"""Le cycle de vie d'un plan : ce qui se range, et ce qui se lit à l'heure qu'il est.

Le fichier du plan range cinq états, posés par des gestes : ``a_composer`` (créé),
``genere`` (une version attend d'être regardée), ``publie`` (la page répond), ``envoye``
(l'athlète a son lien), ``resultat`` (la course est courue et saisie).

Le sixième, ``fige``, n'est posé par personne : c'est l'heure qui le pose. Un plan publié
dont la course est partie ne s'amende plus et attend son résultat. Le ranger demanderait
un réveil à l'heure du départ — un processus de plus, qui peut rater son heure. Le lire
à la demande ne rate rien.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .._dt import parse_iso
from .objets import (
    PLAN_A_COMPOSER,
    PLAN_ENVOYE,
    PLAN_FIGE,
    PLAN_GENERE,
    PLAN_PUBLIE,
    PLAN_RESULTAT,
)


def instant(quand: str | None) -> datetime | None:
    """Un horodatage ISO, ou None. Sans fuseau, il est lu en UTC — le seul choix qui
    ne dépende pas de la machine qui lit."""
    if not quand:
        return None
    try:
        lu = parse_iso(quand)
    except (TypeError, ValueError):
        return None
    return lu if lu.tzinfo else lu.replace(tzinfo=timezone.utc)


def depart_du_plan(plan: dict, course: dict | None) -> datetime | None:
    """Le départ que ce plan vise : celui de sa course, sinon celui de sa dernière version
    (un plan importé du CLI n'a pas toujours de course en bibliothèque)."""
    return instant((course or {}).get("depart_le")) or instant(plan.get("depart_le"))


def est_parti(plan: dict, course: dict | None, maintenant: datetime | None = None) -> bool:
    depart = depart_du_plan(plan, course)
    return depart is not None and (maintenant or datetime.now(timezone.utc)) >= depart


def a_un_resultat(plan: dict) -> bool:
    resultat = plan.get("resultat") or {}
    return resultat.get("officiel_h") is not None or bool(resultat.get("abandon"))


def statut_lu(plan: dict, course: dict | None, maintenant: datetime | None = None) -> str:
    """Le statut tel que l'écran le montre : celui du fichier, plus ``fige`` et
    ``resultat`` que l'heure et la saisie décident."""
    if a_un_resultat(plan):
        return PLAN_RESULTAT
    garde = plan.get("statut") or PLAN_A_COMPOSER
    if garde in (PLAN_PUBLIE, PLAN_ENVOYE) and est_parti(plan, course, maintenant):
        return PLAN_FIGE
    return garde


def statut_publie(plan: dict) -> str:
    """Le statut d'un plan dont la version courante est celle que la page sert.

    Une fois le lien entre les mains de l'athlète, publier une version de plus met la page
    à jour au même endroit : le plan reste « envoyé ». Renvoyer l'email est un geste à
    part, que l'écran propose toujours."""
    return PLAN_ENVOYE if plan.get("envoye_le") else PLAN_PUBLIE


def statut_apres_changement(plan: dict) -> str:
    """Le statut quand la version courante change (génération, restauration)."""
    if plan.get("version_publiee") and plan.get("version") == plan.get("version_publiee"):
        return statut_publie(plan)
    return PLAN_GENERE if plan.get("version") else PLAN_A_COMPOSER


__all__ = ["a_un_resultat", "depart_du_plan", "est_parti", "instant", "statut_apres_changement",
           "statut_lu", "statut_publie"]
