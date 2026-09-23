"""Le registre vivant : chaque course courue avec un plan du tableau de bord (§5.6, §6.3).

Il se CALCULE depuis les plans qui ont un résultat — rien à tenir à la main. Chaque ligne
porte ce que la version publiée a promis (le temps central, la fourchette de course, les
bornes de sécurité), ce que l'athlète a fait, et le niveau servi : ``base`` et ``calibre``
se comptent à part, parce qu'ils ne promettent pas la même chose.

L'export sort au format de ``docs/twin-registre-couverture.json`` — les entrées sont
fabriquées par les fonctions du banc (``twin_engine.registre``), si bien que
``tools/registre.py`` les lit comme les siennes. Le fichier committé reste la version
publiée ; l'export est ce qu'on y fusionne.

Agrégats seulement : le pseudo de l'athlète, jamais son nom ni son email.
"""

from __future__ import annotations

from datetime import datetime
from statistics import fmean

from .. import dossier as _dossier
from .. import registre as _registre
from .cycle import a_un_resultat, depart_du_plan, est_parti
from .magasin import Magasin, ecrire_json, lire_json
from .objets import (NIVEAU_BASE, NIVEAU_CALIBRE, PLAN_ENVOYE, PLAN_FIGE, PLAN_PUBLIE,
                     PLAN_RESULTAT)

NIVEAUX = (NIVEAU_BASE, NIVEAU_CALIBRE)
COMMENTAIRE = ("Registre de couverture — agrégats uniquement (pas de PII). Export du tableau "
               "de bord Twin ; protocole : docs/twin-registre-couverture.md.")


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


def entree(magasin: Magasin, cfg, plan: dict, course: dict | None,
           athlete: dict | None) -> dict | None:
    """L'entrée d'un plan couru, au format du registre committé."""
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
        "dev_set": False,
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


def _courus(magasin: Magasin, maintenant: datetime | None):
    courses = {c["id"]: c for c in magasin.courses.lister()}
    for plan in magasin.plans.lister():
        course = courses.get(plan.get("course_id"))
        publie = plan.get("statut") in (PLAN_PUBLIE, PLAN_ENVOYE, PLAN_FIGE, PLAN_RESULTAT)
        if a_un_resultat(plan) or (publie and est_parti(plan, course, maintenant)):
            athlete = magasin.athletes.lire(plan.get("athlete_id") or "")
            yield plan, course, athlete


def calculer(magasin: Magasin, cfg, maintenant: datetime | None = None) -> dict:
    """La vue de l'écran Registre (§5.6)."""
    lignes = []
    for plan, course, athlete in _courus(magasin, maintenant):
        e = entree(magasin, cfg, plan, course, athlete) if a_un_resultat(plan) else None
        lignes.append(ligne(plan, course, athlete, e))
    lignes.sort(key=lambda l: (l["date"] or "", l["athlete"]), reverse=True)
    return {
        **{niveau: resumer([l for l in lignes if l["niveau"] == niveau]) for niveau in NIVEAUX},
        "lignes": lignes,
    }


def exporter(magasin: Magasin, cfg) -> dict:
    """Les entrées des courses saisies, au format du fichier committé."""
    entrees = [e for e in (entree(magasin, cfg, plan, course, athlete)
                           for plan, course, athlete in _courus(magasin, None)
                           if a_un_resultat(plan))
               if e is not None]
    entrees.sort(key=lambda e: (e["date"], e["athlete"]))
    return {"_comment": COMMENTAIRE, "entries": entrees}


__all__ = ["NIVEAUX", "calculer", "entree", "exporter", "ligne", "resumer"]
