"""La forme du plan jugée contre les passages réels d'une course.

Le banc juge l'arrivée ; ce bloc juge la répartition, de deux façons :

* **mouvement réel imposé** — le plan répartit le temps de mouvement que l'athlète a
  réellement passé : il ne reste que la forme (où le plan met le temps), sans l'erreur de
  total ni les arrêts. Erreur moyenne, pire tronçon et pire cumul, en minutes ;
* **total prédit** — le plan tel qu'il a été servi, ancré sur la prédiction : écart des
  heures de passage à chaque point, biais à mi-course, écart à l'arrivée ;
* **hors ravito imposé** — le plan répartit le temps réellement passé hors des ravitos
  (tronçon moins les arrêts au ravitaillement, comme un chronométrage entrée / sortie) : les
  pauses en route et les trous d'enregistrement restent dans le tronçon, comme dans le plan,
  et un arrêt au ravito, prévisible ou non, n'y pèse plus. Erreur moyenne, pire tronçon,
  pire cumul, et somme signée (plan − réel) sur les tronçons de montée et de descente
  (:func:`type_de_troncon` : le côté dominant, au moins 20 m par km).

S'y ajoutent les arrêts et le mouvement réels contre ceux du plan, et la marche en descente
prévue par le modèle de marche du détecteur (``twin.terrain.marche_prevue``, sous le mouvement réel
imposé) contre celle mesurée. Les mesures réelles viennent des passages (``tools/passages`` :
mouvement, arrêts, marche par tronçon, marche en descente).
"""

from __future__ import annotations

import numpy as np


def _r(x, nd=2):
    return None if x is None else round(float(x), nd)


def type_de_troncon(seg) -> str:
    """« montée » quand le D+ du segment fait au moins deux fois son D− et au moins 20 m par km
    officiel, « descente » à l'inverse, « mixte » sinon : un tronçon roulant n'est ni l'une ni
    l'autre, même sans un mètre de D−."""
    km = max(float(seg.off1 - seg.off0), 1e-6)
    if seg.dplus_m >= 2.0 * seg.dminus_m and seg.dplus_m >= 20.0 * km:
        return "montée"
    if seg.dminus_m >= 2.0 * seg.dplus_m and seg.dminus_m >= 20.0 * km:
        return "descente"
    return "mixte"


def hors_ravito_impose(course, plan, segs: list) -> dict | None:
    """Le plan, ramené au temps hors ravito réel, contre ce temps tronçon par tronçon ; un
    tronçon compte quand ses deux points ont un séjour mesurable (``ravito_lu``). Montée et
    descente : :func:`type_de_troncon`."""
    idx = [i for i, sg in enumerate(segs)
           if sg is not None and sg.get("hors_ravito_h") is not None and sg.get("ravito_lu", True)]
    if len(idx) < 2:
        return None
    reel = np.array([segs[i]["hors_ravito_h"] for i in idx]) * 60.0
    prevu = np.array([plan.segments[i].t_move_min for i in idx], dtype=float)
    if prevu.sum() <= 0:
        return None
    impose = prevu * reel.sum() / prevu.sum()
    e = impose - reel
    cs = course.segments
    montee = [j for j, i in enumerate(idx) if type_de_troncon(cs[i]) == "montée"]
    descente = [j for j, i in enumerate(idx) if type_de_troncon(cs[i]) == "descente"]
    return {
        "n": len(idx),
        "erreur_moyenne_min": _r(np.mean(np.abs(e)), 1),
        "pire_troncon_min": _r(np.max(np.abs(e)), 1),
        "pire_cumul_min": _r(np.max(np.abs(np.cumsum(e))), 1),
        "biais_montees_min": _r(e[montee].sum(), 1) if montee else None,
        "biais_descentes_min": _r(e[descente].sum(), 1) if descente else None,
        "troncons": [{"i": i, "vers": plan.segments[i].to, "plan_min": _r(impose[j], 1),
                      "reel_min": _r(reel[j], 1)} for j, i in enumerate(idx)],
    }


