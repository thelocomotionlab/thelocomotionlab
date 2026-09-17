"""Variante claire du signe de la marque, pour les fonds colorés (bandeau d'en-tête).

Le signe du site est monochrome terracotta sur fond transparent ; sur le bandeau sauge il
disparaîtrait. On garde la forme (le canal alpha) et on force la couleur à blanc — aucune
retouche à la main, aucun second fichier à maintenir.

    PYTHONPATH=src python -m tools.white_mark
"""

from __future__ import annotations

from pathlib import Path

import matplotlib.image as mpimg
import numpy as np

TEMPLATE = Path(__file__).resolve().parents[1] / "src" / "twin_engine" / "report" / "latex" / "template"
SOURCE = TEMPLATE / "assets" / "logo-mark-512.png"
TARGET = TEMPLATE / "assets" / "logo-mark-512-blanc.png"


def main() -> int:
    rgba = mpimg.imread(SOURCE)
    if rgba.ndim != 3 or rgba.shape[2] != 4:
        raise SystemExit(f"{SOURCE.name} n'est pas une image RGBA")
    out = np.empty_like(rgba)
    out[..., :3] = 1.0          # blanc
    out[..., 3] = rgba[..., 3]  # la forme est dans l'alpha
    mpimg.imsave(TARGET, out)
    print(f"écrit {TARGET.relative_to(TEMPLATE.parents[4])}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
