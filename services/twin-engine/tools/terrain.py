"""Les traits de terrain d'un athlète face à une course : ce que son archive disait, et ce que
le fichier de la course montre, sous les mêmes définitions (``twin.descentes``).

    # traits de l'archive à la veille de la course (registre, dernier run du banc), face au
    # fichier de la montre de la course
    PYTHONPATH=src python -m tools.terrain --activite course.gpx --athlete Val \\
        --course "Nice 100M 2026" --date 2026-09-25 [--run ID] [--depot <dossier>]
    # sans registre : l'archive décodée sur place, coupée la veille (long sur une grosse archive)
    PYTHONPATH=src python -m tools.terrain --activite course.gpx --archive <archive> --until 2026-09-24
    # le registre seul : les traits de chaque entrée d'un run
    PYTHONPATH=src python -m tools.terrain [--run ID]

Les traits d'une course seule se lisent sur cette seule activité : ses descentes fraîches et
fatiguées, sa pénalité de marche, sa fatigue de descente. Agrégats seulement.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from twin_engine.config import load_config, override_config
from twin_engine.registre import DEFAULT_RACINE, Depot
from twin_engine.twin.descentes import traits_terrain


def _f(v, nd=2) -> str:
    return "—" if v is None else f"{v:.{nd}f}"


def traits_de_l_activite(chemin: Path, cfg) -> dict | None:
    """Les traits mesurés sur une seule activité (le fichier d'une course)."""
    from twin_engine.ingest import iter_activities
    from twin_engine.twin.record import process_activity_full

    acts = [a for a in iter_activities(chemin) if a.n > 1]
    if not acts:
        return None
    act = max(acts, key=lambda a: a.duration_s)
    summary = process_activity_full(act, cfg)[0]
    return traits_terrain([summary], cfg)


def traits_de_l_archive(archive: Path, until: date | None, cfg) -> dict | None:
    """Les traits de l'archive décodée, activités datées jusqu'au ``until`` inclus."""
    from twin_engine.ingest import iter_activities
    from twin_engine.twin.record import process_activity_full

    resumes = []
    for act in iter_activities(archive, running_only=True):
        if until is not None and (act.start_time is None or act.start_time.date() > until):
            continue
        resumes.append(process_activity_full(act, cfg)[0])
    return traits_terrain(resumes, cfg)


def _colonnes(titres: list[str], traits: list[dict | None]) -> list[str]:
    """Tableau markdown, une colonne par jeu de traits."""
    out = ["| | " + " | ".join(titres) + " |", "|---|" + "---|" * len(titres)]

    def ligne(nom, f):
        out.append(f"| {nom} | " + " | ".join(f(t) if t else "—" for t in traits) + " |")

    ligne("activités résumées", lambda t: str(t["n_activites"]))
    ligne("unités de cadence à la source", lambda t: ", ".join(f"{k} {v}" for k, v in t["unites"].items()))
    ligne("heures de descente (≤ −8 %)", lambda t: _f(t["heures_descente"], 1))
    n_cls = max((len(t["vitesses"]) for t in traits if t), default=0)
    for i in range(n_cls):
        for etat in ("frais", "fatigue"):
            for allure in ("courable", "hache"):
                def _v(t, i=i, etat=etat, allure=allure):
                    v = t["vitesses"][i]
                    return f"{_f(v[f'{etat}_{allure}_kmh'], 2)} ({_f(v[f'{etat}_{allure}_h'], 1)} h)"
                pente = next(t for t in traits if t)["vitesses"][i]["pente"]
                ligne(f"v {etat} {allure}, pente ]{100 * pente[0]:.0f} ; {100 * pente[1]:.0f}] %, km/h", _v)
    for etat in ("frais", "fatigue"):
        ligne(f"pénalité de marche, {etat} (brut / servi / heures)",
              lambda t, etat=etat: "{} / {} / {}".format(
                  _f(t["penalite_marche"][etat]["brut"], 3), _f(t["penalite_marche"][etat]["valeur"], 3),
                  _f(t["penalite_marche"][etat]["heures"], 1)))
    for nom in ("absolue", "relative"):
        ligne(f"fatigue de descente {nom}, ln v par km de D− (brut / servi / heures)",
              lambda t, nom=nom: "{} / {} / {}".format(
                  _f(t["fatigue_descente"][nom]["brut"], 4), _f(t["fatigue_descente"][nom]["valeur"], 4),
                  _f(t["fatigue_descente"][nom]["heures"], 1)))
    ligne("seuil de cadence personnel, pas/min (marche · course)",
          lambda t: "—" if not t["seuil_cadence"] else "{} ({} · {}), {} % du mouvement entre les seuils".format(
              t["seuil_cadence"]["seuil_spm"], t["seuil_cadence"]["marche_spm"],
              t["seuil_cadence"]["course_spm"], _f(100 * t["seuil_cadence"]["part_entre_les_seuils"], 1)))
    ligne("marche en descente : logit par km de D− · nuit",
          lambda t: "—" if not t["marche"] else f"{_f(t['marche']['dminus_par_km'], 3)} · "
                                                  f"{_f(t['marche']['nuit'], 3)}")
    return out


def _du_registre(depot: Depot, run: str | None, athlete: str, course: str | None,
                 jour: str | None) -> dict | None:
    from tools.registre import charger

    entrees, _ = charger(depot, livre_="banc", run=run)
    for e in entrees:
        if e.get("athlete") != athlete:
            continue
        if course and e.get("race") != course:
            continue
        if jour and e.get("date") != jour:
            continue
        t = (e.get("model") or {}).get("terrain")
        if t:
            return t
    return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="terrain", description=__doc__.split("\n")[0])
    ap.add_argument("--activite", help="fichier de la montre d'une course")
    ap.add_argument("--athlete", help="pseudonyme (traits de l'archive lus au registre)")
    ap.add_argument("--course", help="nom de la course au registre")
    ap.add_argument("--date", help="date de la course au registre, AAAA-MM-JJ")
    ap.add_argument("--archive", help="archive décodée sur place, au lieu du registre")
    ap.add_argument("--until", help="coupure de l'archive, AAAA-MM-JJ (inclus)")
    ap.add_argument("--depot", default=str(DEFAULT_RACINE))
    ap.add_argument("--run", help="run du livre banc (défaut : le dernier)")
    ap.add_argument("--set", action="append", default=[], metavar="BLOC.CLÉ=VALEUR")
    ap.add_argument("--json", action="store_true", help="les traits en JSON")
    args = ap.parse_args(argv)
    cfg = load_config()
    try:
        for spec in args.set:
            cfg = override_config(cfg, spec)
    except ValueError as exc:
        print(f"--set : {exc}", file=sys.stderr)
        return 2

    if not args.activite:
        from tools.registre import charger

        entrees, entete = charger(Depot(args.depot), livre_="banc", run=args.run)
        lignes = [(e["athlete"], e["race"], e["date"], (e.get("model") or {}).get("terrain"))
                  for e in entrees]
        if args.json:
            print(json.dumps([{"athlete": a, "race": r, "date": d, "terrain": t}
                              for a, r, d, t in lignes], ensure_ascii=False, indent=2))
            return 0
        avec = [x for x in lignes if x[3]]
        if not avec:
            print("Aucune entrée du run ne porte de traits de terrain.", file=sys.stderr)
            return 1
        print("\n".join(_colonnes([f"{a} · {r} ({d})" for a, r, d, _ in avec], [t for *_, t in avec])))
        return 0

    course = traits_de_l_activite(Path(args.activite), cfg)
    if course is None:
        print(f"{args.activite} : aucune activité lisible avec cadence et altitude", file=sys.stderr)
        return 1
    archive = None
    if args.archive:
        until = date.fromisoformat(args.until) if args.until else None
        archive = traits_de_l_archive(Path(args.archive), until, cfg)
    elif args.athlete:
        archive = _du_registre(Depot(args.depot), args.run, args.athlete, args.course, args.date)
        if archive is None:
            print(f"{args.athlete} : aucune entrée du run avec des traits de terrain "
                  f"({args.course or 'toutes courses'})", file=sys.stderr)
    if args.json:
        print(json.dumps({"archive": archive, "course": course}, ensure_ascii=False, indent=2))
        return 0
    titres, jeux = ["course"], [course]
    if archive is not None:
        titres, jeux = ["archive", "course"], [archive, course]
    print("\n".join(_colonnes(titres, jeux)))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
