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
from collections import Counter
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
            if not e.get("dnf") and not e.get("quarantine")
            and e.get("official_time_h") is not None
            and e.get("prediction") is not None]


def _verdict(e: dict) -> str | None:
    return (e.get("model") or {}).get("verdict")


def _sd_rel_of(e: dict) -> float | None:
    """sd prédictif relatif de l'entrée : celui stocké (régression, β-covariance), sinon
    REPLI σ/v reconstruit depuis les agrégats consignés (blend/vc_e n'ont pas de β-cov —
    sans ce repli, la fenêtre groupée ne mangerait que les athlètes riches en données)."""
    p = e.get("prediction") or {}
    if p.get("sd_rel"):
        return float(p["sd_rel"])
    sigma = (e.get("model") or {}).get("sigma_kmh")
    deq = (e.get("course") or {}).get("deq_km")
    central = p.get("central_h")
    if not sigma or not deq or not central:
        return None
    v = deq / central
    return float(sigma / v) if v > 0 else None


def pooled_scores(entries: list[dict]) -> tuple[np.ndarray, dict[str, list[float]]]:
    """Scores normalisés |erreur relative| / sd_rel, groupés par athlète (repli σ/v inclus)."""
    per_athlete: dict[str, list[float]] = {}
    for e in _finished(entries):
        p = e["prediction"]
        sd = _sd_rel_of(e)
        if p.get("err_pct") is None or not sd:
            continue
        score = abs(p["err_pct"]) / 100.0 / sd
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
                 "n_quarantine": sum(1 for e in entries if e.get("quarantine")),
                 "n_no_prediction": sum(1 for e in entries if e.get("prediction") is None)}
    if not fin:
        return out

    # LA statistique commerciale : parmi les cas finis, qu'aurait donné ce qui aurait été
    # VENDU (verdict 🟢/🟠) vs ce que le garde-fou a refusé (🔴) ? Un raté refusé ne coûte
    # pas un client — il valide le garde-fou.
    for key, keep in (("vendable", ("🟢", "🟠")), ("refuse", ("🔴",))):
        rows = [e for e in fin if _verdict(e) in keep]
        if not rows:
            continue
        errs_k = np.array([e["prediction"]["err_pct"] for e in rows], dtype=float)
        in80 = [e["prediction"].get("in_safety") for e in rows
                if e["prediction"].get("in_safety") is not None]
        out[key] = {
            "n": len(rows),
            "mae_pct": round(float(np.abs(errs_k).mean()), 2),
            "coverage80_pct": (round(100.0 * sum(in80) / len(in80), 1) if in80 else None),
        }
    # POURQUOI on refuse : le décompte des critères bloquants sur les cas REFUSÉS, trié.
    # Un garde-fou qui refuse des cas où le central est juste est un faux négatif coûteux
    # (client perdu sans raison) — invisible tant qu'on ne compte pas les motifs.
    blocking: Counter = Counter()
    for e in fin:
        if _verdict(e) == "🔴":
            blocking.update((e.get("model") or {}).get("blocking") or ["(motif non consigné)"])
    if blocking:
        out["blocking"] = blocking.most_common()
        # le cas qui doit alerter : refusé ALORS QUE le central était bon
        rates = [e for e in fin if _verdict(e) == "🔴"
                 and abs(e["prediction"]["err_pct"]) <= 15.0]
        out["refuses_pourtant_justes"] = len(rates)

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
        # le pool qui compte pour la CALIBRATION des bandes vendues : conditions VENDABLES
        # uniquement (🟢/🟠) — les catastrophes refusées par le garde-fou ne doivent pas
        # gonfler la fenêtre d'un produit qui ne les aurait jamais livrées
        vend = [e for e in entries if _verdict(e) in ("🟢", "🟠")]
        flat_v, per_v = pooled_scores(vend)
        if len(flat_v):
            out["pooled_vendable"] = {
                "n_scores": int(len(flat_v)),
                "n_athletes": len(per_v),
                "q50": (lambda v: None if v is None else round(v, 3))(conformal_order_quantile(flat_v, 0.5)),
                "q80": (lambda v: None if v is None else round(v, 3))(conformal_order_quantile(flat_v, 0.8)),
            }
    return out


