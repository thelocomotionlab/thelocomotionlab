"""Rendu des documents LaTeX du rapport v2 : Jinja2 → .tex → PDF (XeLaTeX, biber pour le
rapport). Trois gabarits, un même dossier de travail : ``report.tex.j2`` (le rapport, six
pages), ``fiche_assistance.tex.j2`` (la fiche détachable) et ``bracelet.tex.j2`` (la bande à
découper). Classe, polices, logos et figures sont copiés à côté du .tex — la classe charge ses
polices en chemin relatif (``Path=fonts/``)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

_LATEX_DIR = Path(__file__).parent / "latex"
_TEMPLATE_SUPPORT = ("locomotionreport.cls", "math.tex", "references.bib")
REPORT_TEMPLATE = "report.tex.j2"
FICHE_TEMPLATE = "fiche_assistance.tex.j2"
BRACELET_TEMPLATE = "bracelet.tex.j2"


def _jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(_LATEX_DIR)),
        block_start_string="<%",
        block_end_string="%>",
        variable_start_string="<<",
        variable_end_string=">>",
        comment_start_string="<#",
        comment_end_string="#>",
        trim_blocks=True,
        lstrip_blocks=True,
        autoescape=False,
        undefined=StrictUndefined,
    )


def render_template(template: str, context: dict) -> str:
    """Rend un gabarit en source LaTeX (sans compiler)."""
    return _jinja_env().get_template(template).render(**context)


def render_tex(context: dict) -> str:
    """Le rapport en source LaTeX (sans compiler) — utile pour les tests."""
    return render_template(REPORT_TEMPLATE, context)


def _run(cmd: list[str], cwd: Path, *, check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        tail = "\n".join((proc.stdout or "").splitlines()[-25:])
        raise RuntimeError(f"Échec {' '.join(cmd)} (code {proc.returncode}) :\n{tail}")
    return proc


def prepare_workdir(work_dir: str | Path, figures_dir: str | Path | None = None) -> Path:
    """Le dossier de travail d'une compilation : classe, math, bib, polices, logos, figures."""
    work_dir = Path(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    tpl = _LATEX_DIR / "template"
    for name in _TEMPLATE_SUPPORT:
        shutil.copy(tpl / name, work_dir / name)
    shutil.copytree(tpl / "fonts", work_dir / "fonts", dirs_exist_ok=True)
    shutil.copytree(tpl / "assets", work_dir / "assets", dirs_exist_ok=True)
    if figures_dir is not None:
        fig_dst = work_dir / "figures"
        fig_dst.mkdir(exist_ok=True)
        for png in Path(figures_dir).glob("*.png"):
            shutil.copy(png, fig_dst / png.name)
    return work_dir


def build_document(template: str, context: dict, work_dir: str | Path, *, name: str,
                   figures_dir: str | Path | None = None, biber: bool = False,
                   passes: int = 2) -> Path:
    """Compile un gabarit en ``<work_dir>/<name>.pdf`` ; ``biber`` pour le rapport (références),
    deux passes pour les documents sans bibliographie (TikZ « remember picture »)."""
    work_dir = prepare_workdir(work_dir, figures_dir)
    (work_dir / f"{name}.tex").write_text(render_template(template, context), encoding="utf-8")
    xelatex = ["xelatex", "-interaction=nonstopmode", "-halt-on-error", f"{name}.tex"]
    _run(xelatex, work_dir)
    if biber:
        _run(["biber", name], work_dir, check=False)  # biber ne doit pas bloquer sans \cite
    for _ in range(max(passes - 1, 1)):
        _run(xelatex, work_dir)
    pdf = work_dir / f"{name}.pdf"
    if not pdf.exists():
        raise RuntimeError(f"compilation LaTeX terminée mais {name}.pdf absent")
    return pdf


def build_pdf(context: dict, figures_dir: str | Path, work_dir: str | Path) -> Path:
    """Compile le rapport en PDF dans ``work_dir`` (main.pdf) ; renvoie le chemin du PDF."""
    return build_document(REPORT_TEMPLATE, context, work_dir, name="main",
                          figures_dir=figures_dir, biber=True, passes=3)


__all__ = ["render_template", "render_tex", "prepare_workdir", "build_document", "build_pdf",
           "REPORT_TEMPLATE", "FICHE_TEMPLATE", "BRACELET_TEMPLATE"]
