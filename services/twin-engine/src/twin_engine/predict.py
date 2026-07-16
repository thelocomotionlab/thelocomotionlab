"""Prédiction auto-cohérente + Monte-Carlo + validation croisée (twin-theory §4–5).

Plus la course est longue, plus la vitesse baisse — mais la durée dépend de cette
vitesse. On résout le **point fixe** ``T = Deq / v(T)``. L'incertitude vient d'un
**Monte-Carlo** (tirages de v dans sa loi prédictive). La fiabilité est mesurée par
**validation croisée leave-one-out** sur les vrais ultras → indice de confiance imprimé
et critère de suffisance.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

from .calibration import (
    REGIME_REGRESSION,
    UltraCalibration,
    _regression_beta,
    trend_axis_years,
)
from .config import Config
from .twin.model import Twin

logger = logging.getLogger(__name__)


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
    # chaque pli (même β-covariance que le modèle servi) — internes, pas dans to_dict
    fold_weights: list[float] = field(default_factory=list)
    fold_rel_sd: list[float] = field(default_factory=list)

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

    def to_dict(self) -> dict:
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


def _mc_predictive(
    deq_km: float, dpk: float, calibration: UltraCalibration, cfg: Config, rng
) -> np.ndarray:
    """Tirages de la LOI PRÉDICTIVE complète (mode ``mc_mode=predictive``, revue C3).

    Deux termes d'incertitude que le mode historique ``sigma_only`` ignore :
      1. **paramètres** : β ~ N(β̂, σ²(XᵀWX)⁻¹) — le levier x₀ᵀ(XᵀWX)⁻¹x₀ élargit
         l'intervalle quand la cible SORT de l'enveloppe (ln T, D+/km) d'entraînement,
         exactement là où la LOO marque des plis d'extrapolation ;
      2. **rétroaction du point fixe** : chaque tirage re-résout T = Deq/v(T) (vectorisé)
         — un tirage lent allonge T donc abaisse encore v(T) (queue droite plus lourde).
    """
    n = cfg.prediction.mc_n
    beta_hat = np.asarray(calibration.beta, dtype=float)
    cov = np.asarray(calibration.beta_cov, dtype=float)
    betas = rng.multivariate_normal(beta_hat, cov, size=n)          # (n, 3)
    eps = rng.normal(0.0, calibration.sigma_kmh, n)
    floor = cfg.prediction.v_floor_kmh
    t = np.full(n, 20.0)
    tn = t
    for _ in range(500):
        v = np.maximum(betas[:, 0] + betas[:, 1] * np.log(t) + betas[:, 2] * dpk + eps, floor)
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


def leave_one_out(calibration: UltraCalibration, cfg: Config) -> CrossValidation | None:
    """Réajuste la régression en excluant chaque ultra, prédit son temps, compare au réel.

    Utilise **exactement la même pondération par récence** que la régression réellement servie
    (dans chaque pli ET dans l'agrégation MAE/RMSE), afin que l'indice de confiance reflète le
    modèle utilisé : sur un athlète non stationnaire, les ultras récents (bien prédits) pèsent
    plus que les anciens. Poids égaux ⇒ moyenne simple (le golden reste identique).
    """
    if not calibration.supports_cross_validation:
        return None
    g = calibration.genuine
    n = len(g)
    H = np.array([u.hours for u in g])
    V = np.array([u.vga_kmh for u in g])
    dpk = np.array([u.dplus_per_km for u in g])
    deq_each = V * H  # distance ajustée (Deq) de chaque course
    w = (np.asarray(calibration.weights, dtype=float)
         if calibration.weights is not None else np.ones(n))

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
    sig = calibration.sigma_kmh

    # Terme de tendance (P1b, §9.13) appliqué À L'IDENTIQUE : quand le modèle servi porte
    # une tendance, chaque pli la ré-ajuste, l'axe temporel re-référencé à la date de l'ultra
    # RETIRÉ (soustraire years[i] décale l'origine sans changer β3) — le pli prédit donc la
    # forme projetée au jour de SA course, comme le fit servi la projette au dernier ultra.
    years = (trend_axis_years(g)
             if cfg.calibration.trend_term == "ridge" and calibration.trend_kmh_per_year is not None
             else None)

    def _rel_sd(i: int) -> float:
        if Sb is None or V[i] <= 0:
            return float("nan")
        x = np.array([1.0, lnT[i], dpk[i]])
        return float(np.sqrt(max(sig**2 + x @ Sb @ x, 0.0)) / V[i])

    errors: list[float] = []
    w_used: list[float] = []
    rel_sds: list[float] = []
    points: list[tuple[float, float]] = []
    extrap: list[bool] = []
    for i in range(n):
        keep = [j for j in range(n) if j != i]
        # β du pli : MÊME pondération (récence × maximalité), MÊME mode de terrain et MÊME
        # terme de tendance que le fit servi ; vfunc n'utilise que (β0, β1, β2) = projection
        # à tendance nulle, c.-à-d. à la date de l'ultra retiré.
        ty = None if years is None else years[keep] - years[i]
        beta = _regression_beta(H[keep], V[keep], dpk[keep], w[keep], cfg, ty)
        vfunc = lambda T, d, b=beta: b[0] + b[1] * np.log(T) + b[2] * d
        tp = _solve_fixed_point(deq_each[i], dpk[i], vfunc, cfg)
        if tp is None:
            continue
        errors.append(100.0 * (tp - H[i]) / H[i])
        w_used.append(float(w[i]))
        rel_sds.append(_rel_sd(i))
        points.append((float(H[i]), float(tp)))
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


def _sd_rel_target(
    t_point: float, v_point: float | None, dpk: float, calibration: UltraCalibration
) -> float | None:
    """Écart-type prédictif RELATIF au point cible : levier complet x₀ᵀ(XᵀWX)⁻¹x₀ en
    régression (β-covariance disponible), repli σ/v pour blend/vc_e — le MÊME normaliseur
    que la fenêtre empirique groupée du registre (tools/registre)."""
    if v_point is None or v_point <= 0:
        return None
    if calibration.beta_cov is not None:
        x0 = np.array([1.0, np.log(t_point), dpk])
        Sb = np.asarray(calibration.beta_cov, dtype=float)
        return float(np.sqrt(max(calibration.sigma_kmh**2 + x0 @ Sb @ x0, 0.0)) / v_point)
    return float(calibration.sigma_kmh / v_point)


def _conformal_interval(
    t_point: float,
    v_point: float,
    dpk: float,
    cv: CrossValidation | None,
    calibration: UltraCalibration,
    cfg: Config,
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
    Rend None (⇒ repli MC) sans validation croisée exploitable (< 4 plis normalisables).
    """
    if cv is None or calibration.beta_cov is None or v_point is None or v_point <= 0:
        return None
    err = np.asarray(cv.errors_pct, dtype=float) / 100.0
    rel = np.asarray(cv.fold_rel_sd, dtype=float)
    w = np.asarray(cv.fold_weights, dtype=float)
    if len(rel) != len(err) or len(w) != len(err):
        return None
    ok = np.isfinite(err) & np.isfinite(rel) & (rel > 0) & np.isfinite(w) & (w > 0)
    if int(ok.sum()) < 4:
        return None
    scores = np.abs(err[ok]) / rel[ok]
    q = _weighted_quantile(scores, w[ok], coverage)
    # sd prédictif relatif AU POINT CIBLE : même levier que le MC prédictif (β-cov garanti
    # non nul par le garde du haut de fonction)
    sd_rel = _sd_rel_target(t_point, v_point, dpk, calibration)
    if sd_rel is None:
        return None
    half = q * sd_rel
    return t_point * (1.0 - half), t_point * (1.0 + half)


def predict_finish(
    deq_km: float,
    dplus_per_km: float,
    twin: Twin,
    calibration: UltraCalibration,
    cfg: Config,
) -> Prediction | None:
    if not calibration.can_predict:
        return None
    t_point = _solve_fixed_point(deq_km, dplus_per_km, calibration.predict_vga_kmh, cfg)
    if t_point is None:
        return None
    v_point = calibration.predict_vga_kmh(t_point, dplus_per_km)

    # --- Monte-Carlo ---
    rng = np.random.default_rng(cfg.prediction.mc_seed)
    if (
        cfg.prediction.mc_mode == "predictive"
        and calibration.regime == REGIME_REGRESSION
        and calibration.beta_cov is not None
    ):
        # loi prédictive complète : β-covariance (levier) + résidu + point fixe par tirage
        mc = _mc_predictive(deq_km, dplus_per_km, calibration, cfg, rng)
    else:
        # chemin historique (ancien défaut sigma_only ; replis blend/vc_e) — inchangé au bit près
        vp = v_point + rng.normal(0.0, calibration.sigma_kmh, cfg.prediction.mc_n)
        vp = np.maximum(vp, cfg.prediction.v_floor_kmh)
        mc = deq_km / vp
    low = float(np.percentile(mc, cfg.prediction.interval_low_pct))
    high = float(np.percentile(mc, cfg.prediction.interval_high_pct))

    # --- les DEUX bandes servies partagent la même source ---
    # ``mc`` : percentiles du Monte-Carlo (10/90 pour la sécurité, 25/75 pour la fourchette
    # de course). ``conformal_normalized`` : mêmes couvertures nominales, mais étalonnées
    # sur les erreurs LOO réelles — la LOO est donc calculée AVANT le choix.
    cv = leave_one_out(calibration, cfg)
    plan_low = float(np.percentile(mc, cfg.pacing.plan_window_low_pct))
    plan_high = float(np.percentile(mc, cfg.pacing.plan_window_high_pct))
    interval_source = "mc"
    if cfg.prediction.interval_source == "conformal_normalized":
        cov_safety = (cfg.prediction.interval_high_pct - cfg.prediction.interval_low_pct) / 100.0
        cov_plan = (cfg.pacing.plan_window_high_pct - cfg.pacing.plan_window_low_pct) / 100.0
        ci = _conformal_interval(t_point, v_point, dplus_per_km, cv, calibration, cfg, cov_safety)
        pi = _conformal_interval(t_point, v_point, dplus_per_km, cv, calibration, cfg, cov_plan)
        if ci is not None and pi is not None:
            plan_low, plan_high = pi
            # garde-fou de COHÉRENCE : sécurité ⊇ fourchette de course (déjà garanti par
            # q(0,80) ≥ q(0,50) sur les mêmes scores ; le min/max blinde le cas dégénéré)
            low, high = min(ci[0], pi[0]), max(ci[1], pi[1])
            interval_source = "conformal_normalized"
    elif cfg.prediction.interval_source == "pooled":
        # fenêtre EMPIRIQUE groupée (§9.9) : quantiles appris du REGISTRE (conditions
        # vendables, tous athlètes), à l'échelle du sd prédictif de la cible. Tant que les
        # quantiles ne sont pas renseignés (jauge non atteinte), repli percentiles MC.
        pq50, pq80 = cfg.prediction.pooled_q50, cfg.prediction.pooled_q80
        sd_rel = _sd_rel_target(t_point, v_point, dplus_per_km, calibration)
        if pq50 is not None and pq80 is not None and sd_rel is not None:
            plan_low, plan_high = t_point * (1 - pq50 * sd_rel), t_point * (1 + pq50 * sd_rel)
            lo_c, hi_c = t_point * (1 - pq80 * sd_rel), t_point * (1 + pq80 * sd_rel)
            # emboîtement garanti même si q80 < q50 (mauvaise config) : min/max de blindage
            low, high = min(lo_c, plan_low), max(hi_c, plan_high)
            interval_source = "pooled"

    # % de VC seulement si la VC est plausible (sinon on n'affiche pas un ratio trompeur)
    cs = twin.critical_speed
    vc_fraction = None
    if cs is not None and cs.plausible and cs.vc_ms:
        vc_fraction = v_point / (cs.vc_ms * 3.6)

    return Prediction(
        finish_hours=float(t_point),
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
    )


def predict_race(course, twin: Twin, calibration: UltraCalibration, cfg: Config) -> Prediction | None:
    """Wrapper : prend un :class:`CourseProfile` (utilise Deq et D+/km)."""
    return predict_finish(course.deq_km, course.dplus_per_km, twin, calibration, cfg)


__all__ = ["CrossValidation", "Prediction", "predict_finish", "predict_race", "leave_one_out"]
