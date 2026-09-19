"""Les montées et les descentes continues d'un parcours, et ses pentes moyennes.

Un coureur lit un parcours par morceaux : « la grosse montée du début », « la descente sur
Isola ». Ce module les découpe — une marche à hystérésis sur l'altitude lissée : tant qu'on
n'est pas reparti dans l'autre sens de plus de ``TOLERANCE_M``, on est toujours dans le même
morceau — et rend leurs bornes, leur dénivelé et leur pente.

**Aucune nomenclature.** Ce module ne nomme ni ne classe : il mesure. Ce qu'on en fait (la
plus grosse montée, la plus grosse descente) se décide ailleurs, sur les chiffres.

Tout se lit sur le profil traité (``CourseProfile``), la même grille horizontale que le Deq.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

# Un morceau n'est retenu qu'au-delà de ce dénivelé, et il faut repartir de plus que la
# tolérance dans l'autre sens pour le couper en deux.
MIN_DENIVELE_M = 250.0
TOLERANCE_M = 40.0


@dataclass(frozen=True)
class Section:
    """Un morceau continu du parcours, montée ou descente."""

    index: int
    from_km: float
    to_km: float
    length_km: float          # longueur horizontale
    denivele_m: float         # dénivelé du morceau, toujours positif
    alt_start_m: float
    alt_end_m: float
    grade_pct: float          # pente moyenne, signée (négative en descente)

    def to_dict(self) -> dict:
        return asdict(self)


def bornes(alt: np.ndarray, tolerance_m: float) -> tuple[list, list]:
    """(bornes des montées, bornes des descentes) en indices de grille.

    La règle est la même pour un parcours et pour une activité passée : c'est ce qui rend la
    comparaison « cette descente contre la tienne » honnête.
    """
    if alt.size < 2:
        return [], []
    montees: list[tuple[int, int]] = []
    descentes: list[tuple[int, int]] = []
    i_ref, monte = 0, True
    i_ext, alt_ext = 0, alt[0]
    for i in range(1, alt.size):
        a = alt[i]
        if monte:
            if a >= alt_ext:
                i_ext, alt_ext = i, a
            elif alt_ext - a >= tolerance_m:        # ça redescend pour de bon
                montees.append((i_ref, i_ext))
                i_ref, monte, i_ext, alt_ext = i_ext, False, i, a
        else:
            if a <= alt_ext:
                i_ext, alt_ext = i, a
            elif a - alt_ext >= tolerance_m:        # ça remonte pour de bon
                descentes.append((i_ref, i_ext))
                i_ref, monte, i_ext, alt_ext = i_ext, True, i, a
    (montees if monte else descentes).append((i_ref, i_ext))
    return montees, descentes


def _sections(course, indices, *, min_denivele_m: float) -> list[Section]:
    alt = np.asarray(course.alt_smooth_m, float)
    off = np.asarray(course.off_km_grid, float)
    x_m = np.asarray(course.x_m, float)
    out: list[Section] = []
    for i0, i1 in indices:
        if i1 <= i0:
            continue
        denivele = abs(float(alt[i1] - alt[i0]))
        if denivele < min_denivele_m:
            continue
        horiz_m = float(x_m[i1] - x_m[i0])
        signe = 1.0 if alt[i1] >= alt[i0] else -1.0
        out.append(Section(
            index=len(out) + 1,
            from_km=float(off[i0]), to_km=float(off[i1]),
            length_km=horiz_m / 1000.0, denivele_m=denivele,
            alt_start_m=float(alt[i0]), alt_end_m=float(alt[i1]),
            grade_pct=signe * 100.0 * denivele / horiz_m if horiz_m > 0 else 0.0,
        ))
    return out


def montees(course, *, min_denivele_m: float = MIN_DENIVELE_M,
            tolerance_m: float = TOLERANCE_M) -> list[Section]:
    """Les montées continues du parcours, dans l'ordre."""
    haut, _ = bornes(np.asarray(course.alt_smooth_m, float), tolerance_m)
    return _sections(course, haut, min_denivele_m=min_denivele_m)


def descentes(course, *, min_denivele_m: float = MIN_DENIVELE_M,
              tolerance_m: float = TOLERANCE_M) -> list[Section]:
    """Les descentes continues du parcours, dans l'ordre."""
    _, bas = bornes(np.asarray(course.alt_smooth_m, float), tolerance_m)
    return _sections(course, bas, min_denivele_m=min_denivele_m)


def pentes(course, *, plat_pct: float) -> dict:
    """Les pentes moyennes du parcours : en montée, en descente, et la part de chacune.

    Une « pente moyenne » sur une boucle vaut zéro et ne dit rien ; ce qui se lit, c'est la
    pente moyenne QUAND ça monte, celle quand ça descend, et la part de distance horizontale
    de chacune. ``plat_pct`` est le seuil qui sépare les trois — il se déclare, il ne se
    devine pas.
    """
    g = np.asarray(course.grade, float) * 100.0
    if g.size == 0:
        return {"up_pct": 0.0, "down_pct": 0.0, "part_up_pct": 0.0,
                "part_down_pct": 0.0, "part_flat_pct": 0.0}
    up, down = g > plat_pct, g < -plat_pct
    n = float(g.size)
    return {
        "up_pct": float(g[up].mean()) if up.any() else 0.0,
        "down_pct": float(g[down].mean()) if down.any() else 0.0,
        "part_up_pct": 100.0 * float(up.sum()) / n,
        "part_down_pct": 100.0 * float(down.sum()) / n,
        "part_flat_pct": 100.0 * float((~up & ~down).sum()) / n,
    }


__all__ = ["MIN_DENIVELE_M", "TOLERANCE_M", "Section", "bornes", "descentes", "montees",
           "pentes"]
