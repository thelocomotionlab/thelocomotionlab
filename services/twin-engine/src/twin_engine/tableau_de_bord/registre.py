"""Le registre vivant : le livre servi, chaque course courue avec un plan du tableau de bord.

Chaque ligne porte ce que la version publiée a promis (le temps central, la fourchette de
course, les bornes de sécurité), ce que l'athlète a fait, le niveau servi — ``base`` et
``calibre`` se comptent à part, ils ne promettent pas la même chose — et le statut de
l'athlète au registre : ``frais`` (décisionnel) ou ``dev`` (le moteur a été réglé sur ses
données).

**Une entrée figée ne bouge plus.** Le résultat saisi par le laboratoire fait foi : à cet
instant, l'entrée est calculée une fois et rangée (``magasin.registre``), et c'est elle que
le registre relit, même si une version suivante du plan est publiée ou si le plan est
supprimé. La changer demande une correction motivée ; l'ancienne version est gardée dans
``corrections``. Un résultat saisi par l'athlète reste provisoire jusqu'à celui du labo.

L'export sort au format du livre servi committé (``docs/twin-registre/servi.json``) — les
entrées sont fabriquées par les fonctions du banc (``twin_engine.registre``), si bien que
``tools/registre.py`` les lit comme les siennes — avec les statuts des athlètes, sous leur
pseudonyme, pour que le registre committé sache qui était frais à quelle date.

Agrégats seulement : le pseudo de l'athlète, jamais son nom ni son email.
"""

from __future__ import annotations

from datetime import datetime
from statistics import fmean

from .. import dossier as _dossier
from .. import registre as _registre
from ..registre.statuts import STATUT_DEV, STATUT_FRAIS, statut_a_la_date
from .cycle import a_un_resultat, depart_du_plan, est_parti
from .magasin import Magasin, ecrire_json, lire_json
from .objets import (NIVEAU_BASE, NIVEAU_CALIBRE, PLAN_ENVOYE, PLAN_FIGE, PLAN_PUBLIE,
                     PLAN_RESULTAT, maintenant)

NIVEAUX = (NIVEAU_BASE, NIVEAU_CALIBRE)
STATUTS = (STATUT_FRAIS, STATUT_DEV)
COMMENTAIRE = ("Livre servi du registre de couverture — agrégats uniquement (pas de PII). "
               "Export du tableau de bord Twin, à fusionner par tools/registre --importer ; "
               "protocole : docs/twin-registre-couverture.md.")


class ResultatFige(ValueError):
    """Le résultat est consigné au registre : le changer demande une correction motivée."""


def _numero(plan: dict) -> int:
    return int(plan.get("version_publiee") or plan.get("version") or 0)


def _modele_de_la_version(magasin: Magasin, cfg, plan: dict) -> dict | None:
    """Ce que la version servie promettait, indépendamment du résultat — calculé une fois
    et gardé à côté du dossier : reconstruire le parcours à chaque lecture du registre
    coûterait une seconde par ligne."""
    numero = _numero(plan)
    if not numero:
        return None
    repertoire = magasin.plans.repertoire(plan["ref"]) / f"v{numero}"
    garde = repertoire / "registre.json"
    source = repertoire / "dossier.json"
    if not source.exists():
        return None
    deja = lire_json(garde)
    if isinstance(deja, dict) and deja.get("_dossier_mtime") == source.stat().st_mtime_ns:
        return deja

    from ..course import build_course

    d = _dossier.lire(source)
    course = build_course(d.course_gpx, d.race, cfg)
    pente = d.twin.slope_factors(cfg)
    if pente is not None:
        course = course.with_slope_cost(*pente)
    dates = sorted(s.date for s in d.twin.summaries if s.date)
    p = d.prediction
    modele = {
        "_dossier_mtime": source.stat().st_mtime_ns,
        "race": d.race.name,
        "until": dates[-1] if dates else None,
        "course": _registre.bloc_course(course),
        "model": _registre.bloc_modele(twin=d.twin, calibration=d.calibration,
                                       sufficiency=d.sufficiency, cfg=cfg,
                                       n_activities_used=len(d.twin.summaries)),
        "prediction": _registre.bloc_prediction(p, None),
        "domain_demand": _registre.bloc_domaine(d.sufficiency),
        "genuine_min_hours": cfg.calibration.genuine_min_hours,
    }
    ecrire_json(garde, modele)
    return modele


