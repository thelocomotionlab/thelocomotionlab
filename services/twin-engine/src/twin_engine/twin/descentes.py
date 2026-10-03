"""Le détecteur de descentes hachées, et les traits que le jumeau en tire.

**Au décodage** (:func:`resume_descentes`), pour toute activité avec cadence et altitude, un
résumé sans tableau à la seconde, selon les définitions de l'analyse de référence
(``tools/analyses/nice_2026_descentes``, constantes ``twin.terrain_*``) :

* pente à chaque seconde : altitude sur une grille de 5 m, lissée sur 11 points (55 m),
  différence sur ±``terrain_grade_half_base_m`` ; dénivelé négatif cumulé sur la même
  altitude lissée ;
* fenêtres de ``terrain_window_m`` de distance, sur les secondes en mouvement
  (:mod:`.mouvement`) ; une fenêtre de moins de 30 s ne compte pas ; descente si sa pente
  moyenne est sous ``terrain_descent_grade`` ;
* une descente est « hachée » à ``terrain_choppy_switches_per_min`` bascules course ↔ marche
  par minute ou ``terrain_choppy_walk_share`` du temps marché, « courable » sinon ;
* cellules (classe de pente × courable / haché × dénivelé négatif déjà descendu × nuit) :
  secondes, distance, secondes marchées, bascules, FC (somme et nombre de secondes), nombre
  de fenêtres ; pour le reste de l'activité (fenêtres hors descente), secondes et distance
  ajustée à la pente (loi de Minetti) par tranche de dénivelé négatif ; histogramme de la
  cadence lissée en mouvement.

**Dans le jumeau** (:func:`traits_terrain`), sur toutes les activités résumées :

* vitesses par classe de pente, fraîches et fatiguées (sous / au-delà de
  ``terrain_fatigue_dminus_m`` de D− déjà descendu), courables et hachées, et la part
  marchée de chacune ;
* **pénalité de marche** : 1 − v(haché) ÷ v(courable) à classe égale, fraîche et fatiguée.
  Une fenêtre est hachée parce que l'athlète y marche : ce trait mesure ce que coûte la
  marche en descente, quelle qu'en soit la cause (terrain, quadriceps, nuit) ;
* **fatigue de descente** : pente de ln v(descente courue) sur le D− déjà descendu (par km),
  dans une même activité et une même classe de pente ; ``absolue``, et ``relative`` au reste
  de la sortie au même D− (ce que le fade général ne dit pas déjà) ;
* **seuil de cadence personnel** : mélange de deux gaussiennes sur l'histogramme, seuil à
  posteriori égal ; à côté du seuil fixe, qui reste la définition ;
* **modèle de marche** : probabilité de marcher en descente, logistique sur la classe de
  pente, le D− déjà descendu et la nuit.

Chaque trait vaut None sous ``terrain_trait_min_hours`` heures de mesure et se rétrécit vers
0 avec le poids h ÷ (h + ``terrain_trait_shrink_hours``).

Limite : une douleur aux quadriceps produit aussi des arrêts courts et de la marche en
descente ; le détecteur ne sait pas la distinguer du terrain.
"""

from __future__ import annotations

import math
from collections import Counter

import numpy as np

from ..config import Config
from ..minetti import grade_factor
from .mouvement import cadence_lissee, course_a_pied, masque_mouvement

# grille et lissage de l'altitude de l'analyse de référence
_PAS_M = 5.0
_LISSAGE_POINTS = 11
_FENETRE_MIN_S = 30
# histogramme de la cadence lissée (pas par minute)
_CAD_MIN, _CAD_MAX, _CAD_PAS = 40.0, 240.0, 2.0
# colonnes d'une cellule de descente
_COLONNES = ("classe", "hache", "dminus", "nuit", "s", "m", "marche_s", "bascules",
             "fc_somme", "fc_s", "fenetres")


