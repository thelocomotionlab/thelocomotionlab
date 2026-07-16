"""Radiographie d'une archive d'entraînement — agrégats seulement, rien n'est conservé.

Répond à « l'archive contient-elle vraiment ce qu'on croit ? » avec les MÊMES parseurs que
le produit (aucune confiance à une lecture externe) : comptages par année × format, sports,
activités non datées, liste des efforts longs, et raisons de rejet à l'ingestion — l'écart
entre « fichiers dans l'archive » et « activités utilisées par le moteur » devient lisible.

Cas d'usage type (banc d'essai) : le moteur ne voit aucun « vrai ultra » avant une date
alors que l'athlète jure avoir couru — la liste des efforts ≥ N h dit immédiatement si la
course est ABSENTE de l'archive (trou d'export) ou présente mais écartée (sport, durée,
rejet de parsing).

Lancement :  PYTHONPATH=src python -m tools.diag_archive <archive.zip|dossier> [--min-hours 8]
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

from twin_engine.ingest import iter_activities


def _inventory(path: Path) -> Counter:
    """Inventaire BRUT des fichiers (extensions), sans rien lire : ce que l'archive
    contient physiquement, avant tout parsing — l'écart avec « parsées » désigne les
    fichiers que le marcheur ne reconnaît pas (ils sont ignorés en silence en dossier)."""
    import zipfile

    def ext(name: str) -> str:
        n = name.lower()
        for double in (".fit.gz", ".tcx.gz", ".gpx.gz"):
            if n.endswith(double):
                return double
        s = Path(n).suffix
        return s if s else "(sans extension)"

    inv: Counter = Counter()
    if path.is_file() and path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as z:
            for i in z.infolist():
                if not i.is_dir():
                    inv[ext(i.filename)] += 1
    elif path.is_dir():
        for f in path.rglob("*"):
            if f.is_file():
                inv[ext(f.name)] += 1
    else:
        inv[ext(path.name)] += 1
    return inv


def analyze(path: Path, min_hours: float = 8.0) -> dict:
    """Balaye l'archive en flux et ne garde que des agrégats (mémoire O(1 activité))."""
    skipped: list[dict] = []
    per_year: dict[object, Counter] = defaultdict(Counter)
    sports: Counter = Counter()
    long_efforts: list[dict] = []
    n = 0
    for act in iter_activities(path, running_only=False, skipped=skipped):
        n += 1
        dur_h = float(act.t[-1]) / 3600.0 if len(act.t) else 0.0
        year = act.start_time.year if act.start_time else "sans date"
        sport = act.sport or "inconnu"
        per_year[year]["total"] += 1
        per_year[year][act.source_format] += 1
        if sport == "running":
            per_year[year]["running"] += 1
        sports[sport] += 1
        if dur_h >= min_hours:
            long_efforts.append({
                "date": act.start_time.date().isoformat() if act.start_time else "sans date",
                "hours": round(dur_h, 2),
                "km": round(float(act.dist_m[-1]) / 1000.0, 1) if len(act.dist_m) else None,
                "sport": sport,
                "format": act.source_format,
            })
    long_efforts.sort(key=lambda e: e["date"])
    return {
        "inventory": _inventory(path),
        "n_parsed": n,
        "n_skipped": len(skipped),
        "skip_reasons": Counter(s["reason"] for s in skipped),
        "per_year": per_year,
        "sports": sports,
        "long_efforts": long_efforts,
        "min_hours": min_hours,
    }


def report(r: dict) -> None:
    total = sum(r["inventory"].values())
    print(f"\nFichiers dans l'archive : {total}")
    for e, cnt in r["inventory"].most_common(12):
        print(f"    {cnt:>5} × {e}")
    print(f"\nActivités PARSÉES : {r['n_parsed']} · rejetées à l'ingestion : {r['n_skipped']}")
    unseen = total - r["n_parsed"] - r["n_skipped"]
    if unseen > 0:
        print(f"  ⚠ {unseen} fichier(s) ni parsé(s) ni rejeté(s) : extensions non reconnues "
              "par le marcheur (ignorées en silence) — comparer les deux tableaux ci-dessus.")
    if r["skip_reasons"]:
        print("  Raisons de rejet (top 10) :")
        for reason, cnt in r["skip_reasons"].most_common(10):
            print(f"    {cnt:>5} × {reason[:90]}")

    print("\nPar année (parsées — le moteur n'utilise ensuite que la course à pied) :")
    print(f"  {'année':<10} {'total':>6} {'running':>8}   formats")
    years = sorted(r["per_year"], key=lambda y: (isinstance(y, str), y))
    for y in years:
        c = r["per_year"][y]
        fmts = " ".join(f"{k}:{v}" for k, v in sorted(c.items())
                        if k not in ("total", "running"))
        print(f"  {str(y):<10} {c['total']:>6} {c.get('running', 0):>8}   {fmts}")

    print("\nSports :", ", ".join(f"{s}:{n}" for s, n in r["sports"].most_common()))

    print(f"\nEfforts ≥ {r['min_hours']:.0f} h ({len(r['long_efforts'])}) — la liste qui dit "
          "si une course longue est présente :")
    for e in r["long_efforts"]:
        km = "—" if e["km"] is None else f"{e['km']:.0f} km"
        print(f"  {e['date']}  {e['hours']:>5.1f} h  {km:>8}  {e['sport']:<10} ({e['format']})")
    if not r["long_efforts"]:
        print("  (aucun)")

    undated = r["per_year"].get("sans date", {}).get("total", 0)
    if undated:
        print(f"\n⚠ {undated} activité(s) SANS DATE : utilisées en analyse normale, mais "
              "ÉCARTÉES en mode backtest (--until, anti-fuite).")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="diag_archive", description=__doc__.split("\n")[0])
    ap.add_argument("archive", help="archive (.zip/.fit/.tcx/.gpx/.gz) ou dossier")
    ap.add_argument("--min-hours", type=float, default=8.0,
                    help="seuil de la liste des efforts longs (défaut : 8 h)")
    args = ap.parse_args(argv)
    p = Path(args.archive)
    if not p.exists():
        print(f"Introuvable : {p}", file=sys.stderr)
        return 2
    report(analyze(p, args.min_hours))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
