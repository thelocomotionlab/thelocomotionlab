"""Ce que la carte dit de la technicité, appris sur les descentes de l'athlète.

**Exemples.** Chaque fenêtre de descente d'une activité (``twin.descentes.fenetres_de_descente``,
étiquetée hachée ou courable par le détecteur) reçoit les variables des tranches de la carte
de cette activité qu'elle couvre (:func:`variables_de_fenetre`) : moyenne des variables
numériques, part des tranches recalées sur une voie, modalité la plus présente de chaque
étiquette (l'absence d'étiquette est une modalité).

**Modèle.** Une logistique :

    logit P(hachée) = contrôles + carte

où les contrôles sont ceux du modèle de marche du détecteur — classe de pente, dénivelé
négatif déjà descendu (km), nuit — et la carte, les variables numériques centrées-réduites
(une valeur manquante prend la moyenne et lève une indicatrice) et une indicatrice par
modalité (une modalité vue dans moins de ``carte.modalite_min_fenetres`` fenêtres rejoint
« autre »). Pénalité L2 sur les seuls termes de la carte, de force choisie dans
``carte.l2_grille`` par validation croisée sur des plis d'activités entières.

**Validation.** Hors échantillon : par plis d'activités entières (``carte.plis``), puis
région par région (les activités dont les centres sont à moins de ``carte.region_km`` l'une
de l'autre, de proche en proche, forment une région ; la force de la pénalité y est choisie
sans la région retenue). On compare la perte logarithmique du modèle complet à celle des
seuls contrôles, ajustés sur les mêmes plis. ``signal`` est vrai quand la carte réduit la
perte hors échantillon d'au moins ``carte.signal_z`` erreurs types (groupées par activité)
dans les deux validations (dans la seule validation par activités quand il n'y a qu'une
région) : sans quoi la carte ne dit rien de la technicité pour cet athlète, et le modèle le
dit.

**Application** (:func:`probabilites`) : sur une carte de parcours, chaque tranche en
descente reçoit P(hachée) sur la fenêtre de ``twin.terrain_window_m`` centrée sur elle. Un
modèle ne s'applique qu'à une carte dressée avec les mêmes sources (le TRI dépend du MNT).
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field

import numpy as np

from ..config import Config
from .carte import NUMERIQUES, Carte

_ABSENTE = "absente"
_AUTRE = "autre"


# --------------------------------------------------------------------------- exemples
def variables_de_fenetre(c: Carte, debut_m: float, fin_m: float) -> dict:
    """Les variables de la carte sur [``debut_m``, ``fin_m``] de distance de la trace (au
    moins la tranche la plus proche du milieu)."""
    t = c.tranches
    sel = np.arange(np.searchsorted(t.x_m, debut_m, "left"), np.searchsorted(t.x_m, fin_m, "right"))
    if sel.size == 0 and t.n:
        sel = np.array([int(np.argmin(np.abs(t.x_m - (debut_m + fin_m) / 2.0)))])
    out: dict = {}
    for nom, valeurs in c.variables.items():
        if nom == "recale":
            r = np.array([bool(valeurs[i]) for i in sel], dtype=float)
            out["recale"] = float(r.mean()) if r.size else None
        elif nom in NUMERIQUES:
            v = np.array([np.nan if valeurs[i] is None else float(valeurs[i]) for i in sel])
            v = v[np.isfinite(v)]
            out[nom] = float(v.mean()) if v.size else None
        else:
            m = Counter(_ABSENTE if valeurs[i] is None else str(valeurs[i]) for i in sel)
            out[nom] = max(sorted(m), key=lambda k: m[k]) if m else _ABSENTE
    return out


@dataclass
class Exemples:
    """Les fenêtres de descente étiquetées, avec les variables de la carte."""

    lignes: list[dict] = field(default_factory=list)   # variables de la carte
    hache: list[int] = field(default_factory=list)
    classe: list[int] = field(default_factory=list)
    dminus_km: list[float] = field(default_factory=list)
    nuit: list[int | None] = field(default_factory=list)
    activite: list[str] = field(default_factory=list)
    centre: dict[str, tuple[float, float]] = field(default_factory=dict)   # activité → (lat, lon)
    jour: dict[str, str] = field(default_factory=dict)                      # activité → date ISO
    longueur_m: list[float] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.hache)

    def brut(self) -> dict[str, np.ndarray]:
        """Les variables en colonnes (gardées jusqu'au prochain ajout)."""
        if getattr(self, "_brut", None) is None or len(next(iter(self._brut.values()), [])) != len(self):
            self._brut = _colonnes_brutes(self.lignes)
        return self._brut

    def ajouter(self, activite: str, fenetres: list[dict], c: Carte, jour: str | None = None) -> int:
        """Ajoute les fenêtres d'une activité sur sa carte ; rend le nombre ajouté."""
        if c.tranches.n == 0:
            return 0
        n = 0
        for f in fenetres:
            self.lignes.append(variables_de_fenetre(c, f["debut_m"], f["fin_m"]))
            self.hache.append(int(bool(f["hache"])))
            self.classe.append(int(f["classe"]))
            self.dminus_km.append(float(f["dminus_m"]) / 1000.0)
            self.nuit.append(None if f.get("nuit") is None else int(bool(f["nuit"])))
            self.activite.append(activite)
            self.longueur_m.append(max(float(f["fin_m"]) - float(f["debut_m"]), 0.0))
            n += 1
        if n:
            self.centre[activite] = (float(np.mean(c.tranches.lat)), float(np.mean(c.tranches.lon)))
            if jour is not None:
                self.jour[activite] = jour
        return n

    def sous_ensemble(self, activites: set[str]) -> "Exemples":
        """Les seules fenêtres des activités données."""
        e = Exemples()
        noms = ["lignes", "hache", "classe", "dminus_km", "nuit", "activite"]
        if len(self.longueur_m) == len(self):
            noms.append("longueur_m")
        for i, a in enumerate(self.activite):
            if a in activites:
                for nom in noms:
                    getattr(e, nom).append(getattr(self, nom)[i])
        e.centre = {a: v for a, v in self.centre.items() if a in activites}
        e.jour = {a: v for a, v in self.jour.items() if a in activites}
        return e

    def to_json(self) -> dict:
        return {"lignes": self.lignes, "hache": self.hache, "classe": self.classe,
                "dminus_km": self.dminus_km, "nuit": self.nuit, "activite": self.activite,
                "longueur_m": self.longueur_m, "centre": {k: list(v) for k, v in self.centre.items()},
                "jour": self.jour}

    @classmethod
    def depuis_json(cls, brut: dict) -> "Exemples":
        e = cls(**{k: list(brut[k]) for k in ("lignes", "hache", "classe", "dminus_km", "nuit",
                                               "activite")})
        e.longueur_m = list(brut.get("longueur_m") or [])
        e.centre = {k: (float(v[0]), float(v[1])) for k, v in (brut.get("centre") or {}).items()}
        e.jour = dict(brut.get("jour") or {})
        return e


def _colonnes_brutes(lignes: list[dict]) -> dict[str, np.ndarray]:
    """Variables numériques en flottants (NaN : inconnue), étiquettes en chaînes."""
    noms = sorted({k for ligne in lignes for k in ligne})
    out = {}
    for nom in noms:
        vals = [ligne.get(nom) for ligne in lignes]
        if nom in NUMERIQUES or nom == "recale":
            out[nom] = np.array([np.nan if x is None else float(x) for x in vals])
        else:
            out[nom] = np.array([_ABSENTE if x is None else str(x) for x in vals], dtype=object)
    return out


def regions(centres: dict[str, tuple[float, float]], region_km: float) -> dict[str, int]:
    """Région de chaque activité : composantes connexes des centres à moins de
    ``region_km`` l'un de l'autre."""
    noms = sorted(centres)
    parent = list(range(len(noms)))

    def racine(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    pts = np.radians(np.array([centres[n] for n in noms])) if noms else np.zeros((0, 2))
    for i in range(len(noms)):
        dlat = pts[i + 1:, 0] - pts[i, 0]
        dlon = pts[i + 1:, 1] - pts[i, 1]
        a = np.sin(dlat / 2) ** 2 + np.cos(pts[i, 0]) * np.cos(pts[i + 1:, 0]) * np.sin(dlon / 2) ** 2
        d_km = 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))
        for j in np.flatnonzero(d_km <= region_km):
            parent[racine(i + 1 + int(j))] = racine(i)
    ids: dict[int, int] = {}
    return {n: ids.setdefault(racine(i), len(ids)) for i, n in enumerate(noms)}


