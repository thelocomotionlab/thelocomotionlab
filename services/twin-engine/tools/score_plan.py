"""Score de la FORME du plan contre les passages réels — du registre seul, sans archive.

Le banc juge l'arrivée ; ici on juge la répartition : pour chaque course du registre qui
porte des passages réels (``tools/passages``), le plan est reconstruit COMME AU RAPPORT
(parcours de la spec ou découpage 10 km, fade, arrêts, horloge) mais ANCRÉ SUR LE TEMPS
OFFICIEL — l'erreur de total est ainsi retirée, il ne reste que la forme : où le plan
place l'athlète à chaque point de passage, contre où il était vraiment.

Variantes rejouées sur chaque course, sans re-décodage (les agrégats de l'athlète sont
dans le registre : durabilité, Δ des moitiés, taux d'arrêt personnel) :

  * source du fade : ``config`` (Δ fixe), ``durability`` (découplage), ``splits`` (moitiés) ;
  * arrêts : ``carved`` (politique du plan retranchée) ou ``personal`` (taux de l'athlète
    réparti sur les ravitos au prorata de la politique).

Mesures par course : MAE des passages (minutes et % du temps officiel, arrivée exclue), et
biais signé à mi-course (plan − réel, en minutes : > 0 = l'athlète était EN AVANCE sur le
plan à mi-parcours, donc le plan le faisait partir trop lentement / finir trop vite).
Agrégées par athlète × variante, cas de développement et cas frais séparés.

    PYTHONPATH=src python -m tools.score_plan <manifestes…> [--registre r.json] [--out score.md]
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np

from twin_engine.config import load_config, override_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.pacing import build_pacing
from twin_engine.predict import Prediction

from tools.backtest import DEFAULT_REGISTRE, race_spec_from_meta

FADE_SOURCES = ("config", "durability", "splits")
STOPS_MODELS = ("carved", "personal")


def _stand_in(hours: float, deq_km: float, dpk: float, *, stops_model: str,
              stops_rate: float | None) -> Prediction:
    """Prédiction factice ancrée sur ``hours`` : seule la forme du plan est en jeu."""
    moving = hours if stops_model == "carved" or not stops_rate else hours / (1.0 + stops_rate)
    return Prediction(
        finish_hours=float(hours), v_kmh=deq_km / hours, deq_km=deq_km, dplus_per_km=dpk,
        interval_low_h=float(hours), interval_high_h=float(hours), mc_samples=np.array([float(hours)]),
        regime="regression", sigma_kmh=0.0, vc_fraction=None, cross_validation=None,
        plan_low_h=float(hours), plan_high_h=float(hours), moving_hours=float(moving),
        stops_hours=float(hours - moving), stops_model=stops_model,
        stops_rate=(None if stops_model == "carved" else stops_rate),
    )


def score_course(course, race: RaceSpec, official_h: float, passages: dict, cfg,
                 *, durability_pct: float | None, splits_delta: float | None,
                 stops_rate: float | None) -> dict:
    """Toutes les variantes sur UNE course : {(fade, stops): {mae_min, mae_pct, mid_bias_min, n}}."""
    cps = passages.get("checkpoints") or []
    # passages aux bornes de segments : checkpoint i = fin du segment i−1 ; l'arrivée est
    # exclue (le plan y vaut le temps ancré par construction)
    real = [c.get("t_h") for c in cps]
    n_seg = len(course.segments)
    if len(real) != n_seg + 1:
        return {}
    idx = [i for i in range(1, n_seg) if real[i] is not None]
    if len(idx) < 2:
        return {}
    cum_km = np.array([s.off1 for s in course.segments])
    mid_i = idx[int(np.argmin([abs(cum_km[i - 1] - course.length_km / 2.0) for i in idx]))]
    out: dict = {}
    for fade in FADE_SOURCES:
        cfg_v = replace(cfg, pacing=replace(cfg.pacing, fade_source=fade))
        for stops in STOPS_MODELS:
            if stops == "personal" and stops_rate is None:
                continue
            pred = _stand_in(official_h, course.deq_km, course.dplus_per_km,
                             stops_model=stops, stops_rate=stops_rate)
            plan = build_pacing(course, pred, race, cfg_v, durability_pct=durability_pct,
                                splits_delta=splits_delta)
            cum = [s.cum_clock_exact_h if s.cum_clock_exact_h is not None else s.cum_clock_h
                   for s in plan.segments]
            err_min = [60.0 * (cum[i - 1] - real[i]) for i in idx]
            mae_min = float(np.mean(np.abs(err_min)))
            mid = 60.0 * (cum[mid_i - 1] - real[mid_i])
            out[(fade, stops)] = {"mae_min": mae_min, "mae_pct": 100.0 * mae_min / 60.0 / official_h,
                                  "mid_bias_min": float(mid), "n": len(idx),
                                  "fade_used": plan.fade_source_used,
                                  "fade_delta": plan.fade_delta_used}
    return out


def score_registre(registre: dict, manifests: list[Path], cfg) -> list[dict]:
    """Une ligne par course scorée : athlète, course, dev_set, officiel, variantes."""
    paths: dict[tuple[str, str, str], tuple[Path, dict]] = {}
    for mp in manifests:
        man = json.loads(mp.read_text(encoding="utf-8"))
        base = mp.resolve().parent
        for r in man["races"]:
            paths[(man["athlete"], r["name"], r["date"])] = (base, r)
    rows: list[dict] = []
    for e in registre.get("entries", []):
        key = (e.get("athlete"), e.get("race"), e.get("date"))
        pas = e.get("passages")
        official = e.get("official_time_h")
        if key not in paths or not pas or official is None or e.get("dnf") or e.get("quarantine"):
            continue
        base, r = paths[key]
        gpx = (base / r["gpx"]).resolve()
        if not gpx.exists():
            print(f"  {key[0]} · {key[1]} : trace introuvable ({gpx})", file=sys.stderr)
            continue
        if r.get("race_json"):
            race = RaceSpec.from_json((base / r["race_json"]).resolve())
        else:
            meta = e.get("race_meta")
            race = RaceSpec(name=r["name"]) if not meta else race_spec_from_meta(
                r["name"], {"start_local": __import__("datetime").datetime.fromisoformat(meta["start_local"]),
                            "lat": meta["lat"], "lon": meta["lon"], "tz": meta["tz"]})
        course = build_course(gpx.read_bytes(), race, cfg)
        m = e.get("model") or {}
        scores = score_course(course, race, float(official), pas, cfg,
                              durability_pct=m.get("durability_pct"),
                              splits_delta=m.get("fade_delta_splits"),
                              stops_rate=m.get("stops_rate_personal"))
        if not scores:
            continue
        rows.append({"athlete": key[0], "race": key[1], "date": key[2],
                     "dev_set": bool(e.get("dev_set")), "official_h": float(official),
                     "splits_delta": m.get("fade_delta_splits"),
                     "durability_pct": m.get("durability_pct"),
                     "stops_rate": m.get("stops_rate_personal"),
                     "scores": scores})
    return rows


def _agg(rows: list[dict]) -> dict:
    """Moyennes par variante sur un groupe de courses."""
    out: dict = {}
    for fade in FADE_SOURCES:
        for stops in STOPS_MODELS:
            vals = [r["scores"][(fade, stops)] for r in rows if (fade, stops) in r["scores"]]
            if not vals:
                continue
            out[(fade, stops)] = {
                "n": len(vals),
                "mae_pct": float(np.mean([v["mae_pct"] for v in vals])),
                "mae_min": float(np.mean([v["mae_min"] for v in vals])),
                "mid_bias_min": float(np.mean([v["mid_bias_min"] for v in vals])),
                "mid_bias_pct": float(np.mean([100.0 * v["mid_bias_min"] / 60.0 / r["official_h"]
                                               for r, v in zip([r for r in rows if (fade, stops) in r["scores"]], vals)])),
            }
    return out


def _f(v, nd=1) -> str:
    return "—" if v is None else f"{v:.{nd}f}"


def render_markdown(rows: list[dict]) -> str:
    out: list[str] = []
    if not rows:
        return "Aucune course scorable (passages, temps officiel et trace requis)."
    # ce que les athlètes apportent au fade et aux arrêts (médianes des coupures scorées)
    out.append("**Mesures par athlète (médianes des coupures scorées)** : Δ des moitiés NON borné, "
               "durabilité, taux d'arrêt personnel\n")
    out.append("| athlète | n | Δ moitiés | Δ servi par `splits` (borné) | durabilité % | arrêts, min par h de mouvement |")
    out.append("|---|---|---|---|---|---|")
    for ath in sorted({r["athlete"] for r in rows}):
        sub = [r for r in rows if r["athlete"] == ath]
        fd = [r["splits_delta"] for r in sub if r.get("splits_delta") is not None]
        du = [r["durability_pct"] for r in sub if r.get("durability_pct") is not None]
        sr = [60.0 * r["stops_rate"] for r in sub if r.get("stops_rate") is not None]
        served = [r["scores"][("splits", "carved")]["fade_delta"] for r in sub
                  if ("splits", "carved") in r["scores"]]
        out.append(f"| {ath} | {len(sub)} | {_f(float(np.median(fd)), 3) if fd else '—'} "
                   f"| {_f(float(np.median(served)), 3) if served else '—'} "
                   f"| {_f(float(np.median(du))) if du else '—'} | {_f(float(np.median(sr))) if sr else '—'} |")
    groups = [("cas frais (décisionnels)", [r for r in rows if not r["dev_set"]]),
              ("cas de développement (indicatifs)", [r for r in rows if r["dev_set"]]),
              ("tous les cas", rows)]
    for title, grp in groups:
        if not grp:
            continue
        out.append(f"\n**{title} — forme du plan ancré sur le temps officiel** (n = {len(grp)} courses)\n")
        out.append("| fade | arrêts | n | MAE passages, % du temps | MAE, min | biais mi-course, min (> 0 : athlète en avance sur le plan) | biais mi-course, % |")
        out.append("|---|---|---|---|---|---|---|")
        agg = _agg(grp)
        for (fade, stops), a in agg.items():
            out.append(f"| {fade} | {stops} | {a['n']} | {_f(a['mae_pct'], 2)} | {_f(a['mae_min'])} "
                       f"| {_f(a['mid_bias_min'])} | {_f(a['mid_bias_pct'], 2)} |")
        # par athlète
        athletes = sorted({r["athlete"] for r in grp})
        if len(athletes) > 1:
            out.append("\n| athlète | fade | arrêts | n | MAE % | biais mi-course, min |")
            out.append("|---|---|---|---|---|---|")
            for ath in athletes:
                sub = [r for r in grp if r["athlete"] == ath]
                for (fade, stops), a in _agg(sub).items():
                    out.append(f"| {ath} | {fade} | {stops} | {a['n']} | {_f(a['mae_pct'], 2)} "
                               f"| {_f(a['mid_bias_min'])} |")
    out.append("\n**Par course** (MAE des passages en % du temps officiel ; biais mi-course en min)\n")
    heads = [f"{f}/{s}" for f in FADE_SOURCES for s in STOPS_MODELS]
    out.append("| athlète | course | officiel h | " + " | ".join(heads) + " |")
    out.append("|---|---|---|" + "---|" * len(heads))
    for r in rows:
        cells = []
        for f in FADE_SOURCES:
            for s in STOPS_MODELS:
                v = r["scores"].get((f, s))
                cells.append("—" if v is None else f"{v['mae_pct']:.2f} ({v['mid_bias_min']:+.0f})")
        out.append(f"| {r['athlete']} | {r['race']} | {r['official_h']:.2f} | " + " | ".join(cells) + " |")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="score_plan", description=__doc__.split("\n")[0])
    ap.add_argument("manifests", nargs="+", help="manifeste(s) JSON (chemins des traces et specs)")
    ap.add_argument("--registre", default=str(DEFAULT_REGISTRE))
    ap.add_argument("--out", help="écrit le markdown à ce chemin (sinon stdout)")
    ap.add_argument("--set", action="append", default=[], metavar="BLOC.CLÉ=VALEUR",
                    help="surcharge de config appliquée à TOUTES les variantes du scoreur "
                         "(répétable) — ex. --set pacing.fade_delta=0.2 ou "
                         "--set pacing.fade_delta_max=0.3 pour tester une dérive plus forte "
                         "en quelques secondes, sans archive")
    args = ap.parse_args(argv)
    cfg = load_config()
    try:
        for spec in args.set:
            cfg = override_config(cfg, spec)
    except ValueError as exc:
        print(f"--set : {exc}", file=sys.stderr)
        return 2
    reg_path = Path(args.registre)
    if not reg_path.exists():
        print(f"Registre introuvable : {reg_path}", file=sys.stderr)
        return 2
    registre = json.loads(reg_path.read_text(encoding="utf-8"))
    rows = score_registre(registre, [Path(m) for m in args.manifests], cfg)
    md = render_markdown(rows)
    if args.out:
        Path(args.out).write_text(md + "\n", encoding="utf-8")
        print(f"Score écrit : {args.out} ({len(rows)} courses)", file=sys.stderr)
    else:
        print(md)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
