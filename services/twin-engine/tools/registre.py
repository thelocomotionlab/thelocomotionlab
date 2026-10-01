"""Analyse du registre de couverture — la SEULE instance qui tranche la calibration.

Lit le registre committé (``docs/twin-registre/`` : le livre banc, un fichier par run ; le
livre servi ; les statuts des athlètes) et imprime, toujours séparément par LIVRE (banc
rétrospectif, servi prospectif), par STATUT de l'athlète (frais : décisionnel ; dev : le
modèle a été réglé sur ses données) et par NIVEAU (calibré 🟢/🟠, vendu ; de base 🔴, refusé) :

  * couverture empirique des deux bandes (fourchette de course 50 %, sécurité 80 %) ;
  * biais et erreur du central (moyenne signée, MAE, médiane |err|) ;
  * *interval score* de Winkler (Gneiting & Raftery 2007) : largeur + (2/α)·dépassement —
    récompense l'étroitesse, punit les sorties ; plus BAS = meilleur ;
  * quantiles des scores normalisés |err_rel|/sd_rel — la matière de la future fenêtre
    empirique groupée (``interval_source=pooled``), avec le garde-fou par athlète (les
    courses d'un même athlète ne sont pas indépendantes).
  * la forme du plan contre les passages réels (bloc ``forme`` : plan réparti sur le
    mouvement réel, plan servi, arrêts) ;
  * à part, hors de tous les agrégats, les courses mises à part (``a_part.json``,
    ``--a-part``), chacune sur sa ligne.

Règle pré-enregistrée (docs/twin-registre-couverture.md) : AUCUNE recalibration sous
8-10 cas frais ; décision au score, jamais sur un cas isolé ; une décision ne compte que les
athlètes frais à sa date, et les nomme (``--decision``).

Lancement :

    PYTHONPATH=src python -m tools.registre [--livre banc|servi|tous] [--run ID] [--json]
        [--tableau] [--frontiere] [--decision AAAA-MM-JJ] [--compare RUN_A [RUN_B]] [--runs]
    PYTHONPATH=src python -m tools.registre --marquer ATHLÈTE dev|frais "motif"
    PYTHONPATH=src python -m tools.registre --quarantine ATHLÈTE COURSE DATE "motif"
    PYTHONPATH=src python -m tools.registre --a-part ATHLÈTE COURSE DATE "motif"
    PYTHONPATH=src python -m tools.registre --servir dossier.json --athlete A --officiel 35:05:00
    PYTHONPATH=src python -m tools.registre --importer export-tableau-de-bord.json
    PYTHONPATH=src python -m tools.registre --migrer ancien-registre.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import numpy as np

from twin_engine.registre import (DEFAULT_RACINE, LIVRE_BANC, LIVRE_SERVI, STATUT_DEV,
                                  STATUT_FRAIS, Depot, frais_a_la_date, lire_entrees)


def winkler(lo: float, hi: float, y: float, alpha: float) -> float:
    """Interval score S_α : largeur + (2/α)·distance de sortie (0 si couvert)."""
    s = hi - lo
    if y < lo:
        s += (2.0 / alpha) * (lo - y)
    elif y > hi:
        s += (2.0 / alpha) * (y - hi)
    return s


def _finished(entries: list[dict]) -> list[dict]:
    """Les cas qui comptent : finis, prédits, ni en quarantaine ni mis à part."""
    return [e for e in entries
            if not e.get("dnf") and not e.get("quarantine") and not e.get("a_part")
            and e.get("official_time_h") is not None
            and e.get("prediction") is not None]


def forme_rows(entries: list[dict]) -> list[dict]:
    """La forme du plan jugée contre les passages réels (bloc ``forme``), par athlète et
    total, sur les cas qui comptent, vendus comme refusés : moyennes par course de l'erreur
    du plan sous mouvement réel imposé (moyenne, pire tronçon, pire cumul, en minutes, et
    l'erreur moyenne en % du temps moyen d'un tronçon), du plan servi (erreur moyenne des
    heures de passage, biais à mi-course), des arrêts (plan − réel, en heures) et de la
    marche en descente (prévue par le modèle à deux allures contre mesurée : minutes par
    course, erreur moyenne par tronçon)."""
    fin = [e for e in _finished(entries) if e.get("forme")]
    rows: list[dict] = []
    for a in sorted({e["athlete"] for e in fin}) + ["TOTAL"]:
        sub = fin if a == "TOTAL" else [e for e in fin if e["athlete"] == a]
        if not sub:
            continue
        imp = [e["forme"]["mouvement_impose"] for e in sub if e["forme"].get("mouvement_impose")]
        tot = [e["forme"]["total_predit"] for e in sub if e["forme"].get("total_predit")]
        arr = [e["forme"]["arrets"]["plan_h"] - e["forme"]["arrets"]["reel_h"] for e in sub
               if (e["forme"].get("arrets") or {}).get("reel_h") is not None]
        mar = [e["forme"]["marche_descente"] for e in sub if e["forme"].get("marche_descente")]

        def _m(vals):
            vals = [v for v in vals if v is not None]
            return float(np.mean(vals)) if vals else None

        rel = []
        for i in imp:
            reel = [t["reel_min"] for t in i.get("troncons", []) if t.get("reel_min")]
            if reel and i.get("erreur_moyenne_min") is not None:
                rel.append(100.0 * i["erreur_moyenne_min"] / float(np.mean(reel)))
        rows.append({"athlete": a, "n": len(sub), "n_impose": len(imp),
                     "impose_moy_min": _m([i.get("erreur_moyenne_min") for i in imp]),
                     "impose_moy_pct": _m(rel),
                     "impose_pire_min": _m([i.get("pire_troncon_min") for i in imp]),
                     "impose_cumul_min": _m([i.get("pire_cumul_min") for i in imp]),
                     "servi_moy_min": _m([t.get("erreur_moyenne_min") for t in tot]),
                     "servi_mi_course_min": _m([t.get("biais_mi_course_min") for t in tot]),
                     "arrets_ecart_h": _m(arr),
                     "n_marche": len(mar),
                     "marche_prevue_min": _m([m.get("prevue_min") for m in mar]),
                     "marche_reelle_min": _m([m.get("reelle_min") for m in mar]),
                     "marche_erreur_min": _m([m.get("erreur_moyenne_min") for m in mar])})
    return rows


def _md_forme(rows: list[dict]) -> str:
    lines = ["| athlète | n | imposé : erreur moy. min | imposé : % d'un tronçon | imposé : pire "
             "tronçon min | imposé : pire cumul min | servi : erreur moy. min | servi : biais "
             "mi-course min | arrêts plan − réel, h | marche en descente : prévue / réelle min "
             "(erreur moy. par tronçon) |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        marche = ("—" if not r.get("n_marche") else
                  f"{_f(r['marche_prevue_min'])} / {_f(r['marche_reelle_min'])} "
                  f"({_f(r['marche_erreur_min'])})")
        lines.append(f"| {r['athlete']} | {r['n']} | {_f(r['impose_moy_min'])} "
                     f"| {_f(r['impose_moy_pct'], 1, ' %')} | {_f(r['impose_pire_min'])} "
                     f"| {_f(r['impose_cumul_min'])} | {_f(r['servi_moy_min'])} "
                     f"| {_f(r['servi_mi_course_min'])} | {_f(r['arrets_ecart_h'], 2)} | {marche} |")
    return "\n".join(lines)


def _md_a_part(entries: list[dict]) -> str:
    """Les courses mises à part, une ligne chacune : ce qu'elles diraient, sans compter."""
    lines = ["| athlète | course | date | motif | verdict | err % | imposé : erreur moy. / pire "
             "cumul min | servi : erreur moy. min | arrêts plan / réel, h |",
             "|---|---|---|---|---|---|---|---|---|"]
    for e in sorted(entries, key=lambda x: (str(x.get("athlete")), str(x.get("date")))):
        f = e.get("forme") or {}
        imp, tot, arr = f.get("mouvement_impose") or {}, f.get("total_predit") or {}, f.get("arrets") or {}
        lines.append(f"| {e.get('athlete')} | {e.get('race')} | {e.get('date')} | {e.get('a_part')} "
                     f"| {_verdict(e) or '—'} | {_f((e.get('prediction') or {}).get('err_pct'))} "
                     f"| {_f(imp.get('erreur_moyenne_min'))} / {_f(imp.get('pire_cumul_min'))} "
                     f"| {_f(tot.get('erreur_moyenne_min'))} "
                     f"| {_f(arr.get('plan_h'), 2)} / {_f(arr.get('reel_h'), 2)} |")
    return "\n".join(lines)


