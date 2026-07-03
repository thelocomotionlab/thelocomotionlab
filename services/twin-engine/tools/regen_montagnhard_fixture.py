"""Régénère le fixture Montagnhard depuis l'archive réelle (DIAGNOSTIC §8 / §9.6).

À lancer chez Valentin (l'archive ne quitte jamais sa machine) :

    PYTHONPATH=src python -m tools.regen_montagnhard_fixture \\
        /chemin/vers/data_training.zip

Ce que fait le script :
  * ingestion EN FLUX de toute l'archive (``running_only``, jamais purgée) ;
  * jumeau complet → **enveloppe d'endurance réellement FITTÉE** sur la courbe record de
    l'athlète (résout l'hypothèse H3 : l'ancienne enveloppe du fixture était représentative,
    pas ajustée) ;
  * résumés agrégés (``ActivitySummary.to_dict()``) des activités ≥ ``--min-hours`` — avec la
    config COURANTE (donc la base D+ ``distance_150m`` depuis C1) ;
  * ``_meta.course`` repris du fixture existant (le calcul parcours n'est pas concerné par
    C1) sauf si ``--course`` est fourni ;
  * ``_meta.reproduces`` recalculé sur le fixture assemblé, en config BASELINE (maximalité
    off, terrain libre — la même que ``test_montagnhard_robustness._baseline_cfg``) : ce sont
    les chiffres à ré-épingler dans les tests ;
  * imprime un tableau AVANT/APRÈS (baseline + défauts livrés) à coller dans DIAGNOSTIC §9.6.

Le fixture produit ne contient QUE des agrégats dérivés — aucune trace brute, aucune PII
(politique de purge CLAUDE.md). Il peut être committé tel quel.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np

from twin_engine.calibration import build_calibration, select_genuine_ultras
from twin_engine.config import load_config
from twin_engine.ingest import iter_activities
from twin_engine.predict import predict_finish
from twin_engine.twin.model import Twin, build_twin
from twin_engine.twin.record import ActivitySummary, RecordCurve

CFG = load_config()
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "genuine_ultras_montagnhard.fixture.json"


def _baseline_cfg():
    """« Ancien comportement » (tous flags off) — même définition que les tests de robustesse."""
    return replace(
        CFG,
        calibration=replace(CFG.calibration, maximality_mode="off", terrain_term="free"),
        sufficiency=replace(CFG.sufficiency, gate_policy="strict"),
        prediction=replace(CFG.prediction, mc_mode="sigma_only"),  # baseline historique
    )


def _twin_from_fixture(fixture: dict) -> Twin:
    env = fixture["_meta"]["athlete_envelope"]
    summaries = [
        ActivitySummary(**{k: v for k, v in a.items() if not k.startswith("_")})
        for a in fixture["activities"]
    ]
    return Twin(
        critical_speed=None, alpha=env["alpha"], endurance_E=env.get("endurance_E"),
        endurance_coef=env["endurance_coef"], durability_pct=None,
        record=RecordCurve(np.array([]), np.array([]), np.array([]), []), summaries=summaries,
    )


def _evaluate(fixture: dict, cfg, label: str) -> dict:
    """Calibration + prédiction + LOO sur le fixture assemblé (mêmes chemins que les tests)."""
    t = _twin_from_fixture(fixture)
    course = fixture["_meta"]["course"]
    cal = build_calibration(t, cfg)
    pred = predict_finish(course["deq_km"], course["dplus_per_km"], t, cal, cfg)
    cv = pred.cross_validation if pred else None
    row = {
        "label": label,
        "regime": cal.regime,
        "n_genuine": cal.n_genuine,
        "sigma_kmh": round(cal.sigma_kmh, 3),
        "prediction_h": round(pred.finish_hours, 2) if pred else None,
        "loo_mae_pct": round(cv.mae_pct, 1) if cv else None,
        "loo_interp_pct": (round(cv.mae_interpolation_pct, 1)
                           if cv and cv.mae_interpolation_pct is not None else None),
        "loo_extrap_pct": (round(cv.mae_extrapolation_pct, 1)
                           if cv and cv.mae_extrapolation_pct is not None else None),
    }
    return row


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="regen_montagnhard_fixture",
                                 description="Fixture Montagnhard depuis l'archive réelle")
    ap.add_argument("archive", help="archive d'entraînement (.zip/dossier) — non purgée")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--min-hours", type=float, default=9.5)
    ap.add_argument("--course", default=None,
                    help="GPX du parcours (sinon _meta.course est repris du fixture existant)")
    args = ap.parse_args(argv)

    # --- _meta.course : repris de l'existant (parcours non concerné par C1) ou recalculé ---
    meta_course = None
    if args.out.exists():
        old = json.loads(args.out.read_text(encoding="utf-8"))
        meta_course = old.get("_meta", {}).get("course")
    if args.course:
        from twin_engine.course import RaceSpec, build_course

        course = build_course(Path(args.course).read_bytes(), RaceSpec(name="Montagnhard"), CFG)
        meta_course = {
            "deq_km": round(course.deq_km, 2),
            "dplus_per_km": round(course.dplus_per_km, 2),
            "note": "Recalculé depuis la trace fournie (course/profile.py, GPX-only).",
        }
    if meta_course is None:
        print("Ni fixture existant ni --course : impossible de renseigner _meta.course.",
              file=sys.stderr)
        return 2

    # --- jumeau complet : enveloppe FITTÉE (H3) + résumés, en flux (mémoire O(1)) ---
    skipped: list[dict] = []
    twin = build_twin(
        iter_activities(args.archive, running_only=True, skipped=skipped), CFG
    )
    if twin.alpha is None or twin.endurance_coef is None:
        print("Enveloppe d'endurance non ajustable sur cette archive (courbe record vide ?).",
              file=sys.stderr)
        return 2

    longs = [s for s in twin.summaries if s.duration_s >= args.min_hours * 3600]
    genuine_dates = {g.date for g in select_genuine_ultras(longs, CFG)}
    activities = []
    for s in longs:
        d = s.to_dict()
        hours = s.duration_s / 3600.0
        d["_vga_kmh"] = round(s.ga_km / hours, 3) if hours else None
        d["_dplus_per_km"] = round(s.dplus_m / s.dist_km, 1) if s.dist_km else None
        d["_is_genuine_ultra"] = s.date in genuine_dates
        activities.append(d)

    fixture = {
        "_meta": {
            "description": (
                "Fixture de reproduction du cas Crasse Montagnhard (athlete Thomas Ducreux). "
                "Contient UNIQUEMENT les resumes agreges (ActivitySummary) des activites "
                f">={args.min_hours}h extraites par le vrai extracteur du moteur "
                "(process_activity) sur l archive Garmin. AUCUNE trace GPS brute, aucune PII."
            ),
            "provenance": (
                "twin_engine.ingest + twin_engine.twin.record.process_activity, config "
                f"courante (dplus_basis={CFG.twin.dplus_basis}, grade_base_m={CFG.twin.grade_base_m}, "
                f"f_cap={CFG.twin.f_cap}). Regenere par tools/regen_montagnhard_fixture."
            ),
            "athlete_envelope": {
                "alpha": round(float(twin.alpha), 4),
                "endurance_coef": round(float(twin.endurance_coef), 3),
                "endurance_E": (round(float(twin.endurance_E), 3)
                                if twin.endurance_E is not None else None),
                "note": (
                    "Enveloppe d endurance FITTEE sur la courbe record de l athlete "
                    "(fit_endurance_exponent, fenetre endurance_window_s) — resout H3 : "
                    "l ancienne enveloppe du fixture etait representative, pas ajustee. "
                    "Extrapolee a 10-26h pour le filtre de maximalite (usage relatif, §A)."
                ),
            },
            "course": meta_course,
            "usage": (
                "Charger chaque item non-_meta dans ActivitySummary(**item sans les cles _*), "
                "puis select_genuine_ultras -> build_calibration -> predict_finish/leave_one_out. "
                "Enveloppe -> Twin(alpha, endurance_coef) pour le filtre de maximalite."
            ),
            "garbage_note": (
                "Les activites longues a tres faible vga (montre laissee en enregistrement) "
                "sont incluses volontairement : elles DOIVENT etre ecartees par ga>=5.5."
            ),
        },
        "activities": activities,
    }

    # --- reproduces : recalculé sur CE fixture, en baseline (= chiffres à ré-épingler) ---
    base_row = _evaluate(fixture, _baseline_cfg(), "[BASELINE] flags off")
    served_row = _evaluate(fixture, CFG, "défauts livrés (maximalité soft)")
    fixture["_meta"]["reproduces"] = {
        "config": "baseline (maximality off, terrain free, gate strict)",
        **{k: v for k, v in base_row.items() if k != "label"},
    }

    args.out.write_text(json.dumps(fixture, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")

    print(f"\n{len(activities)} activités ≥ {args.min_hours} h → {args.out}")
    print(f"ignorés à l'ingestion : {len(skipped)}")
    print(f"enveloppe FITTÉE : alpha={twin.alpha:.4f}, E={twin.endurance_E}, "
          f"coef={twin.endurance_coef:.3f}  (H3 : à comparer au 0.18/1.22 représentatif)")
    print("\nChiffres à ré-épingler (coller dans la réponse) :")
    for row in (base_row, served_row):
        print("  " + json.dumps(row, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
