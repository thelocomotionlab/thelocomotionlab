"""Génère un SQUELETTE de manifeste de backtest depuis les traces d'un athlète.

Balaye ``_seed/cas_validation/<Athlète>/traces/*.gpx`` et écrit
``_seed/manifest-<athlète>.json`` avec une entrée par trace :

  * la DATE est devinée depuis la première balise ``<time>`` du GPX (export d'activité) —
    à VÉRIFIER ; sans balise, un espace réservé ``AAAA-MM-JJ`` à remplir ;
  * le TEMPS OFFICIEL est laissé vide : à remplir (``HH:MM:SS``) — ou ``"dnf": true`` ;
  * l'ARCHIVE pointe sur le DOSSIER ``archives/`` de l'athlète (l'ingestion sait fusionner
    plusieurs exports posés côte à côte) ;
  * ``dev_set`` vaut false (cas frais) — ``--dev-set`` pour un cas de développement.

Le script REFUSE d'écraser un manifeste existant (vos saisies à la main) : ``--force``
pour regénérer. Lancement, depuis services/twin-engine :

    PYTHONPATH=src python -m tools.make_manifest "Athlète" [--dev-set] [--force]

Puis : remplir dates/temps, et ``python -m tools.backtest _seed/manifest-<athlète>.json``.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parents[1]           # services/twin-engine
DEFAULT_BASE = ENGINE_ROOT / "_seed" / "cas_validation"
DEFAULT_OUT_DIR = ENGINE_ROOT / "_seed"
PLACEHOLDER_DATE = "AAAA-MM-JJ"


def _slug(name: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-") or "athlete"


def _pretty(stem: str) -> str:
    parts = re.split(r"[-_]+", stem.strip())
    return " ".join(p.capitalize() if p.isalpha() else p for p in parts if p)


def _gpx_first_date(path: Path) -> str | None:
    """Date de la première balise <time> (export d'activité = jour de course). Lecture
    partielle : les traces font parfois des Mo, la première balise arrive très tôt."""
    try:
        head = path.read_bytes()[:262_144].decode("utf-8", errors="ignore")
    except OSError:
        return None
    m = re.search(r"<time>\s*(\d{4}-\d{2}-\d{2})T", head)
    return m.group(1) if m else None


def _rel(target: Path, manifest_dir: Path) -> str:
    import os

    return Path(os.path.relpath(target, start=manifest_dir)).as_posix()


def build_manifest(athlete: str, base: Path, out_dir: Path, *, dev_set: bool) -> tuple[dict, list[str]]:
    """Construit le squelette + la liste des champs restant à remplir (avertissements)."""
    adir = base / athlete
    traces_dir = adir / "traces"
    if not traces_dir.is_dir():
        raise FileNotFoundError(f"dossier de traces introuvable : {traces_dir}")
    traces = sorted(p for p in traces_dir.iterdir()
                    if p.is_file() and p.suffix.lower() == ".gpx")
    if not traces:
        raise FileNotFoundError(f"aucune trace .gpx dans {traces_dir}")

    todo: list[str] = []
    archives_dir = adir / "archives"
    if archives_dir.is_dir() and any(archives_dir.iterdir()):
        archive = _rel(archives_dir, out_dir)
    else:
        archive = "A-REMPLIR/chemin/vers/archive.zip"
        todo.append(f"archive : rien trouvé dans {archives_dir} — renseigner le champ 'archive'")

    races = []
    for g in traces:
        date = _gpx_first_date(g)
        if date is None:
            todo.append(f"{g.name} : pas de balise <time> — remplir 'date' ({PLACEHOLDER_DATE})")
        races.append({
            "name": _pretty(g.stem),
            "date": date or PLACEHOLDER_DATE,
            "official_time": "",
            "gpx": _rel(g, out_dir),
        })
    races.sort(key=lambda r: (r["date"] == PLACEHOLDER_DATE, r["date"]))
    todo.append("remplir chaque 'official_time' (HH:MM:SS) — ou mettre \"dnf\": true")
    todo.append("VÉRIFIER les dates devinées depuis les GPX (la coupure = la veille de course)")

    return {"athlete": athlete, "archive": archive, "dev_set": dev_set, "races": races}, todo


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="make_manifest", description=__doc__.split("\n")[0])
    ap.add_argument("athlete", help="nom de l'athlète = nom du dossier sous cas_validation/")
    ap.add_argument("--base", default=str(DEFAULT_BASE),
                    help=f"racine des cas (défaut : {DEFAULT_BASE})")
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR),
                    help=f"dossier du manifeste généré (défaut : {DEFAULT_OUT_DIR})")
    ap.add_argument("--dev-set", action="store_true",
                    help="cas de DÉVELOPPEMENT (compté à part dans le registre)")
    ap.add_argument("--force", action="store_true", help="écraser un manifeste existant")
    args = ap.parse_args(argv)

    out_dir = Path(args.out_dir)
    out_path = out_dir / f"manifest-{_slug(args.athlete)}.json"
    if out_path.exists() and not args.force:
        print(f"{out_path} existe déjà (saisies à protéger) — utilise --force pour regénérer.",
              file=sys.stderr)
        return 2

    try:
        manifest, todo = build_manifest(args.athlete, Path(args.base), out_dir,
                                        dev_set=args.dev_set)
    except FileNotFoundError as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        return 2

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    print(f"Manifeste écrit : {out_path} ({len(manifest['races'])} course(s))", file=sys.stderr)
    for t in todo:
        print(f"  À FAIRE : {t}", file=sys.stderr)
    print(f"\nPuis :  PYTHONPATH=src python -m tools.backtest {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
