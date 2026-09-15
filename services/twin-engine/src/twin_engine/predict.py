"""Prédiction auto-cohérente + Monte-Carlo + validation croisée (twin-theory §4–5).

Plus la course est longue, plus la vitesse baisse — mais la durée dépend de cette
vitesse. On résout le **point fixe** ``T = Deq / v(T)``. L'incertitude vient d'un
**Monte-Carlo** (tirages de v dans sa loi prédictive). La fiabilité est mesurée par
**validation croisée leave-one-out** sur les vrais ultras → indice de confiance imprimé
et critère de suffisance.

Lien de la régression (Phase 1, A2) : en lien ``log`` (ln v = a + b·ln T + c·D+/km) le
point fixe est ANALYTIQUE, ``T = exp((ln Deq − a − c·D+/km)/(1 + b))``, le Monte-Carlo n'a
plus de plancher de vitesse, et toute l'incertitude (LOO, scores, bandes) s'exprime en
log de T — les bandes en heures deviennent asymétriques, ``T·exp(±h)``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

from ._stats import student_t_quantile, weighted_median
from .calibration import (REGIME_REGRESSION, UltraCalibration, _regression_beta,
                          night_deviations, stops_statistics)
from .config import Config
from .twin.model import Twin

logger = logging.getLogger(__name__)

STUDENTIZED_SOURCES = ("studentized_scale", "studentized_scale_mad", "studentized_scale_signed")


@dataclass(frozen=True)
class CrossValidation:
    errors_pct: list[float]
    mae_pct: float
    rmse_pct: float
    n: int
    points: list[tuple[float, float]]  # (temps réel h, temps prédit hors-échantillon h)
    # Gate honnête (§4.3) : séparer les plis d'INTERPOLATION (point retiré dans l'enveloppe des
    # prédicteurs restants) des plis d'EXTRAPOLATION (point retiré au bord = min/max de ln T ou
    # de D+/km). Un seul pli d'extrapolation ne doit pas décider du « vendable ».
    mae_interpolation_pct: float | None = None
    mae_extrapolation_pct: float | None = None
    is_extrapolation: list[bool] = field(default_factory=list)
    n_interpolation: int = 0
    n_extrapolation: int = 0
    # ingrédients du conforme normalisé (S5) : poids et écart-type prédictif RELATIF de
    # chaque pli (même β-covariance que le modèle servi) — internes, pas dans to_dict.
    # En lien log, ``fold_rel_sd`` est l'écart-type de ln T au pli et ``fold_log_errors``
    # le log du rapport prédit/réel : c'est ce couple que les scores studentisés utilisent.
    fold_weights: list[float] = field(default_factory=list)
    fold_rel_sd: list[float] = field(default_factory=list)
    fold_log_errors: list[float] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "mae_pct": round(self.mae_pct, 2),
            "rmse_pct": round(self.rmse_pct, 2),
            "n": self.n,
            "errors_pct": [round(e, 2) for e in self.errors_pct],
            "mae_interpolation_pct": None if self.mae_interpolation_pct is None
            else round(self.mae_interpolation_pct, 2),
            "mae_extrapolation_pct": None if self.mae_extrapolation_pct is None
            else round(self.mae_extrapolation_pct, 2),
            "n_interpolation": self.n_interpolation,
            "n_extrapolation": self.n_extrapolation,
        }


@dataclass
class Prediction:
    finish_hours: float
    v_kmh: float                 # vitesse ajustée moyenne de course
    deq_km: float
    dplus_per_km: float
    interval_low_h: float
    interval_high_h: float
    mc_samples: np.ndarray
    regime: str
    sigma_kmh: float
    vc_fraction: float | None    # v / VC (intensité relative)
    cross_validation: CrossValidation | None
    interval_source: str = "mc"  # source RÉELLEMENT servie (repli possible vers "mc")
    # FOURCHETTE DE COURSE servie (bande de planification, couverture nominale
    # plan_window_high−low, défaut 50 %) : même source que les bornes de sécurité.
    # None (objets construits à la main / anciens replis) ⇒ le pacing retombe sur les
    # percentiles Monte-Carlo — comportement historique.
    plan_low_h: float | None = None
    plan_high_h: float | None = None
    # écart-type prédictif RELATIF de la cible (levier complet en régression, σ/v en repli ;
    # en lien log : écart-type de ln T) et levier x₀ᵀ(XᵀWX)⁻¹x₀ de la cible — la lecture de
    # A1 ; None hors régression
    sd_rel: float | None = None
    leverage: float | None = None
    # facteur d'échelle studentisé servi (A3) : κ et degrés de liberté, None sinon
    scale_kappa: float | None = None
    scale_dof: float | None = None
    # --- Phase 2 : temps réel = mouvement + arrêts, nuit, environnement ----------------------
    # ``finish_hours`` est le temps ÉCOULÉ ; en modèle ``carved`` mouvement = écoulé.
    moving_hours: float | None = None
    stops_hours: float | None = None
    stops_model: str = "carved"            # carved | personal | spec — ce que le plan doit répartir
    stops_rate: float | None = None        # taux d'arrêt appliqué à la cible (h par h de mouvement)
    night_share_target: float | None = None   # part de nuit de la cible sur le temps prédit
    night_dev: float | None = None            # écart à la part de nuit moyenne des ultras
    env_factor: float | None = None           # facteur de vitesse d'environnement servi (1 = rien)
    env_detail: dict | None = None

    def to_dict(self) -> dict:
        def _r(v, n=4):
            return None if v is None else round(v, n)

        return {
            "finish_hours": round(self.finish_hours, 3),
            "v_kmh": round(self.v_kmh, 3),
            "deq_km": round(self.deq_km, 2),
            "dplus_per_km": round(self.dplus_per_km, 2),
            "interval_80_low_h": round(self.interval_low_h, 3),
            "interval_80_high_h": round(self.interval_high_h, 3),
            "plan_low_h": None if self.plan_low_h is None else round(self.plan_low_h, 3),
            "plan_high_h": None if self.plan_high_h is None else round(self.plan_high_h, 3),
            "interval_source": self.interval_source,
            "regime": self.regime,
            "sigma_kmh": round(self.sigma_kmh, 3),
            "vc_fraction": None if self.vc_fraction is None else round(self.vc_fraction, 3),
            "sd_rel": _r(self.sd_rel),
            "leverage": _r(self.leverage, 3),
            "scale_kappa": _r(self.scale_kappa, 3),
            "scale_dof": _r(self.scale_dof, 2),
            "moving_hours": _r(self.moving_hours, 3),
            "stops_hours": _r(self.stops_hours, 3),
            "stops_model": self.stops_model,
            "stops_rate": _r(self.stops_rate, 4),
            "night_share_target": _r(self.night_share_target, 4),
            "night_dev": _r(self.night_dev, 4),
            "env_factor": _r(self.env_factor, 4),
            "env_detail": self.env_detail,
            "cross_validation": None if self.cross_validation is None else self.cross_validation.to_dict(),
        }


def _solve_fixed_point(deq_km: float, dpk: float, vfunc, cfg: Config) -> float | None:
    """Résout T = Deq / v(T) par itération amortie. ``vfunc(T, dpk) -> v[km/h]``."""
    t = 20.0
    floor = cfg.prediction.v_floor_kmh
    for _ in range(200):
        v = vfunc(t, dpk)
        if v is None or v <= 0:
            return None
        tn = deq_km / max(v, floor)
        if abs(tn - t) < 1e-5:
            return tn
        t = 0.5 * t + 0.5 * tn
    # cas pathologique (jamais vu sur des v(T) lisses) : on garde la valeur mais on le SIGNALE
    logger.warning("point fixe non convergé après 200 itérations (T≈%.2f h) — valeur conservée", t)
    return t


_LOG_DENOM_FLOOR = 0.05   # 1 + b sous ce seuil : pente en durée absurde, point fixe non défini


def _fixed_point_log(deq_km: float, dpk: float, beta, offset: float = 0.0) -> float | None:
    """Point fixe ANALYTIQUE du lien log : ln T = ln Deq − a − b·ln T − c·D+/km − offset ⇒
    T = exp((ln Deq − a − c·D+/km − offset)/(1 + b)). ``offset`` porte les termes qui
    s'ajoutent à l'intercept (nuit d·écart, environnement ln f). Aucun plancher de vitesse
    n'est nécessaire ; ``1 + b ≤ 0`` (allure qui s'effondre avec la durée) n'a pas de
    solution → None."""
    a, b, c = float(beta[0]), float(beta[1]), float(beta[2])
    denom = 1.0 + b
    if denom <= _LOG_DENOM_FLOOR:
        return None
    return float(np.exp((np.log(deq_km) - a - c * dpk - offset) / denom))


def _night_grid(night_fn, t_center: float) -> tuple[np.ndarray, np.ndarray] | None:
    """Part de nuit de la cible tabulée sur une grille de temps écoulés autour du central
    (0,3 T à 3 T) : le Monte-Carlo l'interpole pour chaque tirage au lieu d'intégrer le
    calendrier solaire 5 000 fois."""
    if night_fn is None:
        return None
    grid = np.linspace(max(0.3 * t_center, 0.5), 3.0 * t_center, 48)
    return grid, np.array([night_fn(float(t)) for t in grid])


def _mc_predictive(
    deq_km: float, dpk: float, calibration: UltraCalibration, cfg: Config, rng,
    *, night_dev0: float = 0.0, night_grid=None, env_log: float = 0.0,
) -> np.ndarray:
    """Tirages de la LOI PRÉDICTIVE complète du temps de MOUVEMENT (mode
    ``mc_mode=predictive``, revue C3).

    Deux termes d'incertitude que le mode historique ``sigma_only`` ignore :
      1. **paramètres** : β ~ N(β̂, σ²(XᵀWX)⁻¹) — le levier x₀ᵀ(XᵀWX)⁻¹x₀ élargit
         l'intervalle quand la cible SORT de l'enveloppe (ln T, D+/km) d'entraînement,
         exactement là où la LOO marque des plis d'extrapolation ;
      2. **rétroaction du point fixe** : chaque tirage re-résout T = Deq/v(T) (vectorisé)
         — un tirage lent allonge T donc abaisse encore v(T) (queue droite plus lourde).

    Lien log (A2) : le point fixe de chaque tirage est analytique, pas de plancher —
    ``ln T = (ln Deq − a − c·D+/km − d·écart − ln f − ε)/(1 + b)``. Le terme de nuit (C2)
    lit l'écart de part de nuit de chaque tirage sur ``night_grid`` (part de nuit de la cible
    en fonction du temps écoulé), re-évalué trois fois ; ``env_log`` = ln du facteur
    d'environnement (C3). Les arrêts sont ajoutés par l'appelant.
    """
    n = cfg.prediction.mc_n
    coef_hat = calibration.coef_vector
    cov = np.asarray(calibration.beta_cov, dtype=float)
    k = cov.shape[0]
    coefs = rng.multivariate_normal(coef_hat[:k], cov, size=n)          # (n, k)
    eps = rng.normal(0.0, calibration.sigma_link, n)
    has_night = calibration.has_night_term and k >= 4
    dev = np.full(n, float(night_dev0))
    n_bar = calibration.night_share_mean or 0.0

    def _dev_of(t_moving: np.ndarray) -> np.ndarray:
        if not has_night or night_grid is None:
            return dev
        t_el = np.array([calibration.elapsed_from_moving(float(x)) for x in t_moving]) \
            if calibration.stops_elasticity else t_moving * (1.0 + calibration.stops_rate_at(1.0))
        return np.interp(t_el, night_grid[0], night_grid[1]) - n_bar

    if calibration.link == "log":
        denom = np.maximum(1.0 + coefs[:, 1], _LOG_DENOM_FLOOR)
        base = np.log(deq_km) - coefs[:, 0] - coefs[:, 2] * dpk - env_log - eps
        t = np.exp(base / denom)
        if has_night and night_grid is not None:
            for _ in range(3):
                dev = _dev_of(t)
                t = np.exp((base - coefs[:, 3] * dev) / denom)
        elif has_night:
            t = np.exp((base - coefs[:, 3] * dev) / denom)
        return t
    floor = cfg.prediction.v_floor_kmh
    env_f = float(np.exp(env_log))
    t = np.full(n, 20.0)
    tn = t
    for it in range(500):
        eta = coefs[:, 0] + coefs[:, 1] * np.log(t) + coefs[:, 2] * dpk + eps
        if has_night:
            if night_grid is not None and it % 20 == 0:
                dev = _dev_of(t)
            eta = eta + coefs[:, 3] * dev
        v = np.maximum(eta * env_f, floor)
        tn = deq_km / v
        if float(np.max(np.abs(tn - t))) < 1e-5:
            return tn
        t = 0.5 * t + 0.5 * tn
    # quelques tirages extrêmes (β aberrants d'une covariance très large) peuvent osciller :
    # ils restent bornés (v ≥ plancher ⇒ T ≤ Deq/plancher) et les percentiles 10/90 y sont
    # insensibles — on compte et on signale, sans casser la prédiction.
    bad = int(np.sum(np.abs(tn - t) > 1e-3 * np.maximum(t, 1.0)))
    if bad:
        logger.warning("MC prédictif : %d/%d tirages non convergés (bornés, percentiles robustes).",
                       bad, n)
    return t


def _x_row(calibration: UltraCalibration, t_h: float, dpk: float, night_dev: float) -> np.ndarray:
    """Vecteur de prédicteurs de la cible dans l'ordre des colonnes du design servi."""
    x = [1.0, float(np.log(t_h)), float(dpk)]
    if calibration.has_night_term:
        x.append(float(night_dev))
    return np.asarray(x)


