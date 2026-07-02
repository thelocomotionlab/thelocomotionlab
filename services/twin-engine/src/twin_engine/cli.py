"""CLI du moteur — rejoue un cas de bout en bout en local.

  twin-engine preview --training <archive> --course <gpx> [--race <json>]
  twin-engine full    --training <archive> --course <gpx> --out <dir> [--race <json>] [--athlete N]

``--race`` est **optionnel** : sans lui, mode GPX-only (distance issue de la trace,
découpage automatique tous les N km). Avec, il fournit ravitaillements/départ/position
(ex. examples/nice-100m.json pour rejouer le cas Nice 100M). En local, l'archive n'est
PAS purgée par défaut (--purge pour l'opt-in) ; l'API de production, elle, purge.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import load_config
from .course import RaceSpec
from .pipeline import run_full, run_preview


def _progress(n: int, name: str) -> None:
    print(f"\r  ingestion : {n} fichiers lus…", end="", file=sys.stderr, flush=True)


def _print_summary(preview, out=None) -> None:
    out = out or sys.stderr  # résolu à l'appel (compatible capture de tests)
    print(file=out)  # termine la ligne de progression
    suf = preview.sufficiency
    print(f"\n  Verdict de suffisance : {suf.verdict}  (vendable : {suf.sellable})", file=out)
    for c in suf.criteria:
        lvl = c.level or "—"
        print(f"    {lvl}  {c.name} : {c.detail}", file=out)

    # Jumeau physiologique CALCULÉ sur les données de l'athlète — affiché pour lever tout doute :
    # ces valeurs (exposant d'endurance, VC, durabilité) sont ajustées par athlète, jamais figées.
    t = preview.twin.to_dict()

    def _f(v, unit=""):
        return "n/a" if v is None else f"{v}{unit}"

    print(
        f"\n  Jumeau physiologique (ajusté sur {t['n_activities']} activités) : "
        f"exposant d'endurance E = {_f(t['endurance_E'])} · "
        f"VC = {_f(t['vc_kmh'], ' km/h')} · durabilité = {_f(t['durability_pct'], ' %')}",
        file=out,
    )
    pred = preview.prediction
    if pred is not None:
        print(
            f"\n  Prédiction : {pred.finish_hours:.2f} h "
            f"[{pred.interval_low_h:.2f} – {pred.interval_high_h:.2f}] (80%)  "
            f"· régime {pred.regime}",
            file=out,
        )
        if pred.cross_validation:
            print(f"  Validation croisée : MAE {pred.cross_validation.mae_pct:.1f}%", file=out)
    else:
        print("\n  Prédiction indisponible (données insuffisantes).", file=out)


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="twin-engine", description="Moteur Locomotion Twin")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("preview", "full"):
        sp = sub.add_parser(name, help=f"profondeur {name}")
        sp.add_argument("--training", required=True, help="archive d'entraînement (.zip/.fit/.tcx/.gpx/.gz ou dossier)")
        sp.add_argument("--course", required=True, help="trace GPX du parcours")
        sp.add_argument("--race", default=None, help="spec de course JSON (optionnel : sans, mode "
                        "GPX-only — distance issue de la trace, découpage auto tous les N km)")
        sp.add_argument("--athlete", default="athlète")
        sp.add_argument("--purge", action="store_true", help="supprimer l'archive après parsing")
        if name == "full":
            sp.add_argument("--out", required=True, help="dossier de sortie (figures + PDF)")
            sp.add_argument("--no-pdf", action="store_true", help="ne pas compiler le PDF")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    cfg = load_config()

    if args.race:
        race_path = Path(args.race)
        if not race_path.exists():
            print(f"Spec de course introuvable : {race_path}", file=sys.stderr)
            return 2
        race: RaceSpec = RaceSpec.from_json(race_path)
    else:
        # Mode GPX-only : aucun ravitaillement → distance depuis la trace, découpage auto.
        race = RaceSpec(name=Path(args.course).stem)
    course_gpx = Path(args.course).read_bytes()

    if args.cmd == "preview":
        result = run_preview(
            training_path=args.training, course_gpx=course_gpx, race=race, cfg=cfg,
            purge_source=args.purge, progress=_progress,
        )
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        _print_summary(result)
        return 0

    from datetime import datetime

    result = run_full(
        training_path=args.training, course_gpx=course_gpx, race=race, cfg=cfg,
        out_dir=Path(args.out), athlete=args.athlete, purge_source=args.purge,
        render_pdf=not args.no_pdf, report_date=datetime.now(), progress=_progress,
    )
    _print_summary(result.preview)
    if result.pdf_path:
        print(f"\n  Rapport PDF : {result.pdf_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
