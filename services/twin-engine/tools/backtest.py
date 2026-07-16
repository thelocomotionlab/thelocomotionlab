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
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np

from twin_engine.config import load_config
from twin_engine.course import RaceSpec
from twin_engine.pipeline import run_preview

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


def _sd_rel(calibration, prediction) -> float | None:
    """Écart-type prédictif RELATIF au point cible (même levier que le conforme, S5) —
    stocké pour la future fenêtre empirique groupée (normalisation inter-cas)."""
    if calibration.beta_cov is None or prediction is None or prediction.v_kmh <= 0:
        return None
    x0 = np.array([1.0, np.log(prediction.finish_hours), prediction.dplus_per_km])
    Sb = np.asarray(calibration.beta_cov, dtype=float)
    var = calibration.sigma_kmh**2 + float(x0 @ Sb @ x0)
    return float(np.sqrt(max(var, 0.0)) / prediction.v_kmh)


def backtest_race(archive: Path, race_entry: dict, cfg, *, base: Path) -> dict:
    """Rejoue UNE course passée : coupure la veille (ou ``until`` du manifeste) → entrée
    de registre. Une prédiction impossible (🔴) est consignée telle quelle : le refus du
    moteur est une information, pas un échec du banc."""
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
        race = RaceSpec(name=race_entry["name"])

    result = run_preview(
        training_path=archive, course_gpx=gpx_path.read_bytes(), race=race, cfg=cfg,
        purge_source=False, until=until,
    )
    pred = result.prediction
    actual_h = None if race_entry.get("dnf") else parse_time_h(race_entry.get("official_time"))

    entry: dict = {
        "race": race_entry["name"],
        "date": race_entry["date"],
        "until": until.isoformat(),
        "dnf": bool(race_entry.get("dnf", False)),
        "official_time_h": None if actual_h is None else round(actual_h, 3),
        "course": {
            "length_km": round(result.course.length_km, 1),
            "deq_km": round(result.course.deq_km, 1),
            "dplus_per_km": round(result.course.dplus_per_km, 1),
        },
        "model": {
            "verdict": result.sufficiency.verdict,
            "regime": result.calibration.regime,
            "n_genuine": result.calibration.n_genuine,
            "n_eff": round(result.calibration.n_eff, 2),
            "sigma_kmh": round(result.calibration.sigma_kmh, 3),
            "n_activities_used": result.n_ingested,
            "n_excluded_until": result.n_excluded_until,
            "n_skipped_ingest": result.n_skipped,
        },
        "prediction": None,
    }
    # cible SOUS le domaine de calibration (efforts ≥ genuine_min_hours) : la prédiction est
    # une extrapolation vers le bas — consignée et analysée À PART (tools/registre)
    ref_h = actual_h if actual_h is not None else (pred.finish_hours if pred else None)
    entry["below_domain"] = (None if ref_h is None
                             else bool(ref_h < cfg.calibration.genuine_min_hours))
    if pred is not None:
        cv = pred.cross_validation
        err_pct = (None if actual_h is None
                   else round(100.0 * (pred.finish_hours - actual_h) / actual_h, 2))
        entry["prediction"] = {
            "central_h": round(pred.finish_hours, 3),
            "plan_low_h": None if pred.plan_low_h is None else round(pred.plan_low_h, 3),
            "plan_high_h": None if pred.plan_high_h is None else round(pred.plan_high_h, 3),
            "safety_low_h": round(pred.interval_low_h, 3),
            "safety_high_h": round(pred.interval_high_h, 3),
            "interval_source": pred.interval_source,
            "cv_mae_pct": None if cv is None else round(cv.mae_pct, 2),
            "sd_rel": (lambda v: None if v is None else round(v, 4))(_sd_rel(result.calibration, pred)),
            # err_pct > 0 : le moteur a prédit TROP LENT (central au-dessus du réel)
            "err_pct": err_pct,
            "in_plan": (None if actual_h is None or pred.plan_low_h is None
                        else bool(pred.plan_low_h <= actual_h <= pred.plan_high_h)),
            "in_safety": (None if actual_h is None
                          else bool(pred.interval_low_h <= actual_h <= pred.interval_high_h)),
        }
    return entry


def merge_registre(registre: dict, athlete: str, dev_set: bool, entries: list[dict]) -> dict:
    """Fusion idempotente : la clé (athlete, race, date) met à jour l'entrée existante."""
    rows = registre.setdefault("entries", [])
    index = {(r.get("athlete"), r.get("race"), r.get("date")): i for i, r in enumerate(rows)}
    for e in entries:
        row = {"athlete": athlete, "dev_set": bool(dev_set), **e}
        key = (athlete, e["race"], e["date"])
        if key in index:
            rows[index[key]] = row
        else:
            index[key] = len(rows)
            rows.append(row)
    return registre


def run_manifest(manifest_path: Path, cfg, registre: dict) -> list[dict]:
    base = manifest_path.resolve().parent
    man = json.loads(manifest_path.read_text(encoding="utf-8"))
    athlete = man["athlete"]
    archive = (base / man["archive"]).resolve()
    entries: list[dict] = []
    for r in man["races"]:
        print(f"  {athlete} · {r['name']} ({r['date']}) — coupure la veille…",
              file=sys.stderr, flush=True)
        entries.append(backtest_race(archive, r, cfg, base=base))
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
    for m in args.manifests:
        mp = Path(m)
        man = json.loads(mp.read_text(encoding="utf-8"))
        entries = run_manifest(mp, cfg, registre)
        all_rows += [(man["athlete"], e) for e in entries]

    print("\n| athlète    | course                       | CV | prédit  | réel    | err %  | bandes [50] [80] |")
    print("|------------|------------------------------|----|---------|---------|--------|------------------|")
    for athlete, e in all_rows:
        print(_fmt_row(athlete, e))

    if args.dry_run:
        print("\n(dry-run : registre non écrit)", file=sys.stderr)
        return 0
    reg_path.parent.mkdir(parents=True, exist_ok=True)
    reg_path.write_text(json.dumps(registre, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nRegistre mis à jour : {reg_path} ({len(registre['entries'])} entrée(s) au total)",
          file=sys.stderr)
    print("Analyse : PYTHONPATH=src python -m tools.registre", file=sys.stderr)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
