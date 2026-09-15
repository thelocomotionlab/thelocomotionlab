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
    hours: float         # durée de la BASE de vitesse servie (écoulé, mouvement ou hors plateaux)
    vga_kmh: float       # vitesse ajustée moyenne de course sur cette base
    dplus_m: float
    dist_km: float
    avg_hr: float | None
    # --- Phase 2 : ce que la course dit d'autre (None = non mesuré) --------------------
    elapsed_hours: float | None = None   # temps écoulé de bout en bout (ce que la LOO compare)
    stops_h: float | None = None         # heures dans les plateaux ≥ twin.stop_min_s
    night_share: float | None = None     # part de nuit de l'écoulé (0–1)
    split_ratio: float | None = None     # vga hors plateaux, seconde moitié ÷ première
    mean_alt_m: float | None = None      # altitude moyenne

    @property
    def dplus_per_km(self) -> float:
        return self.dplus_m / self.dist_km if self.dist_km else 0.0

    @property
    def moving_hours(self) -> float | None:
        """Heures hors plateaux (écoulé − arrêts), None sans arrêts mesurés."""
        if self.elapsed_hours is None or self.stops_h is None:
            return None
        return max(self.elapsed_hours - self.stops_h, 0.0)

    @property
    def stops_rate(self) -> float | None:
        """Taux d'arrêt personnel de la course : heures d'arrêt par heure de mouvement."""
        mh = self.moving_hours
        if mh is None or mh <= 0 or self.stops_h is None:
            return None
        return self.stops_h / mh

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
    # --- lien de la régression (Phase 1, A2) : ``linear`` (β sur v, σ en km/h) ou ``log``
    # (β sur ln v, σ relatif dans ``sigma_log`` ; ``sigma_kmh`` en est alors l'équivalent
    # à la vitesse moyenne pondérée des ultras, pour l'affichage seulement)
    link: str = "linear"
    sigma_log: float | None = None
    # --- prior sur la pente en durée (Phase 1, A1) : (valeur du prior sur b, λ) appliqué à
    # l'identique dans le fit, la covariance et chaque pli LOO ; None = pente libre
    duration_prior: tuple[float, float] | None = None
    duration_prior_origin: str | None = None            # twin_alpha | population
    # --- arrêts (Phase 2, B4) : ``carved`` = historique (vitesse écoulée, arrêts retranchés
    # par le plan) ; ``personal``/``spec`` = régression hors plateaux + modèle d'arrêts.
    # ``stops_rate`` = r̄ (h d'arrêt par h de mouvement, pondéré), ``stops_rate_sd_log`` =
    # dispersion de ln(1 + r) entre ultras, ``stops_ref_hours`` = heures de mouvement de
    # référence (moyenne géométrique pondérée) pour l'élasticité r(T) = r̄·(T/T̄)^e.
    stops_model: str = "carved"
    stops_rate: float | None = None
    stops_rate_sd_log: float | None = None
    stops_ref_hours: float | None = None
    stops_elasticity: float = 0.0
    stops_rate_origin: str | None = None                # ultras | population
    # --- nuit (Phase 2, C2) : coefficient de la 4ᵉ colonne (écart de part de nuit à la
    # moyenne pondérée des vrais ultras), son prior (valeur, λ) ; None = terme inactif.
    night_coef: float | None = None
    night_share_mean: float | None = None
    night_prior: tuple[float, float] | None = None
    # --- Phase 3 : recalage d'époque (P) et queue de l'enveloppe (B1/B2) ---------------------
    # ``level_shift`` = gain × ln(VC_now ÷ VC_époque) par ultra, appliqué au fit, au recalage
    # du blend et à chaque pli LOO ; None = terme inactif. ``tail_alpha`` = exposant de
    # l'enveloppe des replis blend/vc_e au-delà de ``tail_from_s`` ; None = enveloppe historique.
    level_anchor: str = "none"
    level_shift: tuple[float, ...] | None = None
    level_n_anchored: int = 0
    tail_alpha: float | None = None
    tail_from_s: float | None = None
    tail_source: str | None = None                      # efficiency | record_tail

    @property
    def n_genuine(self) -> int:
        return len(self.genuine)

    @property
    def has_night_term(self) -> bool:
        return self.night_coef is not None

    @property
    def coef_vector(self) -> np.ndarray | None:
        """Coefficients dans l'ordre des colonnes du design : (β0, β1, β2[, d])."""
        if self.beta is None:
            return None
        v = [float(b) for b in self.beta]
        if self.night_coef is not None:
            v.append(float(self.night_coef))
        return np.asarray(v, dtype=float)

    def stops_rate_at(self, moving_hours: float) -> float:
        """Taux d'arrêt appliqué à ``moving_hours`` heures de mouvement (élasticité comprise) ;
        0 en modèle ``carved``."""
        if self.stops_model == "carved" or self.stops_rate is None:
            return 0.0
        r = float(self.stops_rate)
        if self.stops_elasticity and self.stops_ref_hours and moving_hours > 0:
            r *= (moving_hours / self.stops_ref_hours) ** self.stops_elasticity
        return max(r, 0.0)

    def elapsed_from_moving(self, moving_hours: float, *, spec_stops_h: float | None = None) -> float:
        """Temps ÉCOULÉ prédit à partir du temps de mouvement : identité en ``carved``,
        mouvement × (1 + r) en ``personal``, mouvement + arrêts de la spec en ``spec``
        (repli sur le taux personnel sans spec)."""
        if self.stops_model == "spec" and spec_stops_h is not None:
            return moving_hours + float(spec_stops_h)
        return moving_hours * (1.0 + self.stops_rate_at(moving_hours))

    def moving_from_elapsed(self, elapsed_hours: float, *, spec_stops_h: float | None = None) -> float:
        """Inverse d':meth:`elapsed_from_moving` (itéré quand le taux dépend de la durée)."""
        if self.stops_model == "carved":
            return elapsed_hours
        if self.stops_model == "spec" and spec_stops_h is not None:
            return max(elapsed_hours - float(spec_stops_h), 0.5 * elapsed_hours)
        m = elapsed_hours / (1.0 + self.stops_rate_at(elapsed_hours))
        for _ in range(50):
            mn = elapsed_hours / (1.0 + self.stops_rate_at(m))
            if abs(mn - m) < 1e-9:
                return mn
            m = mn
        return m

    @property
    def can_predict(self) -> bool:
        return self.regime != REGIME_INSUFFICIENT

    @property
    def supports_cross_validation(self) -> bool:
        """La validation croisée leave-one-out n'a de sens qu'avec une régression."""
        return self.regime == REGIME_REGRESSION and self.n_genuine >= 3

    @property
    def sigma_link(self) -> float:
        """σ résiduel dans les unités du lien servi (km/h en linéaire, relatif en log)."""
        return self.sigma_log if (self.link == "log" and self.sigma_log is not None) else self.sigma_kmh

    @property
    def level_shift_mean_pct(self) -> float:
        """Décalage de niveau moyen (pondéré par les poids servis) en % de vitesse ; 0 sans terme."""
        if not self.level_shift:
            return 0.0
        sh = np.asarray(self.level_shift, dtype=float)
        w = (np.asarray(self.weights, dtype=float) if self.weights is not None and len(self.weights) == len(sh)
             else np.ones(len(sh)))
        sw = float(w.sum())
        m = float(np.sum(w * sh) / sw) if sw > 0 else float(np.mean(sh))
        return 100.0 * (math.exp(m) - 1.0)

    def predict_vga_kmh(self, hours: float, dplus_per_km: float,
                        night_dev: float = 0.0) -> float | None:
        """Vitesse ajustée modélisée à ``hours`` (heures de la base servie) ; ``night_dev`` =
        écart de part de nuit à la moyenne des ultras (0 hors terme de nuit)."""
        if self.regime == REGIME_REGRESSION:
            b0, b1, b2 = self.beta  # type: ignore[misc]
            eta = b0 + b1 * math.log(hours) + b2 * dplus_per_km
            if self.night_coef is not None:
                eta += self.night_coef * night_dev
            if self.link == "log":
                return float(math.exp(eta))
            return float(eta)
        if self.regime in (REGIME_BLEND, REGIME_VC_E):
            v_env = self._envelope_kmh(hours)
            if v_env is None:
                return None
            return v_env + self.dplus_penalty * dplus_per_km + self.offset_kmh
        return None

    def _envelope_kmh(self, hours: float) -> float | None:
        if self.alpha is None or self.endurance_coef is None:
            return None
        v_ms = _envelope_ms(self.endurance_coef, self.alpha, hours * 3600.0,
                            self.tail_alpha, self.tail_from_s)
        return None if v_ms is None else v_ms * 3.6

    def to_dict(self) -> dict:
        return {
            "regime": self.regime,
            "n_genuine_ultras": self.n_genuine,
            "n_eff_ultras": round(self.n_eff, 2),
            "recency_halflife_days": self.recency_halflife_days,
            "maximality_mode": self.maximality_mode,
            "sigma_kmh": round(self.sigma_kmh, 3),
            "link": self.link,
            "sigma_log": None if self.sigma_log is None else round(self.sigma_log, 4),
            "duration_prior": None if self.duration_prior is None
            else {"b": round(self.duration_prior[0], 4), "lambda": self.duration_prior[1],
                  "origin": self.duration_prior_origin},
            "beta": None if self.beta is None else [round(b, 5) for b in self.beta],
            "stops": None if self.stops_model == "carved" else {
                "model": self.stops_model,
                "rate": None if self.stops_rate is None else round(self.stops_rate, 4),
                "rate_sd_log": (None if self.stops_rate_sd_log is None
                                else round(self.stops_rate_sd_log, 4)),
                "ref_hours": (None if self.stops_ref_hours is None
                              else round(self.stops_ref_hours, 2)),
                "elasticity": self.stops_elasticity,
                "origin": self.stops_rate_origin},
            "night": None if self.night_coef is None else {
                "coef": round(self.night_coef, 4),
                "share_mean": (None if self.night_share_mean is None
                               else round(self.night_share_mean, 4)),
                "prior": None if self.night_prior is None
                else {"d": round(self.night_prior[0], 4), "lambda": self.night_prior[1]}},
            "level_anchor": None if self.level_shift is None else {
                "mode": self.level_anchor,
                "n_anchored": self.level_n_anchored,
                "shift_mean_pct": round(self.level_shift_mean_pct, 2),
                "shifts_pct": [round(100.0 * (math.exp(x) - 1.0), 2) for x in self.level_shift]},
            "envelope_tail": None if self.tail_alpha is None else {
                "alpha": round(self.tail_alpha, 4),
                "from_s": self.tail_from_s,
                "source": self.tail_source},
            "notes": self.notes,
            "genuine": [g.to_dict() for g in self.genuine],
        }