def _verdict(e: dict) -> str | None:
    return (e.get("model") or {}).get("verdict")


def garde_domaine(entries: list[dict]) -> dict:
    """La garde du domaine jugée sur l'ORACLE (``below_domain`` : temps réel sous le seuil
    ultra) : un cas hors domaine VENDU est une fuite, un cas dans le domaine REFUSÉ pour ce
    seul motif est un client perdu sans raison. Les deux comptes doivent valoir 0 (Décision 2,
    DIAGNOSTIC §10.17) ; ``cas`` nomme les entrées fautives."""
    fin = _finished(entries)
    fuites = [e for e in fin if e.get("below_domain") and _verdict(e) in ("🟢", "🟠")]
    perdus = [e for e in fin if e.get("below_domain") is False
              and (e.get("model") or {}).get("blocking") == ["Domaine de calibration"]]
    return {
        "hors_domaine_vendus": len(fuites),
        "dans_domaine_refuses_seul_motif": len(perdus),
        "cas": ([f"{e.get('athlete', '?')} · {e.get('race', '?')} (vendu hors domaine)"
                 for e in fuites]
                + [f"{e.get('athlete', '?')} · {e.get('race', '?')} (refusé dans le domaine)"
                   for e in perdus]),
    }


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
                 "n_a_part": sum(1 for e in entries if e.get("a_part")),
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
    out["garde_domaine"] = garde_domaine(fin)

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


