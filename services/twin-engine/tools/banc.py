"""Le banc en UNE passe par archive : backtest (toutes coupures), radiographie arrêts/nuit
et passages réels sur un seul décodage — les sorties écrites dans un dossier, prêtes à coller.

Décoder une archive Coros de plusieurs milliers de fichiers coûte des dizaines de minutes ;
``tools/backtest``, ``tools/diag_ultras`` et ``tools/passages`` la décodaient chacun. Ici le
flux d'activités est ouvert une fois et « té » vers les trois consommateurs : le cache du
banc (agrégats), le collecteur de la radiographie (efforts longs) et celui des passages
(activités du jour de course). Résultats identiques aux outils séparés (vérifié par test).

    PYTHONPATH=src python -m tools.banc manifest-a.json [manifest-b.json …] --out /tmp/p0
        [--depot <dossier>] [--label NOM] [--set bloc.clé=valeur …] [--avant <run>]
        [--no-diag] [--no-passages] [--min-hours 10] [--min-stop-s 60] [--radius-m 150] [--dry-run]
        [--variant NOM:bloc.clé=valeur[,bloc.clé=valeur…]] … [--terrain <dossier>]

Chaque passage écrit au livre banc du registre (``docs/twin-registre/banc/``) un run pour la
configuration de base et un run par variante, horodatés et marqués du commit, de
l'empreinte de configuration et des drapeaux hors défaut ; les passages réels vont dans
``docs/twin-registre/passages.json``. ``--variant`` (répétable) rejoue TOUTES les coupures
sous une config surchargée, sur le même décodage — l'instrument des A/B de
calibration/prédiction/pacing (les blocs ``twin`` et ``course``, qui changent les agrégats
décodés, ne peuvent pas varier ici).

Écrit dans ``--out`` : ``backtest.md`` (prédit vs réel), ``diag-<athlète>.md`` + ``.json``,
``passages-<athlète>.md``, ``tableau.md`` (= ``tools/registre --tableau``), ``compare.md``
(contre le run ``--avant``, par défaut le dernier run de même étiquette avant ce passage) et,
par variante, ``backtest-<nom>.md``, ``tableau-<nom>.md``, ``compare-<nom>.md`` (contre le run
de base de ce passage). Une archive introuvable est signalée et sautée, jamais fatale.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

from twin_engine.config import override_config
from twin_engine.ingest import iter_activities
from twin_engine.registre import DEFAULT_RACINE, LIVRE_BANC, Depot, entete_de_run, lire_entrees

from tools.backtest import ArchiveCache, _fmt_row, backtest_race, config_du_banc, hint_missing_archive
from tools.diag_ultras import DiagCollector
from tools.diag_ultras import render_markdown as diag_markdown
from tools.passages import (PassageCollector, lignes_de_passages, passages_for_manifest,
                            race_meta_from_candidate)
from tools.passages import render_markdown as passages_markdown
from tools.registre import compare_markdown, tableau_markdown


def _slug(name: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-") or "athlete"


def parse_variants(specs: list[str], cfg) -> dict[str, object]:
    """« NOM:bloc.clé=valeur,… » → {nom: Config}. Refuse un nom en double et toute surcharge
    des blocs ``twin``/``course`` (les agrégats décodés en dépendent : il faudrait
    re-décoder, ce que le banc ne fait pas)."""
    out: dict[str, object] = {}
    for spec in specs:
        if ":" not in spec:
            raise ValueError(f"variante illisible : {spec!r} (attendu NOM:bloc.clé=valeur,…)")
        name, overrides = spec.split(":", 1)
        name = name.strip()
        if not name or name in out:
            raise ValueError(f"nom de variante vide ou en double : {name!r}")
        cfg_v = override_config(cfg, overrides)
        if cfg_v.twin != cfg.twin or cfg_v.course != cfg.course:
            raise ValueError(f"variante {name!r} : les blocs twin/course ne peuvent pas varier "
                             "sans re-décoder l'archive")
        out[name] = cfg_v
    return out


def run_manifest_one_pass(manifest_path: Path, cfg, *, out_dir: Path,
                          do_diag: bool = True, do_passages: bool = True,
                          min_hours: float | None = None, min_stop_s: float = 60.0,
                          radius_m: float = 150.0,
                          variants: dict[str, object] | None = None,
                          connus: dict | None = None,
                          terrain_dir: Path | None = None) -> dict | None:
    """Un manifeste, un décodage, trois produits. ``None`` si l'archive est introuvable.
    ``connus`` : les passages déjà au registre, servis quand la passe ne les relève pas.
    ``terrain_dir`` : les terrains de la carte (``tools/carte banc``), un par course."""
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
    if pas is not None:
        pas.fichiers(man["races"], base)
    # calendrier des courses sans race_json : lu dans l'activité du jour retenue pour les
    # passages (départ, position) — sert au terme de nuit de la cible, rien d'autre
    metas = {k: race_meta_from_candidate(pas.best.get(k)) for k in range(len(man["races"]))} \
        if pas is not None else {}
    # passages de la course (activité du jour) : la forme du plan de chaque entrée se juge
    # contre eux ; sans passe des passages, ceux déjà au registre
    results = (passages_for_manifest(pas.best, man, base, cfg, radius_m=radius_m)
               if pas is not None else None)
    par_course = ({k: p for k, (_, p) in enumerate(results)} if results is not None
                  else {k: (connus or {}).get((athlete, r["name"], r["date"]))
                        for k, r in enumerate(man["races"])})
    terrains = {k: _terrain_de(terrain_dir, athlete, r) for k, r in enumerate(man["races"])}
    entries: list[dict] = []
    for k, r in enumerate(man["races"]):
        print(f"  {athlete} · {r['name']} ({r['date']}) — coupure la veille…",
              file=sys.stderr, flush=True)
        entries.append({"athlete": athlete,
                        **backtest_race(cache, r, cfg, base=base, race_meta=metas.get(k),
                                        passages=par_course.get(k), terrain=terrains.get(k))})

    out: dict = {"athlete": athlete, "courses": len(man["races"]), "entries": entries,
                 "variants": {}, "passages": []}
    # variantes de config : mêmes agrégats décodés, calibration/prédiction rejouées
    for name, cfg_v in (variants or {}).items():
        cache.cfg = cfg_v
        try:
            out["variants"][name] = [
                {"athlete": athlete, **backtest_race(cache, r, cfg_v, base=base,
                                                     race_meta=metas.get(k),
                                                     passages=par_course.get(k),
                                                     terrain=terrains.get(k))}
                for k, r in enumerate(man["races"])]
        finally:
            cache.cfg = cfg
    slug = _slug(athlete)
    if diag is not None:
        res = diag.finish(cache.contributions, archive=archive, n_skipped=len(skipped),
                          manifest=man)
        (out_dir / f"diag-{slug}.md").write_text(diag_markdown(res) + "\n", encoding="utf-8")
        (out_dir / f"diag-{slug}.json").write_text(
            json.dumps(res, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        out["diag"] = res
    if results is not None:
        (out_dir / f"passages-{slug}.md").write_text(passages_markdown(athlete, results) + "\n",
                                                     encoding="utf-8")
        out["passages"] = lignes_de_passages(man, results)
    return out


def _terrain_de(terrain_dir: Path | None, athlete: str, race: dict) -> dict | None:
    """Le terrain de la carte d'une course (``<dossier>/<athlète>/<date>.json``), s'il existe."""
    if terrain_dir is None:
        return None
    chemin = Path(terrain_dir) / _slug(athlete) / f"{race['date']}.json"
    try:
        return json.loads(chemin.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _avant(depot: Depot, ref: str | None, label: str) -> list[dict] | None:
    """Les entrées du run de comparaison : ``ref`` (identifiant ou chemin), sinon le dernier
    run de même étiquette déjà au registre ; ``None`` s'il n'y en a pas."""
    try:
        if ref:
            chemin = Path(ref) if Path(ref).exists() else depot.chemin_du_run(ref)
        else:
            dernier = depot.dernier_run(label=label)
            if dernier is None:
                return None
            chemin = depot.chemin_du_run(dernier)
    except LookupError:
        return None
    _, entrees = lire_entrees(chemin)
    return depot.annoter(entrees, LIVRE_BANC)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="banc", description=__doc__.split("\n")[0])
    ap.add_argument("manifests", nargs="+", help="manifeste(s) JSON, un par athlète")
    ap.add_argument("--out", required=True, help="dossier des sorties markdown/JSON")
    ap.add_argument("--depot", default=str(DEFAULT_RACINE))
    ap.add_argument("--label", default="defauts", help="étiquette du run de base")
    ap.add_argument("--set", action="append", default=[], metavar="BLOC.CLÉ=VALEUR",
                    help="surcharge de la configuration de base (répétable)")
    ap.add_argument("--avant", default=None,
                    help="run de comparaison (identifiant ou chemin) ; défaut : le dernier "
                         "run de même étiquette")
    ap.add_argument("--no-diag", action="store_true", help="sans radiographie arrêts/nuit")
    ap.add_argument("--no-passages", action="store_true", help="sans passages réels")
    ap.add_argument("--min-hours", type=float, default=None,
                    help="seuil des efforts longs de la radiographie (défaut : vrais ultras)")
    ap.add_argument("--min-stop-s", type=float, default=60.0)
    ap.add_argument("--radius-m", type=float, default=150.0)
    ap.add_argument("--dry-run", action="store_true", help="n'écrit rien au registre")
    ap.add_argument("--variant", action="append", default=[], metavar="NOM:BLOC.CLÉ=VALEUR,…",
                    help="rejoue le banc sous une config surchargée (répétable) — un run de "
                         "plus au registre, sorties backtest-/tableau-/compare-<nom> dans --out")
    ap.add_argument("--terrain", default=None, metavar="DOSSIER",
                    help="terrains de la carte par course (tools/carte banc) : servis selon "
                         "pacing.terrain, prediction.terrain_total, calibration.terrain_adjust")
    args = ap.parse_args(argv)

    try:
        cfg = config_du_banc(args.set)
        variants = parse_variants(args.variant, cfg)
    except ValueError as exc:
        ap.error(str(exc))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    depot = Depot(args.depot)
    avant = _avant(depot, args.avant, args.label)

    rows: list[tuple[str, dict]] = []
    variant_rows: dict[str, list[tuple[str, dict]]] = {name: [] for name in variants}
    manifestes: list[dict] = []
    passages: list = []
    missing: list[str] = []
    for m in args.manifests:
        mp = Path(m)
        res = run_manifest_one_pass(
            mp, cfg, out_dir=out_dir, do_diag=not args.no_diag,
            do_passages=not args.no_passages, min_hours=args.min_hours,
            min_stop_s=args.min_stop_s, radius_m=args.radius_m, variants=variants,
            connus=depot.passages(), terrain_dir=Path(args.terrain) if args.terrain else None,
        )
        print(file=sys.stderr)
        if res is None:
            missing.append(json.loads(mp.read_text(encoding="utf-8"))["athlete"])
            continue
        manifestes.append({"athlete": res["athlete"], "courses": res["courses"]})
        rows += [(res["athlete"], e) for e in res["entries"]]
        passages += res["passages"]
        for name, ev in res["variants"].items():
            variant_rows[name] += [(res["athlete"], e) for e in ev]

    head = ("| athlète    | course                       | CV | prédit  | réel    | err %  | bandes [50] [80] |\n"
            "|------------|------------------------------|----|---------|---------|--------|------------------|")
    table = head + "\n" + "\n".join(_fmt_row(a, e) for a, e in rows)
    (out_dir / "backtest.md").write_text(table + "\n", encoding="utf-8")
    print(table)

    if rows and not args.dry_run:
        if passages:
            depot.ecrire_passages(passages)
        entete = entete_de_run(cfg, livre=LIVRE_BANC, label=args.label, manifestes=manifestes)
        chemin = depot.ecrire_run(entete, [e for _, e in rows])
        print(f"\nRun écrit : {chemin}", file=sys.stderr)
        for name, cfg_v in variants.items():
            ev = [e for _, e in variant_rows[name]]
            entete_v = {**entete_de_run(cfg_v, livre=LIVRE_BANC, label=name, manifestes=manifestes),
                        "variante_de": chemin.stem}
            print(f"Run écrit : {depot.ecrire_run(entete_v, ev)}", file=sys.stderr)
    entries = depot.annoter([e for _, e in rows], LIVRE_BANC)
    (out_dir / "tableau.md").write_text(tableau_markdown(entries) + "\n", encoding="utf-8")
    if avant is not None:
        (out_dir / "compare.md").write_text(compare_markdown(avant, entries) + "\n",
                                            encoding="utf-8")
    for name in variants:
        ev = depot.annoter([e for _, e in variant_rows[name]], LIVRE_BANC)
        (out_dir / f"backtest-{name}.md").write_text(
            head + "\n" + "\n".join(_fmt_row(a, e) for a, e in variant_rows[name]) + "\n",
            encoding="utf-8")
        (out_dir / f"tableau-{name}.md").write_text(tableau_markdown(ev) + "\n", encoding="utf-8")
        # l'avant d'une variante = le run de base de CE passage : l'effet du levier se lit
        # à agrégats décodés identiques
        (out_dir / f"compare-{name}.md").write_text(
            compare_markdown(entries, ev) + "\n", encoding="utf-8")
    written = sorted(p.name for p in out_dir.iterdir())
    print(f"\nSorties dans {out_dir} : {', '.join(written)}", file=sys.stderr)
    if missing:
        print(f"\n⚠ {len(missing)} manifeste(s) ignoré(s), archive introuvable : "
              + ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
