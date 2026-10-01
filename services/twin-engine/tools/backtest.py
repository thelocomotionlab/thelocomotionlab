"""Banc d'essai rétrospectif (« walk-forward ») — alimente le registre de couverture.

Rejoue des courses PASSÉES avec exactement ce que le moteur aurait su la veille
(coupure ``until`` du pipeline, anti-fuite : activités postérieures ET non datées
écartées), confronte aux temps officiels, imprime le tableau prédit-vs-réel et
alimente le registre machine-lisible (AGRÉGATS seulement — pas de trace, pas de PII).
Protocole complet : docs/twin-registre-couverture.md.

Manifeste JSON (un fichier par athlète ; chemins relatifs = relatifs au manifeste) :

    {
      "athlete": "Pseudo",
      "archive": "archives/export.zip",
      "races": [
        {"name": "X-Trail 2025", "date": "2025-06-14", "official_time": "26:30:00",
         "gpx": "traces/x-trail.gpx",
         "race_json": "carnets/x-trail.json",   // optionnel (sans : mode GPX-only)
         "until": "2025-06-10",                 // optionnel (défaut : veille de la course)
         // official_time absent = course À VENIR : l'entrée est PRÉPARÉE (central, bandes,
         // source, verdict à la coupure) et reste hors des statistiques ; après la course,
         // on renseigne le temps et on relance — l'entrée est écrasée, complète.
         "dnf": false}                          // true = abandon (consigné, exclu des quantiles)
      ]
    }

Lancement :

    PYTHONPATH=src python -m tools.backtest manifest-athlete1.json [manifest-athlete2.json ...]
        [--depot <dossier>] [--label NOM] [--set bloc.clé=valeur …] [--dry-run]

Chaque lancement écrit UN run au livre banc du registre (``docs/twin-registre/banc/``),
horodaté et marqué du commit, de l'empreinte de configuration et des drapeaux hors défaut ;
un run précédent n'est jamais réécrit. Les archives ne sont JAMAIS purgées (copies locales
de travail). Le statut dev/frais d'un athlète vit dans ``docs/twin-registre/athletes.json`` :
le champ ``dev_set`` d'un manifeste n'est plus lu.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from twin_engine.config import load_config, override_config
from twin_engine.registre import DEFAULT_RACINE, LIVRE_BANC, Depot, entete_de_run
from twin_engine.registre.walkforward import (ArchiveCache, backtest_race,  # noqa: F401
                                              parse_time_h, race_spec_from_meta)


def hint_missing_archive(archive: Path) -> str:
    """Ce qui existe autour du chemin attendu — pour corriger le manifeste sans chercher."""
    parent = archive
    while not parent.exists() and parent != parent.parent:
        parent = parent.parent
    if not parent.is_dir():
        return "  (aucun dossier parent existant)"
    names = sorted(x.name + ("/" if x.is_dir() else f"  ({x.stat().st_size // 1_048_576} Mo)")
                   for x in parent.iterdir())
    return f"  contenu de {parent} : {', '.join(names) if names else '(vide)'}"


def run_manifest(manifest_path: Path, cfg, passages: dict | None = None) -> list[dict] | None:
    """Rejoue toutes les courses d'un manifeste ; les entrées portent le pseudonyme de
    l'athlète. ``None`` si l'archive est introuvable : le banc le signale et passe au
    manifeste suivant, au lieu de tout arrêter."""
    base = manifest_path.resolve().parent
    man = json.loads(manifest_path.read_text(encoding="utf-8"))
    athlete = man["athlete"]
    archive = (base / man["archive"]).resolve()
    if not archive.exists():
        print(f"  {athlete} : ARCHIVE INTROUVABLE — {archive}\n{hint_missing_archive(archive)}\n"
              f"  → corrige le champ « archive » de {manifest_path.name} (chemin relatif au "
              "manifeste) ; ce manifeste est ignoré.", file=sys.stderr)
        return None
    # UN décodage pour tout le manifeste, puis une coupure par course (cf. ArchiveCache)
    print(f"  {athlete} : décodage de l'archive (une seule fois)…", file=sys.stderr, flush=True)
    cache = ArchiveCache(archive, cfg)
    entries: list[dict] = []
    for r in man["races"]:
        print(f"  {athlete} · {r['name']} ({r['date']}) — coupure la veille…",
              file=sys.stderr, flush=True)
        pas = (passages or {}).get((athlete, r["name"], r["date"]))
        entries.append({"athlete": athlete, **backtest_race(cache, r, cfg, base=base,
                                                             passages=pas)})
    return entries


def _fmt_row(athlete: str, e: dict) -> str:
    dom = " ·hors-domaine" if e.get("below_domain") else ""
    p = e.get("prediction")
    if p is None:
        return (f"| {athlete:<10} | {e['race'][:28]:<28} | {e['model']['verdict']} "
                f"| {'—':>7} | {'—':>7} | {'—':>6} | pas de prédiction ({e['model']['regime']}){dom} |")
    actual = e["official_time_h"]
    err = "  dnf" if e["dnf"] else ("    —" if p["err_pct"] is None else f"{p['err_pct']:+5.1f}")
    flags = "" if p["in_plan"] is None else ("✓50 " if p["in_plan"] else "✗50 ")
    flags += "" if p["in_safety"] is None else ("✓80" if p["in_safety"] else "✗80")
    return (f"| {athlete:<10} | {e['race'][:28]:<28} | {e['model']['verdict']} "
            f"| {p['central_h']:7.2f} | {('—' if actual is None else f'{actual:7.2f}'):>7} "
            f"| {err:>6} | [{p['plan_low_h']:.1f}-{p['plan_high_h']:.1f}] "
            f"[{p['safety_low_h']:.1f}-{p['safety_high_h']:.1f}] {flags}{dom} |")


def config_du_banc(sets: list[str]):
    """La configuration du run : ``TWIN_CONFIG_PATH`` (ou ``twin.config.json``), puis chaque
    surcharge ``--set bloc.clé=valeur``."""
    cfg = load_config()
    for spec in sets:
        cfg = override_config(cfg, spec)
    return cfg


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="backtest", description=__doc__.split("\n")[0])
    ap.add_argument("manifests", nargs="+", help="manifeste(s) JSON, un par athlète")
    ap.add_argument("--depot", default=str(DEFAULT_RACINE),
                    help=f"registre committé (défaut : {DEFAULT_RACINE})")
    ap.add_argument("--label", default="defauts", help="étiquette du run (défaut : defauts)")
    ap.add_argument("--set", action="append", default=[], metavar="BLOC.CLÉ=VALEUR",
                    help="surcharge de configuration du run (répétable)")
    ap.add_argument("--dry-run", action="store_true", help="n'écrit pas le run")
    args = ap.parse_args(argv)

    try:
        cfg = config_du_banc(args.set)
    except ValueError as exc:
        ap.error(str(exc))
    depot = Depot(args.depot)

    # tout traiter d'abord (la progression file sur stderr), puis imprimer le tableau
    # d'un bloc — sans lignes de progression intercalées entre l'en-tête et les lignes
    all_rows: list[tuple[str, dict]] = []
    missing: list[str] = []
    manifestes: list[dict] = []
    for m in args.manifests:
        mp = Path(m)
        man = json.loads(mp.read_text(encoding="utf-8"))
        entries = run_manifest(mp, cfg, depot.passages())
        if entries is None:
            missing.append(man["athlete"])
            continue
        manifestes.append({"athlete": man["athlete"], "courses": len(man["races"])})
        all_rows += [(man["athlete"], e) for e in entries]

    print("\n| athlète    | course                       | CV | prédit  | réel    | err %  | bandes [50] [80] |")
    print("|------------|------------------------------|----|---------|---------|--------|------------------|")
    for athlete, e in all_rows:
        print(_fmt_row(athlete, e))

    if args.dry_run:
        print("\n(dry-run : run non écrit)", file=sys.stderr)
        return 1 if missing else 0
    if all_rows:
        entete = entete_de_run(cfg, livre=LIVRE_BANC, label=args.label, manifestes=manifestes)
        chemin = depot.ecrire_run(entete, [e for _, e in all_rows])
        print(f"\nRun écrit : {chemin} ({len(all_rows)} entrée(s), empreinte "
              f"{entete['config_empreinte']}, commit {entete['commit']})", file=sys.stderr)
        print("Analyse : PYTHONPATH=src python -m tools.registre", file=sys.stderr)
    if missing:
        print(f"\n⚠ {len(missing)} manifeste(s) ignoré(s), archive introuvable : "
              + ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
