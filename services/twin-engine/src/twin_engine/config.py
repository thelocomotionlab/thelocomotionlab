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
    vc_window_s: tuple[int, int] = (600, 5400)
    vc_bootstrap_n: int = 2000
    vc_bootstrap_seed: int = 0
    vc_short_effort_floor_s: int = 1800
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
    terrain_term: str = "free"                           # {free, none, prior_shrunk}
    terrain_shrink_lambda: float = 1.0                   # force du ridge (n. de pseudo-obs vers le prior)
    # repli « peu d'ultras » (twin-theory §3)
    default_dplus_penalty_kmh_per_dpkm: float = -0.0148  # prior population (β2)
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


@dataclass(frozen=True)
class PacingParams:
    fade_delta: float = 0.085
    default_stop_min: float = 5.0
    major_base_extra_min: float = 10.0


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


@dataclass(frozen=True)
class Config:
    data_dir: Path
    course: CourseParams = field(default_factory=CourseParams)
    twin: TwinParams = field(default_factory=TwinParams)
    calibration: CalibrationParams = field(default_factory=CalibrationParams)
    prediction: PredictionParams = field(default_factory=PredictionParams)
    pacing: PacingParams = field(default_factory=PacingParams)
    sufficiency: SufficiencyParams = field(default_factory=SufficiencyParams)


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
    )


__all__ = [
    "Config",
    "CourseParams",
    "TwinParams",
    "CalibrationParams",
    "PredictionParams",
    "PacingParams",
    "SufficiencyParams",
    "load_config",
]
