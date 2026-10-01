"""La loi de pente personnelle servie au parcours : au total, à la répartition, ou à rien.

Le jumeau mesure, sur les secondes avec FC de l'archive, de combien l'athlète est plus lent
en montée et plus rapide en descente que sur le plat à réserve cardiaque égale
(:func:`~twin_engine.twin.model.fit_slope_cost` : un facteur par tranche de pente, et κ par
côté, pente des moindres carrés du surcoût personnel sur celui de la loi de Minetti). Ce
module dit ce qui en est servi au parcours, selon le bloc ``calibration`` :

* ``slope_cost=minetti`` — rien ;
* ``slope_cost=personal`` — κ au total (la calibration juge les ultras passés sous les mêmes
  facteurs, :meth:`Twin.slope_factors`) et à la répartition ;
* ``slope_cost=personal_pacing`` — à la seule répartition du plan : le total reste sous la
  loi de Minetti, des deux côtés de la prédiction.

``slope_curve`` choisit la forme de la loi servie à la répartition : ``kappa`` (surcoût de
la loi × κ par côté) ou ``bins`` (facteur mesuré par tranche, rétréci vers la loi avec le
poids h ÷ (h + λ), λ = ``slope_bins_shrink_hours``). Une tranche ne compte que si son côté
(montée ou descente) totalise ``slope_cost_min_hours`` heures de mesure, comme κ.

Sous ``pacing.descent_fatigue=dminus``, la répartition porte en plus la fatigue de descente
du jumeau (:mod:`.descentes`) : le temps des descentes tardives s'allonge avec le dénivelé
négatif déjà descendu, le reste se raccourcit d'autant (le total ne bouge pas).

Le terrain (:mod:`.terrain`) s'y ajoute : à la répartition sous ``pacing.terrain``, au total
sous ``prediction.terrain_total=differential`` ou ``calibration.terrain_adjust=deq`` — un
terrain servi au total l'est aussi à toute répartition, qui sinon le perdrait.

La loi s'applique à la pente du parcours (lissage ``course.smooth_window_m``) ; les facteurs
ont été mesurés sur celle des activités (base ±``twin.grade_base_m``) : deux définitions
voisines, dont l'écart est mesuré au carnet (DIAGNOSTIC §10.28).
"""

from __future__ import annotations

import numpy as np

from ..config import Config
from ..minetti import grade_factor


def kappas_servis(detail: dict | None, cfg: Config) -> tuple[float, float] | None:
    """κ (montée, descente) recalculés depuis les valeurs brutes du détail et les bornes de
    ``cfg`` ; un côté non mesuré vaut 1 ; None sans aucune mesure."""
    if not detail:
        return None
    c = cfg.calibration
    ku, kd = detail.get("kappa_up_raw"), detail.get("kappa_down_raw")
    if ku is None and kd is None:
        return None
    bas = c.slope_kappa_min if c.slope_kappa_down_min is None else c.slope_kappa_down_min
    return (1.0 if ku is None else float(np.clip(ku, c.slope_kappa_min, c.slope_kappa_max)),
            1.0 if kd is None else float(np.clip(kd, bas, c.slope_kappa_max)))


def rapports_par_tranche(detail: dict | None, cfg: Config) -> tuple[np.ndarray, np.ndarray] | None:
    """(pentes en %, rapport facteur servi ÷ facteur de la loi) aux tranches mesurées, le plat
    à 1 ; None sans tranche exploitable. Facteur servi = loi + (personnel − loi)·h ÷ (h + λ)."""
    if not detail or not detail.get("bins"):
        return None
    c = cfg.calibration
    lam = max(float(c.slope_bins_shrink_hours), 0.0)
    assez = {+1: (detail.get("hours_up") or 0.0) >= c.slope_cost_min_hours,
             -1: (detail.get("hours_down") or 0.0) >= c.slope_cost_min_hours}
    g, r = [0.0], [1.0]
    for b in detail["bins"]:
        pente, fp, fm, h = (float(b["grade_pct"]), b.get("f_personal"), b.get("f_minetti"),
                            float(b.get("hours") or 0.0))
        if pente == 0.0 or not assez[1 if pente > 0 else -1]:
            continue
        if fp is None or fm is None or not (fp > 0 and fm > 0) or h <= 0:
            continue
        w = h / (h + lam)
        g.append(pente)
        r.append((fm + w * (fp - fm)) / fm)
    if len(g) == 1:
        return None
    ordre = np.argsort(g)
    return np.asarray(g, dtype=float)[ordre], np.asarray(r, dtype=float)[ordre]


