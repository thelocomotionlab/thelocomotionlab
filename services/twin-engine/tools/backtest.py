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
      "dev_set": false,                    // true = cas de développement (Nice, Montagnhard)
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
        [--registre <chemin.json>] [--dry-run]

Les archives ne sont JAMAIS purgées (copies locales de travail). Chaque (athlète, course,
date) est une clé : relancer le banc MET À JOUR l'entrée, sans doublon.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.ingest import iter_activities
from twin_engine.pipeline import analyze_preview_from_twin
from twin_engine.registre import (bloc_course, bloc_domaine, bloc_modele, bloc_prediction,
                                  sous_le_domaine)
from twin_engine.twin.model import build_twin_from_contributions
from twin_engine.twin.record import iter_contributions

# registre par défaut : docs/ à la racine du monorepo (surchargable par --registre)
DEFAULT_REGISTRE = Path(__file__).resolve().parents[3] / "docs" / "twin-registre-couverture.json"


def parse_time_h(value) -> float | None:
    """Temps officiel → heures décimales. Accepte ``26:30:00``, ``26:30``, ``26h30``,
    ``26h``, un nombre (heures). ``None``/vide → None (ex. abandon)."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().lower()
    m = re.fullmatch(r"(\d+):(\d{1,2})(?::(\d{1,2}))?", s)
    if m:
        h, mn, sec = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
        return h + mn / 60.0 + sec / 3600.0
    m = re.fullmatch(r"(\d+)h(\d{1,2})?", s)
    if m:
        return int(m.group(1)) + int(m.group(2) or 0) / 60.0
    raise ValueError(f"temps officiel illisible : {value!r} (attendu HH:MM[:SS], 26h30 ou heures)")


class ArchiveCache:
    """L'archive décodée UNE fois, rejouable à N coupures temporelles.

    Le décodage (FIT/TCX/GPX + ``process_activity``) domine tout le reste ; une coupure ne
    fait que RETIRER des activités. Rejouer 13 courses coûtait donc 13 décodages complets
    de l'archive — une nuit sur une archive Coros fournie. Ici : un seul décodage, puis un
    filtre par date et une ré-agrégation instantanée par course.

    Les résultats sont identiques au chemin direct (mêmes agrégats, même ordre, donc mêmes
    départages à égalité) — c'est ce que vérifie ``test_backtest_tools``.
    """

    def __init__(self, archive: Path, cfg, *, stream=None,
                 skipped: list[dict] | None = None) -> None:
        """``stream`` : un flux d'activités déjà ouvert (un « tee » qui mesure autre chose au
        passage, cf. tools/banc) — sinon le cache ouvre l'archive lui-même. ``skipped`` est
        la liste des rejets d'ingestion du flux fourni (comptés après consommation)."""
        self.cfg = cfg
        if skipped is None:
            skipped = []
        if stream is None:
            stream = iter_activities(archive, running_only=True, skipped=skipped,
                                     progress=self._progress)
        # on ne garde QUE des agrégats : aucun tableau 1 Hz ne survit à cette ligne
        self.contributions = list(iter_contributions(stream, cfg))
        self.n_skipped = len(skipped)
        print(f"\r  archive décodée : {len(self.contributions)} activités "
              f"({self.n_skipped} écartées à l'ingestion) — rejouable sans re-décodage.",
              file=sys.stderr, flush=True)

    @staticmethod
    def _progress(n: int, name: str) -> None:
        if n % 100 == 0:
            print(f"\r  décodage de l'archive : {n} fichiers…", end="", file=sys.stderr,
                  flush=True)

    def preview_at(self, course, until: date, target_hours=None, race=None):
        """Jumeau + prédiction « ce que le moteur savait au soir du ``until`` ».

        Anti-fuite identique au chemin direct : postérieures ET non datées écartées.
        ``race`` : la spec de course (calendrier, chaleur, ravitos) — donnée de course, pas
        de l'athlète, donc hors du périmètre de la coupure.
        """
        kept = [c for c in self.contributions
                if c.start_date is not None and c.start_date <= until]
        n_excluded = len(self.contributions) - len(kept)
        twin = build_twin_from_contributions(kept, self.cfg)
        return analyze_preview_from_twin(
            twin, course, self.cfg, n_ingested=len(kept), n_skipped=self.n_skipped,
            n_excluded_until=n_excluded, analysis_date=until, target_hours=target_hours,
            race=race,
        )


