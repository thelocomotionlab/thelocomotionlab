"""Heures de passage RÉELLES aux points de contrôle des courses passées.

La matière pour scorer le PLAN, pas seulement l'arrivée. Pour chaque course d'un manifeste :
l'activité du jour de course est retrouvée dans l'archive, le parcours est construit
exactement comme au banc (spec de course, ou découpage automatique en mode GPX-only) et
l'heure de passage à chaque point de découpage est relevée par PROXIMITÉ monotone : premier
échantillon à moins de ``--radius-m`` du point, après le point précédent et cohérent avec la
distance de la montre ; à défaut, l'approche la plus proche, signalée comme telle. Un point
jamais approché est consigné « introuvable » — rien n'est inventé.

Consigné dans le registre sous ``passages`` (clé athlète/course/date), agrégats seulement :
des heures à des km publics. La fusion du banc (``merge_registre``) les préserve.

    PYTHONPATH=src python -m tools.passages manifest-a.json [manifest-b.json …]
        [--registre <chemin.json>] [--radius-m 150] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import numpy as np

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.ingest import iter_activities

from tools.backtest import DEFAULT_REGISTRE, parse_time_h

_R_EARTH = 6_371_000.0


def _dist_to_point(lat: np.ndarray, lon: np.ndarray, la0: float, lo0: float) -> np.ndarray:
    """Distance haversine (m) de chaque échantillon à un point ; NaN sans position."""
    phi1, phi0 = np.radians(lat), np.radians(la0)
    dphi = phi1 - phi0
    dlam = np.radians(lon) - np.radians(lo0)
    a = np.sin(dphi / 2) ** 2 + np.cos(phi1) * np.cos(phi0) * np.sin(dlam / 2) ** 2
    return 2 * _R_EARTH * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def match_checkpoints(t, dist_m, lat, lon, checkpoints, *, radius_m: float = 150.0,
                      dist_tol_frac: float = 0.08, dist_tol_min_m: float = 3000.0,
                      closest_max_m: float = 1000.0) -> list[dict]:
    """Passage à chaque point (km, lat, lon), dans l'ordre du parcours.

    Trois verrous : proximité (``radius_m``), monotonie (jamais avant le point précédent)
    et cohérence avec la distance de la montre (± max(``dist_tol_min_m``,
    ``dist_tol_frac``·km) — un parcours qui repasse au même endroit ne trompe pas la
    recherche). L'heure relevée est celle de l'approche la plus proche du premier passage
    dans le rayon (l'arrivée au point, pas l'entrée dans le rayon). Repli « closest » si
    l'approche la plus proche reste sous ``closest_max_m``, sinon « introuvable »."""
    t = np.asarray(t, dtype=float)
    dist_m = np.asarray(dist_m, dtype=float)
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    idx = np.arange(t.size)
    i_prev = 0
    out: list[dict] = []
    for km, la, lo in checkpoints:
        d = _dist_to_point(lat, lon, la, lo)
        tol = max(dist_tol_min_m, dist_tol_frac * km * 1000.0)
        ok = (np.abs(dist_m - km * 1000.0) <= tol) & (idx >= i_prev) & np.isfinite(d)
        hit = np.flatnonzero(ok & (d <= radius_m))
        if hit.size:
            # premier PASSAGE dans le rayon : on avance jusqu'à l'approche la plus proche de
            # ce passage (première seconde à ≤ 10 m du minimum), pas la première seconde
            # dans le rayon — sinon chaque passage est relevé radius/v secondes trop tôt
            entry = int(hit[0])
            run_end = entry
            while run_end + 1 < t.size and d[run_end + 1] <= radius_m:
                run_end += 1
            run = np.arange(entry, run_end + 1)
            near = run[d[run] <= float(np.min(d[run])) + 10.0]
            i, method = int(near[0]), "radius"
        else:
            window = np.flatnonzero(ok)
            i = int(window[np.argmin(d[window])]) if window.size else None
            method = "closest" if i is not None and d[i] <= closest_max_m else "introuvable"
        if i is None or method == "introuvable":
            out.append({"km": float(km), "t_s": None, "method": "introuvable",
                        "dist_m": None if i is None else round(float(d[i]))})
            continue
        out.append({"km": float(km), "t_s": float(t[i]), "method": method,
                    "dist_m": round(float(d[i]))})
        i_prev = i
    return out


def passages_for_activity(t, dist_m, lat, lon, course, *, radius_m: float = 150.0,
                          official_h: float | None = None) -> dict:
    """Passages d'une activité sur un parcours : heures depuis le passage de la ligne de
    départ (point 0), écart montre − officiel à l'arrivée."""
    coords = course.checkpoint_coords()
    names = [s.frm for s in course.segments] + [course.segments[-1].to]
    hits = match_checkpoints(t, dist_m, lat, lon, coords, radius_m=radius_m)
    t0 = hits[0]["t_s"] if hits and hits[0]["t_s"] is not None else 0.0
    cps = []
    for h, name in zip(hits, names):
        cps.append({"km": h["km"], "name": name,
                    "t_h": None if h["t_s"] is None else (h["t_s"] - t0) / 3600.0,
                    "method": h["method"], "dist_m": h["dist_m"]})
    finish_h = cps[-1]["t_h"] if cps else None
    return {
        "radius_m": float(radius_m),
        "watch_elapsed_h": float(t[-1]) / 3600.0 if len(t) else None,
        "official_time_h": official_h,
        "finish_h": finish_h,
        "finish_gap_min": (None if finish_h is None or official_h is None
                           else 60.0 * (finish_h - official_h)),
        "n_found": sum(1 for c in cps if c["t_h"] is not None),
        "checkpoints": cps,
    }