# --------------------------------------------------------------------------- décodage
def pente_et_denivele(dist_m: np.ndarray, alt_m: np.ndarray, cfg: Config):
    """(pente, dénivelé négatif cumulé en m) à chaque seconde, ou None sans altitude."""
    d = np.maximum.accumulate(np.nan_to_num(np.asarray(dist_m, dtype=float)))
    alt = np.asarray(alt_m, dtype=float)
    ok = np.isfinite(alt)
    if ok.sum() < 2 or d[-1] < 2 * _PAS_M:
        return None
    g = np.arange(0.0, d[-1], _PAS_M)
    z = np.interp(g, d[ok], alt[ok])
    k = _LISSAGE_POINTS
    zs = np.convolve(np.pad(z, (k // 2, k // 2), mode="edge"), np.ones(k) / k, mode="valid")
    h = max(int(round(cfg.twin.terrain_grade_half_base_m / _PAS_M)), 1)
    gr = np.zeros_like(g)
    if g.size > 2 * h:
        gr[h:-h] = (zs[2 * h:] - zs[:-2 * h]) / (2 * h * _PAS_M)
    pente = np.interp(d, g, gr)
    zc = np.interp(d, g, zs)
    dminus = np.concatenate([[0.0], np.cumsum(np.maximum(-np.diff(zc), 0.0))])
    return pente, dminus


def _nuit_par_seconde(act) -> np.ndarray | None:
    """Nuit à chaque seconde de la grille (test du plan, fuseau solaire de la longitude) ;
    None sans heure de départ ni position."""
    if act.start_time is None:
        return None
    lat, lon = np.asarray(act.lat, dtype=float), np.asarray(act.lon, dtype=float)
    ok = np.isfinite(lat) & np.isfinite(lon)
    if not ok.any():
        return None
    from datetime import timedelta, timezone

    from ..pacing.sun import night_mask   # import différé : pacing dépend de twin

    la, lo = float(np.median(lat[ok])), float(np.median(lon[ok]))
    tz = float(round(lo / 15.0))
    debut = act.start_time.astimezone(timezone(timedelta(hours=tz)))
    m = night_mask(debut, float(act.n - 1), la, lo, tz, step_s=60)
    if m.size < act.n:
        m = np.concatenate([m, np.full(act.n - m.size, m[-1] if m.size else False)])
    return m[: act.n]


def _fenetres(act, cfg: Config) -> dict | None:
    """Les fenêtres de distance d'une activité décodée et ce que le résumé en garde (cf.
    module) ; None sans cadence, altitude ou mouvement."""
    tw = cfg.twin
    if act.n < 2 or not act.has_cadence or not act.has_altitude:
        return None
    court = course_a_pied(act.cadence_spm, cfg)
    if court is None:
        return None
    d = np.maximum.accumulate(np.nan_to_num(np.asarray(act.dist_m, dtype=float)))
    pd = pente_et_denivele(d, act.alt_m, cfg)
    if pd is None:
        return None
    pente, dminus = pd
    mvt = masque_mouvement(d, act.gap_s, cfg)
    m = np.flatnonzero(mvt)
    if m.size < _FENETRE_MIN_S:
        return None

    # histogramme de la cadence lissée en mouvement (mélange de deux allures)
    lisse = cadence_lissee(np.asarray(act.cadence_spm, dtype=float), int(tw.terrain_cadence_smooth_s))[m]
    lisse = lisse[np.isfinite(lisse) & (lisse >= _CAD_MIN) & (lisse < _CAD_MAX)]
    hist = np.bincount(((lisse - _CAD_MIN) // _CAD_PAS).astype(int),
                       minlength=int((_CAD_MAX - _CAD_MIN) / _CAD_PAS))

    # fenêtres de distance sur les secondes en mouvement
    w = (d[m] // tw.terrain_window_m).astype(int)
    _, premiers = np.unique(w, return_index=True)
    derniers = np.r_[premiers[1:] - 1, w.size - 1]
    T = np.add.reduceat(np.ones(w.size), premiers)
    g_moy = np.add.reduceat(pente[m], premiers) / T
    marche = np.add.reduceat((~court[m]).astype(float), premiers)
    bascule = np.r_[0.0, ((court[m][1:] != court[m][:-1]) & (w[1:] == w[:-1])).astype(float)]
    bascules = np.add.reduceat(bascule, premiers)
    fc = np.asarray(act.hr, dtype=float)[m]
    fc_ok = np.isfinite(fc)
    fc_somme = np.add.reduceat(np.where(fc_ok, fc, 0.0), premiers)
    fc_s = np.add.reduceat(fc_ok.astype(float), premiers)
    dist = d[m][derniers] - d[m][premiers]
    dist = np.where(dist < 0.5 * tw.terrain_window_m, tw.terrain_window_m, dist)
    dd = np.diff(d, prepend=d[0])[m]
    f_loi = np.asarray(grade_factor(np.clip(pente[m], -cfg.course.grade_clip, cfg.course.grade_clip),
                                    cfg.course.cr0, cap=tw.f_cap), dtype=float)
    dist_ajustee = np.add.reduceat(f_loi * dd, premiers)

    nuit = _nuit_par_seconde(act)
    milieu = m[(premiers + derniers) // 2]
    n_d = int(tw.terrain_dminus_max_m // tw.terrain_dminus_step_m) + 1
    tranche = np.minimum((dminus[m][premiers] // tw.terrain_dminus_step_m).astype(int), n_d - 1)
    bords = np.asarray(tw.terrain_grade_classes, dtype=float)
    classe = np.searchsorted(bords, g_moy, side="left")
    hache = ((bascules / (T / 60.0) >= tw.terrain_choppy_switches_per_min)
             | (marche / T >= tw.terrain_choppy_walk_share))
    valide = T >= _FENETRE_MIN_S
    return {
        "hist": hist, "T": T, "g_moy": g_moy, "marche": marche, "bascules": bascules,
        "fc_somme": fc_somme, "fc_s": fc_s, "dist": dist, "dist_ajustee": dist_ajustee,
        "classe": classe, "hache": hache, "tranche": tranche, "valide": valide,
        "descente": valide & (g_moy <= tw.terrain_descent_grade),
        "nuit": None if nuit is None else nuit[milieu].astype(bool),
    }


def secondes_en_descente(dist_m, alt_m, gap_s, cfg: Config) -> np.ndarray | None:
    """Vrai à chaque seconde en mouvement d'une fenêtre de descente — les fenêtres du
    résumé (distance, pente moyenne, durée minimale) ; None sans altitude exploitable."""
    tw = cfg.twin
    d = np.maximum.accumulate(np.nan_to_num(np.asarray(dist_m, dtype=float)))
    pd = pente_et_denivele(d, alt_m, cfg)
    if pd is None:
        return None
    pente, _ = pd
    m = np.flatnonzero(masque_mouvement(d, gap_s, cfg))
    out = np.zeros(d.size, dtype=bool)
    if m.size == 0:
        return out
    w = (d[m] // tw.terrain_window_m).astype(int)
    _, premiers, comptes = np.unique(w, return_index=True, return_counts=True)
    g_moy = np.add.reduceat(pente[m], premiers) / comptes
    descente = (comptes >= _FENETRE_MIN_S) & (g_moy <= tw.terrain_descent_grade)
    out[m] = np.repeat(descente, comptes)
    return out


def resume_descentes(act, cfg: Config) -> dict | None:
    """Le résumé des descentes d'une activité décodée (cf. module) ; None sans cadence,
    altitude ou mouvement."""
    f = _fenetres(act, cfg)
    if f is None:
        return None
    cellules: dict[tuple, list[float]] = {}
    for i in np.flatnonzero(f["descente"]):
        cle = (int(f["classe"][i]), int(f["hache"][i]), int(f["tranche"][i]),
               0 if f["nuit"] is None else int(f["nuit"][i]))
        c = cellules.setdefault(cle, [0.0] * 7)
        for j, v in enumerate((f["T"][i], f["dist"][i], f["marche"][i], f["bascules"][i],
                               f["fc_somme"][i], f["fc_s"][i], 1.0)):
            c[j] += float(v)
    reste: dict[int, list[float]] = {}
    for i in np.flatnonzero(f["valide"] & ~f["descente"]):
        r = reste.setdefault(int(f["tranche"][i]), [0.0, 0.0])
        r[0] += float(f["T"][i])
        r[1] += float(f["dist_ajustee"][i])
    return {
        "cellules": [[*cle, round(v[0]), round(v[1], 1), round(v[2]), round(v[3]),
                      round(v[4]), round(v[5]), round(v[6])] for cle, v in sorted(cellules.items())],
        "reste": [[b, round(v[0]), round(v[1], 1)] for b, v in sorted(reste.items())],
        "cadence": [[int(i), int(c)] for i, c in enumerate(f["hist"]) if c],
        "nuit_connue": f["nuit"] is not None,
        "unite": getattr(act, "cadence_unit", None),
    }


# --------------------------------------------------------------------------- traits
def _cellules(summaries) -> list[tuple[int, dict]]:
    """(index d'activité, cellule nommée) de toutes les activités résumées."""
    out = []
    for k, s in enumerate(summaries):
        r = getattr(s, "descente", None)
        if not r:
            continue
        for c in r.get("cellules", []):
            out.append((k, dict(zip(_COLONNES, c))))
    return out


def _retreci(x: float | None, heures: float, cfg: Config) -> float | None:
    if x is None:
        return None
    lam = max(float(cfg.twin.terrain_trait_shrink_hours), 0.0)
    return float(x) * heures / (heures + lam) if heures + lam > 0 else None


def _vitesses(cells, cfg: Config) -> list[dict]:
    """Par classe de pente comparable (entre deux bords de ``terrain_grade_classes``), les
    vitesses fraîches et fatiguées, courables et hachées (km/h), leurs heures et la part de
    leurs secondes marchées."""
    tw = cfg.twin
    bords = list(tw.terrain_grade_classes)
    seuil = int(tw.terrain_fatigue_dminus_m // tw.terrain_dminus_step_m)
    out = []
    for c in range(1, len(bords)):
        ligne: dict = {"pente": [bords[c - 1], bords[c]]}
        for etat, fatigue in (("frais", False), ("fatigue", True)):
            for allure, h in (("courable", 0), ("hache", 1)):
                sel = [x for _, x in cells if x["classe"] == c and x["hache"] == h
                       and (x["dminus"] >= seuil) == fatigue]
                s = sum(x["s"] for x in sel)
                n = sum(x["fenetres"] for x in sel)
                ligne[f"{etat}_{allure}_kmh"] = (round(3.6 * sum(x["m"] for x in sel) / s, 3)
                                                 if s > 0 and n >= 2 else None)
                ligne[f"{etat}_{allure}_h"] = round(s / 3600.0, 3)
                ligne[f"{etat}_{allure}_marche"] = (round(sum(x["marche_s"] for x in sel) / s, 4)
                                                    if s > 0 and n >= 2 else None)
        out.append(ligne)
    return out


def _penalite(vitesses: list[dict], etat: str, cfg: Config) -> dict:
    """1 − v(haché) ÷ v(courable), classes pondérées par les heures hachées."""
    num = den = 0.0
    for v in vitesses:
        vc, vh = v[f"{etat}_courable_kmh"], v[f"{etat}_hache_kmh"]
        h = v[f"{etat}_hache_h"]
        if vc and vh and h > 0:
            num += h * (1.0 - vh / vc)
            den += h
    brut = num / den if den > 0 else None
    if brut is None or den < cfg.twin.terrain_trait_min_hours:
        return {"brut": None if brut is None else round(brut, 4), "valeur": None,
                "heures": round(den, 3)}
    return {"brut": round(brut, 4), "valeur": round(_retreci(brut, den, cfg), 4),
            "heures": round(den, 3)}


def _fatigue(summaries, cells, cfg: Config) -> dict:
    """Pente de ln v(descente courue) sur le D− déjà descendu (km), dans une même activité et
    une même classe, absolue et relative à la vitesse ajustée du reste au même D−."""
    tw = cfg.twin
    pas_km = tw.terrain_dminus_step_m / 1000.0
    groupes: dict[tuple[int, int], dict[int, list[float]]] = {}
    for k, x in cells:
        if x["hache"] or x["classe"] == 0:
            continue
        g = groupes.setdefault((k, x["classe"]), {})
        v = g.setdefault(x["dminus"], [0.0, 0.0])
        v[0] += x["s"]
        v[1] += x["m"]
    restes = {}
    for k, s in enumerate(summaries):
        r = getattr(s, "descente", None)
        if r:
            restes[k] = {b: (sec, adj) for b, sec, adj in r.get("reste", [])}
    out = {}
    for nom in ("absolue", "relative"):
        sxy = sxx = heures = 0.0
        for (k, _), tranches in groupes.items():
            pts = []
            for b, (sec, dist) in tranches.items():
                if sec < 60 or dist <= 0:
                    continue
                y = math.log(dist / sec)
                if nom == "relative":
                    sec_r, adj_r = restes.get(k, {}).get(b, (0.0, 0.0))
                    if sec_r < 60 or adj_r <= 0:
                        continue
                    y -= math.log(adj_r / sec_r)
                pts.append(((b + 0.5) * pas_km, y, sec / 3600.0))
            if len(pts) < 2:
                continue
            x, y, w = (np.array(c) for c in zip(*pts))
            xm, ym = np.average(x, weights=w), np.average(y, weights=w)
            sxy += float(np.sum(w * (x - xm) * (y - ym)))
            sxx += float(np.sum(w * (x - xm) ** 2))
            heures += float(w.sum())
        brut = sxy / sxx if sxx > 0 else None
        ok = brut is not None and heures >= tw.terrain_trait_min_hours
        out[nom] = {"brut": None if brut is None else round(brut, 5),
                    "valeur": round(_retreci(brut, heures, cfg), 5) if ok else None,
                    "heures": round(heures, 3)}
    return out


def _seuil_cadence(summaries, cfg: Config) -> dict | None:
    """Mélange de deux gaussiennes sur l'histogramme de cadence lissée en mouvement ; seuil
    où les deux composantes pondérées s'égalent, entre leurs moyennes. None sans deux
    allures nettes (poids ≥ 5 %, séparation d'Ashman ≥ 2) ou sous le minimum d'heures."""
    nb = int((_CAD_MAX - _CAD_MIN) / _CAD_PAS)
    h = np.zeros(nb)
    for s in summaries:
        r = getattr(s, "descente", None)
        for i, c in (r or {}).get("cadence", []):
            if 0 <= i < nb:
                h[i] += c
    total = float(h.sum())
    if total / 3600.0 < cfg.twin.terrain_trait_min_hours:
        return None
    x = _CAD_MIN + (np.arange(nb) + 0.5) * _CAD_PAS
    # départ : les deux côtés du seuil fixe (sans quoi une archive surtout courue verrait
    # deux bosses dans la seule course)
    cote = x >= cfg.twin.terrain_run_cadence_spm
    if h[cote].sum() <= 0 or h[~cote].sum() <= 0:
        return None
    mu = np.array([np.average(x[~cote], weights=h[~cote] + 1e-12),
                   np.average(x[cote], weights=h[cote] + 1e-12)])
    sd = np.array([10.0, 10.0])
    pi = np.array([h[~cote].sum(), h[cote].sum()]) / total
    for _ in range(300):
        dens = pi[:, None] * np.exp(-0.5 * ((x[None, :] - mu[:, None]) / sd[:, None]) ** 2) / sd[:, None]
        resp = dens / np.maximum(dens.sum(axis=0), 1e-300)
        wk = resp * h[None, :]
        nk = wk.sum(axis=1)
        if (nk <= 0).any():
            return None
        pi = nk / total
        mu = (wk * x[None, :]).sum(axis=1) / nk
        sd = np.sqrt(np.maximum((wk * (x[None, :] - mu[:, None]) ** 2).sum(axis=1) / nk, 1.0))
    o = np.argsort(mu)
    mu, sd, pi = mu[o], sd[o], pi[o]
    ashman = math.sqrt(2.0) * abs(mu[1] - mu[0]) / math.sqrt(sd[0] ** 2 + sd[1] ** 2)
    if pi.min() < 0.05 or ashman < 2.0:
        return None
    grille = np.linspace(mu[0], mu[1], 2001)
    ecart = (np.log(pi[0] / sd[0]) - 0.5 * ((grille - mu[0]) / sd[0]) ** 2
             - np.log(pi[1] / sd[1]) + 0.5 * ((grille - mu[1]) / sd[1]) ** 2)
    seuil = float(grille[np.argmin(np.abs(ecart))])
    fixe = cfg.twin.terrain_run_cadence_spm
    bas, haut = sorted((seuil, fixe))
    entre = float(h[(x >= bas) & (x < haut)].sum()) / total
    return {"seuil_spm": round(seuil, 1), "marche_spm": round(float(mu[0]), 1),
            "course_spm": round(float(mu[1]), 1), "ecarts_spm": [round(float(v), 1) for v in sd],
            "poids_marche": round(float(pi[0]), 3), "heures": round(total / 3600.0, 2),
            "part_entre_les_seuils": round(entre, 4)}


def _modele_marche(cells, cfg: Config) -> dict | None:
    """logit P(marcher) = α_classe + β·D− (km) + γ·nuit, sur les secondes en mouvement des
    descentes ; β et γ rétrécis vers 0. None sous le minimum d'heures."""
    tw = cfg.twin
    if not cells:
        return None
    n_cls = len(tw.terrain_grade_classes)
    pas_km = tw.terrain_dminus_step_m / 1000.0
    agg: dict[tuple[int, int, int], list[float]] = {}
    for _, x in cells:
        a = agg.setdefault((x["classe"], x["dminus"], x["nuit"]), [0.0, 0.0])
        a[0] += x["s"]
        a[1] += x["marche_s"]
    heures = sum(a[0] for a in agg.values()) / 3600.0
    if heures < tw.terrain_trait_min_hours:
        return None
    avec_nuit = len({k[2] for k in agg}) > 1
    X, y, w = [], [], []
    for (c, b, n), (s, mch) in agg.items():
        if s <= 0:
            continue
        ligne = [1.0 if c == j else 0.0 for j in range(n_cls)] + [(b + 0.5) * pas_km]
        if avec_nuit:
            ligne.append(float(n))
        X.append(ligne)
        y.append(min(max(mch / s, 0.0), 1.0))
        w.append(s)
    X, y, w = np.asarray(X), np.asarray(y), np.asarray(w) / 3600.0
    beta = np.zeros(X.shape[1])
    for _ in range(100):
        eta = X @ beta
        mu = np.clip(1.0 / (1.0 + np.exp(-eta)), 1e-6, 1 - 1e-6)
        W = w * mu * (1 - mu)
        z = eta + (y - mu) / (mu * (1 - mu))
        A = X.T @ (W[:, None] * X) + 1e-6 * np.eye(X.shape[1])
        nouveau = np.linalg.solve(A, X.T @ (W * z))
        if np.max(np.abs(nouveau - beta)) < 1e-8:
            beta = nouveau
            break
        beta = nouveau
    presentes = {k[0] for k in agg}
    return {
        "intercepts": [round(float(beta[j]), 4) if j in presentes else None for j in range(n_cls)],
        "dminus_par_km": round(_retreci(float(beta[n_cls]), heures, cfg), 4),
        "nuit": round(_retreci(float(beta[n_cls + 1]), heures, cfg), 4) if avec_nuit else None,
        "heures": round(heures, 3),
    }


def traits_terrain(summaries, cfg: Config) -> dict | None:
    """Les traits de terrain du jumeau (cf. module) ; None sans activité résumée."""
    resumes = [s for s in summaries if getattr(s, "descente", None)]
    if not resumes:
        return None
    cells = _cellules(summaries)
    vitesses = _vitesses(cells, cfg)
    return {
        "n_activites": len(resumes),
        "unites": dict(Counter(str(s.descente.get("unite")) for s in resumes)),
        "heures_descente": round(sum(x["s"] for _, x in cells) / 3600.0, 3),
        "vitesses": vitesses,
        "penalite_marche": {"frais": _penalite(vitesses, "frais", cfg),
                            "fatigue": _penalite(vitesses, "fatigue", cfg)},
        "fatigue_descente": _fatigue(summaries, cells, cfg),
        "seuil_cadence": _seuil_cadence(resumes, cfg),
        "marche": _modele_marche(cells, cfg),
    }


__all__ = ["pente_et_denivele", "resume_descentes", "secondes_en_descente",
           "traits_terrain"]