def _stops_var_log(calibration: UltraCalibration) -> float:
    """Variance de ln(1 + r) entre ultras — ce que la dispersion des arrêts ajoute à
    l'incertitude du temps écoulé ; 0 en modèle ``carved`` ou sans mesure."""
    if calibration.stops_model == "carved" or not calibration.stops_rate_sd_log:
        return 0.0
    return float(calibration.stops_rate_sd_log) ** 2


def _sd_log_t(t_h: float, dpk: float, calibration: UltraCalibration,
              night_dev: float = 0.0) -> float | None:
    """Écart-type de ln T (mouvement) au point (T, D+/km[, écart de nuit]) en lien log, par
    delta-méthode sur le point fixe analytique : ln T = (ln Deq − a − c·D+/km − d·écart)/(1+b)
    ⇒ ∂lnT/∂(a, b, c, d) = −(1, ln T, D+/km, écart)/(1+b), plus le résidu ε qui entre comme a.
    Inclut donc l'incertitude de la pente ET la rétroaction du point fixe, que le lien
    linéaire ignore ; la dépendance de l'écart de nuit à T est négligée (second ordre)."""
    if calibration.beta is None or calibration.beta_cov is None or t_h <= 0:
        return None
    b = float(calibration.beta[1])
    denom = 1.0 + b
    if denom <= _LOG_DENOM_FLOOR:
        return None
    g = -_x_row(calibration, t_h, dpk, night_dev) / denom
    Sb = np.asarray(calibration.beta_cov, dtype=float)
    var = float(g @ Sb @ g) + (calibration.sigma_link / denom) ** 2
    return float(np.sqrt(max(var, 0.0)))