def race_activities(archive: Path, races: list[dict], *, progress=None) -> dict[int, dict]:
    """Une passe sur l'archive : pour chaque course, l'activité du jour (±1 j) dont la durée
    est la plus proche du temps officiel. Seuls t/dist/lat/lon des candidates sont gardés."""
    wanted: list[tuple[int, date, float | None]] = []
    for k, r in enumerate(races):
        try:
            wanted.append((k, date.fromisoformat(r["date"]),
                           None if r.get("dnf") else parse_time_h(r.get("official_time"))))
        except (KeyError, ValueError):
            continue
    best: dict[int, dict] = {}
    for act in iter_activities(archive, running_only=True, progress=progress):
        if act.start_time is None:
            continue
        d = act.start_time.date()
        hours = act.duration_s / 3600.0
        for k, rd, official in wanted:
            if abs((d - rd).days) > 1:
                continue
            score = (abs((d - rd).days), abs(hours - official) if official else -hours)
            if k not in best or score < best[k]["score"]:
                best[k] = {"score": score, "date": d.isoformat(), "hours": hours,
                           "t": act.t.copy(), "dist_m": act.dist_m.copy(),
                           "lat": act.lat.copy(), "lon": act.lon.copy()}
    return best


def run_manifest(manifest_path: Path, cfg, registre: dict, *, radius_m: float = 150.0,
                 progress=None) -> list[tuple[str, dict | None]]:
    base = manifest_path.resolve().parent
    man = json.loads(manifest_path.read_text(encoding="utf-8"))
    athlete, dev_set = man["athlete"], bool(man.get("dev_set", False))
    print(f"  {athlete} : recherche des activités de course dans l'archive…", file=sys.stderr)
    found = race_activities((base / man["archive"]).resolve(), man["races"], progress=progress)
    results: list[tuple[str, dict | None]] = []
    rows = registre.setdefault("entries", [])
    for k, r in enumerate(man["races"]):
        cand = found.get(k)
        if cand is None:
            print(f"  {athlete} · {r['name']} : aucune activité le {r['date']} (±1 j)",
                  file=sys.stderr)
            results.append((r["name"], None))
            continue
        race = (RaceSpec.from_json((base / r["race_json"]).resolve()) if r.get("race_json")
                else RaceSpec(name=r["name"]))
        course = build_course((base / r["gpx"]).resolve().read_bytes(), race, cfg)
        official = None if r.get("dnf") else parse_time_h(r.get("official_time"))
        pas = passages_for_activity(cand["t"], cand["dist_m"], cand["lat"], cand["lon"], course,
                                    radius_m=radius_m, official_h=official)
        pas["activity_date"] = cand["date"]
        key = (athlete, r["name"], r["date"])
        row = next((e for e in rows if (e.get("athlete"), e.get("race"), e.get("date")) == key),
                   None)
        if row is None:
            row = {"athlete": athlete, "dev_set": dev_set, "race": r["name"], "date": r["date"]}
            rows.append(row)
        row["passages"] = pas
        results.append((r["name"], pas))
    return results


def _hm(h: float | None) -> str:
    if h is None:
        return "—"
    return f"{int(h):d}h{int(round((h - int(h)) * 60)):02d}"


def render_markdown(athlete: str, results: list[tuple[str, dict | None]]) -> str:
    out: list[str] = []
    for name, pas in results:
        if pas is None:
            out.append(f"\n**{athlete} · {name}** : activité introuvable dans l'archive.")
            continue
        gap = pas["finish_gap_min"]
        gap_txt = "—" if gap is None else f"{gap:+.0f} min"
        out.append(f"\n**{athlete} · {name}** — activité du {pas['activity_date']}, montre "
                   f"{_hm(pas['watch_elapsed_h'])}, officiel {_hm(pas['official_time_h'])}, "
                   f"arrivée relevée {_hm(pas['finish_h'])} (écart {gap_txt}), "
                   f"{pas['n_found']}/{len(pas['checkpoints'])} points trouvés, "
                   f"rayon {pas['radius_m']:.0f} m\n")
        out.append("| km | point | passage | méthode | écart m |")
        out.append("|---|---|---|---|---|")
        for c in pas["checkpoints"]:
            out.append(f"| {c['km']:.1f} | {c['name']} | {_hm(c['t_h'])} | {c['method']} "
                       f"| {'—' if c['dist_m'] is None else c['dist_m']} |")
    return "\n".join(out)


def _progress(n: int, name: str) -> None:
    if n % 100 == 0:
        print(f"\r  décodage : {n} fichiers…", end="", file=sys.stderr, flush=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="passages", description=__doc__.split("\n")[0])
    ap.add_argument("manifests", nargs="+", help="manifeste(s) de backtest, un par athlète")
    ap.add_argument("--registre", default=str(DEFAULT_REGISTRE))
    ap.add_argument("--radius-m", type=float, default=150.0,
                    help="rayon de détection d'un passage (défaut 150 m)")
    ap.add_argument("--dry-run", action="store_true", help="n'écrit pas le registre")
    args = ap.parse_args(argv)

    cfg = load_config()
    reg_path = Path(args.registre)
    registre = (json.loads(reg_path.read_text(encoding="utf-8")) if reg_path.exists()
                else {"entries": []})
    for m in args.manifests:
        mp = Path(m)
        man = json.loads(mp.read_text(encoding="utf-8"))
        results = run_manifest(mp, cfg, registre, radius_m=args.radius_m, progress=_progress)
        print(file=sys.stderr)
        print(render_markdown(man["athlete"], results))
    if args.dry_run:
        print("\n(dry-run : registre non écrit)", file=sys.stderr)
        return 0
    reg_path.parent.mkdir(parents=True, exist_ok=True)
    reg_path.write_text(json.dumps(registre, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nRegistre mis à jour : {reg_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
