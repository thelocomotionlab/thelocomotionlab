"""La forme du plan jugée contre les passages réels d'une course.

Le banc juge l'arrivée ; ce bloc juge la répartition, de deux façons :

* **mouvement réel imposé** — le plan répartit le temps de mouvement que l'athlète a
  réellement passé : il ne reste que la forme (où le plan met le temps), sans l'erreur de
  total ni les arrêts. Erreur moyenne, pire tronçon et pire cumul, en minutes ;
* **total prédit** — le plan tel qu'il a été servi, ancré sur la prédiction : écart des
  heures de passage à chaque point, biais à mi-course, écart à l'arrivée.

S'y ajoutent les arrêts et le mouvement réels contre ceux du plan. Les mesures réelles
viennent des passages (``tools/passages`` : mouvement, arrêts, marche par tronçon).
"""

from __future__ import annotations

import numpy as np


def _r(x, nd=2):
    return None if x is None else round(float(x), nd)


def bloc_forme(course, race, prediction, cfg, passages: dict | None) -> dict | None:
    """Le bloc ``forme`` d'une entrée, ``None`` sans passages exploitables."""
    from ..pacing.plan import build_pacing

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
            impose = prevu / prevu.sum() * reel.sum() if prevu.sum() > 0 else prevu
            e = impose - reel
            out["mouvement_impose"] = {
                "n": len(idx),
                "erreur_moyenne_min": _r(np.mean(np.abs(e)), 1),
                "pire_troncon_min": _r(np.max(np.abs(e)), 1),
                "pire_cumul_min": _r(np.max(np.abs(np.cumsum(e))), 1),
                "troncons": [{"vers": plan.segments[i].to, "plan_min": _r(impose[k], 1),
                              "reel_min": _r(reel[k], 1),
                              "marche_reelle_min": (None if segs[i].get("marche_h") is None
                                                    else _r(60.0 * segs[i]["marche_h"], 1))}
                             for k, i in enumerate(idx)],
            }

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


__all__ = ["bloc_forme"]
