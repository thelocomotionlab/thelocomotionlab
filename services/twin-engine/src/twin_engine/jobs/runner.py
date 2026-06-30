"""Exécution d'un job en arrière-plan (in-process), avec purge des fichiers bruts.

Pas de file de jobs externe ni de worker : on lance le pipeline `full` dans une tâche
d'arrière-plan FastAPI. À la fin, l'archive brute et le dossier d'upload sont supprimés
(garde-fou confidentialité) ; on ne conserve que le PDF et les métadonnées.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from ..config import Config
from ..course import RaceSpec
from ..pipeline import run_full
from .store import JobStore


def run_job(
    *,
    job_id: str,
    store: JobStore,
    cfg: Config,
    job_dir: Path,
    training_path: Path,
    course_gpx: bytes,
    race: RaceSpec,
    athlete: str,
) -> None:
    store.update(job_id, status="running")
    try:
        result = run_full(
            training_path=training_path,
            course_gpx=course_gpx,
            race=race,
            cfg=cfg,
            out_dir=job_dir,
            athlete=athlete,
            purge_source=True,   # supprime l'archive d'entraînement dès la fin du parsing
            render_pdf=True,
        )
        pdf_path = None
        if result.pdf_path:
            final = job_dir / "report.pdf"
            shutil.copy(result.pdf_path, final)
            pdf_path = str(final)
        store.update(
            job_id,
            status="done",
            verdict=result.preview.sufficiency.verdict,
            result_json=json.dumps(result.to_dict(), ensure_ascii=False),
            pdf_path=pdf_path,
        )
    except Exception as exc:  # noqa: BLE001 — on remonte l'erreur dans l'état du job
        store.update(job_id, status="error", error=f"{type(exc).__name__}: {exc}")
    finally:
        # purge l'upload (archive brute + trace), garde figures/tex/report.pdf
        shutil.rmtree(job_dir / "upload", ignore_errors=True)


__all__ = ["run_job"]
