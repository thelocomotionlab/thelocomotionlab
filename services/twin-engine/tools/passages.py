"""Heures de passage RÉELLES aux points de contrôle des courses passées.

La matière pour scorer le PLAN, pas seulement l'arrivée. Pour chaque course d'un manifeste :
l'activité du jour de course est retrouvée dans l'archive, le parcours est construit
exactement comme au banc (spec de course, ou découpage automatique en mode GPX-only) et
l'heure de passage à chaque point de découpage est relevée par PROXIMITÉ monotone : premier
échantillon à moins de ``--radius-m`` du point, après le point précédent et cohérent avec la
distance de la montre ; à défaut, l'approche la plus proche, signalée comme telle. Un point
jamais approché est consigné « introuvable » — rien n'est inventé.

Une course absente de l'archive (exportée avant elle) se lit dans son fichier, désigné par
le manifeste : ``"activite": "chemin/vers/la-course.gpx"`` dans l'entrée de la course.

Consigné dans ``docs/twin-registre/passages.json`` (clé athlète/course/date), commun à
tous les runs qui rejouent la course et à son entrée servie. Agrégats seulement : des heures
à des km publics.

    PYTHONPATH=src python -m tools.passages manifest-a.json [manifest-b.json …]
        [--depot <dossier>] [--radius-m 150] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta, timezone
from pathlib import Path

import numpy as np

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.ingest import iter_activities

from twin_engine.registre import DEFAULT_RACINE, Depot

from tools.backtest import hint_missing_archive, parse_time_h

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
                          official_h: float | None = None, cadence=None, gap=None,
                          cfg=None, alt=None) -> dict:
    """Passages d'une activité sur un parcours : heures depuis le passage de la ligne de
    départ (point 0), écart montre − officiel à l'arrivée. Avec ``cfg``, chaque tronçon entre
    deux points trouvés porte en plus son mouvement, ses arrêts et, si la cadence est là, ses
    minutes de marche (définitions ``twin.terrain_*``) ; avec l'altitude ``alt``, son temps
    et sa marche en descente (fenêtres du détecteur)."""
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
    out = {
        "radius_m": float(radius_m),
        "watch_elapsed_h": float(t[-1]) / 3600.0 if len(t) else None,
        "official_time_h": official_h,
        "finish_h": finish_h,
        "finish_gap_min": (None if finish_h is None or official_h is None
                           else 60.0 * (finish_h - official_h)),
        "n_found": sum(1 for c in cps if c["t_h"] is not None),
        "checkpoints": cps,
    }
    if cfg is not None:
        out.update(_mouvement_par_troncon(np.asarray(t, dtype=float), dist_m, gap, cadence,
                                          hits, names, cfg, alt=alt))
    return out


def _mouvement_par_troncon(t, dist_m, gap, cadence, hits, names, cfg, *, alt=None) -> dict:
    """Mouvement, arrêts et marche entre deux points de passage trouvés (arrivée à arrivée :
    l'arrêt à un ravitaillement compte dans le tronçon qui en repart, comme dans le plan) ;
    descente et marche en descente avec l'altitude."""
    from twin_engine.twin.descentes import secondes_en_descente
    from twin_engine.twin.mouvement import bilan_par_troncon

    bornes = [None if h["t_s"] is None else int(np.clip(np.searchsorted(t, h["t_s"]), 0, len(t) - 1))
              for h in hits]
    descente = None if alt is None else secondes_en_descente(dist_m, alt, gap, cfg)
    bilans = bilan_par_troncon(dist_m, gap, cadence, bornes, cfg, descente=descente)
    segments = [None if b is None else {"de": names[k], "a": names[k + 1],
                                        **{c: (None if v is None else round(v, 4))
                                           for c, v in b.items()}}
                for k, b in enumerate(bilans)]
    complets = [s for s in segments if s is not None]

    def _somme(cle):
        vals = [s[cle] for s in complets]
        return None if not vals or any(v is None for v in vals) else round(float(sum(vals)), 4)

    tw = cfg.twin
    sommes = {"segments": segments, "mouvement_h": _somme("mouvement_h"),
              "arrets_h": _somme("arrets_h"), "marche_h": _somme("marche_h")}
    if descente is not None:
        sommes["marche_descente_h"] = _somme("marche_descente_h")
    return {
        **sommes,
        "definitions": {"vitesse_ms": tw.terrain_moving_ms, "trou_max_s": tw.terrain_gap_max_s,
                        "arret_min_s": tw.terrain_stop_min_s,
                        "cadence_course_spm": tw.terrain_run_cadence_spm},
    }


class PassageCollector:
    """Retient, AU PASSAGE d'un flux d'activités, la meilleure candidate de chaque course
    (jour de course ± 1 j, durée la plus proche du temps officiel) : seuls t/dist/lat/lon
    des candidates survivent."""

    def __init__(self, races: list[dict]) -> None:
        self.wanted: list[tuple[int, date, float | None]] = []
        for k, r in enumerate(races):
            try:
                self.wanted.append((k, date.fromisoformat(r["date"]),
                                    None if r.get("dnf") else parse_time_h(r.get("official_time"))))
            except (KeyError, ValueError):
                continue
        self.best: dict[int, dict] = {}

    def see(self, act) -> None:
        if act.start_time is None:
            return
        d = act.start_time.date()
        hours = act.duration_s / 3600.0
        for k, rd, official in self.wanted:
            if abs((d - rd).days) > 1:
                continue
            # une sortie d'une heure le matin d'un 5 h n'est pas la course (cas réel :
            # Chota 2025, 0 h 56 retenue pour 4 h 56) — entre la moitié et 1,5 × l'officiel
            if official and not (0.5 * official <= hours <= 1.5 * official):
                continue
            score = (abs((d - rd).days), abs(hours - official) if official else -hours)
            if k not in self.best or score < self.best[k]["score"]:
                self.best[k] = _candidate(act, score)

    def fichiers(self, races: list[dict], base: Path) -> None:
        """Une course dont le manifeste désigne le fichier (``"activite"``, chemin relatif au
        manifeste) se lit dans ce fichier : il prime sur l'archive, et son sport n'est pas
        filtré — le manifeste dit que c'est la course."""
        for k, r in enumerate(races):
            if not r.get("activite"):
                continue
            chemin = (base / r["activite"]).resolve()
            acts = ([a for a in iter_activities(chemin) if a.start_time is not None]
                    if chemin.exists() else [])
            if not acts:
                print(f"  {r['name']} : fichier de course introuvable ou illisible — {chemin}",
                      file=sys.stderr)
                continue
            act = max(acts, key=lambda a: a.duration_s)
            self.best[k] = _candidate(act, (-1, 0.0))


def _candidate(act, score) -> dict:
    """Ce que les passages gardent d'une activité : la grille et ses canaux, rien d'autre."""
    return {"score": score, "date": act.start_time.date().isoformat(),
            "hours": act.duration_s / 3600.0, "start_time": act.start_time,
            "t": act.t.copy(), "dist_m": act.dist_m.copy(),
            "dist_device_m": np.asarray(act.dist_device_m).copy(),
            "lat": act.lat.copy(), "lon": act.lon.copy(),
            "alt_m": np.asarray(act.alt_m).copy(),
            "cadence_spm": np.asarray(act.cadence_spm).copy(),
            "gap_s": np.asarray(act.gap_s).copy()}


def race_meta_from_candidate(cand: dict | None) -> dict | None:
    """Calendrier d'une course lu dans l'activité du jour : départ en heure locale du fuseau
    solaire de la longitude, position médiane. None sans candidate, position ou départ."""
    if cand is None or cand.get("start_time") is None:
        return None
    lat, lon = np.asarray(cand["lat"], dtype=float), np.asarray(cand["lon"], dtype=float)
    ok = np.isfinite(lat) & np.isfinite(lon)
    if not ok.any():
        return None
    la, lo = float(np.median(lat[ok])), float(np.median(lon[ok]))
    tz = float(round(lo / 15.0))
    start_local = cand["start_time"].astimezone(timezone(timedelta(hours=tz)))
    return {"start_local": start_local, "lat": la, "lon": lo, "tz": tz}


def race_activities(archive: Path, races: list[dict], *, progress=None,
                    base: Path | None = None) -> dict[int, dict]:
    """Une passe sur l'archive : la meilleure candidate de chaque course (cf. PassageCollector),
    puis les fichiers de course désignés par le manifeste (relatifs à ``base``)."""
    collector = PassageCollector(races)
    for act in iter_activities(archive, running_only=True, progress=progress):
        collector.see(act)
    if base is not None:
        collector.fichiers(races, base)
    return collector.best


def passages_for_manifest(found: dict[int, dict], man: dict, base: Path, cfg,
                          *, radius_m: float = 150.0) -> list[tuple[str, dict | None]]:
    """Des candidates aux passages : parcours construit comme au banc, une ligne par course
    du manifeste (``None`` quand l'activité du jour est introuvable)."""
    athlete = man["athlete"]
    results: list[tuple[str, dict | None]] = []
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
        dist = cand["dist_m"]
        device = cand.get("dist_device_m")
        if (cfg.twin.gpx_distance == "device" and device is not None
                and np.isfinite(device).any()):
            dist = device
        pas = passages_for_activity(cand["t"], dist, cand["lat"], cand["lon"], course,
                                    radius_m=radius_m, official_h=official,
                                    cadence=cand.get("cadence_spm"), gap=cand.get("gap_s"),
                                    cfg=cfg, alt=cand.get("alt_m"))
        pas["activity_date"] = cand["date"]
        results.append((r["name"], pas))
    return results


def lignes_de_passages(man: dict, results: list[tuple[str, dict | None]]):
    """Les passages trouvés, prêts pour ``Depot.ecrire_passages``."""
    dates = {r["name"]: r["date"] for r in man["races"]}
    return [(man["athlete"], name, dates[name], pas) for name, pas in results if pas is not None]


def run_manifest(manifest_path: Path, cfg, *, radius_m: float = 150.0,
                 progress=None) -> list[tuple[str, dict | None]] | None:
    """Toutes les courses d'un manifeste ; ``None`` si l'archive est introuvable (signalé)."""
    base = manifest_path.resolve().parent
    man = json.loads(manifest_path.read_text(encoding="utf-8"))
    athlete = man["athlete"]
    archive = (base / man["archive"]).resolve()
    if not archive.exists():
        print(f"  {athlete} : ARCHIVE INTROUVABLE — {archive}\n{hint_missing_archive(archive)}",
              file=sys.stderr)
        return None
    print(f"  {athlete} : recherche des activités de course dans l'archive…", file=sys.stderr)
    found = race_activities(archive, man["races"], progress=progress, base=base)
    return passages_for_manifest(found, man, base, cfg, radius_m=radius_m)


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
        segs = pas.get("segments")
        if segs is None:
            out.append("| km | point | passage | méthode | écart m |")
            out.append("|---|---|---|---|---|")
            for c in pas["checkpoints"]:
                out.append(f"| {c['km']:.1f} | {c['name']} | {_hm(c['t_h'])} | {c['method']} "
                           f"| {'—' if c['dist_m'] is None else c['dist_m']} |")
            continue
        out.append("| km | point | passage | méthode | écart m | mouvement | arrêts | marche |")
        out.append("|---|---|---|---|---|---|---|---|")
        for k, c in enumerate(pas["checkpoints"]):
            seg = segs[k - 1] if k > 0 else None
            cells = (["—", "—", "—"] if seg is None else
                     [_hm(seg["mouvement_h"]), _hm(seg["arrets_h"]), _hm(seg["marche_h"])])
            out.append(f"| {c['km']:.1f} | {c['name']} | {_hm(c['t_h'])} | {c['method']} "
                       f"| {'—' if c['dist_m'] is None else c['dist_m']} | " + " | ".join(cells) + " |")
        out.append(f"\nMouvement {_hm(pas.get('mouvement_h'))} · arrêts {_hm(pas.get('arrets_h'))}"
                   f" · marche {_hm(pas.get('marche_h'))} (entre le premier et le dernier point trouvés).")
    return "\n".join(out)


def _progress(n: int, name: str) -> None:
    if n % 100 == 0:
        print(f"\r  décodage : {n} fichiers…", end="", file=sys.stderr, flush=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="passages", description=__doc__.split("\n")[0])
    ap.add_argument("manifests", nargs="+", help="manifeste(s) de backtest, un par athlète")
    ap.add_argument("--depot", default=str(DEFAULT_RACINE))
    ap.add_argument("--radius-m", type=float, default=150.0,
                    help="rayon de détection d'un passage (défaut 150 m)")
    ap.add_argument("--dry-run", action="store_true", help="n'écrit pas les passages")
    args = ap.parse_args(argv)

    cfg = load_config()
    depot = Depot(args.depot)
    missing: list[str] = []
    lignes = []
    for m in args.manifests:
        mp = Path(m)
        man = json.loads(mp.read_text(encoding="utf-8"))
        results = run_manifest(mp, cfg, radius_m=args.radius_m, progress=_progress)
        print(file=sys.stderr)
        if results is None:
            missing.append(man["athlete"])
            continue
        print(render_markdown(man["athlete"], results))
        lignes += lignes_de_passages(man, results)
    if args.dry_run:
        print("\n(dry-run : passages non écrits)", file=sys.stderr)
        return 1 if missing else 0
    if lignes:
        depot.ecrire_passages(lignes)
        print(f"\nPassages écrits : {depot.racine / 'passages.json'} ({len(lignes)} course(s))",
              file=sys.stderr)
    if missing:
        print(f"\n⚠ {len(missing)} manifeste(s) ignoré(s), archive introuvable : "
              + ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
