"""Radiographie des vrais ultras : arrêts (H2) et part de nuit (C2) — des mesures, rien d'autre.

Deux préalables du chantier v2, mesurés sur l'archive RÉELLE (le fixture Montagnhard, fait
d'agrégats, ne les voit pas) :

  * **H2 — écoulé = mouvement + arrêts.** Pour chaque effort ≥ ``--min-hours`` : temps
    écoulé, temps de mouvement (masque distance de ``twin/stops.py``, le même que le
    moteur), part d'arrêts en % et en min/h, plateaux ≥ ``--min-stop-s`` et ≥ 5 min, plus
    long arrêt ; et, quand la course est au manifeste, le temps OFFICIEL face à l'écoulé
    de la montre — une montre en pause ment sur l'écoulé que la LOO compare.
  * **C2 — part de nuit.** Pour chaque effort long, la part de nuit du temps écoulé et du
    temps en mouvement, depuis les canaux lat/lon et l'heure de départ (test jour/nuit du
    plan, ``pacing/sun.py``) ; et, avec ``--course/--race/--hours``, la part de nuit de la
    CIBLE, globale et par segment, obtenue du plan réel (``build_pacing``).

Les agrégats sont pondérés comme la calibration servie (récence × maximalité) : on mesure
ce que le modèle « voit » en moyenne, pas une moyenne naïve. Rien n'est conservé : des
agrégats, imprimés en markdown (à coller dans DIAGNOSTIC) ou écrits en JSON.

    PYTHONPATH=src python -m tools.diag_ultras <archive> [--manifest m.json] [--min-hours 10]
        [--min-stop-s 60] [--json sortie.json]
    PYTHONPATH=src python -m tools.diag_ultras --course trace.gpx --race spec.json --hours 32.3
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta, timezone
from pathlib import Path

import numpy as np

from twin_engine.calibration import (_basis_hours, build_calibration, maximality_weights,
                                     recency_weights)
from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.ingest import iter_activities
from twin_engine.pacing import build_pacing
from twin_engine.pacing.sun import night_mask, night_share
from twin_engine.predict import Prediction
from twin_engine.twin.model import build_twin_from_contributions
from twin_engine.twin.record import iter_contributions
from twin_engine.twin.stops import moving_mask, stop_stats

from tools.backtest import parse_time_h


def _tz_from_lon(lon: float) -> float:
    """Fuseau « solaire » (heures entières) déduit de la longitude : suffisant pour le test
    jour/nuit, qui ne dépend que de la cohérence entre l'horloge et les heures solaires."""
    return float(round(lon / 15.0))


def activity_row(act, cfg, *, min_stop_s: float = 60.0) -> dict:
    """Arrêts et nuit d'UNE activité 1 Hz (agrégats seulement)."""
    st = stop_stats(act.dist_m, cfg.twin.moving_speed_threshold_ms, min_stop_s=min_stop_s)
    row = {
        "date": act.start_time.date().isoformat() if act.start_time else None,
        "elapsed_h": st.elapsed_s / 3600.0,
        "moving_h": st.moving_s / 3600.0,
        "stopped_pct": st.stopped_pct,
        "stopped_min_per_h": st.stopped_min_per_hour,
        "n_stops": st.n_stops,
        "n_stops_5min": st.n_stops_5min,
        "in_stops_min_per_h": st.in_stops_min_per_hour,
        "longest_stop_min": st.longest_stop_s / 60.0,
        "night_pct": None,
        "night_moving_pct": None,
        "start_local": None,
    }
    lat, lon = act.lat, act.lon
    finite = np.isfinite(lat) & np.isfinite(lon)
    if finite.any() and act.start_time is not None:
        la, lo = float(np.median(lat[finite])), float(np.median(lon[finite]))
        tz = _tz_from_lon(lo)
        start_local = act.start_time.astimezone(timezone(timedelta(hours=tz)))
        nm = night_mask(start_local, act.duration_s, la, lo, tz)
        mm = moving_mask(act.dist_m, cfg.twin.moving_speed_threshold_ms)
        row["night_pct"] = 100.0 * float(nm.mean()) if nm.size else None
        row["night_moving_pct"] = 100.0 * float(nm[mm].mean()) if mm.any() else None
        row["start_local"] = f"{start_local.strftime('%H:%M')} (UTC{tz:+.0f})"
    return row


