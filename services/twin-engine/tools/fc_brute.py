"""La fréquence cardiaque est-elle dans les fichiers bruts d'une archive ?

Lecture indépendante des adaptateurs du produit : les fichiers d'activité sont découverts
comme le produit les découvre (dossier, ``.zip``, ``.gz``, export Strava), puis la FC est
cherchée là où un fabricant peut la ranger — toute balise XML dont le nom local évoque le
cœur point par point (``hr``, ``heartrate``, ``HeartRateBpm``, ``pulse``…, hors moyennes et
maximums de tour), tout champ FIT d'enregistrement au nom cardiaque (``heart_rate``, champs
développeur) — et comparée à ce que l'adaptateur du produit (``twin_engine.ingest``) en tire.

* **brute, lue** : rien à faire ;
* **brute, non lue** : la FC est dans le fichier et le moteur la rate — adaptateur à corriger ;
* **ni brute ni lue** : la FC n'a jamais été enregistrée, ou elle a été perdue à l'export.

Les fichiers sont nommés ``activity-NNNNN`` comme à l'ingestion : aucun nom d'origine n'est
écrit.

    PYTHONPATH=src python -m tools.fc_brute <archive.zip|dossier> [--out fc.md]
"""

from __future__ import annotations

import argparse
import io
import posixpath
import re
import sys
import warnings
from collections import Counter
from pathlib import Path

import numpy as np

from twin_engine.ingest.archive import decompress_gz, is_gzip, strip_gz
from twin_engine.ingest.registry import _prepare, _safe_name, parse_bytes
from twin_engine.ingest.walker import walk_activity_files

_BALISE = re.compile(rb"<(?:[A-Za-z_][\w.\-]*:)?([A-Za-z_][\w.\-]*)[\s>/]")
_CARDIAQUE = re.compile(r"^(hr|bpm|pulse|heartrate|heart_rate)$|heart", re.IGNORECASE)
# résumés de tour ou de séance : pas une FC point par point
_RESUME = re.compile(r"^(average|avg|maximum|max|minimum|min|resting|rest|zone|lthr|total)",
                     re.IGNORECASE)
_CREATEUR = re.compile(rb'creator\s*=\s*"([^"]*)"')


def _cardiaque(nom: str) -> bool:
    return bool(_CARDIAQUE.search(nom)) and not _RESUME.search(nom)


def _xml(data: bytes) -> tuple[set[str], str | None]:
    """Noms locaux des balises cardiaques point par point, et créateur déclaré (GPX)."""
    noms = {m.group(1).decode("ascii", "replace") for m in _BALISE.finditer(data)}
    c = _CREATEUR.search(data[:4000])
    return {n for n in noms if _cardiaque(n)}, (c.group(1).decode("utf-8", "replace") if c else None)


def _fit(data: bytes) -> tuple[set[str], str | None]:
    """Champs cardiaques renseignés des enregistrements FIT, et fabricant déclaré."""
    import fitdecode

    noms: set[str] = set()
    fabricant = None
    kw = {"check_crc": fitdecode.CrcCheck.DISABLED} if hasattr(fitdecode, "CrcCheck") else {}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with fitdecode.FitReader(io.BytesIO(data), **kw) as reader:
            for frame in reader:
                if not isinstance(frame, fitdecode.FitDataMessage):
                    continue
                if frame.name == "file_id" and fabricant is None:
                    v = next((f.value for f in frame.fields if f.name == "manufacturer"), None)
                    fabricant = None if v is None else str(v)
                elif frame.name == "record":
                    noms |= {f.name for f in frame.fields
                             if f.name and f.value is not None and _cardiaque(f.name)}
                    if noms:
                        break
    return noms, fabricant


def _lue(act) -> bool:
    hr = np.asarray(getattr(act, "hr", None) if getattr(act, "hr", None) is not None else [], dtype=float)
    return bool(hr.size and np.isfinite(hr).any() and np.nanmax(hr) > 0)


