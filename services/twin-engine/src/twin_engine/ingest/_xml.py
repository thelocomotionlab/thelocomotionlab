"""Aides XML tolérantes aux espaces de noms (pour les adaptateurs .tcx / .gpx).

Les exports réels varient dans leurs déclarations de namespace ; on raisonne donc
sur le **nom local** des balises (``{ns}Trackpoint`` → ``Trackpoint``) plutôt que sur
le tag qualifié.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from xml.etree.ElementTree import Element


def localname(tag: str) -> str:
    """``{http://…}Trackpoint`` → ``Trackpoint``."""
    return tag.rsplit("}", 1)[-1]


def child(el: Element, name: str) -> Element | None:
    """Premier enfant DIRECT de nom local ``name``."""
    for c in el:
        if localname(c.tag) == name:
            return c
    return None


def descendant(el: Element, name: str) -> Element | None:
    """Premier descendant (profondeur quelconque) de nom local ``name``."""
    for c in el.iter():
        if c is not el and localname(c.tag) == name:
            return c
    return None


def text_of(el: Element | None) -> str | None:
    return el.text.strip() if (el is not None and el.text) else None


def parse_iso_time(s: str | None) -> datetime | None:
    """Parse un horodatage ISO-8601 (``…Z`` ou offset), tolérant aux fractions longues."""
    if not s:
        return None
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        s2 = re.sub(r"(\.\d{6})\d+", r"\1", s)  # tronque > 6 décimales
        try:
            dt = datetime.fromisoformat(s2)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


__all__ = ["localname", "child", "descendant", "text_of", "parse_iso_time"]
