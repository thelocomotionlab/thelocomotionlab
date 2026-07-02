"""API FastAPI du moteur Twin (le contrat = l'OpenAPI généré).

Endpoints :
  * ``GET  /health``           — sonde de vie.
  * ``POST /preview``          — synchrone : ingestion + suffisance + fourchette (pas de PDF).
  * ``POST /jobs``             — crée un job `full` (arrière-plan in-process) → renvoie l'id.
  * ``GET  /jobs/{id}``        — état + résultat du job.
  * ``GET  /jobs/{id}/report`` — télécharge le PDF (quand prêt).

Stockage local : SQLite pour l'état, dossier de données (volume) pour les fichiers.
"""

from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..config import Config, load_config
from ..course import RaceSpec
from ..jobs import JobStore, run_job
from ..pipeline import run_preview

_PUBLIC_FIELDS = (
    "id", "status", "depth", "athlete", "race_name", "verdict", "error",
    "created_at", "updated_at",
)


def _safe_name(filename: str | None, default: str) -> str:
    """Ne garde que le nom de base (jamais de chemin) — l'extension pilote l'ingestion."""
    return Path(filename or default).name or default


def _parse_race(raw: bytes) -> RaceSpec:
    try:
        return RaceSpec.from_dict(json.loads(raw))
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"spec de course invalide: {exc}") from exc


def create_app(cfg: Config | None = None) -> FastAPI:
    cfg = cfg or load_config()
    store = JobStore(cfg.data_dir / "jobs.sqlite")
    jobs_root = cfg.data_dir / "jobs"
    jobs_root.mkdir(parents=True, exist_ok=True)

    # Balayage de démarrage : un crash (SIGKILL/OOM) court-circuite les purges `finally` —
    # les jobs restés « running » sont clos en erreur et leurs uploads (PII) supprimés,
    # ainsi que les dossiers preview-* orphelins. La promesse « archives supprimées
    # immédiatement après analyse » doit tenir AUSSI après un crash.
    for job_id in store.sweep_stale_running("interrompu par un redémarrage du service"):
        shutil.rmtree(jobs_root / job_id / "upload", ignore_errors=True)
    for stray in cfg.data_dir.glob("preview-*"):
        shutil.rmtree(stray, ignore_errors=True)

    app = FastAPI(
        title="Locomotion Twin Engine",
        version="0.1.0",
        description="Du fichier d'entraînement multi-marques à une prédiction validée et un plan de pacing.",
    )
    app.state.store = store
    app.state.cfg = cfg

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.post("/preview")
    async def preview(
        training: UploadFile = File(...),
        course_gpx: UploadFile = File(...),
        race: UploadFile = File(...),
        athlete: str = Form("athlète"),
    ) -> dict:
        race_spec = _parse_race(await race.read())
        gpx = await course_gpx.read()
        tmp = Path(tempfile.mkdtemp(dir=cfg.data_dir, prefix="preview-"))
        try:
            tpath = tmp / _safe_name(training.filename, "training.bin")
            tpath.write_bytes(await training.read())
            result = run_preview(
                training_path=tpath, course_gpx=gpx, race=race_spec, cfg=cfg, purge_source=True
            )
            return result.to_dict()
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    @app.post("/jobs")
    async def create_job(
        background: BackgroundTasks,
        training: UploadFile = File(...),
        course_gpx: UploadFile = File(...),
        race: UploadFile = File(...),
        athlete: str = Form("athlète"),
    ) -> dict:
        race_spec = _parse_race(await race.read())
        gpx = await course_gpx.read()
        job_id = uuid4().hex
        job_dir = jobs_root / job_id
        (job_dir / "upload").mkdir(parents=True, exist_ok=True)
        tpath = job_dir / "upload" / _safe_name(training.filename, "training.bin")
        tpath.write_bytes(await training.read())

        store.create(job_id, depth="full", athlete=athlete, race_name=race_spec.name)
        background.add_task(
            run_job, job_id=job_id, store=store, cfg=cfg, job_dir=job_dir,
            training_path=tpath, course_gpx=gpx, race=race_spec, athlete=athlete,
        )
        return {"id": job_id, "status": "queued"}

    @app.get("/jobs/{job_id}")
    def get_job(job_id: str) -> dict:
        row = store.get(job_id)
        if row is None:
            raise HTTPException(status_code=404, detail="job inconnu")
        out = {k: row[k] for k in _PUBLIC_FIELDS}
        if row.get("result_json"):
            out["result"] = json.loads(row["result_json"])
        out["report_url"] = f"/jobs/{job_id}/report" if row.get("pdf_path") else None
        return out

    @app.get("/jobs/{job_id}/report")
    def get_report(job_id: str) -> FileResponse:
        row = store.get(job_id)
        if row is None:
            raise HTTPException(status_code=404, detail="job inconnu")
        pdf = row.get("pdf_path")
        if not pdf or not Path(pdf).exists():
            raise HTTPException(status_code=404, detail="rapport non disponible (job non terminé ou 🔴)")
        return FileResponse(pdf, media_type="application/pdf", filename="rapport-locomotion-twin.pdf")

    return app


def get_app() -> FastAPI:
    """Fabrique pour uvicorn : ``uvicorn twin_engine.api:get_app --factory``."""
    return create_app()


__all__ = ["create_app", "get_app"]
