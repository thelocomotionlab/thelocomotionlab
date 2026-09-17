"""Rapport v3 : figures matplotlib (charte), rendu LaTeX (Ubuntu Sans, XeLaTeX + biber) et
livrables (feuille à emporter, ICS, GPX, annexe en ligne)."""

from __future__ import annotations

from .context import build_report_context
from .figures import generate_figures
from .livrables import LIVRABLES, write_livrables
from .render import (build_document, build_feuille, build_pdf, render_template,
                     render_tex)

__all__ = ["build_report_context", "generate_figures", "build_pdf", "build_feuille",
           "build_document", "render_tex", "render_template", "write_livrables",
           "LIVRABLES"]