def statut(e: dict) -> str:
    """Le statut de l'athlète porté par l'entrée annotée ; à défaut, l'ancien ``dev_set``."""
    return e.get("statut") or (STATUT_DEV if e.get("dev_set") else STATUT_FRAIS)


def livre(e: dict) -> str:
    return e.get("livre") or LIVRE_BANC


def _groups(entries: list[dict]) -> list[tuple[str, list[dict]]]:
    """Livre × statut : par livre présent, les cas frais (décisionnels), les cas de
    développement (indicatifs), puis tous. Le niveau (calibré / de base) se sépare dans
    chaque groupe."""
    out: list[tuple[str, list[dict]]] = []
    for nom in sorted({livre(e) for e in entries}):
        sub = [e for e in entries if livre(e) == nom]
        out += [(f"livre {nom} · athlètes frais (décisionnels)",
                 [e for e in sub if statut(e) == STATUT_FRAIS]),
                (f"livre {nom} · athlètes de développement (indicatifs)",
                 [e for e in sub if statut(e) == STATUT_DEV]),
                (f"livre {nom} · tous les athlètes", sub)]
    return out


def tableau_markdown(entries: list[dict]) -> str:
    """Le tableau de référence (DIAGNOSTIC §10.0) : par groupe, VENDUS puis REFUSÉS, par
    athlète et total. Winkler et largeurs en relatif ; « — » = bande absente (repli sans
    prédiction) ou aucun cas."""
    out = [f"Registre : {len(entries)} entrées, {len(_finished(entries))} finies scorables "
           f"(quarantaines exclues)."]
    for label, group in _groups(entries):
        sold = athlete_rows(group, verdicts=SOLD)
        refused = athlete_rows(group, verdicts=REFUSED)
        out.append(f"\n**{label} — niveau calibré, VENDUS (🟢/🟠)**\n")
        out.append(_md_sold(sold) if sold else "(aucun cas vendu)")
        out.append(f"\n**{label} — niveau de base, REFUSÉS (🔴)**\n")
        out.append(_md_refused(refused) if refused else "(aucun refus)")
        out.append(f"\n**{label} — {_garde_line(garde_domaine(group))}")
        forme = forme_rows(group)
        if forme:
            out.append(f"\n**{label} — forme du plan contre les passages réels (vendus et "
                       "refusés)**\n")
            out.append(_md_forme(forme))
    a_part = [e for e in entries if e.get("a_part")]
    if a_part:
        out.append("\n**Rapportées à part (hors de tous les agrégats)**\n")
        out.append(_md_a_part(a_part))
    return "\n".join(out)


