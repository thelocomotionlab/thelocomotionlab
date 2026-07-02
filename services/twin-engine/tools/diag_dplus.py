"""Mesure C1 : D+ des activités, lissage temporel 5 s vs base de distance 150 m.

Le fixture Montagnhard ne contient que des agrégats : un changement du calcul des *features*
(D+, vga…) lui est INVISIBLE (avertissement CLAUDE.md). La décision d'activer
``twin.dplus_basis=distance_150m`` se prend donc sur CES chiffres, mesurés sur l'archive
réelle — jamais sur un A/B fixture inchangé.

Lancement (chez Valentin, archive réelle) :

    PYTHONPATH=src python -m tools.diag_dplus <archive-ou-dossier> [--min-hours 5]

Imprime, par activité assez longue : durée, D+@5s, D+@150m, écart % ; puis l'agrégat.
Si l'écart médian dépasse ~5 %, suivre le protocole DIAGNOSTIC §9.6 (activer le flag,
régénérer le fixture depuis l'archive, recapturer le golden réel).
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import replace

import numpy as np

from twin_engine.config import load_config
from twin_engine.ingest import ingest_path
from twin_engine.twin.record import process_activity

CFG = load_config()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="diag_dplus", description="D+ 5 s vs base distance 150 m")
    ap.add_argument("archive", help="archive d'entraînement (.zip/dossier) — non purgée")
    ap.add_argument("--min-hours", type=float, default=5.0,
                    help="durée minimale des activités mesurées (défaut 5 h)")
    args = ap.parse_args(argv)

    cfg_5s = CFG
    cfg_150 = replace(CFG, twin=replace(CFG.twin, dplus_basis="distance_150m"))

    result = ingest_path(args.archive, purge_source=False, running_only=True)
    rows: list[tuple[str, float, float, float]] = []
    for act in result.running:
        if act.duration_s < args.min_hours * 3600 or not act.has_altitude:
            continue
        s5, _, _ = process_activity(act, cfg_5s)
        s150, _, _ = process_activity(act, cfg_150)
        rows.append((s5.date or "?", s5.duration_s / 3600.0, s5.dplus_m, s150.dplus_m))

    if not rows:
        print("Aucune activité assez longue avec altitude.", file=sys.stderr)
        return 1

    print(f"{len(rows)} activité(s) ≥ {args.min_hours:.0f} h avec altitude\n")
    print("| date       | durée (h) | D+@5s (m) | D+@150m (m) | écart |")
    print("|------------|-----------|-----------|-------------|-------|")
    ratios = []
    for date, hours, d5, d150 in sorted(rows):
        gap = (d5 / d150 - 1) * 100 if d150 > 0 else float("nan")
        ratios.append(gap)
        print(f"| {date} | {hours:9.1f} | {d5:9.0f} | {d150:11.0f} | {gap:+4.1f}% |")
    med = float(np.nanmedian(ratios))
    print(f"\nÉcart médian D+@5s vs D+@150m : {med:+.1f} % "
          f"(min {np.nanmin(ratios):+.1f} %, max {np.nanmax(ratios):+.1f} %)")
    print("→ si ≳ +5 % : le β2 de la calibration est appris sur un axe D+/km gonflé ;"
          " suivre DIAGNOSTIC §9.6 avant d'activer dplus_basis=distance_150m.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