def _genuine_reasons(summary, cfg) -> list[str]:
    """Pourquoi un effort long n'est PAS un vrai ultra (mêmes seuils que la calibration)."""
    c = cfg.calibration
    hours = _basis_hours(summary, cfg)
    vga = summary.ga_km / hours if hours > 0 else 0.0
    fails: list[str] = []
    if summary.duration_s < c.genuine_min_hours * 3600:
        fails.append(f"durée < {c.genuine_min_hours:g} h")
    if vga < c.genuine_min_ga_kmh:
        fails.append(f"vga {vga:.2f} < {c.genuine_min_ga_kmh:g} km/h")
    if summary.decouple_pct is not None and summary.decouple_pct > c.genuine_max_decouple_pct:
        fails.append(f"découplage {summary.decouple_pct:.0f} % > {c.genuine_max_decouple_pct:.0f} %")
    return fails


def attach_official_times(rows: list[dict], manifest: dict) -> None:
    """Rapproche chaque course du manifeste de l'activité du jour (±1 j, durée la plus
    proche du temps officiel) et note l'écart montre − officiel."""
    for r in manifest.get("races", []):
        try:
            rd = date.fromisoformat(r["date"])
        except (KeyError, ValueError):
            continue
        official = None if r.get("dnf") else parse_time_h(r.get("official_time"))
        cands = []
        for row in rows:
            if not row["date"]:
                continue
            gap = abs((date.fromisoformat(row["date"]) - rd).days)
            if gap <= 1:
                cands.append((gap, abs(row["elapsed_h"] - (official or row["elapsed_h"])), row))
        if not cands:
            continue
        cands.sort(key=lambda c: (c[0], c[1]))
        row = cands[0][2]
        row["race"] = r["name"]
        row["official_h"] = official
        row["watch_gap_min"] = (None if official is None
                                else 60.0 * (row["elapsed_h"] - official))


def scan_archive(archive: str | Path, cfg, *, min_hours: float | None = None,
                 min_stop_s: float = 60.0, manifest: dict | None = None,
                 progress=None) -> dict:
    """Une passe sur l'archive : lignes par effort long + jumeau/calibration pour le statut
    « vrai ultra » et les poids, puis agrégats."""
    min_h = cfg.calibration.genuine_min_hours if min_hours is None else float(min_hours)
    rows_by_idx: dict[int, dict] = {}
    skipped: list[dict] = []

    def _tee(stream):
        for i, act in enumerate(stream):
            if act.duration_s >= min_h * 3600:
                rows_by_idx[i] = activity_row(act, cfg, min_stop_s=min_stop_s)
            yield act

    stream = iter_activities(archive, running_only=True, skipped=skipped, progress=progress)
    contribs = list(iter_contributions(_tee(stream), cfg))
    twin = build_twin_from_contributions(contribs, cfg)
    cal = build_calibration(twin, cfg)
    w = recency_weights(cal.genuine, cfg) * maximality_weights(cal.genuine, twin, cfg)
    genuine_w = {(g.date, round(g.hours, 2)): float(w[i]) for i, g in enumerate(cal.genuine)}

    rows: list[dict] = []
    for i, row in rows_by_idx.items():
        summary = contribs[i].summary
        key = (row["date"], round(summary.duration_s / 3600.0, 2) if summary else None)
        if summary is None:
            row["genuine"], row["weight"], row["reasons"] = False, 0.0, ["résumé indisponible"]
        elif key in genuine_w:
            row["genuine"], row["weight"], row["reasons"] = True, genuine_w[key], []
        else:
            row["genuine"], row["weight"] = False, 0.0
            row["reasons"] = _genuine_reasons(summary, cfg) or ["hors calibration (poids nul)"]
        rows.append(row)
    rows.sort(key=lambda r: r["date"] or "")
    if manifest:
        attach_official_times(rows, manifest)
    return {
        "archive": str(archive), "min_hours": min_h, "min_stop_s": min_stop_s,
        "n_activities": len(contribs), "n_skipped": len(skipped),
        "calibration": {"regime": cal.regime, "n_genuine": cal.n_genuine,
                        "n_eff": round(cal.n_eff, 2)},
        "rows": rows,
        "aggregates": aggregate(rows),
    }