# --------------------------------------------------------------------------- encodage
@dataclass
class Encodage:
    """Comment les variables de la carte deviennent des colonnes (appris sur un
    échantillon d'apprentissage)."""

    numeriques: dict[str, tuple[float, float, bool]]   # nom → (moyenne, écart, indicatrice de manque)
    categories: dict[str, list[str]]                   # nom → modalités retenues (+ « autre »)
    classes: int
    avec_nuit: bool

    @classmethod
    def apprendre(cls, ex: Exemples, idx: np.ndarray, cfg: Config) -> "Encodage":
        numeriques, categories = {}, {}
        for nom, col in ex.brut().items():
            vals = col[idx]
            if vals.dtype != object:
                ok = np.isfinite(vals)
                if ok.sum() < 2:
                    continue
                sd = float(np.std(vals[ok]))
                manque = bool((~ok).any())
                if sd > 1e-9 or manque:
                    numeriques[nom] = (float(np.mean(vals[ok])), sd if sd > 1e-9 else 1.0, manque)
            else:
                m = Counter(vals.tolist())
                gardees = sorted(k for k, n in m.items() if n >= cfg.carte.modalite_min_fenetres)
                modalites = gardees + ([_AUTRE] if len(gardees) < len(m) else [])
                if len(modalites) >= 2:
                    categories[nom] = modalites
        avec_nuit = len({ex.nuit[i] or 0 for i in idx}) > 1
        return cls(numeriques, categories, len(cfg.twin.terrain_grade_classes), avec_nuit)

    def colonnes(self) -> tuple[list[str], list[str]]:
        """(colonnes des contrôles, colonnes de la carte)."""
        ctrl = [f"classe={j}" for j in range(self.classes)] + ["dminus_km"]
        if self.avec_nuit:
            ctrl.append("nuit")
        carte = []
        for nom, (_, _, manque) in self.numeriques.items():
            carte.append(nom)
            if manque:
                carte.append(f"{nom}:manquante")
        for nom, modalites in self.categories.items():
            carte.extend(f"{nom}={m}" for m in modalites)
        return ctrl, carte

    def matrice(self, brut: dict[str, np.ndarray], classe, dminus_km, nuit, *,
                carte: bool = True) -> np.ndarray:
        """Les colonnes (contrôles, puis carte si ``carte``) ; ``brut`` : les variables en
        colonnes (:meth:`Exemples.brut`, ou :func:`_colonnes_brutes`)."""
        classe = np.asarray(classe, dtype=int)
        n = classe.size
        cols = [(classe == j).astype(float) for j in range(self.classes)]
        cols.append(np.asarray(dminus_km, dtype=float))
        if self.avec_nuit:
            cols.append(np.array([float(x or 0) for x in nuit]))
        if carte:
            for nom, (moy, sd, manque) in self.numeriques.items():
                v = brut.get(nom, np.full(n, np.nan))
                cols.append(np.where(np.isfinite(v), (v - moy) / sd, 0.0))
                if manque:
                    cols.append((~np.isfinite(v)).astype(float))
            for nom, modalites in self.categories.items():
                v = brut.get(nom, np.full(n, _ABSENTE, dtype=object))
                v = np.where(np.isin(v, modalites), v, _AUTRE)
                cols.extend((v == m).astype(float) for m in modalites)
        return np.column_stack(cols)

    def to_json(self) -> dict:
        return {"numeriques": {k: list(v) for k, v in self.numeriques.items()},
                "categories": self.categories, "classes": self.classes, "avec_nuit": self.avec_nuit}

    @classmethod
    def depuis_json(cls, brut: dict) -> "Encodage":
        return cls({k: (float(v[0]), float(v[1]), bool(v[2])) for k, v in brut["numeriques"].items()},
                   {k: list(v) for k, v in brut["categories"].items()}, int(brut["classes"]),
                   bool(brut["avec_nuit"]))


