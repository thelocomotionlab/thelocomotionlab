"""Le terrain servi au parcours : à la répartition du plan, au total, aux ultras de la
calibration, et la marche prévue en descente.

Deux sources de technicité :

* **déclarée** — la majoration de la course (``technicity_pct``), qui pèse uniformément sur
  chaque mètre du Deq. Servie à la répartition (``pacing.terrain=declared``), elle se reporte
  sur les descentes, au prorata de la probabilité de marcher de l'athlète à cet endroit (modèle
  de marche du détecteur : classe de pente, D− déjà descendu) — uniformément sur les descentes
  sans ce modèle. Le total ne change pas.
* **carte** — le profil de terrain d'une trace (``tools/carte``) : pour chaque tranche de 50 m
  en descente, P(hachée) sous la carte et P(hachée) sur le terrain habituel de l'athlète, à la
  même pente et au même D− (``carte.modele``). Le surcoût d'une tranche est le temps que la
  marche y ajoute au-delà de ce que le terrain habituel en contient déjà :

      facteur = (1 + P_carte·r) ÷ (1 + P_réf·r),   r = p ÷ (1 − p),

  p la pénalité de marche du jumeau (1 − v hachée ÷ v courable), fraîche sous
  ``twin.terrain_fatigue_dminus_m`` de D− déjà descendu, fatiguée au-delà : la technicité du
  tronçon (P_carte) × la sensibilité de l'athlète (p), amplifiée par le D− (dans P et dans p).
  Un modèle de carte sans signal hors échantillon, une pénalité inconnue : facteur 1.

Servie selon les drapeaux :

* ``pacing.terrain ∈ {none, declared, map}`` — à la seule répartition ;
* ``prediction.terrain_total=differential`` — au total du parcours cible (son Deq), la
  calibration intacte ;
* ``calibration.terrain_adjust=deq`` — au total du parcours cible ET au Deq de chaque vrai
  ultra de la calibration (profils de terrain de ses activités) : la même règle des deux côtés.

**Marche prévue** (:func:`marche_prevue`) : minutes de marche en descente par segment du
plan — temps de mouvement du segment réparti sur ses mètres au prorata de leur coût, ×
probabilité de marcher : le modèle de marche du détecteur (classe, D−, nuit du segment) ; avec
un profil de carte, P(hachée) × part marchée des fenêtres hachées + (1 − P) × part marchée des
courables, par classe de pente, fraîches ou fatiguées.
"""

from __future__ import annotations

import math

import numpy as np

from ..config import Config
from ..minetti import grade_factor

_P_MAX = 0.9          # une pénalité de marche au-delà ferait exploser r = p ÷ (1 − p)


# --------------------------------------------------------------------------- traits servis
def penalites(terrain: dict | None) -> tuple[float, float] | None:
    """(pénalité de marche fraîche, fatiguée) servies du jumeau ; l'une manquante prend la
    valeur de l'autre ; None sans aucune."""
    pm = (terrain or {}).get("penalite_marche") or {}
    frais = (pm.get("frais") or {}).get("valeur")
    fatigue = (pm.get("fatigue") or {}).get("valeur")
    if frais is None and fatigue is None:
        return None
    frais = fatigue if frais is None else frais
    fatigue = frais if fatigue is None else fatigue
    return (float(np.clip(frais, 0.0, _P_MAX)), float(np.clip(fatigue, 0.0, _P_MAX)))


def _r(p: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(p, dtype=float), 0.0, _P_MAX)
    return p / (1.0 - p)


def facteur_de_marche(p_carte, p_ref, dminus_m, pen: tuple[float, float], cfg: Config) -> np.ndarray:
    """(1 + P_carte·r) ÷ (1 + P_réf·r), r de la pénalité fraîche ou fatiguée selon le D−."""
    dminus_m = np.asarray(dminus_m, dtype=float)
    p = np.where(dminus_m >= cfg.twin.terrain_fatigue_dminus_m, pen[1], pen[0])
    r = _r(p)
    return (1.0 + np.asarray(p_carte, dtype=float) * r) / (1.0 + np.asarray(p_ref, dtype=float) * r)


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


# --------------------------------------------------------------------------- profils de carte
def profil_compatible(profil: dict | None, course) -> str | None:
    """Raison pour laquelle un profil de terrain ne s'applique pas au parcours (None : il
    s'applique)."""
    if not profil:
        return "pas de profil de terrain"
    if not (profil.get("modele") or {}).get("signal"):
        return "le modèle de carte n'a pas de signal hors échantillon"
    if profil.get("refus"):
        return str(profil["refus"])
    km = profil.get("km") or []
    if not km:
        return "profil vide"
    if abs(float(km[-1]) - float(course.length_km)) > max(1.0, 0.02 * float(course.length_km)):
        return (f"profil d'une autre trace ({float(km[-1]):.1f} km contre "
                f"{float(course.length_km):.1f})")
    return None


