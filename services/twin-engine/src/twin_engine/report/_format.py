"""Formatage francophone pour le rapport LaTeX (nombres, durées, dates, échappement)."""

from __future__ import annotations

from datetime import datetime

_JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
_MOIS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def french_datetime(dt: datetime) -> str:
    """``vendredi 25 septembre 2026 à 13h00`` (jour en minuscule, format FR)."""
    return f"{_JOURS[dt.weekday()]} {dt.day} {_MOIS[dt.month - 1]} {dt.year} à {dt.hour}h{dt.minute:02d}"


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


_DETEX_ACCENTS = {
    "\\'e": "é", "\\`e": "è", "\\^e": "ê", '\\"e': "ë",
    "\\`a": "à", "\\^a": "â", "\\^i": "î", '\\"i': "ï", "\\^o": "ô", "\\^u": "û",
    "\\`u": "ù", '\\"u': "ü", "\\c{c}": "ç", "\\c c": "ç", "\\'E": "É", "\\`A": "À",
    "\\^E": "Ê", "\\^I": "Î", "\\^O": "Ô",
}


def detex(s: str | None) -> str:
    """Le texte d'une phrase du rapport rendu lisible hors LaTeX (annexe en ligne, ICS) :
    accents composés, gras/italique dégroupés, guillemets français, espaces fines, échappements."""
    import re

    if not s:
        return ""
    out = str(s)
    for k, v in _DETEX_ACCENTS.items():
        out = out.replace(k, v)
    out = out.replace("\\og~", "« ").replace("~\\fg\\", " »").replace("~\\fg", " »")
    out = out.replace("\\og ", "« ").replace("\\fg", "»")
    out = re.sub(r"\\(?:textbf|emph|textit|textsc|mathrm)\{([^{}]*)\}", r"\1", out)
    out = re.sub(r"\\(?:textbf|emph|textit)\{([^{}]*)\}", r"\1", out)   # imbrication simple
    out = out.replace("\\,", "\u202f").replace("~", "\u00a0").replace("\\ ", " ")
    out = out.replace("$-$", "−").replace("$\\approx$", "≈").replace("$\\pm$", "±")
    out = out.replace("\\%", "%").replace("\\&", "&").replace("\\_", "_").replace("\\#", "#")
    out = out.replace("\\textperiodcentered{}", "·").replace("\\textperiodcentered", "·")
    out = out.replace("\\textbackslash{}", "\\").replace("\\Deq", "Deq").replace("\\VC", "VC")
    out = out.replace("{", "").replace("}", "").replace("$", "")
    out = re.sub(r"\\\\(\[[^\]]*\])?", " ", out)
    return re.sub(r"[ \t]+", " ", out).strip()


def courses_sur(pct: float | int | str) -> str:
    """Une probabilité dite en courses : 50 → « une course sur deux », 80 → « quatre courses
    sur cinq », 90 → « neuf courses sur dix » ; sinon le pourcentage en clair. Accepte un
    nombre déjà formaté à la française (« 50 », « 79,5 »), ce que servent les contextes."""
    try:
        value = float(str(pct).replace(",", ".").replace("\u202f", "").replace("\\,", ""))
    except ValueError:
        return str(pct)
    table = {50: "une course sur deux", 66: "deux courses sur trois", 67: "deux courses sur trois",
             75: "trois courses sur quatre", 80: "quatre courses sur cinq",
             90: "neuf courses sur dix", 95: "dix-neuf courses sur vingt"}
    return table.get(int(round(value)), f"{fr(value, 0)} % des courses")


__all__ = ["fr", "fr_thousands", "hm", "tex_escape", "detex", "courses_sur"]