def sd_rel_target(
    t_point: float, v_point: float | None, dpk: float, calibration: UltraCalibration,
    night_dev: float = 0.0,
) -> float | None:
    """Écart-type prédictif RELATIF au point cible (temps de mouvement ``t_point``) : levier
    complet x₀ᵀ(XᵀWX)⁻¹x₀ en régression (β-covariance disponible), repli σ/v pour blend/vc_e
    — le MÊME normaliseur que la fenêtre empirique groupée du registre (tools/registre). En
    lien log : écart-type de ln T (delta-méthode, :func:`_sd_log_t`). La dispersion
    personnelle des arrêts (modèle ``personal``/``spec``) s'ajoute en quadrature."""
    if v_point is None or v_point <= 0:
        return None
    if calibration.beta_cov is not None:
        if calibration.link == "log":
            base = _sd_log_t(t_point, dpk, calibration, night_dev)
        else:
            x0 = _x_row(calibration, t_point, dpk, night_dev)
            Sb = np.asarray(calibration.beta_cov, dtype=float)
            base = float(np.sqrt(max(calibration.sigma_kmh**2 + x0 @ Sb @ x0, 0.0)) / v_point)
    else:
        base = float(calibration.sigma_kmh / v_point)
    if base is None:
        return None
    return float(np.sqrt(base**2 + _stops_var_log(calibration)))


