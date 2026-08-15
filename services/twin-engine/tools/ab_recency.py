"""A/B de la DEMI-VIE DE RÉCENCE au banc — l'instrument du « biais de progression ».

Signal n° 3 du registre : sur un athlète en forte progression (Crasse, 2021 premiers
trails → 2026 16 h 04 sur la Montagnhard), le central prédit systématiquement TROP LENT
en régime riche (+16,7 / +8,4 / +5,1 / +13,8 %) alors qu'il était juste en 2023, quand sa
forme l'était. Mécanisme suspecté (docs/twin-registre-couverture.md) : ``recency_halflife_days``
= 365 j pondère encore à ~50 % des courses vieilles d'un an, si bien que les anciennes
ancrent le niveau passé.

Cet outil balaye plusieurs demi-vies sur les MÊMES courses et imprime, par variante,
l'erreur du central et la couverture des bandes — séparément pour les cas de développement
et les cas frais, et par athlète (les courses d'un même athlète ne sont pas indépendantes).

    PYTHONPATH=src python -m tools.ab_recency _seed/manifest-crasse.json [autres…] \\
        [--halflife 90 180 270 365 548 730] [--json]

**Coût** : UN décodage d'archive par athlète, quelle que soit la grille (cf. ``ArchiveCache``).
La demi-vie n'entre que dans la CALIBRATION, en aval du jumeau : les agrégats par activité
sont identiques d'une variante à l'autre. C'est précisément ce qui rend ce balayage possible
— avant le cache, chaque variante coûtait une nuit.

⚠ **Cet outil ne décide rien.** Règle pré-enregistrée (docs/twin-registre-couverture.md) :
aucune recalibration sous 8-10 cas frais, décision au score, jamais sur un athlète isolé.
Une demi-vie plus courte qui « corrige » Crasse en dégradant Lolo et Rapace n'est pas un
progrès — c'est un sur-ajustement à un cas de développement.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course

from tools.backtest import DEFAULT_REGISTRE, ArchiveCache, parse_time_h
from tools.registre import winkler

DEFAULT_GRID = (90.0, 180.0, 270.0, 365.0, 548.0, 730.0)


def _cfg_with_halflife(cfg, halflife_days: float):
    """Variante de config ne touchant QUE la calibration.

    Garde-fou du cache : les contributions par activité dépendent de ``twin``/``course`` —
    si un jour on balaye ces blocs-là, il faudra re-décoder. Ici, rien de tel.
    """
    return replace(cfg, calibration=replace(cfg.calibration,
                                            recency_halflife_days=float(halflife_days)))


def quarantined(registre_path: Path | None = None) -> set[tuple[str, str, str]]:
    """Clés (athlète, course, date) mises en quarantaine dans le registre.

    Le balayage part des MANIFESTES, qui ignorent tout de la curation : sans ce filtre il
    re-score des entrées écartées pour données d'ENTRÉE fausses (ex. trace de parcours à
    l'altitude aplatie) et pollue les agrégats — exactement ce que la quarantaine existe
    pour empêcher.
    """
    path = registre_path or DEFAULT_REGISTRE
    if not Path(path).exists():
        return set()
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {(e.get("athlete"), e.get("race"), e.get("date"))
            for e in data.get("entries", []) if e.get("quarantine")}


def evaluate(manifests: list[Path], grid: tuple[float, ...], cfg,
             exclude: set[tuple[str, str, str]] | None = None) -> list[dict]:
    """Rejoue chaque course sous chaque demi-vie → une ligne par (athlète, course, variante)."""
    exclude = exclude if exclude is not None else set()
    rows: list[dict] = []
    ignores: list[str] = []
    for mp in manifests:
        base = mp.resolve().parent
        man = json.loads(mp.read_text(encoding="utf-8"))
        athlete, dev_set = man["athlete"], bool(man.get("dev_set", False))
        print(f"  {athlete} : décodage de l'archive (une seule fois pour "
              f"{len(grid)} variantes × {len(man['races'])} courses)…", file=sys.stderr)
        cache = ArchiveCache((base / man["archive"]).resolve(), cfg)

        for r in man["races"]:
            race_date = date.fromisoformat(r["date"])
            until = (date.fromisoformat(r["until"]) if r.get("until")
                     else race_date - timedelta(days=1))
            race = (RaceSpec.from_json((base / r["race_json"]).resolve())
                    if r.get("race_json") else RaceSpec(name=r["name"]))
            course = build_course((base / r["gpx"]).resolve().read_bytes(), race, cfg)
            if (athlete, r["name"], r["date"]) in exclude:
                ignores.append(f"{athlete} · {r['name']} ({r['date']})")
                continue  # en quarantaine au registre : données d'entrée fausses
            actual = None if r.get("dnf") else parse_time_h(r.get("official_time"))
            if actual is None:
                continue  # abandon / temps manquant : rien à scorer
            for hl in grid:
                # le jumeau est reconstruit par variante, mais SANS re-décodage
                res_hl = _preview_with(cache, course, until, hl)
                pred = res_hl.prediction
                rows.append({
                    "athlete": athlete, "dev_set": dev_set, "race": r["name"],
                    "halflife": hl,
                    "verdict": res_hl.sufficiency.verdict,
                    "sellable": bool(res_hl.sufficiency.sellable),
                    "regime": res_hl.calibration.regime,
                    "n_eff": round(res_hl.calibration.n_eff, 2),
                    "actual_h": actual,
                    "central_h": None if pred is None else pred.finish_hours,
                    "err_pct": (None if pred is None
                                else 100.0 * (pred.finish_hours - actual) / actual),
                    "in_plan": (None if pred is None or pred.plan_low_h is None
                                else bool(pred.plan_low_h <= actual <= pred.plan_high_h)),
                    "in_safety": (None if pred is None
                                  else bool(pred.interval_low_h <= actual
                                            <= pred.interval_high_h)),
                    # score de Winkler NORMALISÉ par le réel : arbitre unique
                    # finesse/calibration, comparable entre courses de durées inégales
                    "winkler_rel": (None if pred is None else
                                    winkler(pred.interval_low_h, pred.interval_high_h,
                                            actual, 0.2) / actual),
                })
    if ignores:
        print(f"  {len(ignores)} entrée(s) en quarantaine ignorée(s) : "
              + ", ".join(ignores), file=sys.stderr)
    return rows


def _preview_with(cache: ArchiveCache, course, until: date, halflife: float):
    """Preview sous une demi-vie donnée, en réutilisant les contributions déjà décodées."""
    base_cfg = cache.cfg
    try:
        cache.cfg = _cfg_with_halflife(base_cfg, halflife)
        return cache.preview_at(course, until)
    finally:
        cache.cfg = base_cfg


def _stats(rows: list[dict]) -> dict:
    scored = [r for r in rows if r["err_pct"] is not None]
    sold = [r for r in scored if r["sellable"]]
    if not scored:
        return {"n": 0}

    def _cov(rs, key):
        vals = [r[key] for r in rs if r[key] is not None]
        return None if not vals else 100.0 * sum(vals) / len(vals)

    errs = np.array([r["err_pct"] for r in scored], float)
    sold_errs = np.array([r["err_pct"] for r in sold], float) if sold else np.zeros(0)
    wk = [r["winkler_rel"] for r in sold if r["winkler_rel"] is not None]
    return {
        "n": len(scored),
        "biais": float(errs.mean()),
        "mae": float(np.abs(errs).mean()),
        "med": float(np.median(np.abs(errs))),
        "n_sold": len(sold),
        "mae_sold": None if not sold else float(np.abs(sold_errs).mean()),
        "cov50": _cov(scored, "in_plan"),
        "cov80": _cov(scored, "in_safety"),
        # LE COÛT CACHÉ d'une demi-vie courte : elle réduit le nombre EFFECTIF d'ultras
        # (N_eff de Kish). Sous calibration.min_ultras_regression, le moteur quitte le régime
        # régression pour le repli « peu d'ultras » — moins biaisé, mais beaucoup plus flou,
        # voire refusé. Un gain de biais payé en régimes dégradés n'est pas un gain.
        "n_eff": float(np.mean([r["n_eff"] for r in scored])),
        "n_regression": sum(1 for r in scored if r["regime"] == "regression"),
        "winkler": None if not wk else float(np.mean(wk)),
    }



def report(rows: list[dict], grid: tuple[float, ...]) -> None:
    header = ("| demi-vie |  n | biais % |  MAE % | vendus | MAE vendus | couv80 | "
              "N_eff | régr. | Winkler |")
    sep = "|" + "-" * (len(header) - 2) + "|"
    for label, subset in (("cas FRAIS (décisionnels)", [r for r in rows if not r["dev_set"]]),
                          ("cas de DÉVELOPPEMENT (indicatifs)", [r for r in rows if r["dev_set"]])):
        if not subset:
            continue
        print(f"\n== {label} ==")
        print(header)
        print(sep)
        for hl in grid:
            s = _stats([r for r in subset if r["halflife"] == hl])
            if not s["n"]:
                continue
            mae_sold = "     —" if s["mae_sold"] is None else f"{s['mae_sold']:6.1f}"
            cov80 = "     —" if s["cov80"] is None else f"{s['cov80']:6.0f}"
            wk = "      —" if s["winkler"] is None else f"{s['winkler']:7.3f}"
            marque = " ←défaut" if hl == 365.0 else ""
            print(f"| {hl:8.0f} | {s['n']:2d} | {s['biais']:+7.1f} | {s['mae']:6.1f} | "
                  f"{s['n_sold']:6d} | {mae_sold} | {cov80} | {s['n_eff']:5.1f} | "
                  f"{s['n_regression']:5d} | {wk} |{marque}")

        # par athlète : un gain global qui vient d'un seul athlète n'est pas un gain
        athletes = sorted({r["athlete"] for r in subset})
        if len(athletes) > 1:
            print("\n  MAE par athlète (un progrès global porté par un seul cas n'en est pas un) :")
            print("    demi-vie | " + " | ".join(f"{a:>10}" for a in athletes))
            for hl in grid:
                cells = []
                for a in athletes:
                    s = _stats([r for r in subset if r["halflife"] == hl and r["athlete"] == a])
                    cells.append("         —" if not s["n"] else f"{s['mae']:10.1f}")
                print(f"    {hl:8.0f} | " + " | ".join(cells))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="ab_recency", description=__doc__.split("\n")[0])
    ap.add_argument("manifests", nargs="+", help="manifeste(s) de backtest, un par athlète")
    ap.add_argument("--halflife", type=float, nargs="+", default=list(DEFAULT_GRID),
                    metavar="JOURS", help=f"grille de demi-vies (défaut : {list(DEFAULT_GRID)})")
    ap.add_argument("--json", action="store_true", help="lignes brutes en JSON sur stdout")
    args = ap.parse_args(argv)

    cfg = load_config()
    grid = tuple(args.halflife)
    rows = evaluate([Path(m) for m in args.manifests], grid, cfg, exclude=quarantined())
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    report(rows, grid)
    print("\nComment lire : le BIAIS doit tendre vers 0 et le WINKLER baisser (il arbitre "
          "finesse et couverture d'un seul nombre). Surveille N_eff et la colonne « régr. » : "
          "une demi-vie courte réduit le nombre effectif d'ultras et peut faire quitter le "
          "régime régression — biais corrigé, mais prédiction plus floue. Un gain de biais "
          "payé en régimes dégradés n'est pas un gain.", file=sys.stderr)
    print("Pour appliquer une valeur retenue : calibration.recency_halflife_days dans "
          "twin.config.json, puis pytest + tools.ab_montagnhard + entrée DIAGNOSTIC "
          "(protocole CLAUDE.md).", file=sys.stderr)
    print("Rappel : aucune recalibration sous 8-10 cas frais, décision au score, jamais sur "
          "un athlète isolé (docs/twin-registre-couverture.md).", file=sys.stderr)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
