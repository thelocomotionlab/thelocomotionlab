"""Effacer un athlète, et la purge quotidienne des échéances de conservation.

**Effacer un athlète** : son archive sur le service de dépôt, ses demandes, ses plans
(versions, dossiers, documents, page), ses jobs, les dossiers de rendu de ses plans et sa
fiche avec son jumeau et sa calibration partent ; ses entrées du registre restent,
**anonymes** — un identifiant opaque tiré au hasard remplace le pseudo et la référence du
plan (qui le contient), le journal de statut ne garde que les statuts et leurs dates.
C'est la couverture du moteur, pas le dossier d'une personne.

**La purge quotidienne** (:func:`purger`) lit les échéances de ``conservation`` :
l'athlète dont l'échéance des données est passée est effacé ; celui dont seule l'archive
est échue (consentement d'avant la conservation, archive ingérée) perd son archive. Sous
``cohorte.purge=simulation``, la passe compte ce qu'elle effacerait et n'efface rien. Un
dépôt dont l'athlète a été effacé alors que le service ne répondait pas reste noté
(``en_attente_de_purge``) jusqu'à ce qu'une passe le purge ; « Rafraîchir » ne le recrée
pas. Le journal ne garde que des comptes.
"""

from __future__ import annotations

import secrets
from datetime import date, datetime, timezone
from pathlib import Path

from ..config import Config
from . import conservation
from . import registre as _registre
from .depot import DepotIndisponible
from .magasin import Magasin, ecrire_json, lire_json
from .objets import maintenant


def _repertoire(magasin: Magasin) -> Path:
    return magasin.registre.racine.parent / "purges"


def en_attente_de_purge(magasin: Magasin) -> list[str]:
    """Les dépôts dont l'athlète est effacé et que le service n'a pas encore purgés."""
    return list((lire_json(_repertoire(magasin) / "a_purger.json") or {}).get("depots") or [])


def _noter_a_purger(magasin: Magasin, depots: list[str]) -> None:
    ecrire_json(_repertoire(magasin) / "a_purger.json", {"depots": sorted(set(depots))})


def journal(magasin: Magasin) -> list[dict]:
    """Le journal des purges : une ligne par passe, des comptes seulement."""
    return list((lire_json(_repertoire(magasin) / "journal.json") or {}).get("passes") or [])


def _consigner(magasin: Magasin, ligne: dict) -> None:
    passes = journal(magasin)
    passes.append(ligne)
    ecrire_json(_repertoire(magasin) / "journal.json", {"passes": passes})


def anonymiser(magasin: Magasin, refs: set[str], opaque: str) -> int:
    """Les entrées rangées des plans ``refs`` passent sous ``opaque`` (pseudo et référence) ;
    rend leur nombre."""
    n = 0
    for k, g in enumerate(sorted((g for g in magasin.registre.lister() if g.get("id") in refs),
                                 key=lambda g: g["id"]), start=1):
        ident = f"{opaque}-{k}"

        def _sans_nom(bloc: dict | None, ident=ident) -> dict | None:
            if not bloc:
                return bloc
            bloc = {**bloc, "athlete": opaque}
            if "ref" in bloc:
                bloc["ref"] = ident
            return bloc

        fiche = g.get("fiche") or {}
        nouveau = {
            **g, "id": ident, "pseudo": opaque, "anonymise_le": maintenant(),
            "entree": _sans_nom(g.get("entree")), "ligne": _sans_nom(g.get("ligne")),
            "corrections": [{**c, "entree": _sans_nom(c.get("entree")),
                             "ligne": _sans_nom(c.get("ligne"))}
                            for c in g.get("corrections") or []],
            "fiche": {"statut": fiche.get("statut") or "frais", "depuis": fiche.get("depuis"),
                      "journal": [{"le": j.get("le"), "statut": j.get("statut")}
                                  for j in fiche.get("journal") or []]},
        }
        magasin.registre.ecrire(nouveau)
        magasin.registre.supprimer(g["id"])
        n += 1
    return n