def race_spec_from_meta(name: str, meta: dict | None) -> RaceSpec:
    """Spec minimale d'une course sans ``race_json`` : le calendrier (départ local, position,
    fuseau solaire) lu dans les métadonnées de l'activité du jour — l'heure et le lieu d'un
    départ de course sont des données de course, pas une performance de l'athlète. Sans
    métadonnées : spec nominale (mode GPX-only, écart de nuit nul)."""
    if not meta:
        return RaceSpec(name=name)
    return RaceSpec(name=name, start_time=meta["start_local"], lat=float(meta["lat"]),
                    lon=float(meta["lon"]), tz_offset_h=float(meta["tz"]))


def backtest_race(cache: "ArchiveCache", race_entry: dict, cfg, *, base: Path,
                  race_meta: dict | None = None) -> dict:
    """Rejoue UNE course passée : coupure la veille (ou ``until`` du manifeste) → entrée
    de registre. Une prédiction impossible (🔴) est consignée telle quelle : le refus du
    moteur est une information, pas un échec du banc. ``race_meta`` : calendrier de la
    course (cf. :func:`race_spec_from_meta`) quand le manifeste n'a pas de ``race_json``."""
    race_date = date.fromisoformat(race_entry["date"])
    until = (date.fromisoformat(race_entry["until"]) if race_entry.get("until")
             else race_date - timedelta(days=1))
    if until >= race_date:
        raise ValueError(f"{race_entry['name']} : la coupure ({until}) doit précéder la course "
                         f"({race_date}) — fuite de données sinon")
    gpx_path = (base / race_entry["gpx"]).resolve()
    if race_entry.get("race_json"):
        race = RaceSpec.from_json((base / race_entry["race_json"]).resolve())
    else:
        race = race_spec_from_meta(race_entry["name"], race_meta)

    course = build_course(gpx_path.read_bytes(), race, cfg)
    result = cache.preview_at(course, until, target_hours=race.target_hours, race=race)
    pred = result.prediction
    actual_h = None if race_entry.get("dnf") else parse_time_h(race_entry.get("official_time"))

    # Les blocs de l'entrée viennent du moteur (twin_engine.registre) : le tableau de bord
    # consigne ses courses courues par les mêmes fonctions, donc dans les mêmes unités.
    entry: dict = {
        "race": race_entry["name"],
        "date": race_entry["date"],
        "until": until.isoformat(),
        "dnf": bool(race_entry.get("dnf", False)),
        "official_time_h": None if actual_h is None else round(actual_h, 3),
        "course": bloc_course(result.course),
        "model": bloc_modele(twin=result.twin, calibration=result.calibration,
                             sufficiency=result.sufficiency, cfg=cfg,
                             n_activities_used=result.n_ingested,
                             n_excluded_until=result.n_excluded_until,
                             n_skipped_ingest=result.n_skipped),
        "race_meta": None if race_meta is None else {
            "start_local": race_meta["start_local"].isoformat(),
            "lat": round(float(race_meta["lat"]), 2), "lon": round(float(race_meta["lon"]), 2),
            "tz": race_meta["tz"], "source": "activité du jour"},
        "prediction": None,
    }
    entry["below_domain"] = sous_le_domaine(actual_h, pred, cfg)
    entry["domain_demand"] = bloc_domaine(result.sufficiency)
    if pred is not None:
        entry["prediction"] = bloc_prediction(pred, actual_h)
    return entry


