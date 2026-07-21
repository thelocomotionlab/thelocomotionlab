"""Fiche participant·e des ateliers : JSON → Jinja2 → XeLaTeX → PDF.

Même chaîne que le rapport Twin (classe ``locomotionreport``, polices et
logos du template partagés), mais un environnement Jinja distinct : les
délimiteurs ``\\VAR{}``/``\\BLOCK{}`` préfixés d'une contre-oblique ne
peuvent pas entrer en collision avec du LaTeX, et TOUTE variable est
échappée par défaut (``finalize``) — chaque champ libre saisi par un tiers
est une surface d'injection.

Le contenu volatil (consignes de sécurité, questions de santé) arrive DANS
le payload : la page web du site est la source unique, le PDF la suit sans
modification de ce module. L'empreinte SHA-256 scelle les données soumises
(pas le PDF, qui la contient).
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

_FICHE_DIR = Path(__file__).parent
_TEMPLATE_NAME = "fiche_participant.tex.j2"
_REPORT_TEMPLATE = Path(__file__).parent.parent / "report" / "latex" / "template"

# --- Échappement LaTeX -------------------------------------------------------

_LATEX_MAP = {
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
    "<": r"\textless{}",
    ">": r"\textgreater{}",
}
_LATEX_RE = re.compile("|".join(re.escape(k) for k in _LATEX_MAP))


class RawLatex(str):
    """Balisage LaTeX déjà sûr (``coche()``) — ne passe jamais par l'échappement.

    Sans ce marqueur, ``finalize`` échapperait aussi la sortie de ``coche()``
    (``\\LLcoche`` → ``\\textbackslash{}LLcoche``) et casserait les cases.
    """


def latex_escape(value: object) -> str:
    if isinstance(value, RawLatex):
        return str(value)
    if value is None:
        return ""
    if isinstance(value, bool):
        return "oui" if value else "non"
    return _LATEX_RE.sub(lambda m: _LATEX_MAP[m.group()], str(value))


def coche(flag: object) -> RawLatex:
    """Case cochée ou vide (balisage, jamais échappé)."""
    return RawLatex(r"\LLcoche" if flag else r"\LLvide")


# --- Environnement Jinja adapté à LaTeX --------------------------------------

def _jinja_env() -> Environment:
    env = Environment(
        block_start_string=r"\BLOCK{",
        block_end_string="}",
        variable_start_string=r"\VAR{",
        variable_end_string="}",
        comment_start_string=r"\#{",
        comment_end_string="}",
        trim_blocks=True,
        autoescape=False,
        undefined=StrictUndefined,
        loader=FileSystemLoader(str(_FICHE_DIR)),
    )
    env.globals["coche"] = coche
    env.finalize = latex_escape  # échappe TOUTE variable par défaut
    return env


# --- Empreinte ---------------------------------------------------------------

def empreinte(payload: dict) -> str:
    """SHA-256 du payload soumis, hors champs de preuve.

    On scelle les DONNÉES, pas le PDF : le PDF contient l'empreinte, il ne
    peut donc pas contenir la sienne. Rejouer ce hash sur l'enregistrement
    stocké par atelier-api prouve que le PDF correspond au soumis.
    """
    scellable = {k: v for k, v in payload.items() if k != "preuve"}
    canonique = json.dumps(
        scellable, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(canonique.encode("utf-8")).hexdigest()


# --- Rendu -------------------------------------------------------------------

def _preparer(payload: dict) -> dict:
    donnees = json.loads(json.dumps(payload))  # copie profonde
    donnees.setdefault("preuve", {})
    donnees["preuve"]["empreinte"] = empreinte(donnees)
    # cohérence des cases exclusives du droit à l'image
    img = donnees.setdefault("image", {})
    img["refuse"] = not img.get("autorise", False)
    return donnees


def render_tex(payload: dict) -> str:
    """Rend la fiche en source LaTeX (sans compiler) — utile pour les tests."""
    donnees = _preparer(payload)
    return _jinja_env().get_template(_TEMPLATE_NAME).render(**donnees)


def build_pdf(payload: dict, out_dir: str | Path) -> Path:
    """Compile la fiche en PDF dans ``out_dir`` ; renvoie le chemin du PDF."""
    donnees = _preparer(payload)
    tex = _jinja_env().get_template(_TEMPLATE_NAME).render(**donnees)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ref = donnees.get("dossier", {}).get("reference", "fiche")
    nom = re.sub(r"[^A-Za-z0-9._-]", "_", str(ref)) or "fiche"

    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)
        # la classe, les polices et les logos du template partagé doivent être
        # visibles du moteur (Path=fonts/ relatif de la classe)
        shutil.copy(_REPORT_TEMPLATE / "locomotionreport.cls", tmp)
        shutil.copytree(_REPORT_TEMPLATE / "fonts", tmp / "fonts")
        shutil.copytree(_REPORT_TEMPLATE / "assets", tmp / "assets")

        (tmp / f"{nom}.tex").write_text(tex, encoding="utf-8")
        proc: subprocess.CompletedProcess | None = None
        for _ in range(2):  # 2 passes : TikZ remember picture
            proc = subprocess.run(
                ["xelatex", "-interaction=nonstopmode", "-halt-on-error", f"{nom}.tex"],
                cwd=tmp,
                capture_output=True,
                text=True,
            )
        if proc is None or proc.returncode != 0:
            log = tmp / f"{nom}.log"
            tail = (
                log.read_text(errors="replace")[-3000:]
                if log.exists()
                else (proc.stdout[-3000:] if proc else "xelatex introuvable")
            )
            raise RuntimeError(f"Échec XeLaTeX :\n{tail}")

        cible = out_dir / f"{nom}.pdf"
        shutil.copy2(tmp / f"{nom}.pdf", cible)

    return cible


__all__ = ["RawLatex", "latex_escape", "coche", "empreinte", "render_tex", "build_pdf"]
