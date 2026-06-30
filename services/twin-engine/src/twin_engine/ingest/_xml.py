"""Aides XML tolérantes aux espaces de noms (pour les adaptateurs .tcx / .gpx).

Les exports réels varient dans leurs déclarations de namespace ; on raisonne donc
sur le **nom local** des balises (``{ns}Trackpoint`` → ``Trackpoint``) plutôt que sur
le tag qualifié.
"""

from __future__ import annotations

from xml.etree.ElementTree import Element

from .._dt import parse_iso as parse_iso_time  # noqa: F401 (ré-exporté pour les adaptateurs)


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


__all__ = ["localname", "child", "descendant", "text_of", "parse_iso_time"]