def analyser(chemin: Path) -> dict:
    """Comptes par format : fichiers, course à pied, FC brute, FC lue, brute non lue."""
    source, carte_sport, perimetre = _prepare(Path(chemin))
    par_format: dict[str, Counter] = {}
    balises: Counter = Counter()
    origines: Counter = Counter()
    exemples: list[str] = []
    for idx, (orig, data) in enumerate(walk_activity_files(source, path_filter=perimetre), start=1):
        nom = _safe_name(orig, idx)
        brut = decompress_gz(data) if is_gzip(nom) else data
        fmt = strip_gz(nom).rsplit(".", 1)[-1].lower()
        c = par_format.setdefault(fmt, Counter())
        c["fichiers"] += 1
        try:
            noms, origine = _fit(brut) if fmt == "fit" else _xml(brut) if fmt in ("gpx", "tcx") else (set(), None)
        except Exception:  # noqa: BLE001 — un fichier illisible se compte, il n'arrête rien
            c["illisibles"] += 1
            continue
        try:
            act = parse_bytes(data, nom, sport_hint=carte_sport.get(posixpath.basename(orig)))
        except Exception:  # noqa: BLE001
            act = None
        course = act is not None and act.is_running
        lue = act is not None and _lue(act)
        c["course à pied"] += course
        c["FC brute"] += bool(noms)
        c["FC lue"] += lue
        if noms and not lue and act is not None:
            c["brute non lue"] += 1
            if len(exemples) < 10:
                exemples.append(f"{nom} ({', '.join(sorted(noms))})")
        if course:
            c["course : FC brute"] += bool(noms)
            c["course : FC lue"] += lue
        balises.update(noms)
        if origine:
            origines[origine] += 1
    return {"par_format": par_format, "balises": balises, "origines": origines, "exemples": exemples}


def rapport(r: dict) -> str:
    tot = sum((c for c in r["par_format"].values()), Counter())
    cols = ("fichiers", "course à pied", "FC brute", "FC lue", "brute non lue",
            "course : FC brute", "course : FC lue", "illisibles")
    out = ["**La FC dans les fichiers bruts** (lecture indépendante du moteur)", "",
           "| format | " + " | ".join(cols) + " |", "|---|" + "---|" * len(cols)]
    for fmt, c in sorted(r["par_format"].items()):
        out.append(f"| {fmt} | " + " | ".join(str(c[k]) for k in cols) + " |")
    out.append("| **total** | " + " | ".join(str(tot[k]) for k in cols) + " |")
    out += ["", "Balises ou champs cardiaques rencontrés : "
            + (", ".join(f"{n} ({k})" for n, k in r["balises"].most_common()) or "aucun"),
            "", "Créateurs (GPX) ou fabricants (FIT) déclarés : "
            + (", ".join(f"{n} ({k})" for n, k in r["origines"].most_common(12)) or "aucun")]
    if r["exemples"]:
        out += ["", "Fichiers dont la FC brute n'est pas lue : " + " ; ".join(r["exemples"])]
    if tot["brute non lue"]:
        verdict = (f"la FC est dans {tot['brute non lue']} fichier(s) et le moteur ne la lit pas : "
                   "l'adaptateur est à corriger.")
    elif not tot["FC brute"]:
        verdict = ("aucune FC dans les fichiers : elle n'a pas été enregistrée, ou elle a été perdue "
                   "à l'export.")
    else:
        verdict = "la FC est lue partout où elle est dans les fichiers."
    out += ["", f"**Verdict** : {verdict}"]
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="fc_brute", description=__doc__.split("\n")[0])
    ap.add_argument("archive", help="archive (.zip) ou dossier d'activités")
    ap.add_argument("--out", help="écrit le markdown à ce chemin (sinon stdout)")
    args = ap.parse_args(argv)
    chemin = Path(args.archive)
    if not chemin.exists():
        print(f"{chemin} introuvable", file=sys.stderr)
        return 2
    md = rapport(analyser(chemin))
    if args.out:
        Path(args.out).write_text(md + "\n", encoding="utf-8")
        print(f"Écrit : {args.out}", file=sys.stderr)
    else:
        print(md)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