def _wmean(vals: list[float | None], weights: list[float]) -> float | None:
    pairs = [(v, w) for v, w in zip(vals, weights) if v is not None and w > 0]
    if not pairs:
        return None
    sw = sum(w for _, w in pairs)
    return float(sum(v * w for v, w in pairs) / sw) if sw > 0 else None


def _median(vals: list[float | None]) -> float | None:
    xs = [v for v in vals if v is not None]
    return float(np.median(xs)) if xs else None


_METRICS = ("stopped_pct", "stopped_min_per_h", "in_stops_min_per_h", "n_stops",
            "n_stops_5min", "night_pct", "night_moving_pct")


def aggregate(rows: list[dict]) -> dict:
    """Médianes (tous efforts longs, vrais ultras) et moyennes pondérées comme la
    calibration (vrais ultras) ; écart montre − officiel sur les courses rapprochées."""
    genuine = [r for r in rows if r.get("genuine")]
    out: dict = {"n_long": len(rows), "n_genuine": len(genuine)}
    for m in _METRICS:
        out[f"{m}_med_all"] = _median([r.get(m) for r in rows])
        out[f"{m}_med_genuine"] = _median([r.get(m) for r in genuine])
        out[f"{m}_wmean_genuine"] = _wmean([r.get(m) for r in genuine],
                                           [r.get("weight", 0.0) for r in genuine])
    gaps = [r["watch_gap_min"] for r in rows if r.get("watch_gap_min") is not None]
    out["n_races_matched"] = len(gaps)
    out["watch_gap_min_med"] = _median(gaps)
    out["watch_gap_min_max_abs"] = max((abs(g) for g in gaps), default=None)
    return out


def target_night(gpx_bytes: bytes, race: RaceSpec, hours: float, cfg) -> dict:
    """Part de nuit de la CIBLE : le plan réel (fade, arrêts, horloge) réparti sur ``hours``,
    puis la nuit intégrée sur la fenêtre de mouvement de chaque segment."""
    if race.start_time is None or race.lat is None or race.lon is None:
        raise ValueError("la spec de course doit porter start_time, lat et lon")
    course = build_course(gpx_bytes, race, cfg)
    pred = Prediction(
        finish_hours=float(hours), v_kmh=course.deq_km / hours, deq_km=course.deq_km,
        dplus_per_km=course.dplus_per_km, interval_low_h=float(hours), interval_high_h=float(hours),
        mc_samples=np.array([float(hours)]), regime="regression", sigma_kmh=0.0,
        vc_fraction=None, cross_validation=None, plan_low_h=float(hours), plan_high_h=float(hours),
    )
    plan = build_pacing(course, pred, race, cfg)
    start, tz = race.start_time, race.tz_offset_h
    segs: list[dict] = []
    for s in plan.segments:
        t_move_h = s.t_move_min / 60.0
        t0 = s.cum_clock_h - t_move_h
        share = night_share(start + timedelta(hours=t0), t_move_h, race.lat, race.lon, tz)
        segs.append({"index": s.index, "to": s.to, "off1": s.off1, "arr_clock": s.arr_clock,
                     "t_move_min": s.t_move_min, "night_pct": 100.0 * share})
    tm = sum(s["t_move_min"] for s in segs)
    night_move = (sum(s["night_pct"] * s["t_move_min"] for s in segs) / tm) if tm > 0 else 0.0
    night_clock = 100.0 * night_share(start, plan.t_clock_h, race.lat, race.lon, tz)
    dark = [s for s in segs if s["night_pct"] >= 50.0]
    return {
        "name": race.name, "hours": float(hours), "t_move_h": plan.t_move_h,
        "t_clock_h": plan.t_clock_h, "sun": plan.sun,
        "night_moving_pct": night_move, "night_clock_pct": night_clock,
        "night_span_km": (None if not dark else
                          (float(course.segments[dark[0]["index"] - 1].off0), float(dark[-1]["off1"]))),
        "segments": segs,
    }