def _envelope_ms(coef: float, alpha: float, t_s: float,
                 tail_alpha: float | None = None, tail_from_s: float | None = None) -> float:
    """Enveloppe d'endurance (m/s) : ``coef · t^−α`` jusqu'à ``tail_from_s``, puis, avec une
    queue servie, ``coef · tail_from^−α · (t ÷ tail_from)^−α_queue`` — continue au raccord."""
    if tail_alpha is None or tail_from_s is None or t_s <= tail_from_s:
        return float(coef * t_s ** (-alpha))
    return float(coef * tail_from_s ** (-alpha) * (t_s / tail_from_s) ** (-tail_alpha))


def envelope_tail(twin: Twin, cfg: Config) -> tuple[float | None, float | None, str | None, str | None]:
    """Queue de l'enveloppe demandée par ``calibration.envelope_tail`` : ``(α_queue, début en
    s, source, note)`` ; α None = enveloppe historique (mode ``alpha`` ou exposant manquant)."""
    mode = cfg.calibration.envelope_tail
    if mode not in ("efficiency", "record_tail"):
        return None, None, None, None
    a = twin.alpha_eff if mode == "efficiency" else twin.alpha_tail
    if a is None or a <= 0:
        return None, None, None, (f"Queue d'enveloppe « {mode} » demandée mais exposant "
                                  "indisponible : enveloppe historique conservée.")
    return float(a), float(cfg.twin.endurance_window_s[1]), mode, None


