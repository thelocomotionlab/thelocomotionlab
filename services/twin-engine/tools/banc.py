"""Le banc en UNE passe par archive : backtest (toutes coupures), radiographie arrêts/nuit
et passages réels sur un seul décodage — les sorties écrites dans un dossier, prêtes à coller.

Décoder une archive Coros de plusieurs milliers de fichiers coûte des dizaines de minutes ;
``tools/backtest``, ``tools/diag_ultras`` et ``tools/passages`` la décodaient chacun. Ici le
flux d'activités est ouvert une fois et « té » vers les trois consommateurs : le cache du
banc (agrégats), le collecteur de la radiographie (efforts longs) et celui des passages
(activités du jour de course). Résultats identiques aux outils séparés (vérifié par test).

    PYTHONPATH=src python -m tools.banc manifest-a.json [manifest-b.json …] --out /tmp/p0
        [--registre <chemin.json>] [--avant <registre-avant.json>]
        [--no-diag] [--no-passages] [--min-hours 10] [--min-stop-s 60] [--radius-m 150] [--dry-run]

Écrit dans ``--out`` : ``backtest.md`` (prédit vs réel), ``diag-<athlète>.md`` + ``.json``,
``passages-<athlète>.md``, ``tableau.md`` (= ``tools/registre --tableau``) et ``compare.md``
(= ``--compare AVANT``, si le registre « avant » existe). Le registre est mis à jour comme
par ``tools/backtest`` puis ``tools/passages``. Une archive introuvable est signalée et
sautée, jamais fatale.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

from twin_engine.config import load_config
from twin_engine.ingest import iter_activities

from tools.backtest import (DEFAULT_REGISTRE, ArchiveCache, _fmt_row, backtest_race,
                            hint_missing_archive, merge_registre)
from tools.diag_ultras import DiagCollector
from tools.diag_ultras import render_markdown as diag_markdown
from tools.passages import PassageCollector, passages_for_manifest
from tools.passages import render_markdown as passages_markdown
from tools.registre import compare_markdown, tableau_markdown

DEFAULT_AVANT = Path(__file__).resolve().parents[3] / "docs" / "archive" / "twin-v2" / "registre-avant.json"


def _slug(name: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-") or "athlete"


def run_manifest_one_pass(manifest_path: Path, cfg, registre: dict, *, out_dir: Path,
                          do_diag: bool = True, do_passages: bool = True,
                          min_hours: float | None = None, min_stop_s: float = 60.0,
                          radius_m: float = 150.0) -> dict | None:
    """Un manifeste, un décodage, trois produits. ``None`` si l'archive est introuvable."""
    base = manifest_path.resolve().parent
    man = json.loads(manifest_path.read_text(encoding="utf-8"))
    athlete = man["athlete"]
    archive = (base / man["archive"]).resolve()
    if not archive.exists():
        print(f"  {athlete} : ARCHIVE INTROUVABLE — {archive}\n{hint_missing_archive(archive)}\n"
              f"  → corrige le champ « archive » de {manifest_path.name} ; manifeste ignoré.",
              file=sys.stderr)
        return None
    print(f"  {athlete} : décodage de l'archive — une seule fois pour le banc, la "
          "radiographie et les passages (long sur une grosse archive : le compteur avance "
          "tous les 100 fichiers)…", file=sys.stderr, flush=True)
    skipped: list[dict] = []
    diag = DiagCollector(cfg, min_hours=min_hours, min_stop_s=min_stop_s) if do_diag else None
    pas = PassageCollector(man["races"]) if do_passages else None
    stream = iter_activities(archive, running_only=True, skipped=skipped,
                             progress=ArchiveCache._progress)

    def _tee(s):
        for i, act in enumerate(s):
            if diag is not None:
                diag.see(i, act)
            if pas is not None:
                pas.see(act)
            yield act

    cache = ArchiveCache(archive, cfg, stream=_tee(stream), skipped=skipped)
    entries: list[dict] = []
    for r in man["races"]:
        print(f"  {athlete} · {r['name']} ({r['date']}) — coupure la veille…",
              file=sys.stderr, flush=True)
        entries.append(backtest_race(cache, r, cfg, base=base))
    merge_registre(registre, athlete, man.get("dev_set", False), entries)

    out: dict = {"athlete": athlete, "entries": entries}
    slug = _slug(athlete)
    if diag is not None:
        res = diag.finish(cache.contributions, archive=archive, n_skipped=len(skipped),
                          manifest=man)
        (out_dir / f"diag-{slug}.md").write_text(diag_markdown(res) + "\n", encoding="utf-8")
        (out_dir / f"diag-{slug}.json").write_text(
            json.dumps(res, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        out["diag"] = res
    if pas is not None:
        results = passages_for_manifest(pas.best, man, base, cfg, registre, radius_m=radius_m)
        (out_dir / f"passages-{slug}.md").write_text(passages_markdown(athlete, results) + "\n",
                                                     encoding="utf-8")
        out["passages"] = results
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="banc", description=__doc__.split("\n")[0])
    ap.add_argument("manifests", nargs="+", help="manifeste(s) JSON, un par athlète")
    ap.add_argument("--out", required=True, help="dossier des sorties markdown/JSON")
    ap.add_argument("--registre", default=str(DEFAULT_REGISTRE))
    ap.add_argument("--avant", default=str(DEFAULT_AVANT),
                    help="registre « avant » pour compare.md (ignoré s'il n'existe pas)")
    ap.add_argument("--no-diag", action="store_true", help="sans radiographie arrêts/nuit")
    ap.add_argument("--no-passages", action="store_true", help="sans passages réels")
    ap.add_argument("--min-hours", type=float, default=None,
                    help="seuil des efforts longs de la radiographie (défaut : vrais ultras)")
    ap.add_argument("--min-stop-s", type=float, default=60.0)
    ap.add_argument("--radius-m", type=float, default=150.0)
    ap.add_argument("--dry-run", action="store_true", help="n'écrit pas le registre")
    args = ap.parse_args(argv)

    cfg = load_config()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    reg_path = Path(args.registre)
    registre = (json.loads(reg_path.read_text(encoding="utf-8")) if reg_path.exists()
                else {"_comment": "Registre de couverture — agrégats uniquement (pas de PII). "
                                  "Alimenté par tools/backtest.py ; analyse par tools/registre.py ; "
                                  "protocole : docs/twin-registre-couverture.md.",
                      "entries": []})

    rows: list[tuple[str, dict]] = []
    missing: list[str] = []
    for m in args.manifests:
        mp = Path(m)
        res = run_manifest_one_pass(
            mp, cfg, registre, out_dir=out_dir, do_diag=not args.no_diag,
            do_passages=not args.no_passages, min_hours=args.min_hours,
            min_stop_s=args.min_stop_s, radius_m=args.radius_m,
        )
        print(file=sys.stderr)
        if res is None:
            missing.append(json.loads(mp.read_text(encoding="utf-8"))["athlete"])
            continue
        rows += [(res["athlete"], e) for e in res["entries"]]

    head = ("| athlète    | course                       | CV | prédit  | réel    | err %  | bandes [50] [80] |\n"
            "|------------|------------------------------|----|---------|---------|--------|------------------|")
    table = head + "\n" + "\n".join(_fmt_row(a, e) for a, e in rows)
    (out_dir / "backtest.md").write_text(table + "\n", encoding="utf-8")
    print(table)

    if rows and not args.dry_run:
        reg_path.parent.mkdir(parents=True, exist_ok=True)
        reg_path.write_text(json.dumps(registre, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")
        print(f"\nRegistre mis à jour : {reg_path} ({len(registre['entries'])} entrée(s))",
              file=sys.stderr)
    entries = registre.get("entries", [])
    (out_dir / "tableau.md").write_text(tableau_markdown(entries) + "\n", encoding="utf-8")
    avant = Path(args.avant) if args.avant else None
    if avant is not None and avant.exists():
        before = json.loads(avant.read_text(encoding="utf-8")).get("entries", [])
        (out_dir / "compare.md").write_text(compare_markdown(before, entries) + "\n",
                                            encoding="utf-8")
    written = sorted(p.name for p in out_dir.iterdir())
    print(f"\nSorties dans {out_dir} : {', '.join(written)}", file=sys.stderr)
    if missing:
        print(f"\n⚠ {len(missing)} manifeste(s) ignoré(s), archive introuvable : "
              + ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