def _f(v, nd=1) -> str:
    return "—" if v is None else f"{v:.{nd}f}"


def render_markdown(result: dict) -> str:
    out: list[str] = []
    rows = result.get("rows")
    if rows is not None:
        c = result["calibration"]
        out.append(f"Archive : {result['n_activities']} activités de course "
                   f"({result['n_skipped']} écartées à l'ingestion) · calibration {c['regime']}, "
                   f"{c['n_genuine']} vrais ultras (n_eff {c['n_eff']}) · efforts ≥ "
                   f"{result['min_hours']:g} h : {len(rows)} · arrêt = plateau ≥ "
                   f"{result['min_stop_s']:g} s.\n")
        out.append("**H2 — écoulé, mouvement, arrêts** (min/h = minutes d'arrêt par heure de course)\n")
        out.append("| date | course | écoulé h | officiel h | montre−off. min | mouvement h | "
                   "arrêts % | arrêts min/h | plateaux ≥1 min | ≥5 min | plateaux min/h | "
                   "plus long min | vrai ultra | poids |")
        out.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
        for r in rows:
            statut = "oui" if r.get("genuine") else "non : " + " ; ".join(r.get("reasons", []))
            out.append(
                f"| {r['date']} | {r.get('race', '')} | {_f(r['elapsed_h'], 2)} "
                f"| {_f(r.get('official_h'), 2)} | {_f(r.get('watch_gap_min'), 0)} "
                f"| {_f(r['moving_h'], 2)} | {_f(r['stopped_pct'])} | {_f(r['stopped_min_per_h'])} "
                f"| {r['n_stops']} | {r['n_stops_5min']} | {_f(r['in_stops_min_per_h'])} "
                f"| {_f(r['longest_stop_min'], 0)} | {statut} | {_f(r.get('weight'), 2)} |")
        out.append("\n**C2 — part de nuit** (test jour/nuit du plan, fuseau solaire de la longitude)\n")
        out.append("| date | course | départ local | nuit % écoulé | nuit % mouvement | vrai ultra |")
        out.append("|---|---|---|---|---|---|")
        for r in rows:
            out.append(f"| {r['date']} | {r.get('race', '')} | {r.get('start_local') or '—'} "
                       f"| {_f(r['night_pct'])} | {_f(r['night_moving_pct'])} "
                       f"| {'oui' if r.get('genuine') else 'non'} |")
        a = result["aggregates"]
        out.append("\n**Agrégats**\n")
        out.append("| mesure | médiane, tous efforts longs | médiane, vrais ultras | "
                   "moyenne pondérée (récence × maximalité), vrais ultras |")
        out.append("|---|---|---|---|")
        labels = {"stopped_pct": "arrêts % de l'écoulé", "stopped_min_per_h": "arrêts min/h",
                  "in_stops_min_per_h": "plateaux ≥ seuil, min/h", "n_stops": "nb plateaux",
                  "n_stops_5min": "nb plateaux ≥ 5 min", "night_pct": "nuit % écoulé",
                  "night_moving_pct": "nuit % mouvement"}
        for m, lab in labels.items():
            out.append(f"| {lab} | {_f(a[f'{m}_med_all'])} | {_f(a[f'{m}_med_genuine'])} "
                       f"| {_f(a[f'{m}_wmean_genuine'])} |")
        out.append(f"\nCourses rapprochées du manifeste : {a['n_races_matched']} · écart montre − "
                   f"officiel : médiane {_f(a['watch_gap_min_med'])} min, max |écart| "
                   f"{_f(a['watch_gap_min_max_abs'])} min.")
    tgt = result.get("target")
    if tgt:
        out.append(f"\n**Cible — {tgt['name']} sur {tgt['hours']:.2f} h** (mouvement "
                   f"{tgt['t_move_h']:.2f} h, horloge {tgt['t_clock_h']:.2f} h, soleil "
                   f"{tgt['sun'].get('sunrise', '?')}–{tgt['sun'].get('sunset', '?')})\n")
        out.append("| # | vers | arrivée | mouvement min | nuit % |")
        out.append("|---|---|---|---|---|")
        for s in tgt["segments"]:
            out.append(f"| {s['index']} | {s['to']} | {s['arr_clock'] or '—'} "
                       f"| {s['t_move_min']:.0f} | {s['night_pct']:.0f} |")
        span = tgt["night_span_km"]
        out.append(f"\nNuit : {tgt['night_moving_pct']:.1f} % du mouvement, "
                   f"{tgt['night_clock_pct']:.1f} % de l'horloge"
                   + (f" ; segments majoritairement de nuit du km {span[0]:.0f} au km {span[1]:.0f}."
                      if span else " ; aucun segment majoritairement de nuit."))
    return "\n".join(out)


