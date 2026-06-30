"""Rapport : figures matplotlib (charte) + rendu LaTeX (Ubuntu, XeLaTeX + biber)."""

from __future__ import annotations

from .context import build_report_context
from .figures import generate_figures
from .render import build_pdf, render_tex

__all__ = ["build_report_context", "generate_figures", "build_pdf", "render_tex"]
