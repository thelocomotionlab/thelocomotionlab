"""La File : ce qui attend, et le verbe qui vient ensuite.

Un dossier par athlète. Son statut se lit en sept pas — reçu, ingéré, niveau, plan
généré, publié, envoyé, résultat saisi — et **le verbe suivant** est la seule chose que
l'écran demande de décider : ingérer, composer, publier, envoyer, saisir le résultat.

Les compteurs **partitionnent** : chaque dossier est dans une case, et une seule. C'est
ce qui rend la File lisible d'un coup d'œil — un nombre qui monte quelque part est un
nombre qui descend ailleurs, jamais un nombre qui apparaît.

Une cinquième case existe ici et ne s'affiche pas : le plan est parti, la course n'a pas
encore eu lieu, il n'y a rien à faire. La maquette montre quatre chiffres parce qu'un
tableau de bord montre ce qui attend un geste ; la partition, elle, doit être complète,
sinon les quatre chiffres mentent sur ce que porte la liste.
"""

from __future__ import annotations

from .cycle import statut_lu
from .objets import (
    INGESTION_INGERE,
    PLAN_A_COMPOSER,
    PLAN_ENVOYE,
    PLAN_FIGE,
    PLAN_PUBLIE,
    PLAN_RESULTAT,
)

# Les cinq verbes, dans l'ordre où ils se présentent.
INGERER = "ingerer"
COMPOSER = "composer"
PUBLIER = "publier"
ENVOYER = "envoyer"
SAISIR_RESULTAT = "saisir_resultat"
RIEN = "rien"

# La case de chaque verbe. Les quatre premières sont les compteurs de la maquette.
CASES = {
    INGERER: "a_ingerer",
    COMPOSER: "a_composer",
    PUBLIER: "a_publier_ou_envoyer",
    ENVOYER: "a_publier_ou_envoyer",
    SAISIR_RESULTAT: "resultat_a_saisir",
    RIEN: "en_attente",
}
COMPTEURS = ("a_ingerer", "a_composer", "a_publier_ou_envoyer", "resultat_a_saisir",
             "en_attente")


def verbe_suivant(athlete: dict, plan: dict | None, course: dict | None = None,
                  maintenant=None) -> str:
    """Ce qu'il reste à faire sur ce dossier — un seul geste, le prochain.

    Le statut est LU (``cycle.statut_lu``) : un plan envoyé dont la course est partie est
    figé, et c'est son résultat qui attend — personne n'a eu à le ranger à l'heure dite."""
    if (athlete.get("ingestion") or {}).get("statut") != INGESTION_INGERE:
        return INGERER
    if plan is None:
        return COMPOSER
    statut = statut_lu(plan, course, maintenant)
    if statut == PLAN_A_COMPOSER:
        return COMPOSER
    if statut == PLAN_RESULTAT:
        return RIEN
    if statut == PLAN_FIGE:
        # Le résultat ne se saisit qu'une fois la course courue : avant, il n'existe pas.
        return SAISIR_RESULTAT
    if statut not in (PLAN_PUBLIE, PLAN_ENVOYE):
        return PUBLIER
    if statut == PLAN_PUBLIE:
        return ENVOYER
    return RIEN


def compter(dossiers) -> dict[str, int]:
    """Les compteurs, à partir des verbes déjà calculés."""
    compteurs = dict.fromkeys(COMPTEURS, 0)
    for dossier in dossiers:
        compteurs[CASES[dossier["suivant"]]] += 1
    return compteurs


def dossier(athlete: dict, plan: dict | None, course: dict | None, maintenant=None) -> dict:
    """Une ligne de la File, telle que l'écran la lit."""
    return {
        "athlete_id": athlete.get("id"),
        "prenom": athlete.get("pseudo") or athlete.get("prenom") or "",
        "course": (course or {}).get("nom") or "",
        "course_id": (course or {}).get("id") or "",
        "depart_le": (course or {}).get("depart_le") or (plan or {}).get("depart_le") or "",
        "objectif_annonce": (plan or {}).get("reglages", {}).get("cible_h"),
        "archive": (athlete.get("archive") or {}).get("taille") or None,
        "ingestion": (athlete.get("ingestion") or {}).get("statut") or "",
        "erreur": (athlete.get("ingestion") or {}).get("erreur") or "",
        "niveau": (athlete.get("niveau") or {}).get("nom") or "",
        "plan_ref": (plan or {}).get("ref") or "",
        "plan_statut": statut_lu(plan, course, maintenant) if plan else "",
        "suivant": verbe_suivant(athlete, plan, course, maintenant),
    }


# Une date de départ vide passe en dernier : « la course la plus proche en tête » ne veut
# rien dire pour un dossier qui n'a pas encore de course.
_JAMAIS = "9999"


def construire(*, athletes, plans, courses) -> dict:
    """La File entière : les compteurs et les dossiers, la course la plus proche en tête.

    ``plans`` et ``courses`` sont indexés par référence et par id ; un athlète sans plan
    ni course donne quand même une ligne — c'est l'état dans lequel un dépôt arrive.
    """
    dossiers = []
    for athlete in athletes:
        refs = athlete.get("plans") or []
        plan = plans.get(refs[-1]) if refs else None
        course = courses.get(plan["course_id"]) if plan and plan.get("course_id") else None
        dossiers.append(dossier(athlete, plan, course))
    dossiers.sort(key=lambda d: (d["depart_le"] or _JAMAIS, d["prenom"]))
    return {"compteurs": compter(dossiers), "dossiers": dossiers}


__all__ = ["CASES", "COMPOSER", "COMPTEURS", "ENVOYER", "INGERER", "PUBLIER", "RIEN",
           "SAISIR_RESULTAT", "compter", "construire", "dossier", "verbe_suivant"]
