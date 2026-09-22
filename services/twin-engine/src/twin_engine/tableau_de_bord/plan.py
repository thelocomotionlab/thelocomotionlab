"""Le Plan vu depuis un dossier : les cinq chiffres, et l'import d'un dossier fait au CLI.

Un dossier porte tout ce qu'il faut pour refaire les documents sans l'archive. Il porte
donc aussi de quoi remplir un Plan — c'est ce qui rend l'import possible : un plan
fabriqué sur l'ordinateur de Valentin entre dans le tableau de bord **comme s'il y était
né**, sans repasser par le moteur.

Vocabulaire des deux bandes, celui du registre (``docs/twin-registre-couverture.md``) :
la **fourchette de course** est la bande de planification (50 % nominal, ``plan_*``), les
**bornes** sont les bornes de sécurité (80 % nominal, ``interval_*``). Les confondre
donnerait un registre qui compte « dans la fourchette » sur la mauvaise bande.
"""

from __future__ import annotations

from datetime import timedelta

from .objets import Prediction, niveau_du_verdict


def _heures(valeur) -> float | None:
    return None if valeur is None else round(float(valeur), 3)


def resumer_la_prediction(dossier) -> Prediction:
    """Les cinq chiffres du plan, lus dans le dossier."""
    p = dossier.prediction
    fourchette = [p.plan_low_h, p.plan_high_h]
    if any(v is None for v in fourchette):
        # Objets d'avant la fourchette de course : le pacing retombait déjà sur les
        # percentiles Monte-Carlo, la lecture fait pareil plutôt que d'afficher un trou.
        fourchette = [p.interval_low_h, p.interval_high_h]

    arrivee = ""
    depart = getattr(dossier.race, "start_time", None)
    if depart is not None and p.finish_hours is not None:
        arrivee = (depart + timedelta(hours=float(p.finish_hours))).isoformat()

    return Prediction(
        central_h=_heures(p.finish_hours),
        fourchette=[_heures(v) for v in fourchette],
        bornes=[_heures(p.interval_low_h), _heures(p.interval_high_h)],
        arrivee_le=arrivee,
        niveau=niveau_du_verdict(dossier.sufficiency.verdict),
    )


__all__ = ["resumer_la_prediction"]