def _progress(n: int, name: str) -> None:
    if n % 100 == 0:
        print(f"\r  décodage : {n} fichiers…", end="", file=sys.stderr, flush=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="diag_ultras", description=__doc__.split("\n")[0])
    ap.add_argument("archive", nargs="?", help="archive (.zip/dossier) — jamais purgée")
    ap.add_argument("--manifest", help="manifeste de backtest : rapproche les courses et leurs "
                                       "temps officiels")
    ap.add_argument("--min-hours", type=float, default=None,
                    help="seuil des efforts longs (défaut : calibration.genuine_min_hours)")
    ap.add_argument("--min-stop-s", type=float, default=60.0,
                    help="durée minimale d'un plateau compté comme arrêt (défaut 60 s)")
    ap.add_argument("--course", help="trace GPX de la cible (part de nuit de la cible)")
    ap.add_argument("--race", help="spec JSON de la cible (start_time, lat, lon requis)")
    ap.add_argument("--hours", type=float, help="temps central à répartir sur la cible")
    ap.add_argument("--json", help="écrit le résultat complet (JSON) à ce chemin")
    args = ap.parse_args(argv)
    if not args.archive and not args.course:
        ap.error("donne une archive et/ou --course/--race/--hours")

    cfg = load_config()
    result: dict = {}
    if args.archive:
        p = Path(args.archive)
        if not p.exists():
            print(f"Introuvable : {p}", file=sys.stderr)
            return 2
        manifest = (json.loads(Path(args.manifest).read_text(encoding="utf-8"))
                    if args.manifest else None)
        result = scan_archive(p, cfg, min_hours=args.min_hours, min_stop_s=args.min_stop_s,
                              manifest=manifest, progress=_progress)
        print(file=sys.stderr)
    if args.course:
        if not args.race or args.hours is None:
            ap.error("--course demande --race et --hours")
        race = RaceSpec.from_json(args.race)
        result["target"] = target_night(Path(args.course).read_bytes(), race, args.hours, cfg)
    print(render_markdown(result))
    if args.json:
        Path(args.json).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                                   encoding="utf-8")
        print(f"\nJSON écrit : {args.json}", file=sys.stderr)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
