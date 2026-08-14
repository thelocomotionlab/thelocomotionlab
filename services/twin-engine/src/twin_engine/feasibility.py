"""Mode OBJECTIF — confronte la cible de l'athlète à son jumeau (ADR 0002).

Le moteur répond d'ordinaire à « en combien de temps finiras-tu ? ». Ici on répond à
l'autre question, celle que la cohorte pose spontanément : « je vise 31 h, est-ce tenable,
et à quel prix ? ». Rien de neuf côté science — on **inverse** ce qui est déjà ajusté :

* la cible impose une vitesse ajustée moyenne ``deq_km / t_cible`` (même base que
  ``Prediction.v_kmh``, donc comparable terme à terme) ;
* ``Twin.envelope_vga_ms(t_cible)`` dit ce que l'athlète soutient à cette durée ;
* les **bandes de la prédiction** (fourchette de course, bornes de sécurité) tranchent le
  régime — ce sont elles qui sont calibrées et validées par validation croisée, pas
  l'enveloppe, qui n'intervient qu'en EXPLICATION.

Le verdict ne remplace jamais la prédiction : il s'y ajoute. Et il n'ouvre aucune porte que
les garde-fous d'honnêteté ferment — en particulier ``sufficiency.domain_gate`` (une cible
sous le domaine de calibration reste hors périmètre, même si l'athlète y tient).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import Config
from .course import CourseProfile
from .predict import Prediction
from .twin.model import Twin

# Régimes servis. L'ordre est celui de la cible qui se durcit (temps décroissant).
CONFORTABLE = "confortable"      # cible ≥ central prédit : de la marge
NOMINAL = "nominal"              # dans la fourchette de course : le cas attendu
AMBITIEUX = "ambitieux"          # entre fourchette et borne de sécurité basse
HORS_PORTEE = "hors_portee"      # plus rapide que la borne de sécurité basse
HORS_DOMAINE = "hors_domaine"    # sous le domaine de calibration (garde-fou §9.9)
INDECIDABLE = "indecidable"      # pas de prédiction : on ne juge pas une cible sans jumeau


@dataclass(frozen=True)
class TargetAssessment:
    """Verdict de faisabilité d'une cible + les chiffres qui le justifient."""

    target_hours: float
    regime: str
    plan_ok: bool                        # False → on ne sert PAS de plan, on sert l'écart
    required_v_kmh: float                # vitesse ajustée moyenne qu'exige la cible
    envelope_v_kmh: float | None         # ce que l'athlète soutient à cette durée
    envelope_fraction: float | None      # exigée / soutenable (> 1 = au-dessus de l'enveloppe)
    vc_fraction: float | None            # exigée / VC (même lecture que Prediction.vc_fraction)
    gap_vs_central_pct: float | None     # (cible − central)/central ; < 0 = plus rapide que prédit
    speed_gain_pct: float | None         # vitesse à gagner vs prédiction ; > 0 = il faut accélérer
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        def _r(v, n=3):
            return None if v is None else round(v, n)

        return {
            "target_hours": round(self.target_hours, 3),
            "regime": self.regime,
            "plan_ok": self.plan_ok,
            "required_v_kmh": round(self.required_v_kmh, 3),
            "envelope_v_kmh": _r(self.envelope_v_kmh),
            "envelope_fraction": _r(self.envelope_fraction),
            "vc_fraction": _r(self.vc_fraction),
            "gap_vs_central_pct": _r(self.gap_vs_central_pct, 2),
            "speed_gain_pct": _r(self.speed_gain_pct, 2),
            "reasons": list(self.reasons),
        }