def _garde_line(g: dict) -> str:
    cas = f" — {', '.join(g['cas'])}" if g.get("cas") else ""
    return (f"garde du domaine (sur l'oracle) : hors domaine vendus {g['hors_domaine_vendus']} · "
            f"dans le domaine refusés pour ce seul motif {g['dans_domaine_refuses_seul_motif']}{cas}")


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
    groupes_b, groupes_a = dict(_groups(before)), dict(_groups(after))
    for label in [g for g, _ in _groups(before + after)]:
        gb, ga = groupes_b.get(label, []), groupes_a.get(label, [])
        if not gb and not ga:
            continue
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

        fb = {r["athlete"]: r for r in forme_rows(gb)}
        fa = {r["athlete"]: r for r in forme_rows(ga)}
        if fb or fa:
            out.append(f"\n**{label} — forme du plan, avant → après (Δ)**\n")
            out.append("| athlète | n | imposé : erreur moy. min | imposé : pire cumul min | "
                       "servi : erreur moy. min | servi : biais mi-course min | marche en descente : "
                       "erreur moy. par tronçon min |")
            out.append("|---|---|---|---|---|---|---|")
            for a in [x for x in sorted(set(fb) | set(fa)) if x != "TOTAL"] + ["TOTAL"]:
                b, r = fb.get(a, {}), fa.get(a, {})
                if not b and not r:
                    continue
                out.append(f"| {a} | {_delta_cell(b.get('n'), r.get('n'), 0)} "
                           f"| {_delta_cell(b.get('impose_moy_min'), r.get('impose_moy_min'))} "
                           f"| {_delta_cell(b.get('impose_cumul_min'), r.get('impose_cumul_min'))} "
                           f"| {_delta_cell(b.get('servi_moy_min'), r.get('servi_moy_min'))} "
                           f"| {_delta_cell(b.get('servi_mi_course_min'), r.get('servi_mi_course_min'))} "
                           f"| {_delta_cell(b.get('marche_erreur_min'), r.get('marche_erreur_min'))} |")

    a_part_b = [e for e in before if e.get("a_part")]
    a_part_a = [e for e in after if e.get("a_part")]
    if a_part_b or a_part_a:
        out.append("\n**Rapportées à part, avant**\n")
        out.append(_md_a_part(a_part_b) if a_part_b else "(aucune)")
        out.append("\n**Rapportées à part, après**\n")
        out.append(_md_a_part(a_part_a) if a_part_a else "(aucune)")

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


# --------------------------------------------------------------------------- #
# Lecture du registre committé
# --------------------------------------------------------------------------- #
def charger(depot: Depot, *, livre_: str = LIVRE_BANC, run: str | None = None,
            jour: str | None = None) -> tuple[list[dict], dict | None]:
    """Les entrées annotées (livre, statut au ``jour``, quarantaine, passages) d'un livre —
    pour le banc, celles du run demandé (identifiant, début d'identifiant ou chemin) ou du
    dernier run — et l'en-tête du run lu."""
    entrees: list[dict] = []
    entete = None
    if livre_ in (LIVRE_BANC, "tous"):
        ref = run or depot.dernier_run()
        if ref is not None:
            entete, brutes = lire_entrees(depot.chemin_du_run(ref))
            entrees += depot.annoter(brutes, LIVRE_BANC, jour=jour)
    if livre_ in (LIVRE_SERVI, "tous"):
        entrees += depot.annoter(depot.servi(), LIVRE_SERVI, jour=jour)
    return entrees, entete