_sd_rel_target = sd_rel_target   # nom historique


def leverage_target(t_point: float, dpk: float, calibration: UltraCalibration,
                    night_dev: float = 0.0) -> float | None:
    """Levier x₀ᵀ(XᵀWX)⁻¹x₀ de la cible dans l'espace des prédicteurs — sans dimension,
    identique dans les deux liens à pseudo-observations égales (A1 le réduit)."""
    if calibration.beta_cov is None or calibration.sigma_link <= 0:
        return None
    x0 = _x_row(calibration, t_point, dpk, night_dev)
    Sb = np.asarray(calibration.beta_cov, dtype=float)
    return float(x0 @ Sb @ x0 / calibration.sigma_link**2)


def leave_one_out(calibration: UltraCalibration, cfg: Config) -> CrossValidation | None:
    """Réajuste la régression en excluant chaque ultra, prédit son temps, compare au réel.

    Utilise **exactement la même pondération par récence** que la régression réellement servie
    (dans chaque pli ET dans l'agrégation MAE/RMSE), afin que l'indice de confiance reflète le
    modèle utilisé : sur un athlète non stationnaire, les ultras récents (bien prédits) pèsent
    plus que les anciens. Poids égaux ⇒ moyenne simple (le golden reste identique).
    Le lien, le prior de durée, le terme de nuit et le modèle d'arrêts du modèle servi
    s'appliquent à chaque pli : le pli prédit le temps de MOUVEMENT de l'ultra retiré, y
    ajoute les arrêts au taux personnel des autres ultras, et compare au temps ÉCOULÉ réel.
    """
    if not calibration.supports_cross_validation:
        return None
    g = calibration.genuine
    n = len(g)
    link = calibration.link
    H = np.array([u.hours for u in g])
    V = np.array([u.vga_kmh for u in g])
    Y = np.log(V) if link == "log" else V
    dpk = np.array([u.dplus_per_km for u in g])
    deq_each = V * H  # distance ajustée (Deq) de chaque course
    w = (np.asarray(calibration.weights, dtype=float)
         if calibration.weights is not None else np.ones(n))
    night = calibration.has_night_term
    shares = np.array([np.nan if u.night_share is None else float(u.night_share) for u in g])
    stops = calibration.stops_model != "carved"
    # le réel à retrouver : temps écoulé de bout en bout dès qu'un modèle d'arrêts sépare
    # mouvement et arrêts ; sinon la base de vitesse servie (historique)
    real = np.array([(u.elapsed_hours if (stops and u.elapsed_hours is not None) else u.hours)
                     for u in g])

    # Un pli est en EXTRAPOLATION si le point retiré est au bord de l'espace des prédicteurs
    # restants — i.e. il atteint le min OU le max de ln T ou de D+/km sur l'ensemble : le reste
    # ne l'encadre pas, la prédiction hors-échantillon est alors une extrapolation (§4.3).
    lnT = np.log(H)
    lnT_lo, lnT_hi = lnT.min(), lnT.max()
    dpk_lo, dpk_hi = dpk.min(), dpk.max()

    def _is_extrap(i: int) -> bool:
        return bool(
            lnT[i] == lnT_lo or lnT[i] == lnT_hi or dpk[i] == dpk_lo or dpk[i] == dpk_hi
        )

    # écart-type prédictif RELATIF aux points de plis (β-covariance du modèle SERVI) —
    # nourrit le conforme normalisé (S5) : score = |erreur| / sd_pred du pli
    Sb = np.asarray(calibration.beta_cov, dtype=float) if calibration.beta_cov is not None else None

    def _rel_sd(i: int, tp: float, dev_i: float) -> float:
        if Sb is None or V[i] <= 0:
            return float("nan")
        sd = sd_rel_target(tp, V[i], dpk[i], calibration, dev_i)
        return float("nan") if sd is None else sd

    errors: list[float] = []
    log_errors: list[float] = []
    w_used: list[float] = []
    rel_sds: list[float] = []
    points: list[tuple[float, float]] = []
    extrap: list[bool] = []
    for i in range(n):
        keep = [j for j in range(n) if j != i]
        g_keep = [g[j] for j in keep]
        # β du pli : MÊME pondération (récence × maximalité), MÊME mode de terrain, MÊME lien,
        # MÊME prior de durée et MÊME terme de nuit que le fit servi
        dev_keep, dev_i = None, 0.0
        if night:
            dev_keep, mean_keep = night_deviations(g_keep, w[keep])
            if mean_keep is None:
                dev_keep = np.zeros(len(keep))
            elif np.isfinite(shares[i]):
                dev_i = float(shares[i] - mean_keep)
        beta = _regression_beta(H[keep], Y[keep], dpk[keep], w[keep], cfg, link=link,
                                duration_prior=calibration.duration_prior,
                                night_dev=dev_keep, night_prior=calibration.night_prior)
        offset = float(beta[3]) * dev_i if (night and len(beta) > 3) else 0.0
        if link == "log":
            tp = _fixed_point_log(deq_each[i], dpk[i], beta, offset)
        else:
            vfunc = lambda T, d, b=beta, o=offset: b[0] + b[1] * np.log(T) + b[2] * d + o
            tp = _solve_fixed_point(deq_each[i], dpk[i], vfunc, cfg)
        if tp is None:
            continue
        # arrêts du pli : taux personnel des AUTRES ultras (jamais celui de la course retirée)
        tp_el = tp
        if stops:
            st = stops_statistics(g_keep, w[keep], cfg)
            r = float(st["rate"])
            if calibration.stops_elasticity and st["ref_hours"]:
                r *= (tp / st["ref_hours"]) ** calibration.stops_elasticity
            tp_el = tp * (1.0 + max(r, 0.0))
        errors.append(100.0 * (tp_el - real[i]) / real[i])
        log_errors.append(float(np.log(tp_el / real[i])))
        w_used.append(float(w[i]))
        rel_sds.append(_rel_sd(i, tp, dev_i))
        points.append((float(real[i]), float(tp_el)))
        extrap.append(_is_extrap(i))

    if not errors:
        return None
    err = np.asarray(errors)
    wu = np.asarray(w_used)
    ex = np.asarray(extrap, dtype=bool)
    sw = float(wu.sum())

    def _wmae(mask: np.ndarray) -> float | None:
        if not mask.any():
            return None
        m = float(wu[mask].sum())
        return float(np.sum(wu[mask] * np.abs(err[mask])) / m) if m > 0 else None

    return CrossValidation(
        errors_pct=[float(e) for e in err],
        mae_pct=float(np.sum(wu * np.abs(err)) / sw),
        rmse_pct=float(np.sqrt(np.sum(wu * err**2) / sw)),
        n=len(errors),
        points=points,
        mae_interpolation_pct=_wmae(~ex),
        mae_extrapolation_pct=_wmae(ex),
        is_extrapolation=[bool(x) for x in ex],
        n_interpolation=int((~ex).sum()),
        n_extrapolation=int(ex.sum()),
        fold_weights=[float(x) for x in w_used],
        fold_rel_sd=[float(x) for x in rel_sds],
        fold_log_errors=[float(x) for x in log_errors],
    )


