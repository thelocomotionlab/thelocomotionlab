#!/usr/bin/env python3
"""
build_plot.py — Génère un JSON Plotly à partir d'un dossier source.

Convention :
    plots-src/<nom-figure>/
        data.csv        (ou data.tsv, data.txt, data.xlsx, data.ods)
        spec.json       Plotly spec avec des références @colonne et un
                        bloc optionnel "_derived" pour colonnes calculées.

Sortie :
    public/data/plots/<nom-figure>.json

Usage :
    python scripts/build_plot.py plots-src/km-2026/
    python scripts/build_plot.py plots-src/*/         # toutes les figures
    python scripts/build_plot.py plots-src/km-2026/ --out custom/dir/

Dépendances :
    pip install pandas openpyxl odfpy

Références dans spec.json :
    "@colonne"          → liste des valeurs de la colonne (devient un tableau JSON)
    "@@colonne.mean"    → scalaire (moyenne, sum, median, min, max, std)

Colonnes dérivées (calculées à partir des colonnes du CSV) :
    "_derived": {
      "mean_km":   { "agg": "mean",  "of": "km" },    # colonne constante = moyenne
      "cum_km":    { "agg": "cumsum","of": "km" },    # cumulé
      "diff_km":   { "agg": "diff",  "of": "km" },    # différence successive
      "roll_km":   { "agg": "rolling","of": "km", "window": 4 }
    }
    Une fois dérivée, une colonne devient référençable par @nom dans le spec.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

try:
    import pandas as pd
    import numpy as np
except ImportError:
    sys.stderr.write(
        "Erreur : pandas et numpy requis.\n"
        "    pip install pandas openpyxl odfpy\n"
    )
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "public" / "data" / "plots"

# Agrégateurs disponibles pour _derived et @@col.agg
SCALAR_AGGS = {
    "mean": lambda s: float(s.mean()),
    "median": lambda s: float(s.median()),
    "sum": lambda s: float(s.sum()),
    "min": lambda s: float(s.min()),
    "max": lambda s: float(s.max()),
    "std": lambda s: float(s.std()),
    "count": lambda s: int(s.count()),
}

SERIES_AGGS = {
    "cumsum": lambda s, **_: s.cumsum(),
    "diff": lambda s, **_: s.diff(),
    "rolling": lambda s, window=3, **_: s.rolling(window=window, min_periods=1).mean(),
    "pct_change": lambda s, **_: s.pct_change(),
}


# ──────────────────────────────────────────────────────────────────────
# Chargement données
# ──────────────────────────────────────────────────────────────────────

def load_data(folder: Path) -> pd.DataFrame:
    candidates = [
        ("data.csv", lambda p: pd.read_csv(p)),
        ("data.tsv", lambda p: pd.read_csv(p, sep="\t")),
        ("data.txt", lambda p: pd.read_csv(p, sep=None, engine="python")),
        ("data.xlsx", lambda p: pd.read_excel(p)),
        ("data.ods", lambda p: pd.read_excel(p, engine="odf")),
    ]
    for name, reader in candidates:
        f = folder / name
        if f.exists():
            return reader(f)
    raise FileNotFoundError(
        f"Aucun fichier de données dans {folder} "
        f"(attendu : data.csv / .tsv / .txt / .xlsx / .ods)"
    )


# ──────────────────────────────────────────────────────────────────────
# Colonnes dérivées
# ──────────────────────────────────────────────────────────────────────

def apply_derived(df: pd.DataFrame, derived: dict) -> pd.DataFrame:
    for name, rule in derived.items():
        agg = rule.get("agg")
        of = rule.get("of")
        if of not in df.columns:
            raise ValueError(f"_derived[{name}] : colonne '{of}' inconnue. "
                             f"Disponibles : {list(df.columns)}")
        series = df[of]
        if agg in SCALAR_AGGS:
            value = SCALAR_AGGS[agg](series.dropna())
            if "round" in rule:
                value = round(value, int(rule["round"]))
            length = rule.get("length", len(df))
            df[name] = [value] * length
        elif agg in SERIES_AGGS:
            kwargs = {k: v for k, v in rule.items() if k not in ("agg", "of")}
            df[name] = SERIES_AGGS[agg](series, **kwargs)
        else:
            valid = list(SCALAR_AGGS) + list(SERIES_AGGS)
            raise ValueError(f"_derived[{name}] : agrégateur '{agg}' inconnu. "
                             f"Valides : {valid}")
    return df


# ──────────────────────────────────────────────────────────────────────
# Résolution des références @col et @@col.agg
# ──────────────────────────────────────────────────────────────────────

def _clean_value(v):
    """Convertit np.* → types Python natifs et NaN → None pour JSON."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if hasattr(v, "item"):
        try:
            v = v.item()
        except (ValueError, AttributeError):
            pass
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def resolve_column_ref(ref: str, df: pd.DataFrame):
    """@col → liste, @@col.agg → scalaire."""
    if ref.startswith("@@"):
        body = ref[2:]
        if "." not in body:
            raise ValueError(f"Référence scalaire mal formée : '{ref}'. "
                             f"Attendu @@colonne.agrégateur")
        col, agg = body.rsplit(".", 1)
        if col not in df.columns:
            raise ValueError(f"Colonne '{col}' inconnue (réf {ref}). "
                             f"Disponibles : {list(df.columns)}")
        if agg not in SCALAR_AGGS:
            raise ValueError(f"Agrégateur '{agg}' inconnu (réf {ref}). "
                             f"Valides : {list(SCALAR_AGGS)}")
        return SCALAR_AGGS[agg](df[col].dropna())
    # @col → liste
    col = ref[1:]
    if col not in df.columns:
        raise ValueError(f"Colonne '{col}' inconnue (réf {ref}). "
                         f"Disponibles : {list(df.columns)}")
    return [_clean_value(v) for v in df[col].tolist()]


def resolve(node: Any, df: pd.DataFrame):
    if isinstance(node, dict):
        return {k: resolve(v, df) for k, v in node.items()}
    if isinstance(node, list):
        return [resolve(v, df) for v in node]
    if isinstance(node, str) and node.startswith("@"):
        return resolve_column_ref(node, df)
    return node


# ──────────────────────────────────────────────────────────────────────
# Build
# ──────────────────────────────────────────────────────────────────────

def build(folder: Path, out_dir: Path) -> Path:
    spec_file = folder / "spec.json"
    if not spec_file.exists():
        raise FileNotFoundError(f"Manque spec.json dans {folder}")

    with spec_file.open(encoding="utf-8") as f:
        spec = json.load(f)

    df = load_data(folder)
    derived = spec.pop("_derived", {})
    if derived:
        df = apply_derived(df, derived)

    resolved = resolve(spec, df)

    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{folder.name}.json"
    with out.open("w", encoding="utf-8") as f:
        json.dump(resolved, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return out


def main():
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "folders",
        nargs="+",
        type=Path,
        help="Dossiers source (ex : plots-src/km-2026/)",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Dossier de sortie (défaut : {DEFAULT_OUT.relative_to(ROOT)})",
    )
    args = p.parse_args()

    failures = 0
    for folder in args.folders:
        folder = folder.resolve()
        if not folder.is_dir():
            sys.stderr.write(f"× {folder} : pas un dossier\n")
            failures += 1
            continue
        try:
            out = build(folder, args.out)
            try:
                display = out.relative_to(ROOT)
            except ValueError:
                display = out
            print(f"✓ {display}")
        except Exception as e:
            sys.stderr.write(f"× {folder.name} : {e}\n")
            failures += 1

    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
