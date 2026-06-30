"""Formatage francophone pour le rapport LaTeX (nombres, durées, échappement)."""

from __future__ import annotations


def fr(x: float | int | None, decimals: int = 0) -> str:
    """Nombre à la française : décimale = virgule, pas de séparateur de milliers."""
    if x is None:
        return "—"
    s = f"{x:.{decimals}f}"
    return s.replace(".", ",")


def fr_thousands(x: float | int | None, decimals: int = 0) -> str:
    """Comme :func:`fr` mais avec espace fine insécable LaTeX aux milliers (pour la prose)."""
    if x is None:
        return "—"
    neg = x < 0
    s = f"{abs(x):.{decimals}f}"
    intpart, _, frac = s.partition(".")
    groups = []
    while len(intpart) > 3:
        groups.insert(0, intpart[-3:])
        intpart = intpart[:-3]
    groups.insert(0, intpart)
    out = "\\,".join(groups)
    if frac:
        out += "," + frac
    return ("-" if neg else "") + out


def hm(hours: float | None) -> str:
    """Durée en heures → « 30\\,h\\,24 »."""
    if hours is None:
        return "—"
    h = int(hours)
    m = round((hours - h) * 60)
    if m == 60:
        h += 1
        m = 0
    return f"{h}\\,h\\,{m:02d}"


_TEX_SPECIAL = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def tex_escape(s: str | None) -> str:
    """Échappe les caractères spéciaux LaTeX d'une chaîne (noms, titres saisis)."""
    if s is None:
        return ""
    return "".join(_TEX_SPECIAL.get(c, c) for c in str(s))


__all__ = ["fr", "fr_thousands", "hm", "tex_escape"]