def genuine_floor_kmh(elapsed_hours: float, cfg: Config) -> float:
    """Plancher de vitesse ajustée du filtre « vrai ultra » au temps écoulé donné :
    constant (``genuine_floor=fixed``) ou décroissant en (T ÷ genuine_min_hours)^−α
    (``riegel``), jamais au-dessus du plancher historique."""
    c = cfg.calibration
    if c.genuine_floor != "riegel" or c.genuine_min_hours <= 0:
        return float(c.genuine_min_ga_kmh)
    ratio = max(float(elapsed_hours) / float(c.genuine_min_hours), 1.0)
    return float(c.genuine_min_ga_kmh * ratio ** (-float(c.genuine_floor_alpha)))


def genuine_gate_failures(s: ActivitySummary, cfg: Config) -> list[str]:
    """Raisons pour lesquelles un effort N'EST PAS un vrai ultra (liste vide = retenu) : durée,
    plancher de vitesse au temps écoulé, découplage, plus long plateau (garde « sommeil »,
    ``genuine_max_stop_s`` > 0). Une seule définition du domaine, partagée par la
    calibration, la queue de la courbe record et les outils de diagnostic."""
    c = cfg.calibration
    fails: list[str] = []
    elapsed_h = s.duration_s / 3600.0
    if s.duration_s < c.genuine_min_hours * 3600:
        fails.append(f"durée {elapsed_h:.1f} h < {c.genuine_min_hours:g} h")
    hours = _basis_hours(s, cfg)
    vga_kmh = s.ga_km / hours if hours > 0 else 0.0
    gate_kmh = (s.ga_km / elapsed_h if (c.stops_model != "carved" and elapsed_h > 0) else vga_kmh)
    floor = genuine_floor_kmh(elapsed_h, cfg)
    if gate_kmh < floor:
        fails.append(f"vga {gate_kmh:.2f} < plancher {floor:.2f} km/h")
    if s.decouple_pct is not None and s.decouple_pct > c.genuine_max_decouple_pct:
        fails.append(f"découplage {s.decouple_pct:.1f} % > {c.genuine_max_decouple_pct:.0f} %")
    longest = getattr(s, "longest_stop_s", None)
    if c.genuine_max_stop_s > 0 and longest is not None and longest > c.genuine_max_stop_s:
        fails.append(f"plus long arrêt {longest / 60:.0f} min > {c.genuine_max_stop_s / 60:.0f} min")
    return fails


def _basis_hours(s: ActivitySummary, cfg: Config) -> float:
    """Durée de référence de l'effort : temps écoulé (défaut), temps de mouvement (§4.4) ou,
    dès qu'un modèle d'arrêts est servi (``stops_model`` ≠ ``carved``), temps HORS PLATEAUX
    (écoulé − arrêts ≥ twin.stop_min_s : les arrêts francs sortent, la marche lente reste).

    Une base non mesurable retombe sur le temps écoulé (pas d'invention de donnée)."""
    if cfg.calibration.stops_model != "carved":
        st = getattr(s, "stops_s", None)
        if st is not None and s.duration_s - st > 0:
            return (s.duration_s - st) / 3600.0
        return s.duration_s / 3600.0
    if cfg.twin.speed_basis == "moving":
        mt = getattr(s, "moving_time_s", None)
        if mt is not None and mt > 0:
            return mt / 3600.0
    return s.duration_s / 3600.0


