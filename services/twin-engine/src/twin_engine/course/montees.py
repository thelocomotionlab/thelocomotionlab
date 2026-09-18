"""Les montées du parcours : où elles sont, ce qu'elles pèsent, comment on les appelle.

Un coureur ne lit pas un parcours en mètres de D+ cumulés mais en montées : « trois KV, dont
un dans les vingt derniers kilomètres ». Ce module découpe le profil en montées continues —
une descente courte ne coupe pas une montée —, les classe en kilomètres verticaux et donne
les pentes moyennes du parcours.

Rien n'est déclaré ici : tout se lit sur le profil traité (``CourseProfile``), la même grille
horizontale que celle qui sert au Deq.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

# Une montée n'est retenue qu'au-delà de ce dénivelé (sous 250 m, c'est une bosse, pas une
# montée qu'on raconte), et une descente doit dépasser la tolérance pour la couper en deux.
MIN_DPLUS_M = 250.0
TOLERANCE_M = 40.0

# Le kilomètre vertical se compte par demi : 1 demi-KV, 2 un KV, 3 un KV et demi, 4 un double.
KV_M = 1000.0
_LABELS = {1: "demi-KV", 2: "KV", 3: "KV et demi", 4: "double KV"}


@dataclass(frozen=True)
class Montee:
    index: int
    from_km: float
    to_km: float
    length_km: float          # longueur horizontale de la montée
    dplus_m: float
    alt_start_m: float
    alt_top_m: float
    grade_pct: float          # pente moyenne de la montée
    half_kv: int              # dénivelé arrondi au demi-KV (2 = un KV)
    label: str

    def to_dict(self) -> dict:
        return asdict(self)


def classe_kv(dplus_m: float) -> tuple[int, str]:
    """(nombre de demi-KV, son nom). 500 m → « demi-KV », 1 000 → « KV », 2 000 → « double KV ».

    Au-delà du double KV, le nom devient le compte : « 2,5 KV », « 3 KV ».
    """
    half = int(round(max(float(dplus_m), 0.0) / (KV_M / 2.0)))
    if half in _LABELS:
        return half, _LABELS[half]
    kv = half / 2.0
    return half, f"{kv:.1f}".replace(".0", "").replace(".", ",") + " KV"


def montees(course, *, min_dplus_m: float = MIN_DPLUS_M,
            tolerance_m: float = TOLERANCE_M) -> list[Montee]:
    """Les montées continues du parcours, dans l'ordre.

    Marche à hystérésis sur l'altitude lissée : tant qu'on n'est pas redescendu de plus de
    ``tolerance_m`` sous le point haut, on est toujours dans la même montée. Un replat ou un
    faux plat descendant ne coupe donc pas un col en deux montées qui ne veulent rien dire.
    """
    alt = np.asarray(course.alt_smooth_m, float)
    off = np.asarray(course.off_km_grid, float)
    x_m = np.asarray(course.x_m, float)
    if alt.size < 2:
        return []

    bornes: list[tuple[int, int]] = []
    i_bas, monte = 0, True
    i_ext, alt_ext = 0, alt[0]
    for i in range(1, alt.size):
        a = alt[i]
        if monte:
            if a >= alt_ext:
                i_ext, alt_ext = i, a
            elif alt_ext - a >= tolerance_m:        # la descente est franche : la montée est finie
                bornes.append((i_bas, i_ext))
                i_bas, monte, i_ext, alt_ext = i_ext, False, i, a
        else:
            if a <= alt_ext:
                i_ext, alt_ext = i, a
            elif a - alt_ext >= tolerance_m:        # ça remonte pour de bon
                i_bas, monte, i_ext, alt_ext = i_ext, True, i, a
    if monte:
        bornes.append((i_bas, i_ext))

    out: list[Montee] = []
    for i0, i1 in bornes:
        dplus = float(alt[i1] - alt[i0])
        if dplus < min_dplus_m or i1 <= i0:
            continue
        horiz_m = float(x_m[i1] - x_m[i0])
        half, label = classe_kv(dplus)
        out.append(Montee(
            index=len(out) + 1,
            from_km=float(off[i0]), to_km=float(off[i1]),
            length_km=horiz_m / 1000.0, dplus_m=dplus,
            alt_start_m=float(alt[i0]), alt_top_m=float(alt[i1]),
            grade_pct=100.0 * dplus / horiz_m if horiz_m > 0 else 0.0,
            half_kv=half, label=label,
        ))
    return out


def pentes(course, *, plat_pct: float = 1.0) -> dict:
    """Les pentes moyennes du parcours : en montée, en descente, et la part de chacune.

    Une « pente moyenne » sur une boucle vaut zéro et ne dit rien ; ce qui se lit, c'est la
    pente moyenne QUAND ça monte, celle quand ça descend, et le temps passé dans chacune —
    ici en part de distance horizontale.
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


def compte_par_classe(liste: list[Montee]) -> list[dict]:
    """Les classes présentes, de la plus dure à la plus douce : [{half_kv, label, n}]."""
    compte: dict[int, list] = {}
    for m in liste:
        compte.setdefault(m.half_kv, [m.label, 0])[1] += 1
    return [{"half_kv": k, "label": v[0], "n": v[1]}
            for k, v in sorted(compte.items(), reverse=True)]


__all__ = ["Montee", "classe_kv", "compte_par_classe", "montees", "pentes"]