def frontiere(entries: list[dict], *, alpha: float = 0.2, band: str = "safety",
              sellable_only: bool = True,
              grid=(0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 5.0)) -> list[dict]:
    """Frontière FINESSE / CALIBRATION : que donnerait la bande servie, élargie ou resserrée ?

    Une bande large est toujours « juste » et ne vaut rien : l'objectif est la finesse SOUS
    CONTRAINTE de calibration (Gneiting & Raftery 2007). Le juge est le score de Winkler
    — largeur + (2/α)·dépassement — qui punit les deux travers d'un seul nombre.

    Pour chaque facteur ``k``, la bande est dilatée AUTOUR DU CENTRAL (``central ± k·demi-
    largeur``, asymétrie préservée) puis re-scorée sur les cas réellement courus. On lit
    d'un coup : le ``k`` qui atteint la couverture nominale, et le ``k`` qui minimise
    Winkler. S'ils diffèrent, c'est le second qui a raison — il intègre le coût de la
    largeur, pas seulement celui des ratés.

    ⚠ Le ``k`` optimal se lit sur les cas FRAIS et n'a de sens qu'à partir de 8-10 d'entre
    eux (règle pré-enregistrée). En dessous, c'est un thermomètre, pas une décision.
    """
    lo_key, hi_key = (("safety_low_h", "safety_high_h") if band == "safety"
                      else ("plan_low_h", "plan_high_h"))
    # Par défaut, seuls les cas VENDABLES (🟢/🟠) comptent : la question est « jusqu'où
    # puis-je resserrer ce que je VENDS ». Mêler les refus (🔴), dont les erreurs vont
    # jusqu'à +372 %, ferait croire qu'aucune largeur ne suffit — alors que le garde-fou
    # les a précisément écartés du produit.
    rows = [e for e in _finished(entries)
            if e["prediction"].get(lo_key) is not None
            and e["prediction"].get(hi_key) is not None
            and (not sellable_only or _verdict(e) in ("🟢", "🟠"))]
    out: list[dict] = []
    if not rows:
        return out
    for k in grid:
        widths, scores, covered = [], [], 0
        for e in rows:
            p, y = e["prediction"], e["official_time_h"]
            c = p["central_h"]
            lo = c - k * (c - p[lo_key])
            hi = c + k * (p[hi_key] - c)
            widths.append((hi - lo) / c)
            scores.append(winkler(lo, hi, y, alpha) / c)   # normalisé : cas de durées inégales
            covered += int(lo <= y <= hi)
        out.append({
            "k": k, "n": len(rows),
            "coverage_pct": 100.0 * covered / len(rows),
            "width_rel_pct": 100.0 * float(np.mean(widths)),
            "winkler_rel": float(np.mean(scores)),
        })
    return out


SOLD = ("🟢", "🟠")
REFUSED = ("🔴",)
_BANDS = (("plan", "plan_low_h", "plan_high_h", 0.5), ("safety", "safety_low_h", "safety_high_h", 0.2))


def _band_metrics(rows: list[dict], lo_k: str, hi_k: str, alpha: float) -> dict:
    """Couverture, Winkler RELATIF moyen (÷ temps réel : comparable entre courses de durées
    inégales) et largeur relative MÉDIANE (÷ central) d'une bande, sur des cas finis."""
    xs = [e for e in rows
          if e["prediction"].get(lo_k) is not None and e["prediction"].get(hi_k) is not None]
    if not xs:
        return {"coverage_pct": None, "winkler_rel": None, "width_rel_med_pct": None}
    inside, wk, widths = [], [], []
    for e in xs:
        p, y = e["prediction"], e["official_time_h"]
        inside.append(p[lo_k] <= y <= p[hi_k])
        wk.append(winkler(p[lo_k], p[hi_k], y, alpha) / y)
        widths.append(100.0 * (p[hi_k] - p[lo_k]) / p["central_h"])
    return {"coverage_pct": 100.0 * sum(inside) / len(xs),
            "winkler_rel": float(np.mean(wk)),
            "width_rel_med_pct": float(np.median(widths))}