def _weighted_quantile(scores: np.ndarray, weights: np.ndarray, q: float) -> float:
    """Quantile pondéré CONSERVATEUR des scores conformes.

    Les poids (récence × maximalité, AUTO-NORMALISÉS au nombre de plis) règlent la
    REPRÉSENTATIVITÉ des plis — sur un athlète non stationnaire, l'erreur des courses
    récentes compte plus, comme partout ailleurs dans le moteur ; la correction d'échantillon
    fini reste « n+1 » (le point cible compte pour un pli, score « +∞ »). À poids égaux on
    retrouve exactement le conforme split standard ⌈(n+1)q⌉ (Vovk ; Lei et al. 2018).
    (La variante stricte de Tibshirani 2019 — masse brute Σw + poids cible — dégénère dès
    que la récence écrase Σw : q(0,50) = q(0,80) = score max, bandes 50/80 confondues.)
    Si la masse des plis ne suffit pas, on rend le score max observé (choix fini le plus
    prudent)."""
    order = np.argsort(scores)
    s = scores[order]
    w = weights[order]
    n = len(s)
    cum = np.cumsum(w) / float(w.sum()) * (n / (n + 1.0))
    idx = int(np.searchsorted(cum, q, side="left"))
    return float(s[min(idx, n - 1)])


def _fold_scores(cv: CrossValidation, calibration: UltraCalibration):
    """Erreurs (signées, dans les unités du lien), sd des plis et poids, filtrés sur les plis
    normalisables. Rend None sous 4 plis — le repli MC des deux bandes."""
    if calibration.link == "log":
        err = np.asarray(cv.fold_log_errors, dtype=float)
    else:
        err = np.asarray(cv.errors_pct, dtype=float) / 100.0
    rel = np.asarray(cv.fold_rel_sd, dtype=float)
    w = np.asarray(cv.fold_weights, dtype=float)
    if len(rel) != len(err) or len(w) != len(err):
        return None
    ok = np.isfinite(err) & np.isfinite(rel) & (rel > 0) & np.isfinite(w) & (w > 0)
    if int(ok.sum()) < 4:
        return None
    return err[ok], rel[ok], w[ok]


def _bands(t_point: float, half_lo: float, half_hi: float, link: str) -> tuple[float, float]:
    """Bornes en heures à partir des demi-largeurs dans les unités du lien : symétriques en
    heures en linéaire, ``T·exp(∓h)`` en log (la borne basse ne peut plus être négative).
    En linéaire, une demi-largeur relative ≥ 1 donnerait une borne basse négative — un temps
    d'arrivée négatif n'a pas de sens, la borne est plafonnée à 0."""
    if link == "log":
        return t_point * float(np.exp(-half_lo)), t_point * float(np.exp(half_hi))
    return max(0.0, t_point * (1.0 - half_lo)), t_point * (1.0 + half_hi)


def _conformal_interval(
    t_point: float,
    sd_rel: float | None,
    cv: CrossValidation | None,
    calibration: UltraCalibration,
    coverage: float,
) -> tuple[float, float] | None:
    """Intervalle CONFORME NORMALISÉ (S5, ``interval_source=conformal_normalized``) à la
    couverture nominale demandée (0,80 pour les bornes de sécurité, 0,50 pour la fourchette
    de course — les deux bandes partagent les mêmes scores, donc leur emboîtement est garanti).

    Le Monte-Carlo prédictif propage l'incertitude DU MODÈLE ; sa largeur est honnête si le
    modèle l'est. Le conforme cale au contraire la couverture sur les erreurs RÉELLEMENT
    observées en LOO : score de chaque pli = |erreur relative| / sd prédictif relatif du pli
    (normalisation « studentisée », Vovk ; Romano & Candès) — la géométrie du levier est
    conservée (une cible en extrapolation garde un intervalle plus large que les plis
    interpolés), mais l'ÉCHELLE vient des erreurs vraies, pas de la loi supposée.
    ``t_point`` est le temps écoulé servi, ``sd_rel`` l'écart-type prédictif relatif de la
    cible (même normaliseur que les plis). Rend None (⇒ repli MC) sans validation croisée
    exploitable (< 4 plis normalisables).
    """
    if cv is None or calibration.beta_cov is None or sd_rel is None:
        return None
    folds = _fold_scores(cv, calibration)
    if folds is None:
        return None
    err, rel, w = folds
    scores = np.abs(err) / rel
    q = _weighted_quantile(scores, w, coverage)
    half = q * sd_rel
    return _bands(t_point, half, half, calibration.link)


