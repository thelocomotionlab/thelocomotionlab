"""La technicité déclarée servie au parcours, et la marche prévue en descente.

**Technicité déclarée** — la majoration de la course (``technicity_pct``), qui pèse
uniformément sur chaque mètre du Deq. Servie à la répartition (``pacing.terrain=declared``),
elle se reporte sur les descentes, au prorata de la probabilité de marcher de l'athlète à cet
endroit (modèle de marche du détecteur : classe de pente, D− déjà descendu) — uniformément sur
les descentes sans ce modèle. Le total ne change pas.

**Marche prévue** (:func:`marche_prevue`) : minutes de marche en descente par segment du
plan — temps de mouvement du segment réparti sur ses mètres au prorata de leur coût, ×
probabilité de marcher du modèle de marche du détecteur (classe, D−, nuit du segment).
"""

from __future__ import annotations

import numpy as np

from ..config import Config


def _dminus_grille(course) -> np.ndarray:
    alt = np.asarray(course.alt_smooth_m, dtype=float)
    return np.concatenate([[0.0], np.cumsum(np.maximum(-np.diff(alt), 0.0))])


def _proba_marche(modele: dict | None, classe: np.ndarray, dminus_km: np.ndarray,
                  nuit: np.ndarray | None = None) -> np.ndarray | None:
    """Probabilité de marcher du modèle de marche du détecteur ; None sans modèle. Une classe
    sans intercept prend celui de la classe mesurée la plus proche."""
    if not modele or not modele.get("intercepts"):
        return None
    inter = list(modele["intercepts"])
    connus = [j for j, v in enumerate(inter) if v is not None]
    if not connus:
        return None
    a = np.array([inter[min(connus, key=lambda j: abs(j - int(c)))] for c in classe], dtype=float)
    eta = a + float(modele.get("dminus_par_km") or 0.0) * np.asarray(dminus_km, dtype=float)
    if nuit is not None and modele.get("nuit") is not None:
        eta = eta + float(modele["nuit"]) * np.asarray(nuit, dtype=float)
    return 1.0 / (1.0 + np.exp(-eta))


def facteur_declare(course, terrain: dict | None, cfg: Config) -> np.ndarray | None:
    """Multiplicateur de répartition de la technicité déclarée, reportée sur les descentes ;
    None sans technicité déclarée ou sans descente."""
    tau = float(getattr(course, "technicity_pct", 0.0) or 0.0) / 100.0
    if tau <= 0 or course.x_m.size < 2:
        return None
    pente = np.asarray(course.grade, dtype=float)
    desc = pente <= cfg.twin.terrain_descent_grade
    if not desc.any():
        return None
    bords = np.asarray(cfg.twin.terrain_grade_classes, dtype=float)
    p = _proba_marche((terrain or {}).get("marche"), np.searchsorted(bords, pente, side="left"),
                      _dminus_grille(course) / 1000.0)
    a = np.where(desc, 1.0 if p is None else p, 0.0)
    f = np.asarray(course.grade_factor, dtype=float)
    poids = float(np.sum(f * a))
    if poids <= 0:
        return None
    tau_d = tau * float(np.sum(f)) / poids
    return 1.0 + tau_d * a


def marche_prevue(course, plan, terrain: dict | None, cfg: Config) -> list[float | None] | None:
    """Minutes de marche prévues en descente, par segment du plan ; None sans modèle de
    marche."""
    if course.x_m.size < 2:
        return None
    pente = np.asarray(course.grade, dtype=float)
    desc = pente <= cfg.twin.terrain_descent_grade
    bords = np.asarray(cfg.twin.terrain_grade_classes, dtype=float)
    classe = np.searchsorted(bords, pente, side="left")
    dminus = _dminus_grille(course)
    off = np.asarray(course.off_km_grid, dtype=float)
    # coût par mètre de la répartition servie (la loi du total à défaut)
    cout = np.diff(np.asarray(course.deq_grid_m, dtype=float), prepend=0.0)
    if getattr(course, "repartition_grid", None) is not None:
        cout = np.asarray(course.repartition_grid, dtype=float)

    modele = (terrain or {}).get("marche")
    if not modele:
        return None

    out: list[float | None] = []
    for seg, sp in zip(course.segments, plan.segments):
        sel = (off >= seg.off0) & (off < seg.off1)
        if not sel.any() or cout[sel].sum() <= 0:
            out.append(None)
            continue
        t_m = sp.t_move_min * cout[sel] / cout[sel].sum()
        d = desc[sel]
        if not d.any():
            out.append(0.0)
            continue
        part = _proba_marche(modele, classe[sel][d], dminus[sel][d] / 1000.0,
                             np.full(int(d.sum()), float(sp.night)))
        out.append(round(float(np.sum(t_m[d] * part)), 1))
    return out


def _environ(minutes: float) -> int:
    """Un ordre de grandeur lisible : à la minute sous 10 min, aux 5 min au-delà."""
    return int(round(minutes)) if minutes < 10 else int(5 * round(minutes / 5.0))


def consignes_de_marche(marche: list[float | None] | None) -> list[str | None]:
    """La consigne « Sur ce segment » de chaque segment : les minutes de marche prévues en
    descente (:func:`marche_prevue`), dès qu'elles atteignent une minute ; None sinon."""
    out: list[str | None] = []
    for m in marche or []:
        if m is None or m < 0.5:
            out.append(None)
            continue
        out.append(f"descentes : environ {_environ(m)} min prévues à la marche")
    return out


__all__ = ["consignes_de_marche", "facteur_declare", "marche_prevue"]