def bloc_forme(course, race, prediction, cfg, passages: dict | None, *,
               terrain: dict | None = None) -> dict | None:
    """Le bloc ``forme`` d'une entrée, ``None`` sans passages exploitables. ``terrain`` : les
    traits de terrain du jumeau (modèle de marche) — de quoi prévoir la marche en descente."""
    from ..pacing.plan import build_pacing
    from ..twin.terrain import marche_prevue

    if not passages or prediction is None:
        return None
    cps = passages.get("checkpoints") or []
    n_seg = len(course.segments)
    if len(cps) != n_seg + 1:
        return None
    plan = build_pacing(course, prediction, race, cfg)
    out: dict = {}

    segs = passages.get("segments")
    if segs and len(segs) == n_seg:
        idx = [i for i, sg in enumerate(segs) if sg is not None and sg.get("mouvement_h") is not None]
        if len(idx) >= 2:
            reel = np.array([segs[i]["mouvement_h"] for i in idx]) * 60.0
            prevu = np.array([plan.segments[i].t_move_min for i in idx], dtype=float)
            k_impose = reel.sum() / prevu.sum() if prevu.sum() > 0 else 1.0
            impose = prevu * k_impose
            e = impose - reel
            marche = marche_prevue(course, plan, terrain, cfg)
            troncons = []
            for k, i in enumerate(idx):
                md = segs[i].get("marche_descente_h")
                troncons.append({
                    "vers": plan.segments[i].to, "plan_min": _r(impose[k], 1), "reel_min": _r(reel[k], 1),
                    "marche_reelle_min": (None if segs[i].get("marche_h") is None
                                          else _r(60.0 * segs[i]["marche_h"], 1)),
                    "marche_descente_prevue_min": (None if marche is None or marche[i] is None
                                                   else _r(marche[i] * k_impose, 1)),
                    "marche_descente_reelle_min": None if md is None else _r(60.0 * md, 1)})
            out["mouvement_impose"] = {
                "n": len(idx),
                "erreur_moyenne_min": _r(np.mean(np.abs(e)), 1),
                "pire_troncon_min": _r(np.max(np.abs(e)), 1),
                "pire_cumul_min": _r(np.max(np.abs(np.cumsum(e))), 1),
                "troncons": troncons,
            }
            paires = [(t["marche_descente_prevue_min"], t["marche_descente_reelle_min"]) for t in troncons
                      if t["marche_descente_prevue_min"] is not None
                      and t["marche_descente_reelle_min"] is not None]
            if paires:
                pv, rl = (np.array(x, dtype=float) for x in zip(*paires))
                out["marche_descente"] = {
                    "n": len(paires), "prevue_min": _r(pv.sum(), 1), "reelle_min": _r(rl.sum(), 1),
                    "erreur_moyenne_min": _r(np.mean(np.abs(pv - rl)), 1),
                    "pire_troncon_min": _r(np.max(np.abs(pv - rl)), 1),
                }

        hors = hors_ravito_impose(course, plan, segs)
        if hors is not None:
            out["hors_ravito_impose"] = hors

    reel_t = [c.get("t_h") for c in cps]
    cumul = [s.cum_clock_exact_h if s.cum_clock_exact_h is not None else s.cum_clock_h
             for s in plan.segments]
    points = [i for i in range(1, n_seg + 1) if reel_t[i] is not None]
    if points:
        e = np.array([60.0 * (cumul[i - 1] - reel_t[i]) for i in points])
        km = np.array([course.segments[i - 1].off1 for i in points])
        mi = int(np.argmin(np.abs(km - course.length_km / 2.0)))
        out["total_predit"] = {
            "n": len(points),
            "erreur_moyenne_min": _r(np.mean(np.abs(e)), 1),
            "pire_min": _r(np.max(np.abs(e)), 1),
            "biais_mi_course_min": _r(e[mi], 1),
            "arrivee_min": _r(e[-1], 1) if points[-1] == n_seg else None,
        }

    out["mouvement"] = {"plan_h": _r(plan.t_move_h, 3), "reel_h": _r(passages.get("mouvement_h"), 3)}
    out["arrets"] = {"plan_h": _r(plan.t_stops_h, 3), "reel_h": _r(passages.get("arrets_h"), 3)}
    out["marche_reelle_h"] = _r(passages.get("marche_h"), 3)
    return out or None


__all__ = ["bloc_forme", "hors_ravito_impose", "type_de_troncon"]