def effacer_un_athlete(magasin: Magasin, cfg: Config, athlete: dict, *, depot,
                       jobs=None) -> dict:
    """Efface l'athlète (cf. module) ; rend ce qui est parti. Un dépôt injoignable n'arrête
    rien : l'archive est notée en attente de purge et la prochaine passe la reprend."""
    from .file import plans_de_lathlete
    from .routes_plans import course_du_plan

    archive = None
    if athlete.get("depot_id") and not (athlete.get("archive") or {}).get("purgee_le"):
        try:
            archive = depot.supprimer(athlete["depot_id"])
        except DepotIndisponible:
            _noter_a_purger(magasin, [*en_attente_de_purge(magasin), athlete["depot_id"]])
            archive = False
    plans = plans_de_lathlete(athlete["id"], magasin.plans.lister())
    refs = {p["ref"] for p in plans}
    for plan in plans:
        _registre.garder(magasin, cfg, plan, course_du_plan(magasin, plan), athlete)
    from .banc import anonymiser as anonymiser_le_banc

    opaque = f"anonyme-{secrets.token_hex(4)}"
    n_anonymes = anonymiser(magasin, refs, opaque) + anonymiser_le_banc(cfg, athlete["id"], opaque)
    for demande in magasin.demandes.lister():
        if demande.get("plan_ref") in refs:
            magasin.demandes.supprimer(demande["id"])
    for ref in refs:
        magasin.plans.supprimer(ref)
        (Path(cfg.data_dir) / "dossiers" / f"{ref}.json").unlink(missing_ok=True)
    n_jobs = 0 if jobs is None else jobs.supprimer_ceux_de(athlete_id=athlete["id"], plan_refs=refs)
    magasin.athletes.supprimer(athlete["id"])
    return {"archive": archive, "plans": len(refs), "entrees_anonymisees": n_anonymes,
            "jobs": n_jobs}


def purger_larchive(magasin: Magasin, athlete: dict, *, depot) -> bool:
    """Purge la seule archive de l'athlète (ses données restent) ; True si elle est partie
    ou n'existait plus."""
    if not athlete.get("depot_id") or (athlete.get("archive") or {}).get("purgee_le"):
        return True
    try:
        depot.supprimer(athlete["depot_id"])
    except DepotIndisponible:
        return False
    archive = {**(athlete.get("archive") or {}), "purgee_le": maintenant()}
    magasin.athletes.modifier(athlete["id"], archive=archive)
    return True


def purger(magasin: Magasin, cfg: Config, *, depot, jobs=None,
           aujourdhui: date | None = None) -> dict:
    """Une passe : les échéances passées sont purgées (ou comptées, en simulation), les
    échéances recalculées, le journal complété. Rend la ligne du journal."""
    from .file import plans_de_lathlete

    active = cfg.cohorte.purge == "active"
    jour = aujourdhui or datetime.now(timezone.utc).date()
    courses = {c["id"]: c for c in magasin.courses.lister()}
    ligne = {"le": maintenant(), "mode": "active" if active else "simulation", "athletes": 0,
             "archives": 0, "plans": 0, "entrees_anonymisees": 0, "echecs": 0}
    for athlete in magasin.athletes.lister():
        if (athlete.get("ingestion") or {}).get("statut") == "en_cours":
            continue
        plans = plans_de_lathlete(athlete["id"], magasin.plans.lister())
        fin = conservation.echeance(athlete, plans, courses, cfg)
        if fin is not None and fin < jour:
            ligne["athletes"] += 1
            if not active:
                ligne["plans"] += len(plans)
                continue
            parti = effacer_un_athlete(magasin, cfg, athlete, depot=depot, jobs=jobs)
            ligne["archives"] += 1 if parti["archive"] else 0
            ligne["echecs"] += 1 if parti["archive"] is False else 0
            ligne["plans"] += parti["plans"]
            ligne["entrees_anonymisees"] += parti["entrees_anonymisees"]
            continue
        fin_archive = conservation.echeance_archive(athlete, plans, courses, cfg)
        if (fin_archive is not None and fin_archive <= jour and athlete.get("depot_id")
                and not (athlete.get("archive") or {}).get("purgee_le")):
            if not active:
                ligne["archives"] += 1
            elif purger_larchive(magasin, athlete, depot=depot):
                ligne["archives"] += 1
            else:
                ligne["echecs"] += 1
        jusquau = None if fin is None else fin.isoformat()
        if jusquau and athlete.get("conservation_jusquau") != jusquau:
            magasin.athletes.modifier(athlete["id"], conservation_jusquau=jusquau)
    if active:
        reste = []
        for depot_id in en_attente_de_purge(magasin):
            try:
                depot.supprimer(depot_id)
                ligne["archives"] += 1
            except DepotIndisponible:
                reste.append(depot_id)
                ligne["echecs"] += 1
        _noter_a_purger(magasin, reste)
    _consigner(magasin, ligne)
    return ligne


__all__ = ["anonymiser", "effacer_un_athlete", "en_attente_de_purge", "journal", "purger",
           "purger_larchive"]