def _studentized_interval(
    t_point: float,
    sd_rel: float | None,
    cv: CrossValidation | None,
    calibration: UltraCalibration,
    cfg: Config,
    coverage: float,
    *,
    variant: str = "studentized_scale",
) -> tuple[tuple[float, float], float, float] | None:
    """Intervalle par FACTEUR D'ÉCHELLE studentisé (A3) : ``(bornes, κ, ν)`` ou None (repli MC).

    Mêmes scores que le conforme (|erreur|/sd du pli, poids récence × maximalité), mais au
    lieu d'un quantile EMPIRIQUE — le 11ᵉ score sur 12 pour le 80 %, un seul pli fixe la
    borne — on estime une ÉCHELLE κ et on lit le quantile sur une loi de Student à
    ν = n_eff − p degrés de liberté (p = nombre de coefficients ajustés) :

    * ``studentized_scale`` : κ = RMS pondéré des scores — l'estimateur naturel de l'échelle
      d'une Student, qui utilise chaque pli ;
    * ``studentized_scale_mad`` : κ = 1,4826 × médiane pondérée des scores — robuste à un pli
      aberrant, plus bruyant à petit n (mesuré, pas adopté) ;
    * ``studentized_scale_signed`` : κ séparé par signe de l'erreur (prédit trop lent ⇒ le réel
      est SOUS la prédiction ⇒ échelle de la borne basse) — asymétrie apprise, repli sur le
      κ commun quand un côté a moins de 2 plis.
    Demi-largeur = t_ν(½ + couverture/2) · κ · sd_pred(cible), bornes selon le lien."""
    if cv is None or calibration.beta_cov is None or sd_rel is None:
        return None
    folds = _fold_scores(cv, calibration)
    if folds is None:
        return None
    err, rel, w = folds
    s = np.abs(err) / rel
    wn = w / float(w.sum())
    n_eff = float(w.sum()) ** 2 / float(np.sum(w**2))
    p = (2 if cfg.calibration.terrain_term == "none" else 3) + (1 if calibration.has_night_term else 0)
    dof = max(n_eff - p, 1.0)
    tq = student_t_quantile(0.5 + coverage / 2.0, dof)

    def _rms(mask: np.ndarray) -> float | None:
        if int(mask.sum()) < 2:
            return None
        return float(np.sqrt(np.sum(wn[mask] * s[mask]**2) / np.sum(wn[mask])))

    if variant == "studentized_scale_mad":
        kappa = 1.4826 * weighted_median(s, wn)
    else:
        kappa = float(np.sqrt(np.sum(wn * s**2)))
    if kappa <= 0:
        return None
    kappa_lo = kappa_hi = kappa
    if variant == "studentized_scale_signed":
        # erreur > 0 : prédit trop LENT, le réel est en dessous → borne BASSE
        k_lo, k_hi = _rms(err > 0), _rms(err < 0)
        kappa_lo = kappa if k_lo is None else k_lo
        kappa_hi = kappa if k_hi is None else k_hi
    bands = _bands(t_point, tq * kappa_lo * sd_rel, tq * kappa_hi * sd_rel, calibration.link)
    return bands, kappa, dof


def night_share_function(race, cfg: Config):
    """Part de nuit de la cible en fonction de son temps ÉCOULÉ (heures), lue sur le
    calendrier de la spec (départ local, position, fuseau) par le test jour/nuit du plan ;
    None sans spec complète. Mémoïsée au centième d'heure."""
    if race is None or race.start_time is None or race.lat is None or race.lon is None:
        return None
    from .pacing.sun import night_share   # import différé : pacing dépend de predict

    start, lat, lon, tz = race.start_time, float(race.lat), float(race.lon), float(race.tz_offset_h)
    cache: dict[float, float] = {}

    def f(hours: float) -> float:
        key = round(float(hours), 2)
        if key not in cache:
            cache[key] = night_share(start, max(key, 0.0), lat, lon, tz) if key > 0 else 0.0
        return cache[key]

    return f


def environment_factor(course, race, calibration: UltraCalibration, cfg: Config
                       ) -> tuple[float, dict | None]:
    """Facteur multiplicatif de vitesse du terme d'environnement (C3, ``environment_term=
    declared``) et son détail : chaleur DÉCLARÉE au-dessus de la référence, altitude moyenne
    du parcours au-dessus de l'altitude moyenne pondérée des vrais ultras. (1, None) si le
    terme est inactif ou sans entrée."""
    p = cfg.prediction
    if p.environment_term != "declared":
        return 1.0, None
    detail: dict = {"heat_c": None, "heat_cost": 0.0, "alt_course_m": None, "alt_ref_m": None,
                    "alt_cost": 0.0}
    heat = getattr(race, "heat_c", None) if race is not None else None
    if heat is not None:
        detail["heat_c"] = float(heat)
        detail["heat_cost"] = float(p.heat_cost_per_c) * max(float(heat) - float(p.heat_ref_c), 0.0)
    alt_grid = getattr(course, "alt_smooth_m", None)
    if alt_grid is not None and np.size(alt_grid) and np.isfinite(alt_grid).any():
        alt_course = float(np.nanmean(alt_grid))
        detail["alt_course_m"] = alt_course
        w = (np.asarray(calibration.weights, dtype=float) if calibration.weights is not None
             else np.ones(len(calibration.genuine)))
        alts = np.array([np.nan if g.mean_alt_m is None else float(g.mean_alt_m)
                         for g in calibration.genuine], dtype=float)
        ok = np.isfinite(alts) & (w > 0)
        if ok.any():
            alt_ref = float(np.sum(w[ok] * alts[ok]) / np.sum(w[ok]))
            detail["alt_ref_m"] = alt_ref
            detail["alt_cost"] = float(p.altitude_cost_per_km) * max(alt_course - alt_ref, 0.0) / 1000.0
    factor = max(1.0 - detail["heat_cost"] - detail["alt_cost"], 0.5)
    detail["factor"] = factor
    return factor, detail


