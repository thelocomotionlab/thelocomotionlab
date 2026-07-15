"""Analyse du registre de couverture — la SEULE instance qui tranche la calibration.

Lit le registre JSON alimenté par ``tools/backtest.py`` (+ les courses réelles au fil de
l'eau) et imprime, séparément pour les cas de développement (Nice, Montagnhard — le modèle
a été réglé dessus) et les cas FRAIS :

  * couverture empirique des deux bandes (fourchette de course 50 %, sécurité 80 %) ;
  * biais et erreur du central (moyenne signée, MAE, médiane |err|) ;
  * *interval score* de Winkler (Gneiting & Raftery 2007) : largeur + (2/α)·dépassement —
    récompense l'étroitesse, punit les sorties ; plus BAS = meilleur ;
  * quantiles des scores normalisés |err_rel|/sd_rel — la matière de la future fenêtre
    empirique groupée (``interval_source=pooled``), avec le garde-fou par athlète (les
    courses d'un même athlète ne sont pas indépendantes).

Règle pré-enregistrée (docs/twin-registre-couverture.md) : AUCUNE recalibration sous
8-10 cas frais ; décision au score, jamais sur un cas isolé.

Lancement :  PYTHONPATH=src python -m tools.registre [<chemin.json>] [--json]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

DEFAULT_REGISTRE = Path(__file__).resolve().parents[3] / "docs" / "twin-registre-couverture.json"


def winkler(lo: float, hi: float, y: float, alpha: float) -> float:
    """Interval score S_α : largeur + (2/α)·distance de sortie (0 si couvert)."""
    s = hi - lo
    if y < lo:
        s += (2.0 / alpha) * (lo - y)
    elif y > hi:
        s += (2.0 / alpha) * (y - hi)
    return s


def _finished(entries: list[dict]) -> list[dict]:
    return [e for e in entries
            if not e.get("dnf") and e.get("official_time_h") is not None
            and e.get("prediction") is not None]


def pooled_scores(entries: list[dict]) -> tuple[np.ndarray, dict[str, list[float]]]:
    """Scores normalisés |erreur relative| / sd_rel, groupés par athlète."""
    per_athlete: dict[str, list[float]] = {}
    for e in _finished(entries):
        p = e["prediction"]
        if p.get("err_pct") is None or not p.get("sd_rel"):
            continue
        score = abs(p["err_pct"]) / 100.0 / p["sd_rel"]
        per_athlete.setdefault(e["athlete"], []).append(score)
    flat = np.array([s for v in per_athlete.values() for s in v], dtype=float)
    return flat, per_athlete


def conformal_order_quantile(scores: np.ndarray, q: float) -> float | None:
    """Quantile conservateur ⌈(n+1)·q⌉-ième statistique d'ordre (conforme split standard)."""
    n = len(scores)
    if n == 0:
        return None
    k = min(int(np.ceil((n + 1) * q)), n)
    return float(np.sort(scores)[k - 1])