def loi_de_repartition(detail: dict | None, cfg: Config) -> dict | None:
    """La loi servie à la répartition sous ``calibration.slope_curve`` ; None sans mesure."""
    if cfg.calibration.slope_curve == "bins":
        rp = rapports_par_tranche(detail, cfg)
        if rp is None:
            return None
        return {"curve": "bins", "shrink_hours": float(cfg.calibration.slope_bins_shrink_hours),
                "grade_pct": [round(float(x), 2) for x in rp[0]],
                "ratio": [round(float(x), 4) for x in rp[1]]}
    k = kappas_servis(detail, cfg)
    return None if k is None else {"curve": "kappa", "kappa": [round(k[0], 4), round(k[1], 4)]}


def facteur_de_minetti(course) -> np.ndarray | None:
    """Coût par mètre de la loi de Minetti sur la grille du parcours (1 = plat), relu dans sa
    décomposition — indépendant d'un coût personnel déjà servi au total ; None sans
    décomposition."""
    if course.excess_up_grid_m is None or course.excess_down_grid_m is None or course.x_m.size < 2:
        return None
    step = float(course.x_m[1] - course.x_m[0])
    surcout = np.diff(course.excess_up_grid_m + course.excess_down_grid_m, prepend=0.0)
    return 1.0 + surcout / step


def facteur_sur_la_grille(course, loi: dict) -> np.ndarray | None:
    """Coût par mètre de la loi ``loi`` sur la grille du parcours ; None sans décomposition."""
    f = facteur_de_minetti(course)
    if f is None:
        return None
    pente = np.asarray(course.grade, dtype=float)
    if loi["curve"] == "bins":
        out = f * np.interp(100.0 * pente, loi["grade_pct"], loi["ratio"])
    else:
        ku, kd = loi["kappa"]
        out = np.where(pente > 0, 1.0 + ku * (f - 1.0), np.where(pente < 0, 1.0 + kd * (f - 1.0), f))
    # un coût par mètre nul ou négatif (κ_descente proche de 2 sous la loi) n'a pas de sens
    return np.maximum(out, 1e-3)


def fatigue_servie(terrain: dict | None, cfg: Config) -> float | None:
    """φ servi sous ``pacing.descent_fatigue=dminus`` : la fatigue de descente RELATIVE du
    jumeau (rétrécie), en ln-vitesse par km de D− ; None hors du drapeau ou sans mesure."""
    if cfg.pacing.descent_fatigue != "dminus" or not terrain:
        return None
    rel = (terrain.get("fatigue_descente") or {}).get("relative") or {}
    return rel.get("valeur")


def facteur_de_fatigue(course, phi: float, cfg: Config) -> np.ndarray:
    """Multiplicateur du temps par mètre sur la grille : exp(−φ·D−) dans les descentes (pente
    ≤ ``twin.terrain_descent_grade``), D− le dénivelé négatif déjà descendu (km, altitude
    lissée du parcours), 1 ailleurs. φ < 0 (l'athlète ralentit) allonge les descentes tardives."""
    alt = np.asarray(course.alt_smooth_m, dtype=float)
    dminus = np.concatenate([[0.0], np.cumsum(np.maximum(-np.diff(alt), 0.0))]) / 1000.0
    descente = np.asarray(course.grade, dtype=float) <= cfg.twin.terrain_descent_grade
    return np.where(descente, np.exp(-float(phi) * dminus), 1.0)