def _sur_la_grille(profil: dict, course) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(descente, P_carte, P_réf) du profil ramenés aux points de la grille du parcours
    (tranche la plus proche en km officiel)."""
    km = np.asarray(profil["km"], dtype=float)
    off = np.asarray(course.off_km_grid, dtype=float)
    i = np.clip(np.searchsorted(km, off), 1, km.size - 1) if km.size > 1 else np.zeros(off.size, dtype=int)
    if km.size > 1:
        i = np.where(np.abs(km[i - 1] - off) <= np.abs(km[i] - off), i - 1, i)
    desc = np.asarray(profil["descente"], dtype=bool)[i]
    pc = np.nan_to_num(np.asarray(profil["p_carte"], dtype=float)[i])
    pr = np.nan_to_num(np.asarray(profil["p_ref"], dtype=float)[i])
    return desc, pc, pr


def facteur_carte(course, profil: dict | None, terrain: dict | None, cfg: Config) -> np.ndarray | None:
    """Multiplicateur du coût par mètre de la carte sur la grille du parcours (1 hors des
    descentes) ; None si le profil ne s'applique pas ou sans pénalité de marche."""
    pen = penalites(terrain)
    if pen is None or profil_compatible(profil, course) is not None:
        return None
    desc, pc, pr = _sur_la_grille(profil, course)
    f = facteur_de_marche(pc, pr, _dminus_grille(course), pen, cfg)
    return np.where(desc, f, 1.0)


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


def surcout_km(course, facteur: np.ndarray) -> float:
    """Ce que le facteur ajoute au Deq du parcours (km)."""
    inc = np.diff(np.asarray(course.deq_grid_m, dtype=float), prepend=0.0)
    return float(np.sum(inc * (np.asarray(facteur, dtype=float) - 1.0)) / 1000.0)


# --------------------------------------------------------------------------- ultras
def surcout_d_une_activite(entree: dict, pen: tuple[float, float], cfg: Config) -> float:
    """Le surcoût de terrain (km de Deq) d'une activité du magasin des ultras : ses tranches en
    descente, Deq de chacune, P_carte, P_réf, D− déjà descendu."""
    deq = np.asarray(entree.get("deq_m") or [], dtype=float)
    if deq.size == 0:
        return 0.0
    f = facteur_de_marche(entree["p_carte"], entree["p_ref"], entree["dminus_m"], pen, cfg)
    return float(np.sum(deq * (f - 1.0)) / 1000.0)


def surcouts_des_ultras(magasin: dict | None, terrain: dict | None, cfg: Config) -> dict[str, float] | None:
    """Surcoût de terrain (km) de chaque activité du magasin, par heure de départ (clé des
    résumés) ; None si le magasin ne s'applique pas (absent, modèle sans signal) ou sans
    pénalité de marche."""
    pen = penalites(terrain)
    if not magasin or pen is None or not (magasin.get("modele") or {}).get("signal"):
        return None
    return {cle: surcout_d_une_activite(e, pen, cfg) for cle, e in (magasin.get("activites") or {}).items()}


def tranches_pour_le_magasin(tranches, p_carte, p_ref, descente, cfg: Config) -> dict:
    """L'entrée d'une activité au magasin des ultras : ses seules tranches en descente."""
    d = np.asarray(descente, dtype=bool)
    f = np.asarray(grade_factor(np.clip(tranches.pente, -cfg.course.grade_clip, cfg.course.grade_clip),
                                cfg.course.cr0), dtype=float)
    return {"deq_m": [round(float(x), 2) for x in (f * tranches.pas_m)[d]],
            "p_carte": [round(float(x), 4) for x in np.asarray(p_carte)[d]],
            "p_ref": [round(float(x), 4) for x in np.asarray(p_ref)[d]],
            "dminus_m": [round(float(x), 1) for x in tranches.dminus_m[d]]}


# --------------------------------------------------------------------------- marche prévue
def _parts_marchees(terrain: dict | None) -> dict | None:
    """Part marchée des fenêtres hachées et courables, par classe et état (frais, fatigué)."""
    vit = (terrain or {}).get("vitesses")
    if not vit:
        return None
    out = {}
    for c, ligne in enumerate(vit, start=1):
        for etat in ("frais", "fatigue"):
            for allure in ("hache", "courable"):
                v = ligne.get(f"{etat}_{allure}_marche")
                if v is not None:
                    out[(c, etat, allure)] = float(v)
    return out or None