def _date_de_course(plan: dict, course: dict | None) -> str:
    depart = depart_du_plan(plan, course)
    return depart.date().isoformat() if depart else ""


def statut_de(athlete: dict | None, jour: str | None = None) -> str:
    """Le statut de l'athlète au registre (au ``jour`` donné, sinon courant)."""
    return statut_a_la_date((athlete or {}).get("registre"), jour)


def entree(magasin: Magasin, cfg, plan: dict, course: dict | None,
           athlete: dict | None) -> dict | None:
    """L'entrée d'un plan couru, au format du livre servi."""
    modele = _modele_de_la_version(magasin, cfg, plan)
    if modele is None:
        return None
    resultat = plan.get("resultat") or {}
    reel = None if resultat.get("abandon") else resultat.get("officiel_h")
    p = modele["prediction"]
    prediction = {**p, **_registre.ecarts(
        central_h=p["central_h"], plan=(p["plan_low_h"], p["plan_high_h"]),
        bornes=(p["safety_low_h"], p["safety_high_h"]), actual_h=reel)}
    ref_h = reel if reel is not None else p["central_h"]
    nom = (course or {}).get("nom") or modele["race"]
    edition = (course or {}).get("edition")
    return {
        "athlete": (athlete or {}).get("pseudo") or "athlète",
        "statut": statut_de(athlete),
        "race": f"{nom} {edition}" if edition and str(edition) not in nom else nom,
        "date": _date_de_course(plan, course),
        "until": modele["until"],
        "dnf": bool(resultat.get("abandon")),
        "official_time_h": None if reel is None else round(float(reel), 3),
        "course": modele["course"],
        "model": modele["model"],
        "race_meta": None,
        "prediction": prediction,
        "below_domain": bool(ref_h < modele["genuine_min_hours"]),
        "domain_demand": modele["domain_demand"],
        # ce que le banc n'a pas : le niveau SERVI et d'où vient la ligne
        "niveau": (plan.get("prediction") or {}).get("niveau") or NIVEAU_BASE,
        "source": "tableau-de-bord",
    }


def ligne(plan: dict, course: dict | None, athlete: dict | None, e: dict | None) -> dict:
    """Une ligne de l'écran Registre : ce qui a été promis, ce qui a été fait."""
    pr = plan.get("prediction") or {}
    resultat = plan.get("resultat") or {}
    ecarts = (e or {}).get("prediction") or {}
    return {
        "ref": plan["ref"],
        "athlete": (athlete or {}).get("pseudo") or "",
        "statut": statut_de(athlete),
        "course": (course or {}).get("nom") or (e or {}).get("race") or "",
        "date": _date_de_course(plan, course),
        "niveau": pr.get("niveau") or NIVEAU_BASE,
        "version": _numero(plan),
        "central_h": pr.get("central_h"),
        "fourchette": pr.get("fourchette") or [],
        "bornes": pr.get("bornes") or [],
        "officiel_h": resultat.get("officiel_h"),
        "abandon": bool(resultat.get("abandon")),
        "saisi_par": resultat.get("saisi_par"),
        "a_saisir": not a_un_resultat(plan),
        "err_pct": ecarts.get("err_pct"),
        "in_plan": ecarts.get("in_plan"),
        "in_safety": ecarts.get("in_safety"),
    }


