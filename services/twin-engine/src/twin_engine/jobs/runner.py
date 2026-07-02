"""Exécution d'un job en arrière-plan (in-process), avec purge des fichiers bruts.

Pas de file de jobs externe ni de worker : on lance le pipeline `full` dans une tâche
d'arrière-plan FastAPI. À la fin, l'archive brute et le dossier d'upload sont supprimés
(garde-fou confidentialité) ; on ne conserve que le PDF et les métadonnées.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import threading
from datetime import datetime
from pathlib import Path

from ..config import Config
from ..course import RaceSpec
from ..pipeline import run_full
from .store import JobStore

logger = logging.getLogger(__name__)

# Borne de concurrence des jobs (rendu = numpy + matplotlib + XeLaTeX, plusieurs minutes) :
# sans elle, quelques uploads simultanés saturent le threadpool FastAPI et bloquent le polling
# d'état. Knob d'INFRA (pas une constante scientifique) → variable d'environnement.
_MAX_CONCURRENT_JOBS = max(1, int(os.environ.get("TWIN_MAX_CONCURRENT_JOBS", "2")))
_JOBS_SEMAPHORE = threading.BoundedSemaphore(_MAX_CONCURRENT_JOBS)


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
    with _JOBS_SEMAPHORE:
        _run_job_locked(
            job_id=job_id, store=store, cfg=cfg, job_dir=job_dir,
            training_path=training_path, course_gpx=course_gpx, race=race, athlete=athlete,
        )


def _run_job_locked(
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
            # traçabilité : chaque rapport porte sa vraie date et une référence dérivée du job
            report_ref=f"LL-TWIN-{job_id[:8].upper()}",
            report_date=datetime.now(),
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
        # le détail (qui peut contenir des chemins internes, ex. queue de log XeLaTeX) reste
        # dans les journaux serveur ; le client ne voit qu'un message aseptisé.
        logger.exception("job %s en échec", job_id)
        store.update(
            job_id,
            status="error",
            error=f"{type(exc).__name__} : échec du traitement (détails dans les journaux du serveur)",
        )
    finally:
        # purge l'upload (archive brute + trace), garde figures/tex/report.pdf
        shutil.rmtree(job_dir / "upload", ignore_errors=True)


__all__ = ["run_job"]