def marche_prevue(course, plan, terrain: dict | None, cfg: Config, *,
                  profil: dict | None = None) -> list[float | None] | None:
    """Minutes de marche prévues en descente, par segment du plan ; None sans modèle de marche
    (ni parts marchées avec un profil de carte)."""
    if course.x_m.size < 2:
        return None
    pente = np.asarray(course.grade, dtype=float)
    desc = pente <= cfg.twin.terrain_descent_grade
    bords = np.asarray(cfg.twin.terrain_grade_classes, dtype=float)
    classe = np.searchsorted(bords, pente, side="left")
    dminus = _dminus_grille(course)
    fatigue = dminus >= cfg.twin.terrain_fatigue_dminus_m
    off = np.asarray(course.off_km_grid, dtype=float)
    # coût par mètre de la répartition servie (la loi du total à défaut)
    cout = np.diff(np.asarray(course.deq_grid_m, dtype=float), prepend=0.0)
    if getattr(course, "repartition_grid", None) is not None:
        cout = np.asarray(course.repartition_grid, dtype=float)

    parts = _parts_marchees(terrain)
    p_h = None
    if profil is not None and parts is not None and profil_compatible(profil, course) is None:
        _, p_h, _ = _sur_la_grille(profil, course)
    modele = (terrain or {}).get("marche")
    if p_h is None and not modele:
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
        if p_h is not None:
            part = []
            for c, fa, ph in zip(classe[sel][d], fatigue[sel][d], p_h[sel][d]):
                etat = "fatigue" if fa else "frais"
                wh = parts.get((int(c), etat, "hache"), parts.get((int(c), "frais", "hache")))
                wc = parts.get((int(c), etat, "courable"), parts.get((int(c), "frais", "courable")))
                part.append(math.nan if wh is None or wc is None else ph * wh + (1.0 - ph) * wc)
            part = np.asarray(part)
            if np.isnan(part).any():
                if not modele:
                    out.append(None)
                    continue
                pm = _proba_marche(modele, classe[sel][d], dminus[sel][d] / 1000.0,
                                   np.full(int(d.sum()), float(sp.night)))
                part = np.where(np.isnan(part), pm, part)
        else:
            part = _proba_marche(modele, classe[sel][d], dminus[sel][d] / 1000.0,
                                 np.full(int(d.sum()), float(sp.night)))
        out.append(round(float(np.sum(t_m[d] * part)), 1))
    return out


def _environ(minutes: float) -> int:
    """Un ordre de grandeur lisible : à la minute sous 10 min, aux 5 min au-delà."""
    return int(round(minutes)) if minutes < 10 else int(5 * round(minutes / 5.0))


def segments_techniques(course, profil: dict | None) -> list[bool] | None:
    """Par segment, vrai quand la carte y rend les descentes plus hachées que le terrain
    habituel de l'athlète (P_carte > P_réf en moyenne) ; None sans profil applicable."""
    if profil_compatible(profil, course) is not None:
        return None
    desc, pc, pr = _sur_la_grille(profil, course)
    off = np.asarray(course.off_km_grid, dtype=float)
    out = []
    for seg in course.segments:
        sel = desc & (off >= seg.off0) & (off < seg.off1)
        out.append(bool(sel.any() and float(np.mean(pc[sel] - pr[sel])) > 0.0))
    return out


def consignes_de_marche(marche: list[float | None] | None,
                        techniques: list[bool] | None = None) -> list[str | None]:
    """La consigne « Sur ce segment » de chaque segment : les minutes de marche prévues en
    descente (:func:`marche_prevue`), dès qu'elles atteignent une minute ; « descente
    technique » là où la carte le dit (:func:`segments_techniques`). None sinon."""
    out: list[str | None] = []
    for k, m in enumerate(marche or []):
        if m is None or m < 0.5:
            out.append(None)
            continue
        quoi = "descente technique" if techniques and techniques[k] else "descentes"
        out.append(f"{quoi} : environ {_environ(m)} min prévues à la marche")
    return out


__all__ = ["consignes_de_marche", "facteur_carte", "facteur_de_marche", "facteur_declare",
           "marche_prevue", "penalites", "profil_compatible", "segments_techniques",
           "surcout_d_une_activite", "surcout_km", "surcouts_des_ultras", "tranches_pour_le_magasin"]