def summarize(entries: list[dict]) -> dict:
    fin = _finished(entries)
    out: dict = {"n_total": len(entries), "n_finished": len(fin),
                 "n_dnf": sum(1 for e in entries if e.get("dnf")),
                 "n_no_prediction": sum(1 for e in entries if e.get("prediction") is None)}
    if not fin:
        return out
    errs = np.array([e["prediction"]["err_pct"] for e in fin], dtype=float)
    out["bias_pct"] = round(float(errs.mean()), 2)          # >0 = prédit trop lent
    out["mae_pct"] = round(float(np.abs(errs).mean()), 2)
    out["median_abs_err_pct"] = round(float(np.median(np.abs(errs))), 2)

    # cibles SOUS le domaine de calibration (< genuine_min_hours) : extrapolation vers le
    # bas, comptée À PART — un raté sur un 50 km ne juge pas le cœur de métier ultra
    below = [e for e in fin if e.get("below_domain")]
    if below:
        eb = np.array([e["prediction"]["err_pct"] for e in below], dtype=float)
        ei = np.array([e["prediction"]["err_pct"] for e in fin if not e.get("below_domain")],
                      dtype=float)
        out["below_domain"] = {"n": len(below), "mae_pct": round(float(np.abs(eb).mean()), 2)}
        if len(ei):
            out["mae_in_domain_pct"] = round(float(np.abs(ei).mean()), 2)

    for band, alpha, lo_k, hi_k in (("plan", 0.5, "plan_low_h", "plan_high_h"),
                                    ("safety", 0.2, "safety_low_h", "safety_high_h")):
        rows = [e for e in fin if e["prediction"].get(lo_k) is not None]
        if not rows:
            continue
        inside = [e["prediction"][lo_k] <= e["official_time_h"] <= e["prediction"][hi_k]
                  for e in rows]
        scores = [winkler(e["prediction"][lo_k], e["prediction"][hi_k],
                          e["official_time_h"], alpha) for e in rows]
        widths = [e["prediction"][hi_k] - e["prediction"][lo_k] for e in rows]
        out[band] = {
            "n": len(rows),
            "coverage_pct": round(100.0 * sum(inside) / len(rows), 1),
            "mean_width_h": round(float(np.mean(widths)), 2),
            "mean_winkler_h": round(float(np.mean(scores)), 2),
        }

    flat, per_ath = pooled_scores(entries)
    if len(flat):
        out["pooled"] = {
            "n_scores": int(len(flat)),
            "n_athletes": len(per_ath),
            "q50": (lambda v: None if v is None else round(v, 3))(conformal_order_quantile(flat, 0.5)),
            "q80": (lambda v: None if v is None else round(v, 3))(conformal_order_quantile(flat, 0.8)),
            "median_by_athlete": {a: round(float(np.median(v)), 3) for a, v in per_ath.items()},
        }
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="registre", description=__doc__.split("\n")[0])
    ap.add_argument("registre", nargs="?", default=str(DEFAULT_REGISTRE))
    ap.add_argument("--json", action="store_true", help="sortie JSON brute")
    args = ap.parse_args(argv)

    path = Path(args.registre)
    if not path.exists():
        print(f"Registre introuvable : {path} (lance d'abord tools/backtest.py)", file=sys.stderr)
        return 2
    entries = json.loads(path.read_text(encoding="utf-8")).get("entries", [])
    groups = {
        "cas frais (décisionnels)": [e for e in entries if not e.get("dev_set")],
        "cas de développement (indicatifs — le modèle a été réglé dessus)":
            [e for e in entries if e.get("dev_set")],
    }
    if args.json:
        print(json.dumps({k: summarize(v) for k, v in groups.items()},
                         ensure_ascii=False, indent=2))
        return 0

    for label, group in groups.items():
        s = summarize(group)
        print(f"\n== {label} ==")
        print(f"  entrées : {s['n_total']} (finies {s['n_finished']}, dnf {s['n_dnf']}, "
              f"sans prédiction {s['n_no_prediction']})")
        if not s.get("n_finished"):
            continue
        print(f"  central : biais {s['bias_pct']:+.1f} % · MAE {s['mae_pct']:.1f} % · "
              f"médiane |err| {s['median_abs_err_pct']:.1f} %")
        if "below_domain" in s:
            bd = s["below_domain"]
            in_dom = (f" · MAE dans le domaine : {s['mae_in_domain_pct']:.1f} %"
                      if "mae_in_domain_pct" in s else "")
            print(f"  hors domaine (< seuil ultra) : n={bd['n']} · MAE {bd['mae_pct']:.1f} %{in_dom}")
        for band, nominal in (("plan", "50"), ("safety", "80")):
            if band in s:
                b = s[band]
                print(f"  bande {nominal:>2} % : couverture {b['coverage_pct']:.0f} % "
                      f"(n={b['n']}) · largeur moy. {b['mean_width_h']:.2f} h · "
                      f"Winkler {b['mean_winkler_h']:.2f} h")
        if "pooled" in s:
            p = s["pooled"]
            print(f"  scores groupés (fenêtre empirique) : n={p['n_scores']} sur "
                  f"{p['n_athletes']} athlète(s) · q50={p['q50']} · q80={p['q80']}")
            print(f"    médianes par athlète : {p['median_by_athlete']}")
    n_fresh_fin = summarize(groups["cas frais (décisionnels)"]).get("n_finished", 0)
    if n_fresh_fin < 8:
        print(f"\n⚠ {n_fresh_fin} cas frais finis < 8 : la règle pré-enregistrée INTERDIT toute "
              "recalibration à ce stade (collecter, ne pas conclure).")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