def predict_finish(
    deq_km: float,
    dplus_per_km: float,
    twin: Twin,
    calibration: UltraCalibration,
    cfg: Config,
    *,
    night_fn=None,
    env_factor: float = 1.0,
    env_detail: dict | None = None,
    spec_stops_h: float | None = None,
) -> Prediction | None:
    """Prédiction du temps de course : point fixe du temps de MOUVEMENT (nuit et environnement
    compris), arrêts selon le modèle servi, Monte-Carlo, validation croisée et bandes —
    tout dans le même lien et avec les mêmes termes que la calibration.

    ``night_fn`` : part de nuit de la cible en fonction du temps écoulé (None = écart nul) ;
    ``env_factor`` : facteur de vitesse d'environnement (1 = rien) ; ``spec_stops_h`` :
    arrêts de la politique du plan pour la cible (modèle ``spec``)."""
    if not calibration.can_predict:
        return None
    night = calibration.has_night_term and night_fn is not None
    n_bar = calibration.night_share_mean or 0.0
    env_log = float(np.log(env_factor)) if env_factor > 0 else 0.0
    is_reg = calibration.regime == REGIME_REGRESSION

    def _solve(dev: float) -> float | None:
        if is_reg and calibration.link == "log":
            offset = (float(calibration.night_coef) * dev if calibration.has_night_term else 0.0) + env_log
            return _fixed_point_log(deq_km, dplus_per_km, calibration.beta, offset)
        vfunc = lambda T, d: (None if (v := calibration.predict_vga_kmh(T, d, dev)) is None
                              else v * env_factor)
        return _solve_fixed_point(deq_km, dplus_per_km, vfunc, cfg)

    # point fixe itéré sur l'écart de nuit : la part de nuit dépend du temps écoulé, qui
    # dépend de la vitesse, qui dépend de la nuit — quelques allers-retours suffisent
    dev = 0.0
    t_mov = _solve(dev)
    if t_mov is None:
        return None
    t_el = calibration.elapsed_from_moving(t_mov, spec_stops_h=spec_stops_h)
    share_target = None
    if night:
        for _ in range(8):
            share_target = float(night_fn(t_el))
            dev_new = share_target - n_bar
            if abs(dev_new - dev) < 1e-4:
                dev = dev_new
                break
            dev = dev_new
            t_new = _solve(dev)
            if t_new is None:
                return None
            t_mov = t_new
            t_el = calibration.elapsed_from_moving(t_mov, spec_stops_h=spec_stops_h)
        share_target = float(night_fn(t_el))
    elif night_fn is not None:
        share_target = float(night_fn(t_el))
    v_point = calibration.predict_vga_kmh(t_mov, dplus_per_km, dev)
    if v_point is not None:
        v_point *= env_factor
    rate = calibration.stops_rate_at(t_mov)

    # --- Monte-Carlo (temps de mouvement, puis arrêts) ---
    rng = np.random.default_rng(cfg.prediction.mc_seed)
    if (
        cfg.prediction.mc_mode == "predictive"
        and is_reg
        and calibration.beta_cov is not None
    ):
        # loi prédictive complète : β-covariance (levier) + résidu + point fixe par tirage
        grid = _night_grid(night_fn, t_el) if night else None
        mc_mov = _mc_predictive(deq_km, dplus_per_km, calibration, cfg, rng,
                                night_dev0=dev, night_grid=grid, env_log=env_log)
    else:
        # chemin historique (ancien défaut sigma_only ; replis blend/vc_e) — inchangé au bit près
        vp = v_point + rng.normal(0.0, calibration.sigma_kmh, cfg.prediction.mc_n)
        vp = np.maximum(vp, cfg.prediction.v_floor_kmh)
        mc_mov = deq_km / vp
    if calibration.stops_model == "carved":
        mc = mc_mov
    else:
        # arrêts par tirage : modèle servi × dispersion personnelle de ln(1 + r)
        if calibration.stops_model == "spec" and spec_stops_h is not None:
            mc = mc_mov + float(spec_stops_h)
        else:
            rates = np.array([calibration.stops_rate_at(float(x)) for x in mc_mov]) \
                if calibration.stops_elasticity else np.full(mc_mov.shape, rate)
            noise = rng.normal(0.0, float(np.sqrt(_stops_var_log(calibration))), mc_mov.shape)
            mc = mc_mov * (1.0 + rates) * np.exp(noise)
    low = float(np.percentile(mc, cfg.prediction.interval_low_pct))
    high = float(np.percentile(mc, cfg.prediction.interval_high_pct))

    # --- les DEUX bandes servies partagent la même source ---
    # ``mc`` : percentiles du Monte-Carlo (10/90 pour la sécurité, 25/75 pour la fourchette
    # de course). ``conformal_normalized`` / ``studentized_scale*`` : mêmes couvertures
    # nominales, mais étalonnées sur les erreurs LOO réelles — la LOO est donc calculée AVANT
    # le choix.
    cv = leave_one_out(calibration, cfg)
    sd_rel = sd_rel_target(t_mov, v_point, dplus_per_km, calibration, dev)
    plan_low = float(np.percentile(mc, cfg.pacing.plan_window_low_pct))
    plan_high = float(np.percentile(mc, cfg.pacing.plan_window_high_pct))
    interval_source = "mc"
    scale_kappa = scale_dof = None
    cov_safety = (cfg.prediction.interval_high_pct - cfg.prediction.interval_low_pct) / 100.0
    cov_plan = (cfg.pacing.plan_window_high_pct - cfg.pacing.plan_window_low_pct) / 100.0
    src = cfg.prediction.interval_source
    if src == "conformal_normalized":
        ci = _conformal_interval(t_el, sd_rel, cv, calibration, cov_safety)
        pi = _conformal_interval(t_el, sd_rel, cv, calibration, cov_plan)
        if ci is not None and pi is not None:
            plan_low, plan_high = pi
            # garde-fou de COHÉRENCE : sécurité ⊇ fourchette de course (déjà garanti par
            # q(0,80) ≥ q(0,50) sur les mêmes scores ; le min/max blinde le cas dégénéré)
            low, high = min(ci[0], pi[0]), max(ci[1], pi[1])
            interval_source = "conformal_normalized"
    elif src in STUDENTIZED_SOURCES:
        si = _studentized_interval(t_el, sd_rel, cv, calibration, cfg, cov_safety, variant=src)
        pi_s = _studentized_interval(t_el, sd_rel, cv, calibration, cfg, cov_plan, variant=src)
        if si is not None and pi_s is not None:
            (lo_c, hi_c), scale_kappa, scale_dof = si
            (plan_low, plan_high), _, _ = pi_s
            low, high = min(lo_c, plan_low), max(hi_c, plan_high)
            interval_source = src
    elif src == "pooled":
        # fenêtre EMPIRIQUE groupée (§9.9) : quantiles appris du REGISTRE (conditions
        # vendables, tous athlètes), à l'échelle du sd prédictif de la cible. Tant que les
        # quantiles ne sont pas renseignés (jauge non atteinte), repli percentiles MC.
        pq50, pq80 = cfg.prediction.pooled_q50, cfg.prediction.pooled_q80
        if pq50 is not None and pq80 is not None and sd_rel is not None:
            plan_low, plan_high = _bands(t_el, pq50 * sd_rel, pq50 * sd_rel, calibration.link)
            lo_c, hi_c = _bands(t_el, pq80 * sd_rel, pq80 * sd_rel, calibration.link)
            # emboîtement garanti même si q80 < q50 (mauvaise config) : min/max de blindage
            low, high = min(lo_c, plan_low), max(hi_c, plan_high)
            interval_source = "pooled"

    # % de VC seulement si la VC est plausible (sinon on n'affiche pas un ratio trompeur)
    cs = twin.critical_speed
    vc_fraction = None
    if cs is not None and cs.plausible and cs.vc_ms and v_point is not None:
        vc_fraction = v_point / (cs.vc_ms * 3.6)

    return Prediction(
        finish_hours=float(t_el),
        v_kmh=float(v_point),
        deq_km=float(deq_km),
        dplus_per_km=float(dplus_per_km),
        interval_low_h=low,
        interval_high_h=high,
        mc_samples=mc,
        regime=calibration.regime,
        sigma_kmh=calibration.sigma_kmh,
        vc_fraction=vc_fraction,
        cross_validation=cv,
        interval_source=interval_source,
        plan_low_h=plan_low,
        plan_high_h=plan_high,
        sd_rel=sd_rel,
        leverage=(leverage_target(t_mov, dplus_per_km, calibration, dev) if is_reg else None),
        scale_kappa=scale_kappa,
        scale_dof=scale_dof,
        moving_hours=float(t_mov),
        stops_hours=float(t_el - t_mov),
        stops_model=calibration.stops_model,
        stops_rate=(None if calibration.stops_model == "carved" else float(rate)),
        night_share_target=share_target,
        night_dev=(float(dev) if night else None),
        env_factor=(None if env_detail is None else float(env_factor)),
        env_detail=env_detail,
    )