def charger_source(depot: Depot, ref: str, *, jour: str | None = None) -> list[dict]:
    """Une source de comparaison : ``servi``, un run (identifiant ou chemin), ou un registre
    à l'ancien format (fichier unique, livre banc)."""
    if ref == LIVRE_SERVI:
        return depot.annoter(depot.servi(), LIVRE_SERVI, jour=jour)
    chemin = Path(ref) if Path(ref).exists() else depot.chemin_du_run(ref)
    _, brutes = lire_entrees(chemin)
    return depot.annoter(brutes, LIVRE_BANC, jour=jour)


def _aujourdhui() -> str:
    return date.today().isoformat()


def migrer(ancien: Path, depot: Depot, *, statuts: list[tuple[str, str, str, str]],
           le: str, commit: str | None) -> dict:
    """Range un registre à l'ancien format (un seul fichier) dans le registre committé :

    * ses passages vont dans ``passages.json``, ses quarantaines dans ``quarantaines.json`` ;
    * ses entrées deviennent un run historique du livre banc (étiqueté « registre-migre »,
      commit du fichier, sans empreinte : la configuration d'alors n'est pas reconstituable) ;
    * ``statuts`` (athlète, statut, date, motif) ouvre le journal de chaque athlète.

    Rend le décompte de ce qui a été rangé. Le fichier d'origine n'est pas touché."""
    _, entrees = lire_entrees(ancien)
    passages = [(e["athlete"], e["race"], e["date"], e["passages"]) for e in entrees
                if e.get("passages")]
    if passages:
        depot.ecrire_passages(passages)
    n_q = 0
    for e in entrees:
        if e.get("quarantine"):
            depot.mettre_en_quarantaine(e["athlete"], e["race"], e["date"], e["quarantine"], le)
            n_q += 1
    for athlete, st, quand, motif in statuts:
        depot.marquer(athlete, st, le=quand, par="Valentin", motif=motif)
    propres = [{k: v for k, v in e.items() if k not in ("passages", "quarantine", "dev_set")}
               for e in entrees]
    entete = {
        "id": f"{le[:10].replace('-', '')}-000000-registre-migre",
        "livre": LIVRE_BANC,
        "label": "registre-migre",
        "le": le,
        "commit": commit,
        "modifie": None,
        "config_empreinte": None,
        "drapeaux": None,
        "manifestes": sorted({e["athlete"] for e in entrees}),
        "source": str(ancien.name),
    }
    depot.ecrire_run(entete, propres)
    return {"entrees": len(entrees), "passages": len(passages), "quarantaines": n_q,
            "statuts": len(statuts)}


