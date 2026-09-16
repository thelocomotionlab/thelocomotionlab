"""Instances statiques d'Ubuntu Sans pour le rapport (XeLaTeX + fontspec).

La charte (packages/ui) sert Ubuntu Sans en police VARIABLE (300 → 800). fontspec sait
charger une police variable, mais pas choisir une graisse arbitraire par fichier de façon
reproductible d'une TeX Live à l'autre : le rapport embarque donc des instances STATIQUES,
produites ici depuis la police variable avec ``fontTools.varLib.instancer``, puis réduites
au latin étendu et à la ponctuation typographique (``fontTools.subset``) pour tenir dans le
dépôt et dans l'image Docker.

    PYTHONPATH=src python -m tools.instance_fonts [--source DOSSIER] [--out DOSSIER]

``--source`` : dossier contenant ``UbuntuSans[wdth,wght].ttf`` et
``UbuntuSans-Italic[wdth,wght].ttf`` (paquet Debian ``fonts-ubuntu`` :
/usr/share/fonts/truetype/ubuntu). ``--out`` : dossier des instances (défaut : le dossier
``fonts/`` du gabarit). Les fichiers produits sont committés : l'outil ne sert qu'à les
régénérer (nouvelle version de la police, nouvelle graisse).
"""

from __future__ import annotations

import argparse
import io
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FAMILY = "Ubuntu Sans"
# graisses servies par la classe LaTeX : (suffixe PostScript, wght, italique)
INSTANCES = (
    ("Light", 300, False),
    ("Regular", 400, False),
    ("Medium", 500, False),
    ("SemiBold", 600, False),
    ("Bold", 700, False),
    ("ExtraBold", 800, False),
    ("Italic", 400, True),
    ("BoldItalic", 700, True),
)
# latin de base et étendu, ponctuation générale (guillemets, tirets, points de suspension),
# symboles monétaires, flèches, opérateurs (±, ×, ≈, ≤, ≥), espaces insécables
UNICODES = "U+0000-024F,U+02C6-02DC,U+2000-206F,U+20A0-20CF,U+2190-2199,U+2200-22FF,U+00B0,U+2030,U+2122"
DEFAULT_SOURCE = Path("/usr/share/fonts/truetype/ubuntu")
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "src" / "twin_engine" / "report" / "latex" / "template" / "fonts"


def _instance(vf_path: Path, style: str, wght: int) -> TTFont:
    vf = TTFont(vf_path)
    try:
        inst = instancer.instantiateVariableFont(vf, {"wght": wght, "wdth": 100}, updateFontNames=True)
    except Exception:  # position sans instance nommée : on nomme à la main
        inst = instancer.instantiateVariableFont(TTFont(vf_path), {"wght": wght, "wdth": 100})
    name = inst["name"]
    ps = f"UbuntuSans-{style}"
    name.setName(FAMILY, 1, 3, 1, 0x409)
    name.setName(style, 2, 3, 1, 0x409)
    name.setName(f"{FAMILY} {style}", 4, 3, 1, 0x409)
    name.setName(ps, 6, 3, 1, 0x409)
    name.setName(FAMILY, 16, 3, 1, 0x409)
    name.setName(style, 17, 3, 1, 0x409)
    return inst


def _subset(font: TTFont) -> TTFont:
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    src = TTFont(buf)
    options = subset.Options()
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.layout_features = ["*"]           # tnum, lnum, liga, kern… tous conservés
    options.notdef_outline = True
    options.recalc_bounds = True
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(src)
    return src


def build(source: Path, out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for style, wght, italic in INSTANCES:
        vf = source / ("UbuntuSans-Italic[wdth,wght].ttf" if italic else "UbuntuSans[wdth,wght].ttf")
        font = _subset(_instance(vf, style, wght))
        path = out / f"UbuntuSans-{style}.ttf"
        font.save(path)
        written.append(path)
    return written


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args(argv)
    for p in build(args.source, args.out):
        print(f"{p.name:<28} {p.stat().st_size / 1024:6.0f} Ko")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