def athlete_rows(entries: list[dict], *, verdicts: tuple[str, ...] = SOLD) -> list[dict]:
    """Une ligne par athlète + une ligne TOTAL, sur les cas finis au verdict demandé
    (vendus 🟢/🟠 par défaut) : n, MAE et biais du central, puis par bande couverture,
    Winkler relatif moyen et largeur relative médiane. Refusés : motifs bloquants en plus."""
    fin = [e for e in _finished(entries)
           if _verdict(e) in verdicts and e["prediction"].get("err_pct") is not None]
    athletes = sorted({e["athlete"] for e in fin})
    rows: list[dict] = []
    for a in athletes + ["TOTAL"]:
        sub = fin if a == "TOTAL" else [e for e in fin if e["athlete"] == a]
        if not sub:
            continue
        errs = np.array([e["prediction"]["err_pct"] for e in sub], dtype=float)
        row = {"athlete": a, "n": len(sub),
               "mae_pct": float(np.abs(errs).mean()), "bias_pct": float(errs.mean())}
        for band, lo_k, hi_k, alpha in _BANDS:
            for k, v in _band_metrics(sub, lo_k, hi_k, alpha).items():
                row[f"{band}_{k}"] = v
        if verdicts == REFUSED:
            c: Counter = Counter()
            for e in sub:
                c.update((e.get("model") or {}).get("blocking") or ["(motif non consigné)"])
            row["blocking"] = c.most_common()
        rows.append(row)
    return rows


def _f(v, nd=1, suffix="") -> str:
    return "—" if v is None else f"{v:.{nd}f}{suffix}"


def _md_sold(rows: list[dict]) -> str:
    head = ("| athlète | n | MAE % | biais % | couv 50 | couv 80 | Winkler rel 50 | "
            "Winkler rel 80 | largeur rel méd 50 | largeur rel méd 80 |\n"
            "|---|---|---|---|---|---|---|---|---|---|")
    lines = [head]
    for r in rows:
        lines.append(
            f"| {r['athlete']} | {r['n']} | {_f(r['mae_pct'])} | {_f(r['bias_pct'], 1, '')} "
            f"| {_f(r['plan_coverage_pct'], 0, ' %')} | {_f(r['safety_coverage_pct'], 0, ' %')} "
            f"| {_f(r['plan_winkler_rel'], 3)} | {_f(r['safety_winkler_rel'], 3)} "
            f"| {_f(r['plan_width_rel_med_pct'], 1, ' %')} | {_f(r['safety_width_rel_med_pct'], 1, ' %')} |")
    return "\n".join(lines)


def _md_refused(rows: list[dict]) -> str:
    lines = ["| athlète | n | MAE % | biais % | couv 80 | motifs bloquants |", "|---|---|---|---|---|---|"]
    for r in rows:
        motifs = " · ".join(f"{m} ×{n}" for m, n in r.get("blocking", []))
        lines.append(f"| {r['athlete']} | {r['n']} | {_f(r['mae_pct'])} | {_f(r['bias_pct'])} "
                     f"| {_f(r['safety_coverage_pct'], 0, ' %')} | {motifs} |")
    return "\n".join(lines)


def _groups(entries: list[dict]) -> list[tuple[str, list[dict]]]:
    return [("cas frais (décisionnels)", [e for e in entries if not e.get("dev_set")]),
            ("cas de développement (indicatifs)", [e for e in entries if e.get("dev_set")]),
            ("tous les cas", list(entries))]


def tableau_markdown(entries: list[dict]) -> str:
    """Le tableau de référence (DIAGNOSTIC §10.0) : par groupe, VENDUS puis REFUSÉS, par
    athlète et total. Winkler et largeurs en relatif ; « — » = bande absente (repli sans
    prédiction) ou aucun cas."""
    out = [f"Registre : {len(entries)} entrées, {len(_finished(entries))} finies scorables "
           f"(quarantaines exclues)."]
    for label, group in _groups(entries):
        sold = athlete_rows(group, verdicts=SOLD)
        refused = athlete_rows(group, verdicts=REFUSED)
        out.append(f"\n**{label} — VENDUS (🟢/🟠)**\n")
        out.append(_md_sold(sold) if sold else "(aucun cas vendu)")
        out.append(f"\n**{label} — REFUSÉS (🔴)**\n")
        out.append(_md_refused(refused) if refused else "(aucun refus)")
    return "\n".join(out)