def assess_target(
    target_hours: float,
    course: CourseProfile,
    twin: Twin,
    prediction: Prediction | None,
    cfg: Config,
) -> TargetAssessment:
    """Classe la cible dans un régime et dit si un plan peut être servi.

    Les frontières sont les bandes de la PRÉDICTION (temps décroissant = plus rapide) :
    central, fourchette de course, borne de sécurité basse. Quand la fourchette n'est pas
    disponible (objets de repli sans ``plan_low_h``), le régime ``nominal`` se replie sur la
    borne de sécurité — plus prudent que d'inventer une frontière.
    """
    if target_hours <= 0:
        raise ValueError("target_hours doit être strictement positif")

    required_v = course.deq_km / target_hours
    reasons: list[str] = []

    # Enveloppe d'endurance à la durée VISÉE : explication, jamais décision (elle n'est pas
    # validée par validation croisée, contrairement aux bandes).
    env_ms = twin.envelope_vga_ms(target_hours * 3600.0)
    envelope_v = None if env_ms is None else env_ms * 3.6
    envelope_fraction = (None if not envelope_v else required_v / envelope_v)

    cs = twin.critical_speed
    vc_fraction = None
    if cs is not None and cs.plausible and cs.vc_ms:
        vc_fraction = required_v / (cs.vc_ms * 3.6)

    gap_pct = None
    speed_gain_pct = None
    if prediction is not None and prediction.finish_hours > 0 and prediction.v_kmh > 0:
        gap_pct = 100.0 * (target_hours - prediction.finish_hours) / prediction.finish_hours
        speed_gain_pct = 100.0 * (required_v / prediction.v_kmh - 1.0)

    def _out(regime: str, plan_ok: bool) -> TargetAssessment:
        if envelope_fraction is not None and envelope_fraction > 1.0:
            reasons.append(
                f"L'objectif demande {envelope_fraction:.0%} de ton enveloppe d'endurance à "
                f"cette durée : au-dessus de ce que tes données montrent comme soutenable."
            )
        return TargetAssessment(
            target_hours=float(target_hours), regime=regime, plan_ok=plan_ok,
            required_v_kmh=float(required_v), envelope_v_kmh=envelope_v,
            envelope_fraction=envelope_fraction, vc_fraction=vc_fraction,
            gap_vs_central_pct=gap_pct, speed_gain_pct=speed_gain_pct, reasons=reasons,
        )

    # 1) Sans prédiction, aucune frontière n'existe : on ne juge pas une cible sans jumeau.
    if prediction is None:
        reasons.append(
            "Données insuffisantes pour prédire : sans jumeau exploitable, un objectif ne "
            "peut être ni validé ni contredit."
        )
        return _out(INDECIDABLE, False)

    # 2) Garde-fou DOMAINE (DIAGNOSTIC §9.9) — prioritaire sur la cible : le moteur est
    #    calibré sur les efforts ≥ genuine_min_hours ; en dessous, il est hors périmètre,
    #    que l'athlète ait un chiffre en tête ou non.
    if (cfg.sufficiency.domain_gate == "on"
            and target_hours < cfg.calibration.genuine_min_hours):
        reasons.append(
            f"Objectif de {target_hours:.1f} h : sous le domaine de calibration du moteur "
            f"(efforts ≥ {cfg.calibration.genuine_min_hours:.0f} h) — hors périmètre actuel."
        )
        return _out(HORS_DOMAINE, False)

    central = prediction.finish_hours
    plan_low = prediction.plan_low_h
    safety_low = prediction.interval_low_h

    # 3) Cible plus lente (ou égale) que le central : de la marge.
    if target_hours >= central:
        if target_hours > prediction.interval_high_h:
            reasons.append(
                "Objectif nettement en retrait de ce que tes données permettent : le plan "
                "est tenable avec de la marge, tu peux viser mieux."
            )
        else:
            reasons.append(
                "Objectif plus prudent que la prédiction centrale : le plan a de la marge."
            )
        return _out(CONFORTABLE, True)

    # 4) Dans la fourchette de course : le cas attendu.
    if plan_low is not None and target_hours >= plan_low:
        reasons.append(
            "Objectif dans la fourchette de course : c'est un plan de pilotage réaliste."
        )
        return _out(NOMINAL, True)

    # 5) Entre la fourchette et la borne de sécurité basse : ambitieux mais plausible.
    if target_hours >= safety_low:
        if plan_low is None:
            reasons.append(
                "Fourchette de course indisponible : le régime est jugé sur les seules "
                "bornes de sécurité (lecture plus prudente)."
            )
        reasons.append(
            "Objectif plus rapide que la fourchette de course, mais dans les bornes de "
            "sécurité : tenable dans un bon jour, sans marge d'erreur."
        )
        return _out(AMBITIEUX, True)

    # 6) Au-delà : on ne sert pas de plan, on sert l'écart (objectif d'entraînement).
    reasons.append(
        f"Objectif plus rapide que la borne de sécurité basse ({safety_low:.1f} h) : hors "
        f"de portée au vu des données actuelles."
    )
    if speed_gain_pct is not None:
        reasons.append(
            f"Pour l'atteindre il faudrait environ {speed_gain_pct:+.1f} % de vitesse "
            f"ajustée moyenne par rapport à ton niveau actuel — c'est un objectif "
            f"d'entraînement, pas un plan de course."
        )
    return _out(HORS_PORTEE, not cfg.target.refuse_outside_safety)


__all__ = [
    "TargetAssessment",
    "assess_target",
    "CONFORTABLE",
    "NOMINAL",
    "AMBITIEUX",
    "HORS_PORTEE",
    "HORS_DOMAINE",
    "INDECIDABLE",
]