def resumer(lignes: list[dict]) -> dict:
    """Les chiffres d'un niveau : combien, l'erreur moyenne du central, et la couverture
    des deux bandes — sur les courses FINIES seulement. Un abandon n'a pas de temps à
    comparer ; il se compte à part, il ne se glisse pas dans une moyenne."""
    saisies = [l for l in lignes if not l["a_saisir"]]
    finies = [l for l in saisies if l["err_pct"] is not None]
    dans_la_fourchette = [l["in_plan"] for l in finies if l["in_plan"] is not None]
    dans_les_bornes = [l["in_safety"] for l in finies if l["in_safety"] is not None]
    return {
        "entrees": len(saisies),
        "finies": len(finies),
        "abandons": sum(1 for l in saisies if l["abandon"]),
        "erreur_moyenne": round(fmean(abs(l["err_pct"]) for l in finies), 1) if finies else None,
        "biais": round(fmean(l["err_pct"] for l in finies), 1) if finies else None,
        "fourchette": (round(sum(dans_la_fourchette) / len(dans_la_fourchette), 3)
                       if dans_la_fourchette else None),
        "bornes": (round(sum(dans_les_bornes) / len(dans_les_bornes), 3)
                   if dans_les_bornes else None),
    }


def _courus(magasin: Magasin, maintenant_: datetime | None):
    """Les plans courus — résultat saisi, ou publiés et partis — et ceux qui portent une
    entrée figée (un plan réimporté sous la même référence retrouve la sienne)."""
    courses = {c["id"]: c for c in magasin.courses.lister()}
    figes = {g["id"] for g in magasin.registre.lister() if g.get("fige_le")}
    for plan in magasin.plans.lister():
        course = courses.get(plan.get("course_id"))
        publie = plan.get("statut") in (PLAN_PUBLIE, PLAN_ENVOYE, PLAN_FIGE, PLAN_RESULTAT)
        if (a_un_resultat(plan) or plan["ref"] in figes
                or (publie and est_parti(plan, course, maintenant_))):
            athlete = magasin.athletes.lire(plan.get("athlete_id") or "")
            yield plan, course, athlete


def figee(magasin: Magasin, ref: str) -> dict | None:
    """L'entrée figée d'un plan, ou ``None`` tant que le labo n'a pas saisi de résultat."""
    rangee = magasin.registre.lire(ref)
    return rangee if rangee and rangee.get("fige_le") else None


def figer(magasin: Magasin, cfg, plan: dict, course: dict | None, athlete: dict | None,
          *, correction: str = "") -> dict | None:
    """Fige l'entrée d'un plan dont le labo a saisi le résultat. Une entrée déjà figée ne
    se remplace qu'avec une correction motivée, l'ancienne gardée dans ``corrections``."""
    avant = figee(magasin, plan["ref"])
    if avant is not None and not correction.strip():
        raise ResultatFige("le résultat est consigné au registre : une correction demande un "
                           "motif (champ « correction »)")
    corrections = list((avant or {}).get("corrections") or [])
    if avant is not None:
        corrections.append({"le": maintenant(), "motif": correction.strip(),
                            "entree": avant.get("entree"), "ligne": avant.get("ligne")})
    e = entree(magasin, cfg, plan, course, athlete) if a_un_resultat(plan) else None
    if e is None and avant is None:
        return None
    rangee = {"id": plan["ref"], "fige_le": maintenant(), "entree": e,
              "ligne": None if e is None else ligne(plan, course, athlete, e),
              "corrections": corrections,
              "pseudo": (athlete or {}).get("pseudo") or "",
              "fiche": (athlete or {}).get("registre")}
    magasin.registre.ecrire(rangee)
    return rangee


