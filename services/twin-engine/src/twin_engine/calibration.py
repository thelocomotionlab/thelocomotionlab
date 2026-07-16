"""Calibration ultra : le moteur de la prédiction (twin-theory §3).

On isole les **vrais ultras engagés** par des conditions explicites, puis on ajuste la
vitesse ajustée moyenne de course en fonction de la durée et du dénivelé. La théorie
impose une **dégradation propre** selon le nombre d'ultras disponibles :

  * ``≥ min_ultras_regression`` (≈3) → **régression personnelle** v = β0 + β1·ln(T) + β2·(D+/km) ;
  * **1–2** → **mélange** : extrapolation VC+E (enveloppe d'endurance) **recalée** sur les
    ultras personnels, incertitude élargie ;
  * **0** → **extrapolation VC+E seule**, incertitude large (→ souvent 🟠/🔴).

C'est le manque clé du _seed (twin_fit.py supposait ~8 ultras) ; on le comble ici.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

import numpy as np

from .config import Config
from .twin.model import Twin
from .twin.record import ActivitySummary

REGIME_REGRESSION = "regression"
REGIME_BLEND = "blend"
REGIME_VC_E = "vc_e"
REGIME_INSUFFICIENT = "insufficient"


@dataclass(frozen=True)
class GenuineUltra:
    date: str | None
    hours: float
    vga_kmh: float       # vitesse ajustée moyenne de course
    dplus_m: float
    dist_km: float
    avg_hr: float | None

    @property
    def dplus_per_km(self) -> float:
        return self.dplus_m / self.dist_km if self.dist_km else 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class UltraCalibration:
    """Modèle de vitesse ajustée de course v(T, D+/km), selon le régime de données."""

    regime: str
    genuine: list[GenuineUltra]
    sigma_kmh: float
    notes: list[str] = field(default_factory=list)
    # paramètres internes selon le régime
    beta: tuple[float, float, float] | None = None  # régression (β0, β1, β2)
    alpha: float | None = None                       # exposant d'endurance (repli)
    endurance_coef: float | None = None              # coef enveloppe (repli)
    dplus_penalty: float = 0.0                        # β2 prior (repli)
    offset_kmh: float = 0.0                           # recalage du mélange (blend)
    # pondération (récence × maximalité) du régime régression : réutilisée À L'IDENTIQUE par la LOO
    weights: tuple[float, ...] | None = None
    n_eff: float = 0.0                                # nb effectif d'ultras = (Σw)²/Σw²
    # covariance des β = σ²(XᵀWX)⁻¹ (3×3, mode terrain inclus) — sert au Monte-Carlo
    # « predictive » (revue 2026-07, C3) pour propager le levier d'extrapolation
    beta_cov: tuple[tuple[float, float, float], ...] | None = None
    recency_halflife_days: float = 0.0
    # filtre de maximalité (§4.1) : mode appliqué + poids de maximalité seul (pour transparence/rapport)
    maximality_mode: str = "off"
    maximality_weights: tuple[float, ...] | None = None
    # terme de tendance temporelle (P1b, §9.13) : β3 ajusté (km/h par an, ridgé vers 0) quand
    # ``calibration.trend_term=ridge`` et l'axe temporel est établissable — None sinon. La
    # prédiction servie est PROJETÉE à tendance nulle (date du dernier vrai ultra) : β3 ne
    # figure donc pas dans ``beta``, il est stocké ici pour transparence et pour que la LOO
    # sache que le terme était actif (traitement identique par pli).
    trend_kmh_per_year: float | None = None

    @property
    def n_genuine(self) -> int:
        return len(self.genuine)

    @property
    def can_predict(self) -> bool:
        return self.regime != REGIME_INSUFFICIENT

    @property
    def supports_cross_validation(self) -> bool:
        """La validation croisée leave-one-out n'a de sens qu'avec une régression."""
        return self.regime == REGIME_REGRESSION and self.n_genuine >= 3

    def predict_vga_kmh(self, hours: float, dplus_per_km: float) -> float | None:
        if self.regime == REGIME_REGRESSION:
            b0, b1, b2 = self.beta  # type: ignore[misc]
            return b0 + b1 * math.log(hours) + b2 * dplus_per_km
        if self.regime in (REGIME_BLEND, REGIME_VC_E):
            v_env = self._envelope_kmh(hours)
            if v_env is None:
                return None
            return v_env + self.dplus_penalty * dplus_per_km + self.offset_kmh
        return None

    def _envelope_kmh(self, hours: float) -> float | None:
        if self.alpha is None or self.endurance_coef is None:
            return None
        return self.endurance_coef * (hours * 3600.0) ** (-self.alpha) * 3.6

    def to_dict(self) -> dict:
        return {
            "regime": self.regime,
            "n_genuine_ultras": self.n_genuine,
            "n_eff_ultras": round(self.n_eff, 2),
            "recency_halflife_days": self.recency_halflife_days,
            "maximality_mode": self.maximality_mode,
            "sigma_kmh": round(self.sigma_kmh, 3),
            "beta": None if self.beta is None else [round(b, 5) for b in self.beta],
            "trend_kmh_per_year": (None if self.trend_kmh_per_year is None
                                   else round(self.trend_kmh_per_year, 4)),
            "notes": self.notes,
            "genuine": [g.to_dict() for g in self.genuine],
        }


def _basis_hours(s: ActivitySummary, cfg: Config) -> float:
    """Durée de référence de l'effort : temps écoulé (défaut) ou temps de mouvement (§4.4).

    ``moving`` n'est retenu que s'il a pu être mesuré (``moving_time_s`` renseigné et > 0) ;
    sinon repli automatique sur le temps écoulé (pas d'invention de donnée)."""
    if cfg.twin.speed_basis == "moving":
        mt = getattr(s, "moving_time_s", None)
        if mt is not None and mt > 0:
            return mt / 3600.0
    return s.duration_s / 3600.0


def select_genuine_ultras(summaries: list[ActivitySummary], cfg: Config) -> list[GenuineUltra]:
    """Vrais ultras engagés : durée > seuil, vitesse ajustée ≥ seuil, découplage < seuil.

    Le filtre de durée porte sur le temps ÉCOULÉ (un 10 h avec de longs arrêts reste un ultra) ;
    la vitesse ajustée est calculée sur la base de durée configurée (écoulé/mouvement, §4.4)."""
    c = cfg.calibration
    out: list[GenuineUltra] = []
    for s in summaries:
        if s.duration_s < c.genuine_min_hours * 3600:
            continue
        hours = _basis_hours(s, cfg)
        vga_kmh = s.ga_km / hours
        if vga_kmh < c.genuine_min_ga_kmh:
            continue
        # exclut reconnaissances/randos ; FC absente → on ne peut pas vérifier (on garde, signalé)
        if s.decouple_pct is not None and s.decouple_pct > c.genuine_max_decouple_pct:
            continue
        out.append(
            GenuineUltra(
                date=s.date,
                hours=hours,
                vga_kmh=vga_kmh,
                dplus_m=s.dplus_m,
                dist_km=s.dist_km,
                avg_hr=s.avg_hr,
            )
        )
    return out


def recency_weights(genuine: list[GenuineUltra], cfg: Config) -> np.ndarray:
    """Poids de récence (décroissance exponentielle sur le temps **calendaire**).

    ``w_i = 0.5 ^ (age_i / demi-vie)`` où ``age_i`` est l'écart en jours au **plus récent**
    vrai ultra. Robuste aux trous (décroissance temporelle, pas par nombre d'activités). Une
    demi-vie ≤ 0 — ou moins de deux dates exploitables — désactive la pondération (poids 1).
    Les ultras non datés reçoivent le **plus faible** poids daté (prudence : on ne présume pas
    récent ce qu'on ne peut pas dater).
    """
    n = len(genuine)
    if n == 0:
        return np.zeros(0)
    hl = cfg.calibration.recency_halflife_days
    if hl <= 0:
        return np.ones(n)
    from datetime import date as _date

    parsed: list[_date | None] = []
    for g in genuine:
        d: _date | None = None
        if g.date:
            try:
                d = _date.fromisoformat(g.date)
            except ValueError:
                d = None
        parsed.append(d)
    valid = [d for d in parsed if d is not None]
    if len(valid) < 2:
        return np.ones(n)  # timeline non établissable → pondération neutre
    ref = max(valid)
    w = np.ones(n)
    for i, d in enumerate(parsed):
        if d is not None:
            w[i] = 0.5 ** (max(0, (ref - d).days) / hl)
    dated = [w[i] for i, d in enumerate(parsed) if d is not None]
    fill = min(dated) if dated else 1.0
    for i, d in enumerate(parsed):
        if d is None:
            w[i] = fill
    return w


def trend_axis_years(genuine: list[GenuineUltra]) -> np.ndarray | None:
    """Axe temporel du terme de tendance (P1b) : années SIGNÉES relatives au plus récent
    vrai ultra — négatives dans le passé, 0 à la référence (année = 365,25 j).

    Rend ``None`` (tendance non identifiable → pas de colonne, no-op) si un ultra n'est
    pas daté ou s'il y a moins de deux dates DISTINCTES : on n'ajuste jamais une tendance
    sur un axe temporel qu'on ne peut pas établir — contrairement à la récence (qui peut
    remplir prudemment les non-datés), une date inventée ici fabriquerait une pente.

    Le décalage d'origine est sans effet sur β3 (absorbé par β0) : la LOO re-référence le
    même axe à la date de chaque pli par simple soustraction (predict.leave_one_out)."""
    if not genuine:
        return None
    from datetime import date as _date

    parsed: list[_date] = []
    for g in genuine:
        if not g.date:
            return None
        try:
            parsed.append(_date.fromisoformat(g.date))
        except ValueError:
            return None
    if len(set(parsed)) < 2:
        return None
    ref = max(parsed)
    return np.array([-(ref - d).days / 365.25 for d in parsed])


def _trend_axis(genuine: list[GenuineUltra], cfg: Config | None) -> np.ndarray | None:
    """Axe temporel SEULEMENT si le flag ``calibration.trend_term=ridge`` est actif."""
    if cfg is None or cfg.calibration.trend_term != "ridge":
        return None
    return trend_axis_years(genuine)


def _effective_n(weights: np.ndarray) -> float:
    """Nombre effectif d'échantillons ``(Σw)²/Σw²`` (= n quand les poids sont égaux)."""
    sw = float(weights.sum())
    sw2 = float(np.square(weights).sum())
    return (sw * sw / sw2) if sw2 > 0 else 0.0


def _ramp(x: float, lo: float, hi: float) -> float:
    """Rampe linéaire bornée : 0 en ``lo``, 1 en ``hi``, clampée dans [0, 1].

    ``hi ≤ lo`` (rampe dégénérée) ⇒ marche : 1 dès que ``x ≥ hi``, 0 sinon."""
    if hi <= lo:
        return 1.0 if x >= hi else 0.0
    return float(min(1.0, max(0.0, (x - lo) / (hi - lo))))


def maximality_weights(
    genuine: list[GenuineUltra], twin: Twin, cfg: Config
) -> np.ndarray:
    """Poids de maximalité w ∈ [0, 1] par ultra (§4.1) — 1 = effort pleinement engagé.

    ``r_i = vga_i / (enveloppe_vga(T_i)·3.6)`` = fraction du plafond d'endurance **propre** à
    l'athlète (sans FC absolue). Effort engagé ⇒ ``r≈1`` ; footing/aventure ⇒ ``r`` bas. Le modèle
    v(T) suppose des efforts maximaux ; homogénéiser via ``r`` restaure cette hypothèse.

    * ``off`` → poids 1 partout (comportement actuel, golden intact).
    * ``soft_weight`` → ``w = clip((r − r_floor)/(r_ref − r_floor), 0, 1)``.
    * ``hard_filter`` → ``w ∈ {0, 1}`` (retrait franc des efforts non engagés).

    **Référence de l'intensité (§A, robustesse inter-athlètes).** ``maximality_reference`` :
    ``envelope_absolute`` compare ``r`` au seul plafond extrapolé (sensible à un biais
    d'extrapolation) ; ``self_relative`` (défaut) le compare AUSSI à un pôle robuste (quantile) des
    propres ultras de l'athlète → **invariant à l'échelle de l'enveloppe**. Aucun réglage par athlète.

    **Garde-fous anti-faux-positif — tous « rescue » (le poids final = max des signaux), donc on ne
    down-pondère un ultra que si TOUS le jugent non engagé** :
      * le signal auto-relatif protège un effort maximal qu'une enveloppe biaisée aurait sous-crédité ;
      * une course dure mais raide/technique (D+/km élevé) paraît lente vs plafond : la FC normalisée
        à la FC max des ultras la **remonte** (on ne baisse que si r bas ET FC basse).
    Cette structure garantit le no-op sur un athlète « propre » (tous ses efforts au plafond ⇒ poids 1)
    et empêche le filtre d'être plus agressif que le seul signal absolu. Sans enveloppe exploitable,
    la maximalité n'est pas évaluable → poids 1 (neutre, signalé)."""
    c = cfg.calibration
    n = len(genuine)
    if c.maximality_mode == "off" or n == 0:
        return np.ones(n)
    if twin.alpha is None or twin.endurance_coef is None:
        return np.ones(n)  # pas d'enveloppe → maximalité non évaluable → neutre

    # r_i = fraction du propre plafond d'endurance (NaN si enveloppe non calculable à cette durée).
    r = np.full(n, np.nan)
    for i, g in enumerate(genuine):
        env_ms = twin.envelope_vga_ms(g.hours * 3600.0)
        if env_ms is not None and env_ms > 0:
            r[i] = g.vga_kmh / (env_ms * 3.6)

    def _ramp_or(x: float, floor: float, ref: float, fallback: float) -> float:
        """Rampe, ou ``fallback`` quand le signal est absent (NaN) — jamais d'invention."""
        return _ramp(x, floor, ref) if math.isfinite(x) else fallback

    # Signaux de maximalité, tous « rescue » : on ne down-pondère un ultra que si TOUS le jugent
    # non engagé (le poids final = max des signaux). Un signal absent contribue 0 (n'aide pas)
    # sauf le signal absolu quand r est incalculable (fallback 1 = on garde, faute de mieux).
    signals: list[np.ndarray] = []

    # (1) absolu : r vs plafond extrapolé — garant du no-op (r ≥ ref ⇒ poids 1, athlète « propre »).
    signals.append(np.array([_ramp_or(x, c.maximality_r_floor, c.maximality_r_ref, 1.0) for x in r]))

    # (2) auto-relatif (§A) : r vs pôle robuste des propres ultras → invariant à l'échelle de
    #     l'enveloppe (protège les efforts maximaux d'une extrapolation biaisée). Rescue uniquement.
    if c.maximality_reference == "self_relative":
        finite = r[np.isfinite(r)]
        if finite.size >= 1:
            pole = float(np.quantile(finite, c.maximality_self_quantile))
            if pole > 0:
                signals.append(
                    np.array([_ramp_or(x / pole, c.maximality_r_floor, c.maximality_r_ref, 0.0) for x in r])
                )

    # (3) second signal FC (normalisée à la FC max des ultras) : course dure mais raide → rescue.
    hrs = np.array([g.avg_hr if g.avg_hr is not None else np.nan for g in genuine], dtype=float)
    hr_max = float(np.nanmax(hrs)) if np.isfinite(hrs).any() else float("nan")
    if math.isfinite(hr_max) and hr_max > 0:
        signals.append(
            np.array([_ramp_or(h / hr_max, c.maximality_hr_floor, c.maximality_hr_ref, 0.0) for h in hrs])
        )

    w = np.maximum.reduce(signals)

    if c.maximality_mode == "hard_filter":
        return np.where(w > 0.0, 1.0, 0.0)
    return w


def _regression_beta(
    h: np.ndarray, v: np.ndarray, dpk: np.ndarray, weights: np.ndarray, cfg: Config | None,
    trend_years: np.ndarray | None = None,
) -> np.ndarray:
    """β pondéré de ``v ~ 1 + ln(T) + β2·D+/km [+ β3·années]`` selon le mode de terrain (§4.2).

    * ``free`` : β2 libre (défaut historique, jusqu'au 2026-07-03).
    * ``none`` : β2 = 0 (la vga est **déjà** ajustée à la pente → pas de double-comptage).
    * ``prior_shrunk`` (défaut) : ridge de β2 vers le prior population via une pseudo-observation
      pondérée ``λ`` (atténue les points de levier terrain, ex. un ultra à D+/km extrême).

    ``trend_years`` non nul (P1b, §9.13) ajoute la colonne temporelle : β3 (km/h par an) est
    ridgé vers 0 (prior « pas de tendance », ``trend_ridge_lambda``, même mécanique de
    pseudo-observation que le terrain). Le vecteur rendu a alors 4 composantes — la prédiction
    servie n'utilise que les 3 premières (projection à tendance nulle). L'appelant fournit un
    axe déjà gâté par le flag (``_trend_axis``) ; ``None`` ⇒ comportement actuel à l'identique.

    ``cfg`` absent ⇒ ``free`` (rétro-compatibilité du golden)."""
    term = cfg.calibration.terrain_term if cfg is not None else "free"
    lt = np.log(h)
    sw = np.sqrt(np.asarray(weights, dtype=float))
    cols = ([np.ones_like(h), lt] if term == "none"
            else [np.ones_like(h), lt, dpk])
    if trend_years is not None:
        cols.append(np.asarray(trend_years, dtype=float))
    X = np.vstack(cols).T
    Xw = X * sw[:, None]
    yw = v * sw
    ridge_rows: list[np.ndarray] = []
    ridge_targets: list[float] = []
    if term == "prior_shrunk":
        prior = cfg.calibration.default_dplus_penalty_kmh_per_dpkm
        lam = math.sqrt(max(cfg.calibration.terrain_shrink_lambda, 0.0))
        row = np.zeros(X.shape[1])
        row[2] = lam
        ridge_rows.append(row)
        ridge_targets.append(lam * prior)
    if trend_years is not None:
        lam_t = math.sqrt(max(cfg.calibration.trend_ridge_lambda, 0.0))
        row = np.zeros(X.shape[1])
        row[-1] = lam_t
        ridge_rows.append(row)
        ridge_targets.append(0.0)
    if ridge_rows:
        Xw = np.vstack([Xw, np.vstack(ridge_rows)])
        yw = np.concatenate([yw, np.asarray(ridge_targets)])
    b, *_ = np.linalg.lstsq(Xw, yw, rcond=None)
    b = np.asarray(b, dtype=float)
    if term == "none":
        # réinsère β2 = 0 pour conserver la forme (β0, β1, β2[, β3])
        b = np.concatenate([b[:2], [0.0], b[2:]])
    return b


def _beta_covariance(
    genuine: list[GenuineUltra], weights: np.ndarray, sigma: float, cfg: Config | None,
    trend_years: np.ndarray | None = None,
) -> np.ndarray:
    """Covariance des coefficients : σ²(XᵀWX)⁻¹ (3×3), cohérente avec le mode de terrain.

    C'est le terme de LEVIER de la loi prédictive (Var = σ²(1 + x₀ᵀ(XᵀWX)⁻¹x₀)) : il grandit
    quand la cible sort de l'enveloppe des (ln T, D+/km) d'entraînement — le même phénomène
    que les plis d'« extrapolation » de la LOO, jusqu'ici absent de l'intervalle vendu.

    * ``none`` : β2 fixé à 0 → bloc 2×2 (β0, β1), ligne/colonne β2 nulles ;
    * ``prior_shrunk`` : la pseudo-observation ridge entre dans XᵀWX (comme dans le fit) ;
    * ``trend_years`` non nul (P1b) : la colonne temporelle et SA pseudo-observation ridge
      entrent dans XᵀWX (comme dans le fit), puis on rend le BLOC MARGINAL des coefficients
      servis — exact au point servi, car la prédiction est projetée à tendance nulle
      (x₀ = [1, ln T, D+/km, 0] ⇒ Var = bloc 3×3 marginal, l'incertitude de β3 gonflant
      celle de β0 via leur covariance) ;
    * ``pinv`` (pas ``inv``) : design mal conditionné → covariance large, jamais NaN.
    """
    h = np.array([g.hours for g in genuine])
    dpk = np.array([g.dplus_per_km for g in genuine])
    sw = np.sqrt(np.asarray(weights, dtype=float))
    term = cfg.calibration.terrain_term if cfg is not None else "free"
    cols = ([np.ones_like(h), np.log(h)] if term == "none"
            else [np.ones_like(h), np.log(h), dpk])
    n_base = len(cols)  # nb de coefficients SERVIS présents dans le design (2 ou 3)
    if trend_years is not None:
        cols.append(np.asarray(trend_years, dtype=float))
    X = np.vstack(cols).T * sw[:, None]
    ridge_rows: list[np.ndarray] = []
    if term == "prior_shrunk":
        lam = math.sqrt(max(cfg.calibration.terrain_shrink_lambda, 0.0))
        row = np.zeros(X.shape[1])
        row[2] = lam
        ridge_rows.append(row)
    if trend_years is not None:
        lam_t = math.sqrt(max(cfg.calibration.trend_ridge_lambda, 0.0))
        row = np.zeros(X.shape[1])
        row[-1] = lam_t
        ridge_rows.append(row)
    if ridge_rows:
        X = np.vstack([X, np.vstack(ridge_rows)])
    full = sigma**2 * np.linalg.pinv(X.T @ X)
    cov = np.zeros((3, 3))
    cov[:n_base, :n_base] = full[:n_base, :n_base]
    return cov


def _fit_regression(
    genuine: list[GenuineUltra], weights: np.ndarray | None = None, cfg: Config | None = None,
    trend_years: np.ndarray | None = None,
):
    """β = lstsq **pondéré** (v ~ 1 + ln(T) + D+/km [+ années]). Renvoie (beta, residuals).

    Poids ``None`` ou égaux ⇒ moindres carrés ordinaires (le golden reste identique). Le mode de
    terrain (``cfg.calibration.terrain_term``) et le terme de tendance (P1b) sont appliqués ici
    ET dans la LOO à l'identique. Les résidus sont ceux du design COMPLET (tendance incluse
    quand elle est active) : c'est le bruit autour du modèle réellement ajusté qui nourrit σ."""
    h = np.array([g.hours for g in genuine])
    v = np.array([g.vga_kmh for g in genuine])
    dpk = np.array([g.dplus_per_km for g in genuine])
    w = np.ones_like(h) if weights is None else np.asarray(weights, dtype=float)
    beta = _regression_beta(h, v, dpk, w, cfg, trend_years)
    cols = [np.ones_like(h), np.log(h), dpk]
    if beta.shape[0] == 4:
        cols.append(np.asarray(trend_years, dtype=float))
    X = np.vstack(cols).T
    resid = v - X @ beta
    return beta, resid


def build_calibration(twin: Twin, cfg: Config) -> UltraCalibration:
    c = cfg.calibration
    genuine = select_genuine_ultras(twin.summaries, cfg)
    notes: list[str] = []

    # Poids : récence (non-stationnarité) × maximalité (hétérogénéité d'intention). Les deux sont
    # appliqués À L'IDENTIQUE dans le fit ET la LOO → l'indice de confiance reflète le modèle servi.
    recency = recency_weights(genuine, cfg)
    maximality = maximality_weights(genuine, twin, cfg)

    # ``hard_filter`` : on retire franchement les efforts non engagés (poids de maximalité nul).
    dropped = 0
    if c.maximality_mode == "hard_filter" and len(genuine):
        keep = [i for i in range(len(genuine)) if maximality[i] > 0.0]
        dropped = len(genuine) - len(keep)
        genuine = [genuine[i] for i in keep]
        recency = recency[keep]
        maximality = maximality[keep]
    n = len(genuine)

    weights = recency * maximality
    n_eff = _effective_n(weights) if n else 0.0

    if c.maximality_mode != "off":
        if twin.alpha is None or twin.endurance_coef is None:
            notes.append(
                "Filtre de maximalité demandé mais enveloppe d'endurance indisponible : "
                "poids neutre (maximalité non évaluable)."
            )
        elif c.maximality_mode == "hard_filter":
            notes.append(f"Maximalité (hard) : {dropped} effort(s) non engagé(s) écarté(s).")
        else:
            notes.append(
                "Maximalité (soft) : les efforts sous le plafond d'endurance pèsent moins "
                "(homogénéisation en efforts maximaux, §4.1)."
            )
    max_w_tuple = tuple(float(x) for x in maximality) if c.maximality_mode != "off" else None

    # ---------- régime régression (≥ ~3 vrais ultras ET N_eff suffisant) ----------
    # Le plancher N_eff empêche la pondération (récence × maximalité) de fabriquer une régression
    # sûre d'elle sur trop peu d'ultras effectifs (surconfiance) : dans ce cas on bascule
    # dans le repli « peu d'ultras » (incertitude élargie) ci-dessous.
    if n >= c.min_ultras_regression and n_eff >= c.min_ultras_regression:
        # Terme de tendance (P1b, §9.13) : axe temporel gâté par le flag ; None si un ultra
        # n'est pas daté ou dates non distinctes (no-op signalé — jamais de pente inventée).
        t_years = _trend_axis(genuine, cfg)
        if c.trend_term == "ridge" and t_years is None:
            notes.append(
                "Terme de tendance demandé mais axe temporel non établissable "
                "(ultra non daté ou dates identiques) : régression sans tendance."
            )
        beta, resid = _fit_regression(genuine, weights, cfg, t_years)
        trend = float(beta[3]) if beta.shape[0] == 4 else None
        # σ pondérée : variance résiduelle pondérée corrigée par le nb effectif de degrés de
        # liberté. Se réduit EXACTEMENT à √(Σr²/(n−3)) quand les poids sont égaux (golden
        # intact). Tendance active ⇒ 4 paramètres ajustés (comptés pleins bien que ridgés :
        # σ légèrement conservatrice, jamais optimiste).
        sw = float(weights.sum())
        wmse = float(np.sum(weights * resid**2) / sw) if sw > 0 else 0.0
        n_params = 4.0 if trend is not None else 3.0
        dof_eff = max(n_eff - n_params, 1.0)
        sigma = float(np.sqrt(wmse * n_eff / dof_eff))
        sigma = max(sigma, c.regression_min_sigma_kmh)
        beta_cov = _beta_covariance(genuine, weights, sigma, cfg, t_years)
        notes.append(
            f"Régression personnelle pondérée par récence sur {n} vrais ultras "
            f"(≈ {n_eff:.1f} effectifs, demi-vie {c.recency_halflife_days:.0f} j)."
        )
        if trend is not None:
            notes.append(
                f"Tendance de forme (§9.13) : {trend:+.2f} km/h par an "
                f"(ridge λ={c.trend_ridge_lambda:g}), prédiction projetée à la date du "
                "dernier vrai ultra."
            )
        return UltraCalibration(
            regime=REGIME_REGRESSION,
            genuine=genuine,
            sigma_kmh=sigma,
            notes=notes,
            beta=(float(beta[0]), float(beta[1]), float(beta[2])),
            weights=tuple(float(x) for x in weights),
            beta_cov=tuple(tuple(float(x) for x in row) for row in beta_cov),
            n_eff=n_eff,
            recency_halflife_days=c.recency_halflife_days,
            maximality_mode=c.maximality_mode,
            maximality_weights=max_w_tuple,
            trend_kmh_per_year=trend,
        )

    # ---------- replis VC+E (nécessitent l'enveloppe d'endurance) ----------
    if twin.alpha is None or twin.endurance_coef is None:
        notes.append(
            "Ni régression ultra (trop peu de vrais ultras) ni enveloppe d'endurance "
            "exploitable → prédiction impossible avec confiance."
        )
        return UltraCalibration(
            regime=REGIME_INSUFFICIENT, genuine=genuine, sigma_kmh=float("inf"), notes=notes,
            n_eff=n_eff, recency_halflife_days=c.recency_halflife_days,
            maximality_mode=c.maximality_mode, maximality_weights=max_w_tuple,
        )

    penalty = c.default_dplus_penalty_kmh_per_dpkm

    # ---------- régime mélange (1–2 ultras) : recalage du niveau ----------
    if n >= 1:
        # Recalage PONDÉRÉ par les mêmes poids (récence × maximalité) que partout ailleurs :
        # le blend est précisément le régime où l'on tombe quand les vieux ultras (ou les
        # sorties non engagées, poids de maximalité 0) ne doivent plus peser — ils ne doivent
        # pas non plus recaler le niveau à poids plein. Repli non pondéré si Σw = 0.
        offsets: list[float] = []
        offset_w: list[float] = []
        for i, g in enumerate(genuine):
            v_env = twin.envelope_vga_ms(g.hours * 3600.0)
            if v_env is None:
                continue
            base = v_env * 3.6 + penalty * g.dplus_per_km
            offsets.append(g.vga_kmh - base)
            offset_w.append(float(weights[i]))
        if offsets and sum(offset_w) > 0:
            offset = float(np.average(offsets, weights=offset_w))
        else:
            offset = float(np.mean(offsets)) if offsets else 0.0
        if n >= c.min_ultras_regression:
            # demoté par le plancher N_eff : assez d'ultras, mais trop peu de RÉCENTS
            notes.append(
                f"{n} vrais ultras mais seulement ≈ {n_eff:.1f} récents (non-stationnarité) : "
                "extrapolation VC+E recalée sur vos données, incertitude élargie."
            )
        else:
            notes.append(
                f"Seulement {n} vrai(s) ultra(s) : extrapolation VC+E recalée sur vos données, "
                "incertitude élargie."
            )
        return UltraCalibration(
            regime=REGIME_BLEND,
            genuine=genuine,
            sigma_kmh=c.blend_sigma_kmh,
            notes=notes,
            alpha=twin.alpha,
            endurance_coef=twin.endurance_coef,
            dplus_penalty=penalty,
            offset_kmh=offset,
            n_eff=n_eff,
            recency_halflife_days=c.recency_halflife_days,
            maximality_mode=c.maximality_mode,
            maximality_weights=max_w_tuple,
        )

    # ---------- régime VC+E seul (0 ultra) ----------
    notes.append(
        "Aucun ultra proche de la durée cible : extrapolation par vitesse critique et "
        "exposant d'endurance, confiance faible (pénalité D+ = prior population)."
    )
    return UltraCalibration(
        regime=REGIME_VC_E,
        genuine=genuine,
        sigma_kmh=c.vc_e_sigma_kmh,
        notes=notes,
        alpha=twin.alpha,
        endurance_coef=twin.endurance_coef,
        dplus_penalty=penalty,
        offset_kmh=0.0,
        n_eff=n_eff,
        recency_halflife_days=c.recency_halflife_days,
        maximality_mode=c.maximality_mode,
        maximality_weights=max_w_tuple,
    )


__all__ = [
    "GenuineUltra",
    "UltraCalibration",
    "select_genuine_ultras",
    "maximality_weights",
    "recency_weights",
    "trend_axis_years",
    "build_calibration",
    "REGIME_REGRESSION",
    "REGIME_BLEND",
    "REGIME_VC_E",
    "REGIME_INSUFFICIENT",
]