def servir_parcours(course, twin, cfg: Config, profil: dict | None = None):
    """Le parcours tel que le moteur le sert à l'athlète : total sous κ si
    ``slope_cost=personal`` ; total sous le terrain de la carte (``profil``, le profil de
    terrain du parcours) si ``prediction.terrain_total=differential`` ou
    ``calibration.terrain_adjust=deq`` ; répartition sous la loi de ``slope_curve`` si une loi
    personnelle est servie à la répartition et diffère de celle du total, sous la fatigue de
    descente si ``pacing.descent_fatigue=dminus``, sous le terrain si ``pacing.terrain`` le
    demande."""
    from dataclasses import replace

    from ..carte.osm import ATTRIBUTION as ATTRIBUTION_OSM
    from .terrain import (facteur_carte, facteur_declare, penalites, profil_compatible,
                          segments_techniques)

    c = cfg.calibration
    if c.slope_cost == "personal":
        k = twin.slope_factors(cfg)
        if k is not None:
            course = course.with_slope_cost(*k)
    traits = getattr(twin, "terrain", None)
    mode_total = ("deq" if c.terrain_adjust == "deq"
                  else "differential" if cfg.prediction.terrain_total == "differential" else None)
    f_carte = None
    if mode_total is not None or cfg.pacing.terrain == "map":
        f_carte = facteur_carte(course, profil, traits, cfg)
        # ce que le parcours dit de la carte servie (ou pourquoi elle ne l'est pas) : les
        # documents en tirent l'attribution des données et les descentes techniques
        info = {"source": "carte", "total": mode_total, "repartition": cfg.pacing.terrain == "map"}
        if f_carte is not None:
            info.update(segments_techniques=segments_techniques(course, profil),
                        attributions=list(profil.get("attributions") or [ATTRIBUTION_OSM]))
            course = (course.with_terrain(f_carte, info) if mode_total is not None
                      else replace(course, terrain=info))
        else:
            raison = (profil_compatible(profil, course) or
                      ("pénalité de marche inconnue" if penalites(traits) is None else None))
            course = replace(course, terrain={**info, "servi": False, "raison": raison})
    f_pacing = None
    if cfg.pacing.terrain == "map":
        f_pacing = f_carte
    elif cfg.pacing.terrain == "declared":
        f_pacing = facteur_declare(course, traits, cfg)
    garde = f_carte if (mode_total is not None and cfg.pacing.terrain != "map") else None
    detail = None
    if c.slope_cost == "personal_pacing" or (c.slope_cost == "personal" and c.slope_curve == "bins"):
        detail = getattr(twin, "slope_detail", None)
        if detail is None:
            detail = {}
    return repartir(course, detail, cfg, phi=fatigue_servie(traits, cfg),
                    terrain=f_pacing, terrain_total=garde)


def repartir(course, detail: dict | None, cfg: Config, *, phi: float | None = None,
             terrain: np.ndarray | None = None, terrain_total: np.ndarray | None = None):
    """Le parcours dont le plan répartit sous la loi de ``slope_curve`` mesurée dans
    ``detail`` (``None`` : la loi du total), sous la fatigue de descente ``phi`` et sous le
    facteur de terrain ``terrain`` (``pacing.terrain``) ; ``terrain_total`` : le facteur que
    le total porte déjà, gardé dans toute répartition. Tel quel sans loi, sans fatigue ni
    terrain de répartition, ou sans décomposition."""
    loi = loi_de_repartition(detail, cfg) if detail is not None else None
    if loi is None and phi is None and terrain is None:
        return course
    if loi is None:
        f = None if facteur_de_minetti(course) is None else np.asarray(course.grade_factor, dtype=float)
        loi = {"curve": "total"}
    else:
        f = facteur_sur_la_grille(course, loi)
    if f is None:
        return course
    if phi is not None:
        f = f * facteur_de_fatigue(course, phi, cfg)
        loi = {**loi, "descent_fatigue": round(float(phi), 5)}
    if terrain is not None:
        f = f * np.asarray(terrain, dtype=float)
        loi = {**loi, "terrain": cfg.pacing.terrain}
    if terrain_total is not None:
        f = f * np.asarray(terrain_total, dtype=float)
    return course.with_repartition(f, loi)


def detail_du_registre(modele: dict | None, cfg: Config) -> dict | None:
    """Le détail de la mesure tel que le registre le garde (bloc ``model``) : valeurs brutes
    de κ, heures par côté, tranches. Une entrée qui ne porte que les κ servis (registre
    d'avant les tranches) les rend comme valeurs brutes."""
    if not modele:
        return None
    tranches = modele.get("slope_bins") or []
    bins = [{"grade_pct": float(g), "f_personal": float(fp),
             "f_minetti": float(grade_factor(float(g) / 100.0, cfg.course.cr0, cap=cfg.twin.f_cap)),
             "hours": float(h)} for g, fp, h in tranches]
    ku = modele.get("slope_kappa_up_raw", modele.get("slope_kappa_up"))
    kd = modele.get("slope_kappa_down_raw", modele.get("slope_kappa_down"))
    if ku is None and kd is None and not bins:
        return None
    return {"kappa_up_raw": ku, "kappa_down_raw": kd,
            "hours_up": modele.get("slope_hours_up"), "hours_down": modele.get("slope_hours_down"),
            "bins": bins}


__all__ = ["detail_du_registre", "facteur_de_fatigue", "facteur_de_minetti", "facteur_sur_la_grille",
           "fatigue_servie", "kappas_servis", "loi_de_repartition", "rapports_par_tranche",
           "repartir", "servir_parcours"]