def select_genuine_ultras(summaries: list[ActivitySummary], cfg: Config) -> list[GenuineUltra]:
    """Vrais ultras engagés : durée > seuil, vitesse ajustée ≥ seuil, découplage < seuil.

    Le filtre de durée porte sur le temps ÉCOULÉ (un 10 h avec de longs arrêts reste un ultra) ;
    la vitesse ajustée servie est calculée sur la base de durée configurée (écoulé, mouvement
    §4.4, ou hors plateaux dès qu'un modèle d'arrêts est servi). Le PLANCHER de vitesse, lui,
    se lit sur la vitesse écoulée dès qu'un modèle d'arrêts est servi : c'est lui qui écarte
    les enregistrements quasi immobiles (bivouac, montre laissée tourner, journées d'étape),
    dont la vitesse hors plateaux est pourtant celle d'une course — au banc de la Phase 2,
    la base hors plateaux sans cette garde a fait entrer des « ultras » à 500 à 1 800 minutes
    d'arrêt par heure de mouvement (DIAGNOSTIC §10.5)."""
    out: list[GenuineUltra] = []
    for s in summaries:
        # durée, plancher (fixe ou dépendant de la durée), découplage (reconnaissances/randos ;
        # FC absente → non vérifiable, on garde), plus long plateau : genuine_gate_failures
        if genuine_gate_failures(s, cfg):
            continue
        hours = _basis_hours(s, cfg)
        vga_kmh = s.ga_km / hours
        stops_s = getattr(s, "stops_s", None)
        out.append(
            GenuineUltra(
                date=s.date,
                hours=hours,
                vga_kmh=vga_kmh,
                dplus_m=s.dplus_m,
                dist_km=s.dist_km,
                avg_hr=s.avg_hr,
                elapsed_hours=s.duration_s / 3600.0,
                stops_h=None if stops_s is None else stops_s / 3600.0,
                night_share=getattr(s, "night_share", None),
                split_ratio=getattr(s, "half_split_ratio", None),
                mean_alt_m=getattr(s, "mean_alt_m", None),
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


def level_shifts(genuine: list[GenuineUltra], twin: Twin, cfg: Config
                 ) -> tuple[np.ndarray | None, np.ndarray | None]:
    """Décalage de niveau par ultra (Phase 3, P) : ``gain × ln(VC_now ÷ VC_époque)``, VC_époque
    lue dans ``twin.level_marks`` à la date de l'ultra ; 0 sans VC d'époque. Rend
    ``(décalages, masque des ultras recalés)`` ; ``(None, None)`` quand le terme n'est pas
    servi (``level_anchor=none``). Sans VC actuelle plausible : décalages nuls, masque vide."""
    c = cfg.calibration
    n = len(genuine)
    if c.level_anchor != "vc_epoch" or n == 0:
        return None, None
    shifts = np.zeros(n)
    anchored = np.zeros(n, dtype=bool)
    cs = twin.critical_speed
    if cs is None or not cs.plausible or cs.vc_ms <= 0 or not twin.level_marks:
        return shifts, anchored
    for i, g in enumerate(genuine):
        vc_epoch = twin.level_marks.get(g.date) if g.date else None
        if vc_epoch is not None and vc_epoch > 0:
            shifts[i] = float(c.level_anchor_gain) * math.log(cs.vc_ms / vc_epoch)
            anchored[i] = True
    return shifts, anchored


def _shifted_response(v: np.ndarray, link: str, shifts: np.ndarray | None) -> np.ndarray:
    """Réponse de la régression : ln v ou v, ramenée au niveau actuel par les décalages
    (additifs en log, multiplicatifs en linéaire) ; identité sans décalage."""
    if link == "log":
        y = np.log(v)
        return y if shifts is None else y + shifts
    return v if shifts is None else v * np.exp(shifts)


def _design_matrix(h: np.ndarray, dpk: np.ndarray, cfg: Config | None,
                   night_dev: np.ndarray | None = None) -> np.ndarray:
    """Colonnes de la régression : 1, ln T[, D+/km][, écart de nuit]. Le terrain manque en
    ``terrain_term=none`` ; l'écart de nuit n'est là qu'avec ``night_dev``."""
    term = cfg.calibration.terrain_term if cfg is not None else "free"
    cols = [np.ones_like(h), np.log(h)]
    if term != "none":
        cols.append(np.asarray(dpk, dtype=float))
    if night_dev is not None:
        cols.append(np.asarray(night_dev, dtype=float))
    return np.vstack(cols).T


def _pseudo_rows(cfg: Config | None, *, link: str, duration_prior: tuple[float, float] | None,
                 n_cols: int, night_prior: tuple[float, float] | None = None
                 ) -> tuple[list[np.ndarray], list[float]]:
    """Pseudo-observations ridge, communes au fit, à la covariance et aux plis LOO.

    Terrain (``terrain_term=prior_shrunk``) : β2 tiré vers le prior population — en km/h par
    m/km en lien linéaire, en relatif par m/km en lien log. Durée (``duration_term=
    prior_shrunk``) : b tiré vers −α (log) ou −α·v̄ (linéaire), ``duration_prior = (valeur,
    λ)``. Nuit (``night_term=prior_shrunk``) : d tiré vers ``night_prior = (valeur, λ)`` sur la
    dernière colonne. Chaque pseudo-observation pèse √λ dans la régression pondérée."""
    rows: list[np.ndarray] = []
    targets: list[float] = []
    term = cfg.calibration.terrain_term if cfg is not None else "free"
    has_terrain = term != "none"
    if term == "prior_shrunk" and has_terrain:
        prior = (cfg.calibration.default_dplus_penalty_log_per_dpkm if link == "log"
                 else cfg.calibration.default_dplus_penalty_kmh_per_dpkm)
        lam = math.sqrt(max(cfg.calibration.terrain_shrink_lambda, 0.0))
        row = np.zeros(n_cols)
        row[2] = lam
        rows.append(row)
        targets.append(lam * prior)
    if duration_prior is not None and duration_prior[1] > 0:
        lam_b = math.sqrt(duration_prior[1])
        row = np.zeros(n_cols)
        row[1] = lam_b
        rows.append(row)
        targets.append(lam_b * duration_prior[0])
    if night_prior is not None and night_prior[1] > 0:
        lam_d = math.sqrt(night_prior[1])
        row = np.zeros(n_cols)
        row[-1] = lam_d
        rows.append(row)
        targets.append(lam_d * night_prior[0])
    return rows, targets


def _regression_beta(
    h: np.ndarray, y: np.ndarray, dpk: np.ndarray, weights: np.ndarray, cfg: Config | None,
    *, link: str = "linear", duration_prior: tuple[float, float] | None = None,
    night_dev: np.ndarray | None = None, night_prior: tuple[float, float] | None = None,
) -> np.ndarray:
    """Coefficients pondérés de ``y ~ 1 + ln(T) + β2·D+/km [+ d·nuit]`` selon le mode de
    terrain (§4.2). Rend toujours (β0, β1, β2[, d]) : β2 = 0 en ``terrain_term=none``.

    ``y`` = v (lien linéaire, défaut historique) ou ln v (lien log, A2) — même design,
    mêmes poids, mêmes pseudo-observations (:func:`_pseudo_rows`).

    * ``free`` : β2 libre (défaut historique, jusqu'au 2026-07-03).
    * ``none`` : β2 = 0 (la vga est **déjà** ajustée à la pente → pas de double-comptage).
    * ``prior_shrunk`` (défaut) : ridge de β2 vers le prior population via une pseudo-observation
      pondérée ``λ`` (atténue les points de levier terrain, ex. un ultra à D+/km extrême).

    ``cfg`` absent ⇒ ``free`` (rétro-compatibilité du golden)."""
    term = cfg.calibration.terrain_term if cfg is not None else "free"
    sw = np.sqrt(np.asarray(weights, dtype=float))
    X = _design_matrix(h, dpk, cfg, night_dev)
    Xw = X * sw[:, None]
    yw = y * sw
    rows, targets = _pseudo_rows(cfg, link=link, duration_prior=duration_prior,
                                 n_cols=X.shape[1], night_prior=night_prior)
    if rows:
        Xw = np.vstack([Xw, np.array(rows)])
        yw = np.concatenate([yw, np.array(targets)])
    b, *_ = np.linalg.lstsq(Xw, yw, rcond=None)
    b = np.asarray(b, dtype=float)
    if term == "none":
        b = np.concatenate([b[:2], [0.0], b[2:]])
    return b


def _beta_covariance(
    genuine: list[GenuineUltra], weights: np.ndarray, sigma: float, cfg: Config | None,
    *, link: str = "linear", duration_prior: tuple[float, float] | None = None,
    night_dev: np.ndarray | None = None, night_prior: tuple[float, float] | None = None,
) -> np.ndarray:
    """Covariance des coefficients : σ²(XᵀWX)⁻¹ (3×3, ou 4×4 avec le terme de nuit),
    cohérente avec le mode de terrain.

    C'est le terme de LEVIER de la loi prédictive (Var = σ²(1 + x₀ᵀ(XᵀWX)⁻¹x₀)) : il grandit
    quand la cible sort de l'enveloppe des (ln T, D+/km) d'entraînement — le même phénomène
    que les plis d'« extrapolation » de la LOO, jusqu'ici absent de l'intervalle vendu.
    ``sigma`` est dans les unités du lien (km/h ou relatif).

    * ``none`` : β2 fixé à 0 → ligne/colonne β2 nulles ;
    * ``prior_shrunk`` / priors de durée et de nuit : les pseudo-observations ridge entrent
      dans XᵀWX (comme dans le fit) ;
    * ``pinv`` (pas ``inv``) : design mal conditionné → covariance large, jamais NaN.
    """
    h = np.array([g.hours for g in genuine])
    dpk = np.array([g.dplus_per_km for g in genuine])
    sw = np.sqrt(np.asarray(weights, dtype=float))
    term = cfg.calibration.terrain_term if cfg is not None else "free"
    X = _design_matrix(h, dpk, cfg, night_dev) * sw[:, None]
    rows, _ = _pseudo_rows(cfg, link=link, duration_prior=duration_prior, n_cols=X.shape[1],
                           night_prior=night_prior)
    if rows:
        X = np.vstack([X, np.array(rows)])
    core = sigma**2 * np.linalg.pinv(X.T @ X)
    if term == "none":
        k = core.shape[0] + 1
        cov = np.zeros((k, k))
        cov[:2, :2] = core[:2, :2]
        if k > 3:
            cov[:2, 3:] = core[:2, 2:]
            cov[3:, :2] = core[2:, :2]
            cov[3:, 3:] = core[2:, 2:]
        return cov
    return core


def _fit_regression(
    genuine: list[GenuineUltra], weights: np.ndarray | None = None, cfg: Config | None = None,
    *, link: str = "linear", duration_prior: tuple[float, float] | None = None,
    night_dev: np.ndarray | None = None, night_prior: tuple[float, float] | None = None,
    shifts: np.ndarray | None = None,
):
    """β = lstsq **pondéré** (v ~ 1 + ln(T) + D+/km [+ nuit], ou ln v en lien log). Renvoie
    (beta, residuals), les résidus dans les unités du lien.

    Poids ``None`` ou égaux ⇒ moindres carrés ordinaires (le golden reste identique). Le mode de
    terrain (``cfg.calibration.terrain_term``), le prior de durée et le terme de nuit sont
    appliqués ici ET dans la LOO à l'identique."""
    h = np.array([g.hours for g in genuine])
    v = np.array([g.vga_kmh for g in genuine])
    y = _shifted_response(v, link, shifts)
    dpk = np.array([g.dplus_per_km for g in genuine])
    w = np.ones_like(h) if weights is None else np.asarray(weights, dtype=float)
    beta = _regression_beta(h, y, dpk, w, cfg, link=link, duration_prior=duration_prior,
                            night_dev=night_dev, night_prior=night_prior)
    cols = [np.ones_like(h), np.log(h), dpk]
    if night_dev is not None:
        cols.append(np.asarray(night_dev, dtype=float))
    X = np.vstack(cols).T
    resid = y - X @ beta
    return beta, resid


def night_deviations(genuine: list[GenuineUltra], weights: np.ndarray
                     ) -> tuple[np.ndarray, float | None]:
    """Écart de part de nuit de chaque ultra à la moyenne PONDÉRÉE des ultras mesurés ;
    un ultra sans mesure est à l'écart nul. ``(écarts, moyenne)`` ; moyenne None si aucun
    ultra ne porte de part de nuit (terme inactif)."""
    n = len(genuine)
    shares = np.array([np.nan if g.night_share is None else float(g.night_share)
                       for g in genuine], dtype=float)
    known = np.isfinite(shares)
    if not known.any():
        return np.zeros(n), None
    w = np.asarray(weights, dtype=float)
    sw = float(w[known].sum())
    mean = (float(np.sum(w[known] * shares[known]) / sw) if sw > 0
            else float(np.mean(shares[known])))
    dev = np.where(known, shares - mean, 0.0)
    return dev, mean


def _night_prior(genuine: list[GenuineUltra], weights: np.ndarray, cfg: Config, link: str
                 ) -> tuple[float, float] | None:
    """Prior (valeur, λ) du coefficient de nuit : ``night_prior_log_per_share`` en lien log,
    × v̄ en lien linéaire ; None si le terme n'est pas demandé."""
    c = cfg.calibration
    if c.night_term != "prior_shrunk":
        return None
    d = float(c.night_prior_log_per_share)
    if link != "log":
        sw = float(np.sum(weights))
        v_bar = (float(np.sum(weights * np.array([g.vga_kmh for g in genuine])) / sw) if sw > 0
                 else float(np.mean([g.vga_kmh for g in genuine])))
        d *= v_bar
    return (d, float(c.night_shrink_lambda))


def stops_statistics(genuine: list[GenuineUltra], weights: np.ndarray, cfg: Config
                     ) -> dict:
    """Taux d'arrêt personnel r̄ (h d'arrêt par h de mouvement, pondéré récence × maximalité),
    dispersion de ln(1 + r) entre ultras (corrigée du n effectif) et heures de mouvement de
    référence (moyenne géométrique pondérée) ; repli population sans ultra mesuré."""
    c = cfg.calibration
    rates, ws, mh = [], [], []
    for g, w in zip(genuine, np.asarray(weights, dtype=float)):
        r = g.stops_rate
        if r is None or w <= 0:
            continue
        rates.append(r)
        ws.append(float(w))
        mh.append(float(g.moving_hours))
    if not rates:
        return {"rate": float(c.stops_rate_population), "sd_log": 0.0, "ref_hours": None,
                "origin": "population", "n": 0}
    r = np.asarray(rates)
    w = np.asarray(ws)
    sw = float(w.sum())
    rate = float(np.sum(w * r) / sw)
    lr = np.log1p(r)
    lbar = float(np.sum(w * lr) / sw)
    n_eff = _effective_n(w)
    var = float(np.sum(w * (lr - lbar) ** 2) / sw)
    sd = float(np.sqrt(var * n_eff / (n_eff - 1.0))) if n_eff > 1.0 else 0.0
    ref = float(np.exp(np.sum(w * np.log(np.asarray(mh))) / sw))
    return {"rate": rate, "sd_log": sd, "ref_hours": ref, "origin": "ultras", "n": len(rates)}


def _duration_prior(
    genuine: list[GenuineUltra], weights: np.ndarray, twin: Twin, cfg: Config, link: str
) -> tuple[tuple[float, float] | None, str | None]:
    """Prior sur la pente en durée (A1) : ``(valeur, λ)`` et son origine, ou ``(None, None)``.

    Riegel : v ∝ T^−α ⇒ en lien log b_prior = −α ; en lien linéaire la pente est en km/h par
    unité de ln T, soit −α·v̄ avec v̄ la vga moyenne pondérée des vrais ultras."""
    c = cfg.calibration
    if c.duration_term != "prior_shrunk" or c.duration_shrink_lambda <= 0:
        return None, None
    # source demandée, puis repli honnête : efficacité-durée ou queue → α historique → population
    candidates: list[tuple[str, float | None]] = []
    if c.duration_prior_source == "efficiency":
        candidates = [("efficiency", twin.alpha_eff), ("twin_alpha", twin.alpha)]
    elif c.duration_prior_source == "record_tail":
        candidates = [("record_tail", twin.alpha_tail), ("twin_alpha", twin.alpha)]
    elif c.duration_prior_source == "twin_alpha":
        candidates = [("twin_alpha", twin.alpha)]
    alpha, origin = float(c.duration_prior_alpha_population), "population"
    for name, value in candidates:
        if value is not None and value > 0:
            alpha, origin = float(value), name
            break
    if link == "log":
        return (-alpha, float(c.duration_shrink_lambda)), origin
    sw = float(np.sum(weights))
    v_bar = (float(np.sum(weights * np.array([g.vga_kmh for g in genuine])) / sw) if sw > 0
             else float(np.mean([g.vga_kmh for g in genuine])))
    return (-alpha * v_bar, float(c.duration_shrink_lambda)), origin


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
    w_tuple = tuple(float(x) for x in weights)

    # recalage sur le niveau de l'époque (Phase 3, P) : mêmes décalages dans tous les régimes
    shifts, anchored = level_shifts(genuine, twin, cfg)
    level_kw: dict = {"level_anchor": c.level_anchor}
    if shifts is not None:
        n_anchored = int(anchored.sum())
        level_kw.update(level_shift=tuple(float(x) for x in shifts), level_n_anchored=n_anchored)
        if n_anchored:
            mean_pct = 100.0 * (math.exp(float(np.mean(shifts[anchored]))) - 1.0)
            notes.append(f"Niveau de l'époque : {n_anchored} ultra(s) sur {n} recalé(s) sur la "
                         f"VC actuelle (décalage moyen {mean_pct:+.1f} % de vitesse).")
        elif n:
            notes.append("Recalage de niveau demandé mais aucune VC d'époque exploitable : "
                         "ultras pris tels que courus.")
    # queue de l'enveloppe des replis (Phase 3, B1/B2)
    tail_alpha, tail_from_s, tail_source, tail_note = envelope_tail(twin, cfg)
    tail_kw: dict = {"tail_alpha": tail_alpha, "tail_from_s": tail_from_s, "tail_source": tail_source}

    # modèle d'arrêts (Phase 2, B4) : mêmes statistiques dans tous les régimes
    stops_kw: dict = {"stops_model": c.stops_model}
    if c.stops_model != "carved":
        st = stops_statistics(genuine, weights, cfg) if n else {
            "rate": float(c.stops_rate_population), "sd_log": 0.0, "ref_hours": None,
            "origin": "population", "n": 0}
        stops_kw.update(stops_rate=st["rate"], stops_rate_sd_log=st["sd_log"],
                        stops_ref_hours=st["ref_hours"], stops_elasticity=float(c.stops_duration_elasticity),
                        stops_rate_origin=st["origin"])
        if st["origin"] == "population":
            notes.append(f"Arrêts : aucun vrai ultra n'en porte la mesure, taux population "
                         f"{st['rate']:.3f} h/h appliqué.")
        else:
            notes.append(f"Arrêts personnels : {st['rate'] * 60:.1f} min par heure de mouvement "
                         f"sur {st['n']} ultra(s), base hors plateaux.")

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
        link = c.link
        duration_prior, prior_origin = _duration_prior(genuine, weights, twin, cfg, link)
        # terme de nuit (C2) : actif seulement si le prior est demandé ET qu'au moins un
        # ultra porte une part de nuit mesurée (sinon la colonne serait vide)
        night_prior = _night_prior(genuine, weights, cfg, link)
        night_dev, night_mean = (night_deviations(genuine, weights) if night_prior is not None
                                 else (None, None))
        if night_prior is not None and night_mean is None:
            notes.append("Terme de nuit demandé mais aucun vrai ultra n'a de part de nuit "
                         "mesurable (position ou départ absents) : terme inactif.")
            night_prior, night_dev = None, None
        beta, resid = _fit_regression(genuine, weights, cfg, link=link,
                                      duration_prior=duration_prior,
                                      night_dev=night_dev, night_prior=night_prior,
                                      shifts=shifts)
        # σ pondérée : variance résiduelle pondérée corrigée par le nb effectif de degrés de
        # liberté. Se réduit EXACTEMENT à √(Σr²/(n−3)) quand les poids sont égaux (golden intact).
        sw = float(weights.sum())
        wmse = float(np.sum(weights * resid**2) / sw) if sw > 0 else 0.0
        n_params = 3.0 + (1.0 if night_dev is not None else 0.0)
        dof_eff = max(n_eff - n_params, 1.0)
        sigma = float(np.sqrt(wmse * n_eff / dof_eff))
        sigma = max(sigma, c.regression_min_sigma_log if link == "log" else c.regression_min_sigma_kmh)
        beta_cov = _beta_covariance(genuine, weights, sigma, cfg, link=link,
                                    duration_prior=duration_prior,
                                    night_dev=night_dev, night_prior=night_prior)
        if link == "log":
            # équivalent km/h pour l'affichage : σ relatif × vga moyenne pondérée des ultras
            v_bar = float(np.sum(weights * np.array([g.vga_kmh for g in genuine])) / sw) if sw > 0 else 0.0
            sigma_kmh, sigma_log = sigma * v_bar, sigma
        else:
            sigma_kmh, sigma_log = sigma, None
        notes.append(
            f"Régression personnelle pondérée par récence sur {n} vrais ultras "
            f"(≈ {n_eff:.1f} effectifs, demi-vie {c.recency_halflife_days:.0f} j)."
        )
        if link == "log":
            notes.append("Lien log (forme de Riegel) : erreur multiplicative, bandes asymétriques.")
        if duration_prior is not None:
            notes.append(
                f"Pente en durée tirée vers {duration_prior[0]:+.3f} ({prior_origin}, "
                f"λ = {duration_prior[1]:g})."
            )
        night_coef = None
        if night_dev is not None and night_prior is not None:
            night_coef = float(beta[3])
            notes.append(
                f"Nuit : coefficient {night_coef:+.3f} par unité de part de nuit (prior "
                f"{night_prior[0]:+.3f}, λ = {night_prior[1]:g}), part de nuit moyenne des "
                f"ultras {100 * night_mean:.0f} %."
            )
        return UltraCalibration(
            regime=REGIME_REGRESSION,
            genuine=genuine,
            sigma_kmh=sigma_kmh,
            notes=notes,
            beta=(float(beta[0]), float(beta[1]), float(beta[2])),
            weights=w_tuple,
            beta_cov=tuple(tuple(float(x) for x in row) for row in beta_cov),
            n_eff=n_eff,
            recency_halflife_days=c.recency_halflife_days,
            maximality_mode=c.maximality_mode,
            maximality_weights=max_w_tuple,
            link=link,
            sigma_log=sigma_log,
            duration_prior=duration_prior,
            duration_prior_origin=prior_origin,
            night_coef=night_coef,
            night_share_mean=night_mean if night_coef is not None else None,
            night_prior=night_prior if night_coef is not None else None,
            **stops_kw,
            **level_kw,
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
            maximality_mode=c.maximality_mode, maximality_weights=max_w_tuple, link=c.link,
            weights=w_tuple if n else None, **stops_kw,
        )

    penalty = c.default_dplus_penalty_kmh_per_dpkm
    if tail_note:
        notes.append(tail_note)
    elif tail_alpha is not None:
        notes.append(f"Enveloppe : au-delà de {tail_from_s / 3600:.0f} h, décroissance en "
                     f"t^−{tail_alpha:.3f} ({tail_source}) au lieu de t^−{twin.alpha:.3f}.")

    # ---------- régime mélange (1–2 ultras) : recalage du niveau ----------
    if n >= 1:
        # Recalage PONDÉRÉ par les mêmes poids (récence × maximalité) que partout ailleurs :
        # le blend est précisément le régime où l'on tombe quand les vieux ultras (ou les
        # sorties non engagées, poids de maximalité 0) ne doivent plus peser — ils ne doivent
        # pas non plus recaler le niveau à poids plein. Repli non pondéré si Σw = 0.
        offsets: list[float] = []
        offset_w: list[float] = []
        for i, g in enumerate(genuine):
            # même enveloppe (queue comprise) que la prédiction, ultra ramené au niveau actuel
            v_env = _envelope_ms(twin.endurance_coef, twin.alpha, g.hours * 3600.0,
                                 tail_alpha, tail_from_s)
            base = v_env * 3.6 + penalty * g.dplus_per_km
            v_i = g.vga_kmh * (math.exp(float(shifts[i])) if shifts is not None else 1.0)
            offsets.append(v_i - base)
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
            link=c.link,
            weights=w_tuple,
            **stops_kw,
            **level_kw,
            **tail_kw,
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
        link=c.link,
        weights=w_tuple if n else None,
        **tail_kw,
        **stops_kw,
    )


__all__ = [
    "GenuineUltra",
    "UltraCalibration",
    "select_genuine_ultras",
    "maximality_weights",
    "recency_weights",
    "build_calibration",
    "night_deviations",
    "stops_statistics",
    "REGIME_REGRESSION",
    "REGIME_BLEND",
    "REGIME_VC_E",
    "REGIME_INSUFFICIENT",
]