def _key(e: dict) -> tuple:
    return (e.get("athlete"), e.get("race"), e.get("date"))


def _delta_cell(b, a, nd=1, suffix="") -> str:
    if b is None and a is None:
        return "—"
    if b is None or a is None:
        return f"{_f(b, nd, suffix)} → {_f(a, nd, suffix)}"
    return f"{b:.{nd}f} → {a:.{nd}f} ({a - b:+.{nd}f})"


def compare_markdown(before: list[dict], after: list[dict]) -> str:
    """AVANT → APRÈS : par groupe et par athlète sur les cas VENDUS (n, MAE, biais,
    couvertures, Winkler, largeurs), puis les changements de verdict (vendu ↔ refusé,
    prédiction apparue/disparue) et l'erreur du central entrée par entrée. C'est la pièce
    à coller dans DIAGNOSTIC pour toute règle d'adoption (MAE vendue, Winkler, largeur)."""
    out: list[str] = []
    for (label, gb), (_, ga) in zip(_groups(before), _groups(after)):
        rb = {r["athlete"]: r for r in athlete_rows(gb)}
        ra = {r["athlete"]: r for r in athlete_rows(ga)}
        names = [a for a in sorted(set(rb) | set(ra)) if a != "TOTAL"] + ["TOTAL"]
        out.append(f"\n**{label} — VENDUS, avant → après (Δ)**\n")
        out.append("| athlète | n | MAE % | biais % | couv 50 | couv 80 | Winkler rel 50 | "
                   "Winkler rel 80 | largeur rel méd 50 | largeur rel méd 80 |")
        out.append("|---|---|---|---|---|---|---|---|---|---|")
        for a in names:
            b, r = rb.get(a, {}), ra.get(a, {})
            if not b and not r:
                continue
            out.append(
                f"| {a} | {_delta_cell(b.get('n'), r.get('n'), 0)} "
                f"| {_delta_cell(b.get('mae_pct'), r.get('mae_pct'))} "
                f"| {_delta_cell(b.get('bias_pct'), r.get('bias_pct'))} "
                f"| {_delta_cell(b.get('plan_coverage_pct'), r.get('plan_coverage_pct'), 0)} "
                f"| {_delta_cell(b.get('safety_coverage_pct'), r.get('safety_coverage_pct'), 0)} "
                f"| {_delta_cell(b.get('plan_winkler_rel'), r.get('plan_winkler_rel'), 3)} "
                f"| {_delta_cell(b.get('safety_winkler_rel'), r.get('safety_winkler_rel'), 3)} "
                f"| {_delta_cell(b.get('plan_width_rel_med_pct'), r.get('plan_width_rel_med_pct'))} "
                f"| {_delta_cell(b.get('safety_width_rel_med_pct'), r.get('safety_width_rel_med_pct'))} |")

    kb = {_key(e): e for e in before}
    ka = {_key(e): e for e in after}
    flips: list[str] = []
    out.append("\n**Entrées, avant → après** (verdict, erreur du central, dans la bande 50 / 80)\n")
    out.append("| athlète | course | date | verdict | err % | 50 | 80 |")
    out.append("|---|---|---|---|---|---|---|")

    def _flag(v):
        return "—" if v is None else ("✓" if v else "✗")

    for k in sorted(set(kb) | set(ka), key=lambda x: (str(x[0]), str(x[2]))):
        b, a = kb.get(k), ka.get(k)
        pb, pa = (b or {}).get("prediction") or {}, (a or {}).get("prediction") or {}
        vb, va = (_verdict(b) if b else None), (_verdict(a) if a else None)
        eb, ea = pb.get("err_pct"), pa.get("err_pct")
        out.append(f"| {k[0]} | {k[1]} | {k[2]} | {vb or 'absent'} → {va or 'absent'} "
                   f"| {_delta_cell(eb, ea)} | {_flag(pb.get('in_plan'))} → {_flag(pa.get('in_plan'))} "
                   f"| {_flag(pb.get('in_safety'))} → {_flag(pa.get('in_safety'))} |")
        sold_b, sold_a = vb in SOLD, va in SOLD
        if b is None or a is None:
            flips.append(f"{k[0]} · {k[1]} ({k[2]}) : {'apparue' if b is None else 'disparue'}")
        elif sold_b != sold_a:
            flips.append(f"{k[0]} · {k[1]} ({k[2]}) : {vb} → {va}"
                         f"{' (devient VENDABLE)' if sold_a else ' (devient REFUSÉE)'}")
        elif (pb.get("central_h") is None) != (pa.get("central_h") is None):
            flips.append(f"{k[0]} · {k[1]} ({k[2]}) : prédiction "
                         f"{'apparue' if pa.get('central_h') is not None else 'disparue'}")
    out.append("\n**Changements de verdict** : " + ("; ".join(flips) if flips else "aucun."))
    return "\n".join(out)


