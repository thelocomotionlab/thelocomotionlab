"""Rendu des documents LaTeX du rapport v3 : Jinja2 → .tex → PDF (XeLaTeX, biber pour le
rapport). Deux gabarits, un même dossier de travail : ``report.tex.j2`` (le rapport, trois
pages) et ``feuille.tex.j2`` (la feuille à emporter, A4 paysage recto-verso, détachable).
Classe, polices, marque et figures sont copiés à côté du .tex — la classe charge ses polices
en chemin relatif (``Path=fonts/``)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

_LATEX_DIR = Path(__file__).parent / "latex"
_TEMPLATE_SUPPORT = ("locomotionreport.cls", "math.tex", "references.bib")
REPORT_TEMPLATE = "report.tex.j2"
FEUILLE_TEMPLATE = "feuille.tex.j2"
FICHES_TEMPLATE = "fiches.tex.j2"


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


# Fichiers auxiliaires que LaTeX RELIT au démarrage : un reste de compilation précédente y
# référence des macros du gabarit d'alors, et la passe suivante meurt sur « Undefined control
# sequence » dans le .aux — une erreur qui accuse le document neuf pour un vestige de l'ancien.
_AUX_SUFFIXES = (".aux", ".bbl", ".bcf", ".blg", ".log", ".out", ".run.xml", ".toc",
                 ".lof", ".lot", ".synctex.gz")


def clean_aux(work_dir: Path, name: str) -> None:
    """Efface les auxiliaires de ``name`` dans ``work_dir`` (dossier de sortie réutilisé)."""
    for suffix in _AUX_SUFFIXES:
        (work_dir / f"{name}{suffix}").unlink(missing_ok=True)


def build_document(template: str, context: dict, work_dir: str | Path, *, name: str,
                   figures_dir: str | Path | None = None, biber: bool = False,
                   passes: int = 2) -> Path:
    """Compile un gabarit en ``<work_dir>/<name>.pdf`` ; ``biber`` pour le rapport (références),
    deux passes pour les documents sans bibliographie (TikZ « remember picture »)."""
    work_dir = prepare_workdir(work_dir, figures_dir)
    clean_aux(work_dir, name)
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


def build_feuille(context: dict, figures_dir: str | Path, work_dir: str | Path) -> Path:
    """Compile la feuille à emporter (deux pages A4 paysage) ; renvoie le chemin du PDF."""
    return build_document(FEUILLE_TEMPLATE, context, work_dir, name="feuille",
                          figures_dir=figures_dir, passes=2)


def build_fiches(context: dict, figures_dir: str | Path, work_dir: str | Path) -> Path:
    """Compile la planche de fiches d'assistance (A4 portrait, une fiche par poste).

    Document à part et non troisième page de la feuille : celle-ci est en paysage, et une
    orientation ne se change pas en cours de document sans casser la géométrie des deux
    premières pages.
    """
    return build_document(FICHES_TEMPLATE, context, work_dir, name="fiches",
                          figures_dir=figures_dir, passes=2)


__all__ = ["render_template", "render_tex", "prepare_workdir", "clean_aux", "build_document",
           "build_pdf", "build_feuille", "build_fiches", "REPORT_TEMPLATE", "FEUILLE_TEMPLATE",
           "FICHES_TEMPLATE"]