def entree_servie(dossier_path: Path, depot: Depot, cfg, *, athlete: str, course: str | None,
                  jour: str | None, officiel_h: float | None, dnf: bool = False,
                  profil: str | None = None) -> dict:
    """L'entrée du livre servi d'un plan, fabriquée depuis son dossier (``dossier.json`` de la
    version servie) : ce que le plan promettait, le résultat, le statut de l'athlète au jour
    de la course, la configuration qui l'a servi, et la forme du plan si ses passages sont au
    registre. La configuration est celle que garde la version (``version.json`` à côté du
    dossier) ; à défaut, celle du profil ``profil`` (défaut sinon)."""
    from twin_engine import dossier as _dossier
    from twin_engine.course import build_course
    from twin_engine.registre import (bloc_course, bloc_domaine, bloc_forme, bloc_modele,
                                      bloc_prediction, statut_a_la_date)
    from twin_engine.tableau_de_bord.generation import cfg_de_la_version, configuration_de_la_version
    from twin_engine.twin.pente import servir_parcours

    try:
        resume = json.loads((Path(dossier_path).parent / "version.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        resume = {}
    if resume.get("configuration"):
        configuration = {k: v for k, v in resume["configuration"].items() if k != "surcharges"}
        cfg = cfg_de_la_version(cfg, resume)
    else:
        cfg, configuration = configuration_de_la_version(cfg, profil or "defaut")
        configuration = {k: v for k, v in configuration.items() if k != "surcharges"}
    d = _dossier.lire(dossier_path)
    parcours = servir_parcours(build_course(d.course_gpx, d.race, cfg), d.twin, cfg)
    nom = course or d.race.name
    jour = jour or (d.race.start_time.date().isoformat() if d.race.start_time else None)
    if not jour:
        raise ValueError("date de course inconnue : passe --date")
    reel = None if dnf else officiel_h
    dates = sorted(x.date for x in d.twin.summaries if x.date)
    verdict = getattr(d.sufficiency, "verdict", None)
    entree = {
        "athlete": athlete,
        "statut": statut_a_la_date(depot.athletes().get(athlete), jour),
        "race": nom,
        "date": jour,
        "until": dates[-1] if dates else None,
        "dnf": bool(dnf),
        "official_time_h": None if reel is None else round(float(reel), 3),
        "course": bloc_course(parcours),
        "model": bloc_modele(twin=d.twin, calibration=d.calibration, sufficiency=d.sufficiency,
                             cfg=cfg, n_activities_used=len(d.twin.summaries)),
        "race_meta": None,
        "prediction": bloc_prediction(d.prediction, reel),
        "below_domain": bool((reel if reel is not None else d.prediction.finish_hours)
                             < cfg.calibration.genuine_min_hours),
        "domain_demand": bloc_domaine(d.sufficiency),
        "niveau": "calibre" if verdict in ("🟢", "🟠") else "base",
        "source": "dossier",
        "reference": d.report_ref,
        "configuration": configuration,
    }
    forme = bloc_forme(parcours, d.race, d.prediction, cfg,
                       depot.passages().get((athlete, nom, jour)),
                       terrain=getattr(d.twin, "terrain", None))
    if forme is not None:
        entree["forme"] = forme
    return entree


def importer(export: Path, depot: Depot) -> dict:
    """Fusionne un export du tableau de bord : ses entrées au livre servi (une entrée au
    résultat saisi ne change plus, sauf correction motivée), ses statuts au journal, et les
    runs de son livre banc (« Rejouer au banc ») qui ne sont pas encore là."""
    brut = json.loads(export.read_text(encoding="utf-8"))
    rapport = depot.importer_servi(brut.get("entries") or [])
    rapport["statuts_bouges"] = depot.fusionner_statuts(brut.get("athletes") or {})
    rapport["runs_importes"] = [r["run"]["id"] for r in brut.get("banc") or []
                                if r.get("run") and depot.importer_run(r["run"], r.get("entries") or [])]
    return rapport


def decision(entries: list[dict], fiches: dict, jour: str) -> tuple[list[str], list[dict]]:
    """Les athlètes frais au ``jour`` (nommés) et leurs seules entrées."""
    frais = frais_a_la_date(fiches, jour)
    connus = set(fiches)
    gardes = [e for e in entries
              if (e.get("athlete") in frais) or (e.get("athlete") not in connus
                                                 and statut(e) == STATUT_FRAIS)]
    noms = sorted(set(frais) | {e["athlete"] for e in gardes})
    return noms, gardes


def _imprimer_runs(depot: Depot) -> None:
    runs = depot.runs()
    if not runs:
        print("Aucun run au livre banc.")
        return
    print("| run | étiquette | le | commit | empreinte | drapeaux hors défaut |")
    print("|---|---|---|---|---|---|")
    for r in runs:
        drapeaux = r.get("drapeaux")
        texte = "—" if drapeaux is None else (", ".join(f"{k}={v}" for k, v in drapeaux.items())
                                              or "aucun")
        modifie = " (modifié)" if r.get("modifie") else ""
        print(f"| {r['id']} | {r.get('label')} | {r.get('le')} | {r.get('commit') or '—'}{modifie} "
              f"| {r.get('config_empreinte') or '—'} | {texte} |")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="registre", description=__doc__.split("\n")[0])
    ap.add_argument("source", nargs="?", default=None,
                    help="un fichier de run ou un registre à l'ancien format (sinon le "
                         "registre committé, livre et run choisis par les options)")
    ap.add_argument("--depot", default=str(DEFAULT_RACINE))
    ap.add_argument("--livre", choices=(LIVRE_BANC, LIVRE_SERVI, "tous"), default="tous")
    ap.add_argument("--run", help="run du livre banc (identifiant ou son début ; défaut : le dernier)")
    ap.add_argument("--runs", action="store_true", help="liste les runs du livre banc")
    ap.add_argument("--json", action="store_true", help="sortie JSON brute")
    ap.add_argument("--frontiere", action="store_true",
                    help="trace la frontière finesse/calibration : couverture et score de "
                         "Winkler pour une grille de facteurs d'échelle sur les bandes "
                         "servies — dit de COMBIEN on peut resserrer sans mentir")
    ap.add_argument("--tableau", action="store_true",
                    help="tableau de référence en markdown : par livre et statut, vendus "
                         "(niveau calibré) / refusés (niveau de base), par athlète et total")
    ap.add_argument("--compare", nargs="+", metavar="RUN",
                    help="RUN_A [RUN_B] : avant → après (identifiants de run, chemins, ou "
                         "« servi ») ; RUN_B par défaut = la sélection courante")
    ap.add_argument("--decision", metavar="AAAA-MM-JJ",
                    help="restreint aux athlètes frais à cette date et les nomme")
    ap.add_argument("--quarantine", nargs=4, metavar=("ATHLETE", "COURSE", "DATE", "MOTIF"),
                    help="met une entrée en quarantaine (exclue des stats de tous les runs, "
                         "conservée et visible avec son motif)")
    ap.add_argument("--a-part", nargs=4, metavar=("ATHLETE", "COURSE", "DATE", "MOTIF"),
                    help="met une course à part, avec son motif : hors des agrégats de "
                         "tous les runs, rapportée à part")
    ap.add_argument("--marquer", nargs=3, metavar=("ATHLETE", "STATUT", "MOTIF"),
                    help="change le statut d'un athlète (dev ou frais), daté du jour et "
                         "journalisé avec son motif")
    ap.add_argument("--importer", metavar="EXPORT.json",
                    help="fusionne un export du tableau de bord (livre servi, statuts)")
    ap.add_argument("--migrer", metavar="ANCIEN.json",
                    help="range un registre à l'ancien format dans le registre committé")
    ap.add_argument("--servir", metavar="DOSSIER.json",
                    help="ajoute au livre servi l'entrée d'un plan servi, depuis le dossier de "
                         "sa version (avec --athlete, --officiel ou --dnf, --course, --date)")
    ap.add_argument("--athlete", help="pseudonyme de l'athlète (avec --servir)")
    ap.add_argument("--course", help="nom de la course au registre (avec --servir)")
    ap.add_argument("--date", help="date de la course, AAAA-MM-JJ (avec --servir)")
    ap.add_argument("--officiel", help="temps officiel, 35:05:12 ou 35h05 (avec --servir)")
    ap.add_argument("--dnf", action="store_true", help="abandon (avec --servir)")
    ap.add_argument("--profil", choices=("defaut", "reference", "experimental"),
                    help="profil de configuration qui a servi le plan (avec --servir), quand la "
                         "version ne le garde pas")
    args = ap.parse_args(argv)

    depot = Depot(args.depot)
    if args.marquer:
        athlete, st, motif = args.marquer
        try:
            fiche = depot.marquer(athlete, st, le=_aujourdhui(), par="Valentin", motif=motif)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        print(f"{athlete} : {fiche['statut']} depuis le {fiche['depuis']} — {motif}", file=sys.stderr)
        return 0
    if args.a_part:
        ath, race, jour, motif = args.a_part
        depot.mettre_a_part(ath, race, jour, motif, _aujourdhui())
        print(f"À part : {ath} / {race} / {jour} — {motif}", file=sys.stderr)
        return 0
    if args.quarantine:
        ath, race, jour, motif = args.quarantine
        depot.mettre_en_quarantaine(ath, race, jour, motif, _aujourdhui())
        print(f"En quarantaine : {ath} / {race} / {jour} — motif : {motif}", file=sys.stderr)
        return 0
    if args.importer:
        rapport = importer(Path(args.importer), depot)
        for k, v in rapport.items():
            print(f"  {k} : {len(v)}{' — ' + ', '.join(v) if v else ''}", file=sys.stderr)
        return 1 if rapport.get("refusees") else 0
    if args.servir:
        from twin_engine.config import load_config

        from tools.backtest import parse_time_h

        if not args.athlete or not (args.officiel or args.dnf):
            print("--servir demande --athlete et --officiel (ou --dnf)", file=sys.stderr)
            return 2
        try:
            e = entree_servie(Path(args.servir), depot, load_config(), athlete=args.athlete,
                              course=args.course, jour=args.date,
                              officiel_h=parse_time_h(args.officiel), dnf=args.dnf,
                              profil=args.profil)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        rapport = depot.importer_servi([e])
        for k, v in rapport.items():
            if v:
                print(f"  {k} : {', '.join(v)}", file=sys.stderr)
        p = e["prediction"]
        print(f"{e['athlete']} · {e['race']} ({e['date']}) : prédit {p['central_h']:.2f} h, "
              f"réel {e['official_time_h']}, écart {p['err_pct']} %, statut {e['statut']}"
              f"{', forme jugée' if 'forme' in e else ''}", file=sys.stderr)
        return 1 if rapport.get("refusees") else 0
    if args.migrer:
        print("--migrer : utiliser migrer() depuis Python, avec les statuts initiaux",
              file=sys.stderr)
        return 2
    if args.runs:
        _imprimer_runs(depot)
        return 0

    jour = args.decision
    if args.source:
        entete, brutes = lire_entrees(Path(args.source))
        entries = depot.annoter(brutes, LIVRE_BANC, jour=jour)
    else:
        try:
            entries, entete = charger(depot, livre_=args.livre, run=args.run, jour=jour)
        except LookupError as exc:
            print(str(exc), file=sys.stderr)
            return 2
    if entete is not None:
        print(f"Run {entete['id']} (étiquette {entete.get('label')}, commit "
              f"{entete.get('commit') or '—'}, empreinte {entete.get('config_empreinte') or '—'})",
              file=sys.stderr)
    if jour:
        noms, entries = decision(entries, depot.athletes(), jour)
        print(f"Décision au {jour} : athlètes frais — {', '.join(noms) if noms else 'aucun'}"
              f" ({len(entries)} entrée(s))", file=sys.stderr)

    if args.tableau:
        print(tableau_markdown(entries))
        return 0
    if args.compare:
        try:
            before = charger_source(depot, args.compare[0], jour=jour)
            after = (charger_source(depot, args.compare[1], jour=jour) if len(args.compare) > 1
                     else entries)
        except LookupError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        print(compare_markdown(before, after))
        return 0
    groups = dict(_groups(entries))
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
              f"quarantaine {s['n_quarantine']}, à part {s['n_a_part']}, "
              f"sans prédiction {s['n_no_prediction']})")
        if not s.get("n_finished"):
            continue
        print(f"  central : biais {s['bias_pct']:+.1f} % · MAE {s['mae_pct']:.1f} % · "
              f"médiane |err| {s['median_abs_err_pct']:.1f} %")
        for key, lib in (("vendable", "niveau calibré, VENDU (🟢/🟠)"),
                         ("refuse", "niveau de base, refusé (🔴)")):
            if key in s:
                b = s[key]
                cov = "—" if b["coverage80_pct"] is None else f"{b['coverage80_pct']:.0f} %"
                print(f"  {lib} : n={b['n']} · MAE {b['mae_pct']:.1f} % · couv80 {cov}")
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
        if "garde_domaine" in s:
            print("  " + _garde_line(s["garde_domaine"]))
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
    fresh = [e for e in entries if statut(e) == STATUT_FRAIS]
    n_fresh_fin = summarize(fresh).get("n_finished", 0)
    if n_fresh_fin < 8:
        print(f"\n⚠ {n_fresh_fin} cas frais finis < 8 : la règle pré-enregistrée INTERDIT toute "
              "recalibration à ce stade (collecter, ne pas conclure).")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