def _print_frontiere(label: str, entries: list[dict], *, alpha: float, band: str,
                     nominal_pct: float, sellable_only: bool = True) -> None:
    rows = frontiere(entries, alpha=alpha, band=band, sellable_only=sellable_only)
    if not rows:
        print(f"\n== frontière finesse/calibration — {label} : aucun cas exploitable ==")
        return
    best = min(rows, key=lambda r: r["winkler_rel"])
    # plus petit k atteignant la couverture nominale (None si aucun de la grille n'y arrive)
    atteint = next((r for r in rows if r["coverage_pct"] >= nominal_pct), None)
    perim = "VENDUS seulement" if sellable_only else "tous cas finis"
    print(f"\n== frontière finesse/calibration — {label} "
          f"(bande {band}, nominal {nominal_pct:.0f} %, {perim}, n={rows[0]['n']}) ==")
    print("  facteur | couverture | largeur moy. | Winkler (plus BAS = mieux)")
    for r in rows:
        marques = []
        if r is best:
            marques.append("← meilleur score")
        if atteint is not None and r is atteint:
            marques.append("← 1er à couvrir")
        if abs(r["k"] - 1.0) < 1e-9:
            marques.append("← servi aujourd'hui")
        print(f"  ×{r['k']:5.2f} | {r['coverage_pct']:8.0f} % | {r['width_rel_pct']:10.1f} % | "
              f"{r['winkler_rel']:8.3f}  {' '.join(marques)}")
    if atteint is None:
        print(f"  ⚠ aucun facteur de la grille n'atteint {nominal_pct:.0f} % de couverture : "
              "le problème n'est pas la largeur mais l'ERREUR DU CENTRAL — élargir ne suffira "
              "pas, il faut réduire le biais (cf. tools/ab_recency).")
    elif best["k"] < 1.0:
        print(f"  → marge de resserrement : ×{best['k']:.2f} minimise le score tout en "
              f"couvrant {best['coverage_pct']:.0f} %.")
    else:
        print(f"  → pas de marge de resserrement : l'optimum est à ×{best['k']:.2f} "
              "(les bandes servies sont trop étroites pour ce qu'elles promettent).")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="registre", description=__doc__.split("\n")[0])
    ap.add_argument("registre", nargs="?", default=str(DEFAULT_REGISTRE))
    ap.add_argument("--json", action="store_true", help="sortie JSON brute")
    ap.add_argument("--frontiere", action="store_true",
                    help="trace la frontière finesse/calibration : couverture et score de "
                         "Winkler pour une grille de facteurs d'échelle sur les bandes "
                         "servies — dit de COMBIEN on peut resserrer sans mentir")
    ap.add_argument("--tableau", action="store_true",
                    help="tableau de référence en markdown (DIAGNOSTIC §10.0) : par groupe, "
                         "vendus/refusés, par athlète et total — MAE, biais, couvertures, "
                         "Winkler relatif, largeur relative médiane")
    ap.add_argument("--compare", metavar="AVANT.json",
                    help="avant → après : compare le registre AVANT à celui analysé "
                         "(deltas par athlète sur les cas vendus, changements de verdict, "
                         "erreur entrée par entrée)")
    ap.add_argument("--quarantine", nargs=4, metavar=("ATHLETE", "COURSE", "DATE", "MOTIF"),
                    help="met une entrée en quarantaine (exclue des stats, conservée et "
                         "visible avec son motif — jamais de suppression silencieuse)")
    args = ap.parse_args(argv)

    path = Path(args.registre)
    if not path.exists():
        print(f"Registre introuvable : {path} (lance d'abord tools/backtest.py)", file=sys.stderr)
        return 2
    data = json.loads(path.read_text(encoding="utf-8"))
    entries = data.get("entries", [])

    if args.quarantine:
        ath, race, date, motif = args.quarantine
        hits = [e for e in entries
                if e.get("athlete") == ath and e.get("race") == race and e.get("date") == date]
        if not hits:
            print(f"Entrée introuvable : {ath} / {race} / {date}", file=sys.stderr)
            return 2
        for e in hits:
            e["quarantine"] = motif
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"En quarantaine : {ath} / {race} / {date} — motif : {motif}", file=sys.stderr)
    if args.tableau:
        print(tableau_markdown(entries))
        return 0
    if args.compare:
        before_path = Path(args.compare)
        if not before_path.exists():
            print(f"Registre AVANT introuvable : {before_path}", file=sys.stderr)
            return 2
        before = json.loads(before_path.read_text(encoding="utf-8")).get("entries", [])
        print(compare_markdown(before, entries))
        return 0
    groups = {
        "cas frais (décisionnels)": [e for e in entries if not e.get("dev_set")],
        "cas de développement (indicatifs — le modèle a été réglé dessus)":
            [e for e in entries if e.get("dev_set")],
    }
    if args.json:
        payload = {k: summarize(v) for k, v in groups.items()}
        if args.frontiere:
            payload["frontiere"] = {
                k: {"safety": frontiere(v, alpha=0.2, band="safety"),
                    "plan": frontiere(v, alpha=0.5, band="plan"),
                    "safety_tous_cas": frontiere(v, alpha=0.2, band="safety",
                                                 sellable_only=False)}
                for k, v in groups.items()
            }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if args.frontiere:
        for label, group in groups.items():
            _print_frontiere(label, group, alpha=0.2, band="safety", nominal_pct=80.0)
            _print_frontiere(label, group, alpha=0.5, band="plan", nominal_pct=50.0)
        print("\nRappel : le facteur optimal ne se décide QUE sur les cas frais, et pas avant "
              "8-10 d'entre eux (docs/twin-registre-couverture.md).", file=sys.stderr)
        return 0

    for label, group in groups.items():
        s = summarize(group)
        print(f"\n== {label} ==")
        print(f"  entrées : {s['n_total']} (finies {s['n_finished']}, dnf {s['n_dnf']}, "
              f"quarantaine {s['n_quarantine']}, sans prédiction {s['n_no_prediction']})")
        if not s.get("n_finished"):
            continue
        print(f"  central : biais {s['bias_pct']:+.1f} % · MAE {s['mae_pct']:.1f} % · "
              f"médiane |err| {s['median_abs_err_pct']:.1f} %")
        for key, label in (("vendable", "VENDU (🟢/🟠)"), ("refuse", "refusé (🔴)")):
            if key in s:
                b = s[key]
                cov = "—" if b["coverage80_pct"] is None else f"{b['coverage80_pct']:.0f} %"
                print(f"  {label} : n={b['n']} · MAE {b['mae_pct']:.1f} % · couv80 {cov}")
        if "blocking" in s:
            motifs = " · ".join(f"{nom} ×{n}" for nom, n in s["blocking"])
            print(f"  motifs de REFUS : {motifs}")
            justes = s.get("refuses_pourtant_justes", 0)
            if justes:
                print(f"  ⚠ {justes} refus alors que le central tombait à ±15 % — "
                      "faux négatifs potentiels (client perdu sans raison) : vérifier le "
                      "critère bloquant avant de durcir quoi que ce soit.")
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
        if "pooled_vendable" in s:
            pv = s["pooled_vendable"]
            print(f"  scores groupés CONDITIONS VENDABLES (base de calibration des bandes) : "
                  f"n={pv['n_scores']} sur {pv['n_athletes']} athlète(s) · "
                  f"q50={pv['q50']} · q80={pv['q80']}")
    n_fresh_fin = summarize(groups["cas frais (décisionnels)"]).get("n_finished", 0)
    if n_fresh_fin < 8:
        print(f"\n⚠ {n_fresh_fin} cas frais finis < 8 : la règle pré-enregistrée INTERDIT toute "
              "recalibration à ce stade (collecter, ne pas conclure).")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
