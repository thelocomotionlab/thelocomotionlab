"""Rendu du rapport : Jinja2 → main.tex → PDF (XeLaTeX + biber).

Réutilise le template embarqué (classe locomotionreport, police Ubuntu). Le rendu se
fait dans un dossier de travail isolé (cls/math/bib/fonts/assets/figures copiés à côté
de main.tex), conformément au besoin du `Path=fonts/` relatif de la classe.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

_LATEX_DIR = Path(__file__).parent / "latex"
_TEMPLATE_SUPPORT = ("locomotionreport.cls", "math.tex", "references.bib")


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


def render_tex(context: dict) -> str:
    """Rend le template en source LaTeX (sans compiler) — utile pour les tests."""
    return _jinja_env().get_template("report.tex.j2").render(**context)


def _run(cmd: list[str], cwd: Path, *, check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        tail = "\n".join((proc.stdout or "").splitlines()[-25:])
        raise RuntimeError(f"Échec {' '.join(cmd)} (code {proc.returncode}) :\n{tail}")
    return proc


def build_pdf(context: dict, figures_dir: str | Path, work_dir: str | Path) -> Path:
    """Compile le rapport en PDF dans ``work_dir`` ; renvoie le chemin du PDF."""
    work_dir = Path(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    tpl = _LATEX_DIR / "template"

    for name in _TEMPLATE_SUPPORT:
        shutil.copy(tpl / name, work_dir / name)
    shutil.copytree(tpl / "fonts", work_dir / "fonts", dirs_exist_ok=True)
    shutil.copytree(tpl / "assets", work_dir / "assets", dirs_exist_ok=True)

    fig_dst = work_dir / "figures"
    fig_dst.mkdir(exist_ok=True)
    for png in Path(figures_dir).glob("*.png"):
        shutil.copy(png, fig_dst / png.name)

    (work_dir / "main.tex").write_text(render_tex(context), encoding="utf-8")

    # XeLaTeX → biber → XeLaTeX ×2 (références + table des matières stables)
    xelatex = ["xelatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex"]
    _run(xelatex, work_dir)
    _run(["biber", "main"], work_dir, check=False)  # biber ne doit pas bloquer si pas de \cite
    _run(xelatex, work_dir)
    _run(xelatex, work_dir)

    pdf = work_dir / "main.pdf"
    if not pdf.exists():
        raise RuntimeError("compilation LaTeX terminée mais main.pdf absent")
    return pdf


__all__ = ["render_tex", "build_pdf"]
