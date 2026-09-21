"""La fiche partagée par le moteur et le navigateur : construction des cas.

Le tableau de marche se recalcule à deux endroits — ici (``build_pacing``, qui fait le
document) et dans ``apps/site/lib/twinTableauMarche.js`` (l'aperçu instantané de la page
d'annexe, qui n'a pas de moteur sous la main). Les deux doivent rendre les mêmes minutes,
sans quoi l'athlète verrait à l'écran une heure de passage que son PDF dément.

Ce module produit les cas ; ``tests/fixtures/tableau-de-marche.json`` les fige ; les deux
suites les relisent. Le fichier se refait avec :

    TWIN_REGENERE_LA_FICHE=1 ./.venv/bin/python -m pytest tests/test_tableau_de_marche.py
"""

from __future__ import annotations

import sys
from dataclasses import replace
from pathlib import Path

FICHE = Path(__file__).parent / "fixtures" / "tableau-de-marche.json"

sys.path.insert(0, str(Path(__file__).parent))

# Deux amendements par modèle : un arrêt ordinaire allongé, une base majeure raccourcie.
# Le second attrape les erreurs de signe que le premier laisserait passer.
AMENDEMENTS = (
    ("un arrêt ordinaire allongé de vingt minutes", ({"aid_index": 6, "stop_min": 25.0},)),
    ("une base majeure raccourcie de dix minutes", ({"aid_index": 3, "stop_min": 5.0},)),
)


def config_pour(modele: str, cfg):
    """La config du moteur sous l'un des trois modèles d'arrêts."""
    return replace(cfg, calibration=replace(cfg.calibration, stops_model=modele,
                                            stops_rate_population=0.0 if modele == "carved" else 0.08))


def construire() -> dict:
    """Les cas, calculés par le moteur — c'est-à-dire par le chemin qui fait le document."""
    from test_report_v3 import CFG, _triangle_gpx, race_spec, scenario

    from twin_engine import dossier
    from twin_engine.calibration import build_calibration
    from twin_engine.course import build_course
    from twin_engine.pacing.plan import build_pacing
    from twin_engine.predict import predict_race

    _, twin, *_ = scenario()
    cas = []
    for modele in ("carved", "personal", "spec"):
        cfg = config_pour(modele, CFG)
        race = race_spec()
        course = build_course(_triangle_gpx(), race, cfg)
        pente = twin.slope_factors(cfg)
        if pente is not None:
            course = course.with_slope_cost(*pente)
        cal = build_calibration(twin, cfg)
        pred = predict_race(course, twin, cal, cfg, race)
        plan = build_pacing(course, pred, race, cfg)
        assert plan.stops_model == modele, f"{modele} : le plan n'a pas servi ce modèle"

        d = dossier.Dossier(course_gpx=_triangle_gpx(), race=race, twin=twin, calibration=cal,
                            prediction=pred, sufficiency=None, athlete="Camille & Léo",
                            report_ref="LL-TWIN-GOLDEN01", report_date=None)
        for libelle, reglages in AMENDEMENTS:
            amende = dossier.appliquer(race, {"reglages": [dict(r) for r in reglages]})
            pred_a = dossier.prediction_amendee(d, amende, course, cfg)
            refait = build_pacing(course, pred_a, amende, cfg)
            cas.append({
                "modele": modele,
                "amendement": libelle,
                # ce que la page tient : l'annexe du rapport d'origine
                "segments": [{"index": s.index, "to": s.to,
                              "t_move_min": s.t_move_min, "stop_min": s.stop_min}
                             for s in plan.segments],
                "horloge_min": plan.anchor_hours * 60.0,
                # ce que le formulaire renvoie
                "reglages": [dict(r) for r in reglages],
                # ce que le moteur refait — donc ce que le PDF dira, donc ce que l'aperçu
                # doit annoncer. Mouvement et arrêt sont les valeurs PUBLIÉES (le dixième
                # de minute, la minute) ; le cumul est l'horloge exacte, celle dont le
                # rapport tire l'heure de passage.
                "attendu": {
                    "mouvement": [s.t_move_min for s in refait.segments],
                    "arret": [s.stop_min for s in refait.segments],
                    "cumul": [s.cum_clock_exact_h * 60.0 for s in refait.segments],
                    "arrivee": refait.segments[-1].cum_clock_exact_h * 60.0,
                },
            })
    return {
        "commentaire": ("Tableau de marche recalculé par le moteur après amendement. "
                        "services/twin-engine (build_pacing) et apps/site/lib/"
                        "twinTableauMarche.js (recalcule) doivent rendre ces minutes. "
                        "Refaire avec : TWIN_REGENERE_LA_FICHE=1 pytest "
                        "tests/test_tableau_de_marche.py"),
        # L'écart toléré entre les deux. Il ne reste que l'arrondi de publication : l'annexe
        # sert le mouvement au dixième de minute et l'arrêt à la minute, l'aperçu recalcule
        # sur ces valeurs-là. Au-delà, ce n'est plus un arrondi, c'est une règle qui a bougé.
        "ecart_tolere_min": 0.5,
        "cas": cas,
    }