def garder(magasin: Magasin, cfg, plan: dict, course: dict | None,
           athlete: dict | None) -> bool:
    """Met de côté l'entrée d'un plan couru, juste avant que le plan ne soit supprimé.

    Seuls les chiffres restent — le pseudo, la course, ce qui a été promis et ce qui a été
    fait ; le dossier et le jumeau partent avec le plan. Une entrée déjà figée l'est pour
    de bon ; un plan sans résultat n'a pas d'entrée : il n'y a rien à garder."""
    if figee(magasin, plan["ref"]) is not None:
        if athlete is not None:
            # le statut le plus récent part avec l'entrée : l'athlète va disparaître
            magasin.registre.modifier(plan["ref"], pseudo=athlete.get("pseudo") or "",
                                      fiche=athlete.get("registre"))
        return True
    if not a_un_resultat(plan):
        return False
    return figer(magasin, cfg, plan, course, athlete) is not None


def _rangees_orphelines(magasin: Magasin, vivants: set[str]) -> list[dict]:
    """Les entrées rangées dont le plan n'existe plus : elles restent au registre."""
    return [g for g in magasin.registre.lister()
            if g.get("id") not in vivants and g.get("entree") is not None]


def _entrees_courantes(magasin: Magasin, cfg, maintenant_: datetime | None):
    """``(ligne, entrée)`` de chaque plan couru : l'entrée figée quand elle existe ; sinon
    calculée (résultat de l'athlète, provisoire). Un résultat du labo sans entrée figée —
    saisi avant que le registre ne fige — est figé à sa première lecture."""
    for plan, course, athlete in _courus(magasin, maintenant_):
        rangee = figee(magasin, plan["ref"])
        if rangee is None and (plan.get("resultat") or {}).get("saisi_par") == "labo" \
                and a_un_resultat(plan):
            rangee = figer(magasin, cfg, plan, course, athlete)
        if rangee is not None and rangee.get("entree") is not None:
            yield {**rangee["ligne"], "statut": statut_de(athlete)}, rangee["entree"]
            continue
        e = entree(magasin, cfg, plan, course, athlete) if a_un_resultat(plan) else None
        yield ligne(plan, course, athlete, e), e


def calculer(magasin: Magasin, cfg, maintenant_: datetime | None = None) -> dict:
    """La vue de l'écran Registre (§5.6) : par niveau, et par statut × niveau."""
    lignes = [l for l, _ in _entrees_courantes(magasin, cfg, maintenant_)]
    vivants = {p["ref"] for p in magasin.plans.lister()}
    lignes += [{**g["ligne"], "gardee": True} for g in _rangees_orphelines(magasin, vivants)
               if g.get("ligne")]
    lignes.sort(key=lambda l: (l["date"] or "", l["athlete"]), reverse=True)
    return {
        **{niveau: resumer([l for l in lignes if l["niveau"] == niveau]) for niveau in NIVEAUX},
        "par_statut": {
            st: {niveau: resumer([l for l in lignes
                                  if l["niveau"] == niveau and l.get("statut", STATUT_FRAIS) == st])
                 for niveau in NIVEAUX}
            for st in STATUTS
        },
        "lignes": lignes,
    }


def exporter(magasin: Magasin, cfg) -> dict:
    """Les entrées des courses saisies, au format du livre servi committé, et les statuts
    des athlètes sous leur pseudonyme."""
    entrees = [e for _, e in _entrees_courantes(magasin, cfg, None) if e is not None]
    vivants = {p["ref"] for p in magasin.plans.lister()}
    entrees += [g["entree"] for g in _rangees_orphelines(magasin, vivants)]
    entrees.sort(key=lambda e: (e["date"], e["athlete"]))
    vide = {"statut": STATUT_FRAIS, "depuis": None, "journal": []}
    athletes = {g["pseudo"]: g.get("fiche") or vide
                for g in _rangees_orphelines(magasin, vivants) if g.get("pseudo")}
    athletes.update({a["pseudo"]: a.get("registre") or vide
                     for a in magasin.athletes.lister() if a.get("pseudo")})
    return {"_comment": COMMENTAIRE, "entries": entrees, "athletes": dict(sorted(athletes.items()))}


__all__ = ["NIVEAUX", "ResultatFige", "STATUTS", "calculer", "entree", "exporter", "figee",
           "figer", "garder", "ligne", "resumer", "statut_de"]