# --------------------------------------------------------------------------- ajustement
def _sigmoide(eta: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(eta, -30.0, 30.0)))


def ajuster(X: np.ndarray, y: np.ndarray, n_controles: int, l2: float) -> np.ndarray:
    """Logistique par moindres carrés repondérés, pénalité ``l2`` sur les colonnes au-delà
    des ``n_controles`` premières (les contrôles : 1e-6, pour la stabilité)."""
    p = X.shape[1]
    pen = np.full(p, float(l2))
    pen[:n_controles] = 1e-6
    beta = np.zeros(p)
    for _ in range(100):
        mu = np.clip(_sigmoide(X @ beta), 1e-6, 1 - 1e-6)
        W = mu * (1 - mu)
        grad = X.T @ (y - mu) - pen * beta
        H = X.T @ (W[:, None] * X) + np.diag(pen)
        pas = np.linalg.solve(H, grad)
        beta = beta + pas
        if np.max(np.abs(pas)) < 1e-8:
            break
    return beta


def _perte(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def _rangs(p: np.ndarray) -> np.ndarray:
    """Rangs (1 à n) de ``p``, rang moyen pour les ex æquo."""
    ordre = np.argsort(p, kind="mergesort")
    trie = p[ordre]
    rangs = np.empty(p.size)
    i = 0
    while i < trie.size:
        j = i
        while j + 1 < trie.size and trie[j + 1] == trie[i]:
            j += 1
        rangs[ordre[i:j + 1]] = (i + j) / 2.0 + 1.0
        i = j + 1
    return rangs


def auc(y: np.ndarray, p: np.ndarray) -> float | None:
    """Aire sous la courbe ROC de ``p`` pour séparer ``y`` = 1 de ``y`` = 0 (0,5 : rien)."""
    pos, neg = y == 1, y == 0
    if not pos.any() or not neg.any():
        return None
    r = _rangs(p)
    return float((r[pos].sum() - pos.sum() * (pos.sum() + 1) / 2) / (pos.sum() * neg.sum()))


def _plis(groupes: np.ndarray, k: int) -> list[np.ndarray]:
    """Plis de groupes entiers : les groupes rangés par taille, distribués tour à tour."""
    noms, tailles = np.unique(groupes, return_counts=True)
    ordre = noms[np.argsort(-tailles, kind="mergesort")]
    k = max(min(k, len(noms)), 2)
    pli_de = {g: i % k for i, g in enumerate(ordre)}
    return [np.flatnonzero(np.array([pli_de[g] == i for g in groupes])) for i in range(k)]


def _predire_hors(ex: Exemples, appr: np.ndarray, test: np.ndarray, cfg: Config,
                  l2: float) -> tuple[np.ndarray, np.ndarray]:
    """(P complet, P contrôles seuls) sur ``test``, appris sur ``appr``."""
    enc = Encodage.apprendre(ex, appr, cfg)
    ctrl, _ = enc.colonnes()
    y = np.asarray(ex.hache, dtype=float)

    brut = ex.brut()

    def mat(idx, carte):
        return enc.matrice({k: v[idx] for k, v in brut.items()}, np.asarray(ex.classe)[idx],
                           np.asarray(ex.dminus_km)[idx], [ex.nuit[i] for i in idx], carte=carte)

    b_full = ajuster(mat(appr, True), y[appr], len(ctrl), l2)
    b_ctrl = ajuster(mat(appr, False), y[appr], len(ctrl), 0.0)
    return _sigmoide(mat(test, True) @ b_full), _sigmoide(mat(test, False) @ b_ctrl)


def _validation_croisee(ex: Exemples, idx: np.ndarray, groupes: np.ndarray, cfg: Config,
                        l2: float) -> tuple[np.ndarray, np.ndarray]:
    """P hors pli (complet, contrôles) sur ``idx``, plis de groupes entiers."""
    p_full = np.full(len(ex), np.nan)
    p_ctrl = np.full(len(ex), np.nan)
    for test in _plis(groupes[idx], int(cfg.carte.plis)):
        t = idx[test]
        a = np.setdiff1d(idx, t)
        if a.size == 0:
            continue
        p_full[t], p_ctrl[t] = _predire_hors(ex, a, t, cfg, l2)
    return p_full, p_ctrl


def _choisir_l2(ex: Exemples, idx: np.ndarray, groupes: np.ndarray, cfg: Config) -> tuple[float, dict]:
    pertes = {}
    y = np.asarray(ex.hache, dtype=float)
    for l2 in cfg.carte.l2_grille:
        p_full, _ = _validation_croisee(ex, idx, groupes, cfg, float(l2))
        ok = np.isfinite(p_full[idx])
        pertes[float(l2)] = float(_perte(y[idx][ok], p_full[idx][ok]).mean()) if ok.any() else math.inf
    meilleur = min(pertes, key=lambda k: (pertes[k], -k))
    return meilleur, pertes


def _bilan(y: np.ndarray, p_full: np.ndarray, p_ctrl: np.ndarray, groupes: np.ndarray,
           activites: np.ndarray) -> dict:
    """Pertes hors échantillon, gain de la carte et son écart réduit ``z`` (gain moyen par
    fenêtre ÷ erreur type groupée par activité : les fenêtres d'une même sortie ne sont pas
    indépendantes) ; ``groupes`` : les unités retenues tour à tour."""
    ok = np.isfinite(p_full) & np.isfinite(p_ctrl)
    y, p_full, p_ctrl = y[ok], p_full[ok], p_ctrl[ok]
    groupes, activites = groupes[ok], activites[ok]
    pf, pc = _perte(y, p_full), _perte(y, p_ctrl)
    delta = pc - pf
    sommes = np.array([np.sum(delta[activites == a] - delta.mean()) for a in np.unique(activites)])
    erreur = float(np.sqrt(np.sum(sommes ** 2))) / delta.size if delta.size else 0.0
    mieux = [bool(pf[groupes == g].mean() < pc[groupes == g].mean()) for g in np.unique(groupes)]
    auc_f, auc_c = auc(y, p_full), auc(y, p_ctrl)
    return {
        "fenetres": int(y.size),
        "perte_carte": round(float(pf.mean()), 5), "perte_controles": round(float(pc.mean()), 5),
        "gain_relatif": round(float(1.0 - pf.mean() / pc.mean()), 4) if pc.mean() > 0 else None,
        "z": round(float(delta.mean()) / erreur, 2) if erreur > 0 else None,
        "brier_carte": round(float(np.mean((p_full - y) ** 2)), 5),
        "brier_controles": round(float(np.mean((p_ctrl - y) ** 2)), 5),
        "auc_carte": None if auc_f is None else round(auc_f, 4),
        "auc_controles": None if auc_c is None else round(auc_c, 4),
        "groupes": len(mieux), "groupes_mieux_predits": int(sum(mieux)),
    }


def apprendre(ex: Exemples, cfg: Config, sources: dict | None = None) -> dict:
    """Le modèle de la carte pour un athlète, validé hors échantillon (cf. module). Sans
    assez de fenêtres hachées et courables, ou sans deux activités, ``signal`` est faux et
    la raison est dite."""
    y = np.asarray(ex.hache, dtype=float)
    n_h = int(y.sum())
    acts = np.asarray(ex.activite)
    n_act = len(set(ex.activite))
    base = {"version": 1, "sources": dict(sources or {}), "n_fenetres": len(ex), "n_hachees": n_h,
            "n_activites": n_act}
    minimum = int(cfg.carte.modele_min_fenetres)
    if n_h < minimum or len(ex) - n_h < minimum or n_act < 2:
        return {**base, "signal": False,
                "raison": f"il faut {minimum} fenêtres hachées et {minimum} courables, sur deux "
                          f"activités au moins ({n_h} hachées, {len(ex) - n_h} courables, "
                          f"{n_act} activités)"}
    tout = np.arange(len(ex))
    l2, pertes = _choisir_l2(ex, tout, acts, cfg)
    p_full, p_ctrl = _validation_croisee(ex, tout, acts, cfg, l2)
    par_activites = _bilan(y, p_full, p_ctrl, acts, acts)

    reg = regions(ex.centre, float(cfg.carte.region_km))
    par_reg = np.array([reg.get(a, -1) for a in ex.activite])
    par_regions = None
    if len(set(par_reg.tolist())) >= 2:
        pf = np.full(len(ex), np.nan)
        pc = np.full(len(ex), np.nan)
        for r in np.unique(par_reg):
            test = np.flatnonzero(par_reg == r)
            appr = np.flatnonzero(par_reg != r)
            if len(set(acts[appr].tolist())) < 2 or y[appr].sum() == 0 or y[appr].sum() == appr.size:
                continue
            l2_r, _ = _choisir_l2(ex, appr, acts, cfg)
            pf[test], pc[test] = _predire_hors(ex, appr, test, cfg, l2_r)
        par_regions = _bilan(y, pf, pc, par_reg, acts)

    enc = Encodage.apprendre(ex, tout, cfg)
    ctrl, carte = enc.colonnes()
    X = enc.matrice(ex.brut(), ex.classe, ex.dminus_km, ex.nuit)
    beta = ajuster(X, y, len(ctrl), l2)
    # le terrain habituel de l'athlète : la part moyenne de la carte dans le logit de ses
    # fenêtres d'apprentissage (référence des surcoûts de terrain, twin.terrain)
    eta_moyen = float(np.mean(X[:, len(ctrl):] @ beta[len(ctrl):])) if carte else 0.0
    validations = [par_activites] + ([par_regions] if par_regions is not None else [])
    signal = all((v["z"] or 0.0) >= float(cfg.carte.signal_z) for v in validations)
    return {
        **base, "n_regions": len(set(par_reg.tolist())), "l2": l2,
        "pertes_par_l2": {str(k): round(v, 5) for k, v in pertes.items()},
        "encodage": enc.to_json(), "colonnes": ctrl + carte,
        "coefficients": [round(float(b), 6) for b in beta],
        "eta_carte_moyen": round(eta_moyen, 6),
        "validation": {"activites": par_activites, "regions": par_regions},
        "signal": bool(signal),
    }


# --------------------------------------------------------------------------- application
def _lineaire(modele: dict, lignes: list[dict], classe, dminus_km, nuit) -> tuple[np.ndarray, np.ndarray]:
    """(η total, η de la seule carte) de chaque ligne."""
    enc = Encodage.depuis_json(modele["encodage"])
    ctrl, _ = enc.colonnes()
    X = enc.matrice(_colonnes_brutes(lignes), classe, dminus_km, nuit)
    b = np.asarray(modele["coefficients"], dtype=float)
    return X @ b, X[:, len(ctrl):] @ b[len(ctrl):]


def fenetres_du_parcours(c: Carte, cfg: Config) -> dict:
    """Pour chaque tranche, la fenêtre de ``twin.terrain_window_m`` centrée sur elle : pente
    moyenne, classe, descente ou non, variables de la carte."""
    t = c.tranches
    demi = float(cfg.twin.terrain_window_m) / 2.0
    bords = np.asarray(cfg.twin.terrain_grade_classes, dtype=float)
    i0 = np.searchsorted(t.x_m, t.x_m - demi, "left")
    i1 = np.searchsorted(t.x_m, t.x_m + demi, "right")
    cumul = np.concatenate([[0.0], np.cumsum(t.pente)])
    pente = (cumul[i1] - cumul[i0]) / np.maximum(i1 - i0, 1)
    return {"pente": pente, "classe": np.searchsorted(bords, pente, side="left"),
            "descente": pente <= cfg.twin.terrain_descent_grade,
            "lignes": [variables_de_fenetre(c, x - demi, x + demi) for x in t.x_m]}


def probabilites(c: Carte, modele: dict, cfg: Config, *, nuit=None, frais: bool = False,
                 fenetres: dict | None = None) -> dict:
    """P(hachée) de chaque tranche en descente d'une carte de parcours (NaN ailleurs) ; la
    part de la seule carte dans le logit (``eta_carte``) ; ``p_ref``, P(hachée) à la même
    pente et au même D− sur le terrain habituel de l'athlète (la part de la carte remplacée
    par sa moyenne d'apprentissage). ``frais`` : D− déjà descendu et nuit à zéro, pour
    comparer des parties de parcours sur le seul terrain."""
    if not modele.get("coefficients"):
        raise ValueError("modèle sans coefficients : " + str(modele.get("raison", "")))
    t = c.tranches
    f = fenetres if fenetres is not None else fenetres_du_parcours(c, cfg)
    dminus = np.zeros(t.n) if frais else t.dminus_m / 1000.0
    n = [0] * t.n if (frais or nuit is None) else [int(bool(x)) for x in nuit]
    eta, eta_carte = _lineaire(modele, f["lignes"], f["classe"], dminus, n)
    eta_ref = eta - eta_carte + float(modele.get("eta_carte_moyen") or 0.0)
    return {"p": np.where(f["descente"], _sigmoide(eta), np.nan),
            "p_ref": np.where(f["descente"], _sigmoide(eta_ref), np.nan),
            "eta_carte": np.where(f["descente"], eta_carte, np.nan),
            "descente": f["descente"]}


def identite(modele: dict) -> dict:
    """Ce qu'un profil de terrain garde du modèle qui l'a fait."""
    return {k: modele.get(k) for k in ("sources", "until", "signal", "n_fenetres", "n_hachees",
                                       "n_activites", "l2")}


def profil_de_terrain(c: Carte, modele: dict, cfg: Config, *, nom: str | None = None,
                      longueur_km: float | None = None) -> dict:
    """Le profil de terrain d'un parcours pour le moteur (``twin.terrain``) : km officiel de
    chaque tranche, descente, P(hachée) sous la carte et sur le terrain habituel, au D− du
    parcours, de jour."""
    pr = probabilites(c, modele, cfg)
    t = c.tranches

    def _l(a):
        return [None if not np.isfinite(x) else round(float(x), 4) for x in a]

    return {"version": 1, "course": nom, "longueur_km": longueur_km, "pas_m": t.pas_m,
            "km": [round(float(x), 4) for x in t.km], "descente": [bool(x) for x in pr["descente"]],
            "p_carte": _l(pr["p"]), "p_ref": _l(pr["p_ref"]), "modele": identite(modele),
            "attributions": list(c.attributions)}


def sources_compatibles(modele: dict, c: Carte) -> list[str]:
    """Les sources dont la carte et le modèle diffèrent (vide : compatibles)."""
    a, b = modele.get("sources") or {}, c.sources or {}
    return sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k))


__all__ = ["Encodage", "Exemples", "ajuster", "apprendre", "auc", "fenetres_du_parcours", "identite",
           "probabilites", "profil_de_terrain", "regions", "sources_compatibles",
           "variables_de_fenetre"]