def merge_registre(registre: dict, athlete: str, dev_set: bool, entries: list[dict]) -> dict:
    """Fusion idempotente : la clé (athlete, race, date) met à jour l'entrée existante.

    Les champs de CURATION portés par l'ancienne ligne et que la machine ne régénère pas
    (``quarantine``, annotations futures) SURVIVENT à la re-fusion : une quarantaine ne
    disparaît jamais silencieusement (protocole du registre — leçon du 2026-07-16, où une
    re-fusion avait fait re-rentrer dans les stats une course au parcours inutilisable)."""
    rows = registre.setdefault("entries", [])
    index = {(r.get("athlete"), r.get("race"), r.get("date")): i for i, r in enumerate(rows)}
    for e in entries:
        row = {"athlete": athlete, "dev_set": bool(dev_set), **e}
        key = (athlete, e["race"], e["date"])
        if key in index:
            old = rows[index[key]]
            extras = {k: v for k, v in old.items() if k not in row}
            rows[index[key]] = {**row, **extras}
        else:
            index[key] = len(rows)
            rows.append(row)
    return registre


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


def run_manifest(manifest_path: Path, cfg, registre: dict) -> list[dict] | None:
    """Rejoue toutes les courses d'un manifeste. ``None`` si l'archive est introuvable : le
    banc le signale et passe au manifeste suivant, au lieu de tout arrêter."""
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
        entries.append(backtest_race(cache, r, cfg, base=base))
    merge_registre(registre, athlete, man.get("dev_set", False), entries)
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


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="backtest", description=__doc__.split("\n")[0])
    ap.add_argument("manifests", nargs="+", help="manifeste(s) JSON, un par athlète")
    ap.add_argument("--registre", default=str(DEFAULT_REGISTRE),
                    help=f"registre JSON à alimenter (défaut : {DEFAULT_REGISTRE})")
    ap.add_argument("--dry-run", action="store_true", help="n'écrit pas le registre")
    args = ap.parse_args(argv)

    cfg = load_config()
    reg_path = Path(args.registre)
    registre = (json.loads(reg_path.read_text(encoding="utf-8")) if reg_path.exists()
                else {"_comment": "Registre de couverture — agrégats uniquement (pas de PII). "
                                  "Alimenté par tools/backtest.py ; analyse par tools/registre.py ; "
                                  "protocole : docs/twin-registre-couverture.md.",
                      "entries": []})

    # tout traiter d'abord (la progression file sur stderr), puis imprimer le tableau
    # d'un bloc — sans lignes de progression intercalées entre l'en-tête et les lignes
    all_rows: list[tuple[str, dict]] = []
    missing: list[str] = []
    for m in args.manifests:
        mp = Path(m)
        man = json.loads(mp.read_text(encoding="utf-8"))
        entries = run_manifest(mp, cfg, registre)
        if entries is None:
            missing.append(man["athlete"])
            continue
        all_rows += [(man["athlete"], e) for e in entries]

    print("\n| athlète    | course                       | CV | prédit  | réel    | err %  | bandes [50] [80] |")
    print("|------------|------------------------------|----|---------|---------|--------|------------------|")
    for athlete, e in all_rows:
        print(_fmt_row(athlete, e))

    if args.dry_run:
        print("\n(dry-run : registre non écrit)", file=sys.stderr)
        return 1 if missing else 0
    if all_rows:
        reg_path.parent.mkdir(parents=True, exist_ok=True)
        reg_path.write_text(json.dumps(registre, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")
        print(f"\nRegistre mis à jour : {reg_path} ({len(registre['entries'])} entrée(s) au total)",
              file=sys.stderr)
        print("Analyse : PYTHONPATH=src python -m tools.registre", file=sys.stderr)
    if missing:
        print(f"\n⚠ {len(missing)} manifeste(s) ignoré(s), archive introuvable : "
              + ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
