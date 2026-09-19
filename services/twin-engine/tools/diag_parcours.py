"""La géométrie d'un parcours, mesurée et imprimée — pour comparer deux traces sans deviner.

Ce que le rapport affiche du parcours (distance, D+, D−, Deq, et le D+/D− de chaque segment)
ne dépend que de trois choses : la trace GPX, le carnet de route (``aid_km``) et deux règles
fixes de la config (pas de grille, fenêtre de lissage). L'outil les sort toutes, pour deux
usages :

  * **comparer deux traces** du même parcours — laquelle explique un D+ qui a bougé ;
  * **épingler** la géométrie servie (``--references``), que ``tests/test_geometrie.py``
    relit ensuite pour refuser toute dérive silencieuse.

    PYTHONPATH=src python -m tools.diag_parcours trace.gpx --race examples/nice-100m.json
    PYTHONPATH=src python -m tools.diag_parcours a.gpx --contre b.gpx --race spec.json
    PYTHONPATH=src python -m tools.diag_parcours trace.gpx --race spec.json --references
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course

REFS = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "geometrie-parcours-reel.json"


def _geometrie(gpx: Path, race: RaceSpec, cfg) -> dict:
    c = build_course(gpx.read_bytes(), race, cfg)
    return {
        "total": {"length_km": round(c.length_km, 3), "dplus_m": round(c.dplus_m, 1),
                  "dminus_m": round(c.dminus_m, 1), "deq_km": round(c.deq_km, 3)},
        "segments": [{"index": s.index, "to": s.to, "off0": s.off0, "off1": s.off1,
                      "dplus_m": round(s.dplus_m, 1), "dminus_m": round(s.dminus_m, 1),
                      "deq_km": round(s.deq_km, 3)} for s in c.segments],
    }


def _table(a: dict, b: dict | None) -> str:
    lignes = ["| segment | km | D+ | D− | " + ("Δ D+ | Δ D− |" if b else "")]
    lignes.append("|---|---|---|---|" + ("---|---|" if b else ""))
    for i, s in enumerate(a["segments"]):
        col = f"| {s['index']} {s['to']} | {s['off0']:.1f}→{s['off1']:.1f} | {s['dplus_m']:.0f} | {s['dminus_m']:.0f} |"
        if b and i < len(b["segments"]):
            o = b["segments"][i]
            col += f" {s['dplus_m'] - o['dplus_m']:+.0f} | {s['dminus_m'] - o['dminus_m']:+.0f} |"
        lignes.append(col)
    return "\n".join(lignes)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Géométrie d'un parcours (et comparaison de deux traces)")
    p.add_argument("gpx", type=Path)
    p.add_argument("--race", type=Path, help="spec de course (carnet de route)")
    p.add_argument("--contre", type=Path, help="seconde trace à comparer")
    p.add_argument("--references", action="store_true",
                   help=f"écrire les valeurs épinglées dans {REFS.name}")
    p.add_argument("--json", type=Path)
    args = p.parse_args(argv)

    cfg = load_config()
    race = RaceSpec.from_json(args.race) if args.race else RaceSpec(name="Parcours")
    a = _geometrie(args.gpx, race, cfg)
    b = _geometrie(args.contre, race, cfg) if args.contre else None

    print(f"## {race.name} — {args.gpx.name}")
    for cle, val in a["total"].items():
        ligne = f"  {cle:12s} {val}"
        if b:
            ligne += f"   (autre trace : {b['total'][cle]}, écart {val - b['total'][cle]:+.1f})"
        print(ligne)
    if race.official_dplus_m:
        ecart = 100 * (a["total"]["dplus_m"] - race.official_dplus_m) / race.official_dplus_m
        print(f"  D+ au carnet {race.official_dplus_m:.0f} m → écart mesuré {ecart:+.1f} %")
    print()
    print(_table(a, b))

    if args.json:
        args.json.write_text(json.dumps({"a": a, "b": b}, ensure_ascii=False, indent=1),
                             encoding="utf-8")
    if args.references:
        REFS.parent.mkdir(parents=True, exist_ok=True)
        REFS.write_text(json.dumps(
            {"_comment": "Géométrie épinglée du parcours réel (tests/test_geometrie.py). "
                         "Régénérer avec tools/diag_parcours.py --references quand la trace "
                         "ou le carnet changent, en le disant dans le carnet.",
             "gpx": str(args.gpx.resolve()), "race": str(args.race.resolve()),
             "total": a["total"],
             "segments": [{k: s[k] for k in ("index", "to", "dplus_m", "dminus_m")}
                          for s in a["segments"]]},
            ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nréférences écrites : {REFS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
