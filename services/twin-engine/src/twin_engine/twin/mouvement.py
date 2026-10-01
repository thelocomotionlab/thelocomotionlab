"""Mouvement, arrêts et marche d'une activité à la seconde, selon les définitions de
l'analyse de référence (``tools/analyses/nice_2026_descentes``, constantes ``twin.terrain_*``).

* **en mouvement** : la distance avance d'au moins ``terrain_moving_ms`` sur la seconde, et
  la seconde n'est pas dans un trou d'enregistrement de plus de ``terrain_gap_max_s`` ;
* **arrêt** : au moins ``terrain_stop_min_s`` secondes continues hors mouvement ;
* **course / marche** : cadence lissée sur ``terrain_cadence_smooth_s`` au-dessus ou au-dessous
  de ``terrain_run_cadence_spm`` (pas par minute, deux pieds).

Ces définitions servent les mesures du registre (mouvement, arrêts et minutes marchées par
segment) et le détecteur de descentes hachées ; elles sont distinctes du masque historique
du jumeau (``twin.stops``, seuil ``moving_speed_threshold_ms``), que la calibration garde.
"""

from __future__ import annotations

import numpy as np

from ..config import Config


def masque_mouvement(dist_m: np.ndarray, gap_s: np.ndarray, cfg: Config) -> np.ndarray:
    """True à chaque seconde en mouvement ; la première seconde, sans incrément, est False."""
    d = np.asarray(dist_m, dtype=float)
    if d.size == 0:
        return np.zeros(0, dtype=bool)
    v = np.concatenate([[0.0], np.diff(d)])
    gap = np.asarray(gap_s, dtype=float) if gap_s is not None else np.ones(d.size)
    out = (v >= cfg.twin.terrain_moving_ms) & (gap <= cfg.twin.terrain_gap_max_s)
    out[0] = False
    return out


def episodes_arret(mouvement: np.ndarray, cfg: Config) -> np.ndarray:
    """True à chaque seconde d'un arrêt : suite continue hors mouvement d'au moins
    ``terrain_stop_min_s`` secondes."""
    m = np.asarray(mouvement, dtype=bool)
    arret = ~m
    out = np.zeros(m.size, dtype=bool)
    if not arret.any():
        return out
    bords = np.diff(arret.astype(np.int8), prepend=0, append=0)
    debuts = np.flatnonzero(bords == 1)
    fins = np.flatnonzero(bords == -1)
    for a, b in zip(debuts, fins):
        if b - a >= cfg.twin.terrain_stop_min_s:
            out[a:b] = True
    return out


def cadence_lissee(cadence_spm: np.ndarray, k: int) -> np.ndarray:
    """Moyenne glissante sur ``k`` secondes, bords prolongés (comme l'analyse de référence)."""
    c = np.asarray(cadence_spm, dtype=float)
    if c.size == 0 or k <= 1:
        return c.copy()
    pad = np.pad(c, (k // 2, k // 2 - 1 if k % 2 == 0 else k // 2), mode="edge")
    return np.convolve(pad, np.ones(k) / k, mode="valid")


def course_a_pied(cadence_spm: np.ndarray | None, cfg: Config) -> np.ndarray | None:
    """True là où l'athlète court (cadence lissée au seuil ou au-dessus) ; ``None`` sans
    cadence. Une seconde sans cadence lisible compte comme de la marche."""
    if cadence_spm is None:
        return None
    c = np.asarray(cadence_spm, dtype=float)
    if not np.isfinite(c).any():
        return None
    lisse = cadence_lissee(c, int(cfg.twin.terrain_cadence_smooth_s))
    with np.errstate(invalid="ignore"):
        return lisse >= cfg.twin.terrain_run_cadence_spm


def bilan_par_troncon(dist_m: np.ndarray, gap_s: np.ndarray | None,
                      cadence_spm: np.ndarray | None, bornes: list[int | None],
                      cfg: Config, descente: np.ndarray | None = None) -> list[dict | None]:
    """Pour chaque tronçon entre deux bornes consécutives (indices de seconde) : temps
    écoulé, arrêts, mouvement (écoulé − arrêts) et marche (secondes en mouvement à cadence
    de marche ; ``None`` sans cadence), en heures. ``None`` quand une borne manque.

    ``descente`` (masque par seconde des fenêtres de descente du détecteur,
    ``twin.descentes.secondes_en_descente``) : en plus, le temps en mouvement en descente et
    la marche en descente du tronçon."""
    mouvement = masque_mouvement(dist_m, gap_s, cfg)
    arret = episodes_arret(mouvement, cfg)
    court = course_a_pied(cadence_spm, cfg)
    out: list[dict | None] = []
    for i0, i1 in zip(bornes[:-1], bornes[1:]):
        if i0 is None or i1 is None or i1 < i0:
            out.append(None)
            continue
        ecoule = float(i1 - i0)
        arrets = float(np.count_nonzero(arret[i0:i1]))
        marche = (None if court is None
                  else float(np.count_nonzero(mouvement[i0:i1] & ~court[i0:i1])))
        b = {"ecoule_h": ecoule / 3600.0, "arrets_h": arrets / 3600.0,
             "mouvement_h": (ecoule - arrets) / 3600.0,
             "marche_h": None if marche is None else marche / 3600.0}
        if descente is not None:
            dm = mouvement[i0:i1] & descente[i0:i1]
            b["descente_h"] = float(np.count_nonzero(dm)) / 3600.0
            b["marche_descente_h"] = (None if court is None
                                      else float(np.count_nonzero(dm & ~court[i0:i1])) / 3600.0)
        out.append(b)
    return out


__all__ = ["bilan_par_troncon", "cadence_lissee", "course_a_pied", "episodes_arret",
           "masque_mouvement"]
