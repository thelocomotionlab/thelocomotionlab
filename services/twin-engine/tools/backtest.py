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

from twin_engine.calibration import stops_statistics
from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.ingest import iter_activities
from twin_engine.pacing.plan import fade_delta_from_splits
from twin_engine.pipeline import analyze_preview_from_twin
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
    cal = result.calibration
    actual_h = None if race_entry.get("dnf") else parse_time_h(race_entry.get("official_time"))
    # statistiques personnelles consignées QUEL QUE SOIT le modèle servi : tools/score_plan
    # rejoue la forme du plan (arrêts personnels, fade des moitiés) depuis le registre seul
    w = (np.asarray(cal.weights, dtype=float) if cal.weights is not None
         else np.ones(cal.n_genuine))
    st = stops_statistics(cal.genuine, w, cfg) if cal.n_genuine else None

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
            "slope_kappa": (None if result.course.slope_kappa is None
                            else [round(k, 4) for k in result.course.slope_kappa]),
        },
        "model": {
            "verdict": result.sufficiency.verdict,
            # POURQUOI le moteur refuse : sans ce champ, un 🔴 est un mur — on voit que la
            # vente est bloquée, jamais par quel critère. C'est la différence entre « le
            # garde-fou marche » et « le garde-fou refuse mes meilleurs cas ».
            "blocking": [c.name for c in result.sufficiency.criteria if c.level == "🔴"],
            "regime": result.calibration.regime,
            "link": result.calibration.link,
            "n_genuine": result.calibration.n_genuine,
            "n_eff": round(result.calibration.n_eff, 2),
            "sigma_kmh": round(result.calibration.sigma_kmh, 3),
            "n_activities_used": result.n_ingested,
            "n_excluded_until": result.n_excluded_until,
            "n_skipped_ingest": result.n_skipped,
            # Phase 2 : ce que l'athlète apporte au plan et aux arrêts (agrégats)
            "durability_pct": (None if result.twin.durability_pct is None
                               else round(result.twin.durability_pct, 1)),
            "fade_delta_splits": (None if (fs := fade_delta_from_splits(cal)) is None
                                  else round(fs, 4)),
            "stops_rate_personal": (None if st is None or st["origin"] != "ultras"
                                    else round(st["rate"], 4)),
            "stops_rate_sd_log": (None if st is None or st["origin"] != "ultras"
                                  else round(st["sd_log"], 4)),
            "stops_ref_hours": (None if st is None or st["ref_hours"] is None
                                else round(st["ref_hours"], 2)),
            "stops_model": cal.stops_model,
            "night_share_mean": (None if cal.night_share_mean is None
                                 else round(cal.night_share_mean, 4)),
            "night_coef": None if cal.night_coef is None else round(cal.night_coef, 4),
            # Phase 3 : les trois exposants mesurés (servis ou non) et ce qui a servi
            "alpha": None if result.twin.alpha is None else round(result.twin.alpha, 4),
            "alpha_eff": (None if result.twin.alpha_eff is None
                          else round(result.twin.alpha_eff, 4)),
            "alpha_eff_n": (result.twin.alpha_eff_detail or {}).get("n"),
            "alpha_tail": (None if result.twin.alpha_tail is None
                           else round(result.twin.alpha_tail, 4)),
            "alpha_tail_n": result.twin.alpha_tail_n,
            "duration_prior_origin": cal.duration_prior_origin,
            "envelope_tail_alpha": None if cal.tail_alpha is None else round(cal.tail_alpha, 4),
            "genuine_floor": cfg.calibration.genuine_floor,
            "level_n_anchored": cal.level_n_anchored,
            "level_shift_mean_pct": (None if cal.level_shift is None
                                     else round(cal.level_shift_mean_pct, 2)),
            # Phase 5 : coût de pente personnel mesuré (servi ou non) et ce qui a servi
            "slope_cost": cal.slope_cost,
            "slope_kappa_up": (None if result.twin.slope_kappa_up is None
                               else round(result.twin.slope_kappa_up, 4)),
            "slope_kappa_down": (None if result.twin.slope_kappa_down is None
                                 else round(result.twin.slope_kappa_down, 4)),
            "slope_hours_up": (result.twin.slope_detail or {}).get("hours_up"),
            "slope_hours_down": (result.twin.slope_detail or {}).get("hours_down"),
        },
        "race_meta": None if race_meta is None else {
            "start_local": race_meta["start_local"].isoformat(),
            "lat": round(float(race_meta["lat"]), 2), "lon": round(float(race_meta["lon"]), 2),
            "tz": race_meta["tz"], "source": "activité du jour"},
        "prediction": None,
    }
    # cible SOUS le domaine de calibration (efforts ≥ genuine_min_hours) : la prédiction est
    # une extrapolation vers le bas — consignée et analysée À PART (tools/registre)
    ref_h = actual_h if actual_h is not None else (pred.finish_hours if pred else None)
    entry["below_domain"] = (None if ref_h is None
                             else bool(ref_h < cfg.calibration.genuine_min_hours))
    # ce que la garde du domaine a LU (demande du parcours) — à confronter à l'oracle ci-dessus
    dom = result.sufficiency.domain
    entry["domain_demand"] = None if dom is None else dom.to_dict()
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
            # sd prédictif relatif et levier de la cible : ceux du moteur (predict.sd_rel_target,
            # predict.leverage_target), une seule définition — en lien log, sd de ln T
            "sd_rel": None if pred.sd_rel is None else round(pred.sd_rel, 4),
            "leverage": None if pred.leverage is None else round(pred.leverage, 3),
            "moving_h": None if pred.moving_hours is None else round(pred.moving_hours, 3),
            "stops_h": None if pred.stops_hours is None else round(pred.stops_hours, 3),
            "night_share_target": (None if pred.night_share_target is None
                                   else round(pred.night_share_target, 4)),
            "night_dev": None if pred.night_dev is None else round(pred.night_dev, 4),
            "env_factor": None if pred.env_factor is None else round(pred.env_factor, 4),
            # err_pct > 0 : le moteur a prédit TROP LENT (central au-dessus du réel)
            "err_pct": err_pct,
            "in_plan": (None if actual_h is None or pred.plan_low_h is None
                        else bool(pred.plan_low_h <= actual_h <= pred.plan_high_h)),
            "in_safety": (None if actual_h is None
                          else bool(pred.interval_low_h <= actual_h <= pred.interval_high_h)),
        }
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
