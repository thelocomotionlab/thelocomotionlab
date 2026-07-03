"""Chargement de la configuration du moteur.

Règle d'or (calquée sur services/tracking-cache/src/config.ts) :
  * les **chemins** viennent de l'environnement (``DATA_DIR``, ``TWIN_CONFIG_PATH``) —
    AUCUN chemin en dur dans le code ;
  * les **constantes scientifiques** viennent de ``twin.config.json`` (versionné,
    cf. twin-theory §8) avec des valeurs par défaut codées ici en filet de sécurité ;
  * aucun secret n'est lu ici (le moteur n'en a pas à ce stade).

Tout le reste du moteur reçoit un objet :class:`Config` immuable — jamais de lecture
d'environnement ou de fichier ailleurs.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any


# --------------------------------------------------------------------------- #
# Sous-blocs de configuration (1 dataclass par section de twin.config.json).
# Les valeurs ici sont les DÉFAUTS du cas de référence (twin-theory §12) : elles
# servent de filet si une clé manque dans le JSON.
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class CourseParams:
    grid_step_m: float = 5.0
    smooth_window_m: float = 150.0
    grade_clip: float = 0.45
    cr0: float = 3.6
    # Découpage automatique quand la course ne fournit pas de ravitaillements (mode GPX-only).
    default_segment_km: float = 10.0


@dataclass(frozen=True)
class TwinParams:
    grade_base_m: float = 50.0
    f_cap: float = 3.0
    v_max_ms: float = 7.0
    alt_smooth_s: int = 5
    record_durations_s: tuple[int, ...] = (
        30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 780, 900, 1200, 1500,
        1800, 2400, 3000, 3600, 4500, 5400, 7200, 9000, 10800, 14400, 18000,
        21600, 28800,
    )
    vc_flat_threshold: float = 0.10
    # critère « effort plat propre » : (v_ga − v_raw)/v_raw < seuil. Par défaut le ratio est
    # SIGNÉ (comportement avec lequel le golden a été capturé) : un record en descente nette
    # (v_ga ≪ v_raw) passe le critère. ``vc_flat_symmetric=true`` applique la VALEUR ABSOLUE
    # (twin-theory §2.4) — recommandé, à valider sur le golden réel avant bascule du défaut.
    vc_flat_symmetric: bool = False
    vc_window_s: tuple[int, int] = (600, 5400)
    vc_bootstrap_n: int = 2000
    vc_bootstrap_seed: int = 0
    # plancher de durée du fit VC (garde-fou twin-theory §2.3 : les efforts courts, presque
    # toujours en côte, sont sur-crédités par Minetti). 600 = début de fenêtre (no-op, valeur
    # de capture du golden) ; 1800 = réglage « théorie stricte » à valider sur le golden réel.
    vc_short_effort_floor_s: int = 600
    # --- locomotion vs arrêts (twin-theory §2, Problème « écoulé ≫ mouvement ») -----------
    # ``elapsed`` (défaut, comportement actuel) : durée = temps écoulé de bout en bout.
    # ``moving`` : durée = temps en mouvement (secondes où la vitesse dépasse le seuil), pour
    #   ne pas diluer l'allure des ultras avec les longs arrêts (ravitos, sommeil). Repli
    #   automatique sur ``elapsed`` quand le temps de mouvement n'a pas pu être mesuré.
    speed_basis: str = "elapsed"
    moving_speed_threshold_ms: float = 0.5    # vitesse au-dessus de laquelle on compte « en mouvement »
    # --- robustesse de la courbe record (Problème A : VC/exposant aberrants) ---
    vc_max_plausible_ms: float = 6.0          # plafond physiologique : un point « plat » plus rapide
    #                                           est rejeté avant l'ajustement VC ; une VC au-dessus
    #                                           est marquée non plausible (confiance réduite, pas de % VC).
    record_min_support: int = 2               # nb min d'activités soutenant un point record (sinon
    #                                           on retient la N-ième meilleure → une seule activité
    #                                           contaminée ne peut plus fixer VC ni l'exposant).
    record_reject_speed_ms: float = 6.5       # vitesse brute soutenue impossible pour de la course :
    record_reject_window_s: int = 600         #   toute fenêtre ≥ ce seuil écarte l'activité (vélo/artefact).
    endurance_window_s: tuple[int, int] = (1800, 21600)
    decouple_min_duration_s: int = 4500       # durée min pour CALCULER le découplage
    durability_min_hours: float = 10.0        # durabilité reportée sur les efforts longs (ultras)
    # --- base du découplage (revue C7) ------------------------------------------------------
    # ``elapsed`` (défaut historique) : moyennes sur TOUTES les secondes, arrêts compris — les
    #   ravitos (v≈0, FC>60) plombent l'efficacité de la moitié qui les contient (la 2e en
    #   ultra) : le découplage mesure alors en partie l'ARRÊT, pas l'usure physiologique.
    # ``moving`` : seuls les échantillons en mouvement comptent (même seuil que moving_time).
    # ``decouple_skip_start_s`` ignore l'échauffement (dérive FC initiale) ; 0 = historique.
    decouple_basis: str = "elapsed"           # {elapsed, moving}
    decouple_skip_start_s: int = 0
    # --- base du D+ des activités (revue C1) ------------------------------------------------
    # Le D+ athlète (altitude lissée ~5 s ≈ 15-20 m de base à allure ultra) et le D+ parcours
    # (fenêtre 150 m) ne sont PAS à la même échelle : le D+ est une variation totale, il gonfle
    # quand la fenêtre diminue → β2 est APPRIS sur un axe D+/km gonflé puis APPLIQUÉ à l'axe
    # dégonflé du parcours (pénalité terrain trop douce, biais optimiste sur parcours raides).
    # DÉFAUT = ``distance_150m`` depuis le 2026-07-02 : mesure sur l'archive réelle de référence
    # (tools/diag_dplus, 30 activités ≥ 5 h) → écart médian +14,9 % (min +8,3 %, max +39,9 %),
    # trois fois le seuil de déclenchement (DIAGNOSTIC §9.6). Rollback : ``time_5s``.
    # Recapture des références de régression (twin-theory §12) et régénération du fixture
    # Montagnhard : tools/regen_montagnhard_fixture (archive réelle requise).
    dplus_basis: str = "distance_150m"        # {time_5s, distance_150m}
    dplus_smooth_window_m: float = 150.0


@dataclass(frozen=True)
class CalibrationParams:
    genuine_min_hours: float = 10.0
    genuine_min_ga_kmh: float = 5.5
    genuine_max_decouple_pct: float = 30.0
    min_ultras_regression: int = 3
    # pondération par récence (Problème B : non-stationnarité des ultras sur plusieurs saisons)
    recency_halflife_days: float = 365.0                 # demi-vie de la décroissance exponentielle
    #                                                      temporelle (≤ 0 → pondération désactivée) ;
    #                                                      appliquée à l'identique dans la régression ET
    #                                                      la validation croisée leave-one-out. Le régime
    #                                                      régression n'est retenu que si le nombre EFFECTIF
    #                                                      d'ultras (N_eff = (Σw)²/Σw²) ≥ min_ultras_regression.
    # --- filtre de maximalité (Problème C : hétérogénéité d'intention des ultras) ----------
    # Le modèle v(T) suppose des efforts MAXIMAUX ; mêler des sorties faciles (footings longs)
    # gonfle σ et casse la validation croisée. On homogénéise via l'intensité relative au plafond
    # d'endurance de l'athlète : r_i = vga_i / (enveloppe_vga(T_i)·3.6). ``off`` = ancien
    # comportement (poids 1 partout) ; ``soft_weight`` = pondération douce w=clip((r−floor)/(ref−floor))
    # (DÉFAUT ACTIVÉ, cf. twin.config.json) ; ``hard_filter`` = retrait franc des efforts non engagés.
    # Le poids est appliqué À L'IDENTIQUE dans le fit ET la LOO (comme la récence). Second signal
    # anti-faux-positif (course dure mais raide) : la FC normalisée à la FC max des ultras ne peut
    # que REMONTER le poids (jamais le baisser). NB : sur le golden, les ultras étant near-maximaux,
    # tous les poids valent 1 → régression inchangée (le golden reste intact même activé).
    maximality_mode: str = "soft_weight"                 # {off, soft_weight, hard_filter}
    maximality_r_floor: float = 0.80                     # r ≤ floor → effort jugé non engagé (poids 0)
    maximality_r_ref: float = 0.95                       # r ≥ ref  → effort pleinement engagé (poids 1)
    maximality_hr_floor: float = 0.85                    # FC/FCmax(ultras) ≤ floor → ne rattrape pas
    maximality_hr_ref: float = 0.95                      # FC/FCmax(ultras) ≥ ref  → rattrape à 1 (course dure)
    # référence de l'intensité relative (§A — robustesse inter-athlètes, sans réglage par athlète) :
    #   ``envelope_absolute`` = r comparé au seul plafond extrapolé (sensible à un biais d'extrapolation
    #     de l'enveloppe : si elle sur-estime le plafond, des efforts MAXIMAUX peuvent passer sous le
    #     seuil et être écartés à tort) ;
    #   ``self_relative`` (DÉFAUT) = r comparé AUSSI à un pôle robuste (quantile) des propres ultras de
    #     l'athlète → invariant à l'échelle de l'enveloppe. Ce signal relatif ne peut que REMONTER le
    #     poids (rescue) : il protège les efforts maximaux d'une enveloppe biaisée sans jamais casser le
    #     no-op (un athlète « propre », tous ses efforts au plafond, garde tous ses poids à 1).
    maximality_reference: str = "self_relative"          # {envelope_absolute, self_relative}
    maximality_self_quantile: float = 0.90               # pôle robuste des r de l'athlète (self_relative)
    # --- terme de terrain β2·(D+/km) : anti double-comptage (la vga est DÉJÀ ajustée pente) ----
    # ``free`` (défaut, actuel) : β2 libre. ``none`` : β2=0 (la pente est déjà dans la vga).
    # ``prior_shrunk`` : ridge de β2 vers le prior population, atténue les points de levier terrain.
    # DÉFAUT ``prior_shrunk`` depuis le 2026-07-03 (revue) : β2 est le coefficient le moins
    # identifié (n_eff faible, levier terrain) ; le ridge vers le prior population améliore À LA
    # FOIS la MAE LOO (8,8 → 8,3 sur le fixture) et la largeur d'intervalle (−8 %). No-op sur le
    # cas de référence (son β2 libre ≈ le prior, qu'il définit). Rollback : ``free``.
    terrain_term: str = "prior_shrunk"                   # {free, none, prior_shrunk}
    terrain_shrink_lambda: float = 50.0                  # force du ridge (n. de pseudo-obs vers le prior)
    # repli « peu d'ultras » (twin-theory §3). Prior population (β2) = β2 du cas de référence,
    # RECAPTURÉ le 2026-07-02 sur l'échelle D+ « distance 150 m » (C1) — l'ancien −0.0148
    # datait de l'échelle 5 s (rapport ×1,149 = exactement l'écart d'échelle mesuré).
    default_dplus_penalty_kmh_per_dpkm: float = -0.0170
    regression_min_sigma_kmh: float = 0.20               # plancher de σ (anti-surconfiance)
    blend_sigma_kmh: float = 0.45                        # 1–2 ultras : incertitude élargie
    vc_e_sigma_kmh: float = 0.80                         # 0 ultra : extrapolation VC+E


@dataclass(frozen=True)
class PredictionParams:
    mc_n: int = 5000
    mc_seed: int = 1
    interval_low_pct: int = 10
    interval_high_pct: int = 90
    v_floor_kmh: float = 2.0
    # --- source d'incertitude du Monte-Carlo (revue 2026-07, C3) --------------------------
    # ``sigma_only`` (comportement historique) : tirages v = v(T*) + ε, ε ~ N(0, σ) — seul le
    #   bruit résiduel est propagé ; l'intervalle ne voit NI le levier d'extrapolation
    #   (incertitude des β) NI la rétroaction T↔v.
    # ``predictive`` (DÉFAUT depuis le 2026-07-02, régime régression uniquement) :
    #   β ~ N(β̂, σ²(XᵀWX)⁻¹) + ε ~ N(0, σ), point fixe T = Deq/v(T) re-résolu PAR TIRAGE
    #   (vectorisé). L'intervalle s'élargit là où la cible sort de l'enveloppe des
    #   (ln T, D+/km) d'entraînement — le phénomène que le gate honnête marque en LOO.
    #   Validation sur le cas de référence (capture 2026-07-02) : Nice est une extrapolation
    #   de durée (31,3 h vs 21,3 h max des vrais ultras, levier h₀≈2,7) → intervalle 80 %
    #   [30,0–32,8] → [≈28,9–34,7] (rel 0,19, critère largeur toujours 🟢) ; fixture
    #   Montagnhard : i80 0,19 → 0,68 (critère largeur 🟠, voulu). Rollback : sigma_only.
    #   Blend/vc_e : repli automatique sur sigma_only.
    mc_mode: str = "predictive"                          # {sigma_only, predictive}
    # --- source des BORNES DE SÉCURITÉ (S5, conforme normalisé — revue 2026-07) -------------
    # ``mc`` (défaut) : percentiles du Monte-Carlo (paramétrique). ``conformal_normalized`` :
    # quantile pondéré des scores LOO |erreur|/sd_pred, remis à l'échelle de l'écart-type
    # prédictif de la CIBLE — calibré sur ce que le modèle a DÉMONTRÉ hors échantillon, tout en
    # conservant la sensibilité au levier d'extrapolation (Vovk ; Romano-Candès 2019, adapté).
    # Mesuré (fixture Montagnhard, cible T≈19 h) : bornes 80 % [15,2-28,1] (12,9 h, MC) →
    # [14,9-23,2] (8,2 h) — la queue paramétrique jamais observée disparaît, l'asymétrie du MC
    # est remplacée par ±sym. Garde-fou : jamais plus étroit que la fourchette de course (MC).
    # Repli sur ``mc`` sans validation croisée (blend/vc_e) ou à moins de 4 plis.
    interval_source: str = "mc"                          # {mc, conformal_normalized}


@dataclass(frozen=True)
class PacingParams:
    fade_delta: float = 0.085
    # --- source du fade (revue 2026-07, T3) -----------------------------------------------
    # ``config`` (défaut, comportement historique) : Δ = fade_delta identique pour tous.
    # ``durability`` : Δ dérivé du DÉCOUPLAGE MESURÉ de l'athlète — si l'efficacité chute de
    #   X % entre les deux moitiés à effort constant, la vitesse fait de même ; un fade
    #   linéaire (1+Δ → 1−Δ) réalise (1−Δ)/(1+Δ) = 1 − X/100, d'où Δ = X/(200−X), borné
    #   [fade_delta_min, fade_delta_max]. Repli sur fade_delta si durabilité non mesurable.
    #   Contrôle de cohérence : le défaut historique Δ=0,085 correspond à X ≈ 15,7 %.
    fade_source: str = "config"          # {config, durability}
    fade_delta_min: float = 0.04
    fade_delta_max: float = 0.13
    default_stop_min: float = 5.0
    major_base_extra_min: float = 10.0
    # --- fenêtres horaires (revue C6) : ``true`` (défaut historique) met à l'échelle TOUT le
    # cumul (arrêts compris) par le multiplicateur Monte-Carlo — un scénario lent « rallonge »
    # donc les ravitos, ce qui n'a pas de sens physique. ``false`` : seul le MOUVEMENT est mis
    # à l'échelle, les arrêts déjà passés s'ajoutent constants (fenêtres un peu plus justes).
    scale_stops: bool = True
    # --- double bande (S5-présentation, 2026-07-03) -----------------------------------------
    # Les fenêtres PAR SEGMENT du plan utilisent la « fourchette de course » (bande de
    # PLANIFICATION, défaut interquartile 25-75 : une course sur deux s'y joue) ; l'intervalle
    # de la PRÉDICTION (interval_low/high_pct, défaut 80 %) devient les « bornes de sécurité »
    # (logistique/proches). Deux questions différentes, deux bandes étiquetées par leur USAGE —
    # on n'affiche jamais l'une en la faisant passer pour l'autre.
    plan_window_low_pct: int = 25
    plan_window_high_pct: int = 75
    # au-delà de cette largeur relative des bornes de sécurité ((hi−lo)/T), le rapport ajoute
    # la table « scénarios de course » (rapide/central/prudent par segment) : la dispersion
    # devient un outil de pilotage. 0 = toujours affichée ; très grand = jamais. Cas étroits
    # (réf. Nice ~0,19) : non affichée.
    scenario_rel_width: float = 0.35


@dataclass(frozen=True)
class NarrativeParams:
    """Seuils de PRÉSENTATION du rapport (choix des mots, jamais de la science).

    Ils changent le texte livré au client → ce sont des constantes de comportement, donc
    elles vivent en config comme les autres (règle CLAUDE.md « aucune constante en dur »).
    Les valeurs par défaut sont calées pour que le cas de référence (E≈1,22, découplage
    ~21 %, intensité ~63 % VC) tombe au milieu des catégories."""

    e_diesel: float = 1.12               # E ≤ → « très endurant / diesel »
    e_fade: float = 1.30                 # E ≥ → « décline plus nettement sur la durée »
    durability_excellent_pct: float = 15.0   # découplage ≤ → « excellente »
    durability_good_pct: float = 25.0        # ≤ → « bonne », au-delà → « à surveiller »
    vc_frac_low: float = 0.70            # intensité/VC < → « très loin du plafond »
    vc_frac_sustained: float = 0.85      # < → « confortable » ; ≥ → « engagée »
    recent_weeks: int = 4                # semaines de volume récent affichées
    minetti_example_grade: float = 0.15  # pente de l'exemple pédagogique Minetti (±)


@dataclass(frozen=True)
class SufficiencyParams:
    history_months_green: float = 6.0
    history_months_orange: float = 3.0
    usable_green: int = 120
    usable_orange: int = 50
    long_efforts_green: int = 2
    long_efforts_orange: int = 1
    cv_error_green_pct: float = 5.0
    cv_error_orange_pct: float = 10.0
    long_effort_min_fraction: float = 0.5
    quality_green_frac: float = 0.5
    quality_orange_frac: float = 0.15
    # --- gate honnête tolérant à l'influence (§4.3) --------------------------------------
    # ``strict`` (ancien comportement) : le verdict s'appuie sur la MAE brute de validation croisée
    #   (un seul pli d'extrapolation peut basculer le vendable). ``honest`` (DÉFAUT ACTIVÉ) : le
    #   verdict s'appuie sur la MAE d'INTERPOLATION (plis dont le point retiré reste dans l'enveloppe
    #   des prédicteurs) + une sanité sur la largeur relative de l'intervalle — cohérent avec
    #   « Limites assumées ». N'ajoute qu'un critère et change la source de la MAE de suffisance.
    gate_policy: str = "honest"                          # {strict, honest}
    interval_rel_width_green: float = 0.5                # (haut−bas)/central ≤ → 🟢 (honest)
    interval_rel_width_orange: float = 1.0               # ≤ → 🟠, au-delà → 🔴 (honest)
    # --- CV incalculable (régimes blend/vc_e) : jamais 🟢 sans indice de confiance ------------
    # ``cap_orange`` (défaut, réconcilie twin-theory §3 « 1–2 ultras → souvent 🟠 » et §10) :
    #   le verdict est plafonné à 🟠 quand la validation croisée n'est pas calculable — on vend,
    #   on prévient. ``ignore`` = ancien comportement (le critère absent n'entrait pas au verdict,
    #   un athlète sans AUCUNE validation pouvait sortir 🟢).
    cv_missing_policy: str = "cap_orange"                # {cap_orange, ignore}
    # --- fraîcheur des données (revue C8) -----------------------------------------------------
    # Jours entre la DERNIÈRE activité datée et la date d'analyse. Aucun critère ne portait le
    # garde-fou « forme du jour inconnue » (twin-theory §2.7/§9) : une archive s'arrêtant il y a
    # 8 mois pouvait être 🟢 partout (« Historique » mesure l'étendue, pas la fraîcheur).
    # Évalué seulement quand la date d'analyse est connue (pipeline : date du jour) ; ≤ 0 désactive.
    # NB : ancrer la PONDÉRATION de récence sur la date d'analyse serait inerte (facteur commun
    # sur tous les poids — régression, σ et N_eff de Kish invariants d'échelle) : la fraîcheur
    # se juge ici, pas dans les poids.
    freshness_days_green: float = 30.0
    freshness_days_orange: float = 90.0
    # « efforts longs proches de la cible » : un enregistrement-artefact (montre laissée tourner
    # 12 h à ~1 km/h) ne doit pas compter. Plancher d'allure ajustée = cette fraction du seuil
    # « vrai ultra » (calibration.genuine_min_ga_kmh) — 0 restaure l'ancien comportement.
    long_effort_min_ga_fraction: float = 0.5


@dataclass(frozen=True)
class Config:
    data_dir: Path
    course: CourseParams = field(default_factory=CourseParams)
    twin: TwinParams = field(default_factory=TwinParams)
    calibration: CalibrationParams = field(default_factory=CalibrationParams)
    prediction: PredictionParams = field(default_factory=PredictionParams)
    pacing: PacingParams = field(default_factory=PacingParams)
    sufficiency: SufficiencyParams = field(default_factory=SufficiencyParams)
    narrative: NarrativeParams = field(default_factory=NarrativeParams)


# --------------------------------------------------------------------------- #
# Construction d'un sous-bloc dataclass à partir d'un dict JSON, en ne gardant
# que les clés connues et en coerçant les tuples (JSON ne connaît que les listes).
# --------------------------------------------------------------------------- #
def _build(cls: type, raw: dict[str, Any] | None):
    if not raw:
        return cls()
    known = {f.name: f for f in fields(cls)}
    kwargs: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in known:
            continue  # clé inconnue (ex. "_comment") → ignorée
        default = getattr(cls(), key)
        if isinstance(default, tuple) and isinstance(value, list):
            value = tuple(value)
        kwargs[key] = value
    return cls(**kwargs)


def _default_config_path() -> Path:
    """``twin.config.json`` est posé à la racine du service (à côté de pyproject)."""
    return Path(__file__).resolve().parents[2] / "twin.config.json"


def load_config(config_path: str | os.PathLike[str] | None = None) -> Config:
    """Charge la configuration : env (chemins) > twin.config.json (constantes) > défauts."""
    path = Path(
        config_path
        or os.environ.get("TWIN_CONFIG_PATH")
        or _default_config_path()
    )

    raw: dict[str, Any] = {}
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:  # pragma: no cover - défensif
            raise SystemExit(f"twin.config.json illisible ({path}): {exc}") from exc

    data_dir = Path(os.environ.get("DATA_DIR") or raw.get("data_dir") or "/data")

    return Config(
        data_dir=data_dir,
        course=_build(CourseParams, raw.get("course")),
        twin=_build(TwinParams, raw.get("twin")),
        calibration=_build(CalibrationParams, raw.get("calibration")),
        prediction=_build(PredictionParams, raw.get("prediction")),
        pacing=_build(PacingParams, raw.get("pacing")),
        sufficiency=_build(SufficiencyParams, raw.get("sufficiency")),
        narrative=_build(NarrativeParams, raw.get("narrative")),
    )


__all__ = [
    "Config",
    "CourseParams",
    "TwinParams",
    "CalibrationParams",
    "PredictionParams",
    "PacingParams",
    "SufficiencyParams",
    "NarrativeParams",
    "load_config",
]