def predict_race(course, twin: Twin, calibration: UltraCalibration, cfg: Config,
                 race=None) -> Prediction | None:
    """Wrapper : prend un :class:`CourseProfile` (utilise Deq et D+/km) et, s'il est fourni,
    le :class:`RaceSpec` — calendrier de course pour la nuit (C2), chaleur déclarée et
    altitude du parcours pour l'environnement (C3), politique d'arrêts pour le modèle
    ``spec`` (B4). Sans spec : écart de nuit nul, pas de coût, arrêts au taux personnel."""
    from .course.spec import stops_policy_min

    night_fn = night_share_function(race, cfg) if calibration.has_night_term else None
    env_f, env_detail = environment_factor(course, race, calibration, cfg)
    spec_stops_h = None
    if calibration.stops_model == "spec":
        major = race.major_base_indices if race is not None else ()
        spec_stops_h = float(stops_policy_min(len(course.segments), major, cfg).sum() / 60.0)
    return predict_finish(course.deq_km, course.dplus_per_km, twin, calibration, cfg,
                          night_fn=night_fn, env_factor=env_f, env_detail=env_detail,
                          spec_stops_h=spec_stops_h)


__all__ = ["CrossValidation", "Prediction", "predict_finish", "predict_race", "leave_one_out",
           "sd_rel_target", "leverage_target", "night_share_function", "environment_factor",
           "STUDENTIZED_SOURCES"]
