"""Test de suffisance — verdict 🟢/🟠/🔴 (twin-theory §10).

Calculé **avant tout** (avant paiement) sur la donnée normalisée, il répond à « ces
données suffisent-elles ? » par cinq critères, dont l'**erreur de validation croisée**
comme indice de confiance. Renvoie le verdict **et le pourquoi** (chaque critère, sa
valeur, son niveau).

  🟢 → rapport complet · 🟠 → confiance réduite (on prévient) · 🔴 → on ne vend pas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from .calibration import REGIME_INSUFFICIENT, UltraCalibration
from .config import Config
from .predict import Prediction
from .twin.model import Twin

GREEN = "🟢"
ORANGE = "🟠"
RED = "🔴"
_RANK = {RED: 0, ORANGE: 1, GREEN: 2}


@dataclass(frozen=True)
class Criterion:
    name: str
    level: str | None       # None = non évalué (ex. validation croisée non calculable)
    value: float | int | None
    detail: str

    def to_dict(self) -> dict:
        return {"name": self.name, "level": self.level, "value": self.value, "detail": self.detail}


@dataclass
class Sufficiency:
    verdict: str
    sellable: bool
    criteria: list[Criterion]
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "verdict": self.verdict,
            "sellable": self.sellable,
            "criteria": [c.to_dict() for c in self.criteria],
            "reasons": self.reasons,
        }


def _parsed_dates(summaries) -> list[date]:
    dates = []
    for s in summaries:
        if s.date:
            try:
                dates.append(date.fromisoformat(s.date))
            except ValueError:
                pass
    return dates


def _history_months(summaries) -> float:
    dates = _parsed_dates(summaries)
    if len(dates) < 2:
        return 0.0
    return (max(dates) - min(dates)).days / 30.44


def _higher_is_better(value, green, orange) -> str:
    return GREEN if value >= green else ORANGE if value >= orange else RED


def _lower_is_better(value, green, orange) -> str:
    return GREEN if value <= green else ORANGE if value <= orange else RED


def assess_sufficiency(
    twin: Twin,
    calibration: UltraCalibration,
    prediction: Prediction | None,
    cfg: Config,
    *,
    analysis_date: date | None = None,
) -> Sufficiency:
    s = cfg.sufficiency
    summaries = twin.summaries
    criteria: list[Criterion] = []
    reasons: list[str] = []

    # 1) Historique
    months = _history_months(summaries)
    criteria.append(
        Criterion(
            "Historique",
            _higher_is_better(months, s.history_months_green, s.history_months_orange),
            round(months, 1),
            f"{months:.1f} mois de données",
        )
    )

    # 1b) Fraîcheur (revue C8) : « Historique » mesure l'ÉTENDUE, pas la fraîcheur — une
    #     archive s'arrêtant il y a 8 mois pouvait être 🟢 partout alors que la prédiction
    #     suppose la forme du moment (twin-theory §2.7/§9). Évalué quand la date d'analyse
    #     est connue (le pipeline passe la date du jour) ; seuils ≤ 0 → désactivé.
    if analysis_date is not None and s.freshness_days_green > 0:
        dates = _parsed_dates(summaries)
        if dates:
            gap_days = (analysis_date - max(dates)).days
            criteria.append(
                Criterion(
                    "Fraîcheur des données",
                    _lower_is_better(gap_days, s.freshness_days_green, s.freshness_days_orange),
                    gap_days,
                    f"dernière activité il y a {gap_days} j (analyse du {analysis_date.isoformat()})",
                )
            )
        else:
            criteria.append(
                Criterion("Fraîcheur des données", None, None,
                          "activités non datées → fraîcheur non évaluable")
            )
            reasons.append("Fraîcheur inconnue (activités non datées) : recalcul recommandé "
                           "à l'approche de la course.")

    # 2) Courses exploitables
    usable = len(summaries)
    criteria.append(
        Criterion(
            "Courses exploitables",
            _higher_is_better(usable, s.usable_green, s.usable_orange),
            usable,
            f"{usable} activités de course exploitées",
        )
    )

    # 3) Efforts longs proches de la cible — avec un plancher d'allure ajustée : une montre
    #    laissée en enregistrement (12 h à ~1 km/h) n'est PAS un effort long exploitable.
    if prediction is not None:
        threshold_s = s.long_effort_min_fraction * prediction.finish_hours * 3600
        ga_floor_kmh = cfg.calibration.genuine_min_ga_kmh * s.long_effort_min_ga_fraction
        longs = sum(
            1
            for a in summaries
            if a.duration_s >= threshold_s
            and (a.ga_km / (a.duration_s / 3600.0)) >= ga_floor_kmh
        )
        long_detail = (
            f"{longs} efforts ≥ {threshold_s / 3600:.0f} h "
            f"(≈ moitié de la cible, allure ajustée ≥ {ga_floor_kmh:.1f} km/h)"
        )
    else:
        longs = calibration.n_genuine
        long_detail = f"{longs} vrais ultras (cible non prédite)"
    criteria.append(
        Criterion(
            "Efforts longs proches de la cible",
            _higher_is_better(longs, s.long_efforts_green, s.long_efforts_orange),
            longs,
            long_detail,
        )
    )

    # 4) Qualité = pire des fractions FC ET altitude (twin-theory §10 promet les deux) :
    #    la durabilité dépend de la FC, mais la courbe record (donc VC/E) et la vitesse
    #    ajustée de la calibration dépendent de l'ALTITUDE — plus critique encore.
    #    (has_altitude=None = agrégats anciens sans ce champ → repli FC seule.)
    frac_hr = (sum(1 for a in summaries if a.has_hr) / len(summaries)) if summaries else 0.0
    alt_known = [a for a in summaries if getattr(a, "has_altitude", None) is not None]
    frac_alt = (
        sum(1 for a in alt_known if a.has_altitude) / len(alt_known) if alt_known else None
    )
    lvl_hr = _higher_is_better(frac_hr, s.quality_green_frac, s.quality_orange_frac)
    if frac_alt is None:
        quality_level, quality_value = lvl_hr, round(frac_hr, 2)
        quality_detail = f"{frac_hr * 100:.0f}% des activités avec FC (altitude non renseignée)"
    else:
        lvl_alt = _higher_is_better(frac_alt, s.quality_green_frac, s.quality_orange_frac)
        quality_level = min((lvl_hr, lvl_alt), key=lambda lv: _RANK[lv])
        quality_value = round(min(frac_hr, frac_alt), 2)
        quality_detail = (
            f"{frac_hr * 100:.0f}% des activités avec FC · "
            f"{frac_alt * 100:.0f}% avec altitude (ajustement pente)"
        )
    criteria.append(
        Criterion("Qualité (FC / altitude / distance)", quality_level, quality_value, quality_detail)
    )

    # 5) Erreur de validation croisée (indice de confiance)
    # ``strict`` (défaut) : MAE brute — un seul pli d'extrapolation peut basculer le vendable.
    # ``honest`` (§4.3) : MAE d'INTERPOLATION (le modèle jugé sur ce qu'il sait faire), l'extrapolation
    #   étant rapportée comme incertitude assumée, pas comme un couperet.
    cv = prediction.cross_validation if prediction else None
    if cv is not None:
        honest = s.gate_policy == "honest" and cv.mae_interpolation_pct is not None
        if honest:
            gate_mae = cv.mae_interpolation_pct
            ext = "n/a" if cv.mae_extrapolation_pct is None else f"{cv.mae_extrapolation_pct:.1f}%"
            cv_detail = (f"erreur d'interpolation {gate_mae:.1f}% "
                         f"(brute {cv.mae_pct:.1f}%, extrapolation {ext})")
        else:
            gate_mae = cv.mae_pct
            cv_detail = f"erreur moyenne hors-échantillon {cv.mae_pct:.1f}%"
        cv_level = _lower_is_better(gate_mae, s.cv_error_green_pct, s.cv_error_orange_pct)
        criteria.append(Criterion("Erreur validation croisée", cv_level, round(gate_mae, 1), cv_detail))
    else:
        criteria.append(
            Criterion("Erreur validation croisée", None, None,
                      "non calculable (moins de 3 vrais ultras → pas de régression)")
        )
        reasons.append("Validation croisée indisponible : prédiction par repli VC+E (§3).")

    # 6) Sanité de l'intervalle (gate honnête uniquement) : une fourchette absurdement large trahit
    #    une prédiction peu fiable même si la MAE d'interpolation est bonne.
    if s.gate_policy == "honest" and prediction is not None and prediction.finish_hours > 0:
        rel_width = (prediction.interval_high_h - prediction.interval_low_h) / prediction.finish_hours
        width_level = _lower_is_better(rel_width, s.interval_rel_width_green, s.interval_rel_width_orange)
        criteria.append(
            Criterion("Largeur d'intervalle", width_level, round(rel_width, 2),
                      f"intervalle 80% large de {rel_width * 100:.0f}% du temps central")
        )

    # --- verdict global = pire niveau parmi les critères ÉVALUÉS ---
    if calibration.regime == REGIME_INSUFFICIENT or prediction is None:
        verdict = RED
        reasons.append("Prédiction impossible avec confiance (ni régression ultra ni enveloppe).")
    else:
        evaluated = [c.level for c in criteria if c.level is not None]
        verdict = min(evaluated, key=lambda lv: _RANK[lv]) if evaluated else RED
        # CV incalculable → jamais 🟢 : le 🟢 est l'engagement de confiance, et l'indice de
        # confiance (LOO) est précisément ce qui manque. On vend quand même (🟠), on prévient.
        if cv is None and s.cv_missing_policy == "cap_orange" and verdict == GREEN:
            verdict = ORANGE
            reasons.append(
                "Verdict plafonné à 🟠 : sans validation croisée possible (moins de 3 vrais "
                "ultras), la fiabilité de la prédiction ne peut pas être établie sur tes courses."
            )

    if verdict == GREEN:
        reasons.append("Données suffisantes pour un rapport complet.")
    elif verdict == ORANGE:
        reasons.append("Données limites : rapport produit avec confiance réduite (on prévient).")
    else:
        reasons.append("Données insuffisantes : on ne vend pas (🔴).")

    return Sufficiency(verdict=verdict, sellable=(verdict != RED), criteria=criteria, reasons=reasons)


__all__ = ["GREEN", "ORANGE", "RED", "Criterion", "Sufficiency", "assess_sufficiency"]
