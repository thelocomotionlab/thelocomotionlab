"""API FastAPI : preview synchrone, cycle de vie d'un job, service du PDF."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from twin_engine.config import load_config

FIX = Path(__file__).parent / "fixtures"


def _triangle_gpx(n=200):
    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(n + 1):
        x = 10000.0 * i / n
        ele = 1000.0 * (x / 5000.0) if x <= 5000 else 1000.0 * (2 - x / 5000.0)
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


_RACE = json.dumps({"name": "Course Test", "aid_km": [0.0, 5.0, 10.0],
                    "aid_names": ["départ", "sommet", "arrivée"]}).encode()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    from twin_engine.api import create_app

    return TestClient(create_app(load_config()))


def _files():
    return {
        "training": ("perso.gpx", (FIX / "sample.gpx").read_bytes(), "application/gpx+xml"),
        "course_gpx": ("course.gpx", _triangle_gpx(), "application/gpx+xml"),
        "race": ("race.json", _RACE, "application/json"),
    }


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_preview_returns_verdict(client):
    r = client.post("/preview", files=_files(), data={"athlete": "Test"})
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] in {"🟢", "🟠", "🔴"}
    assert "sufficiency" in body and body["sufficiency"]["criteria"]


def test_preview_rejects_bad_race_spec(client):
    files = _files()
    files["race"] = ("race.json", b"{not valid json", "application/json")
    r = client.post("/preview", files=files, data={"athlete": "Test"})
    assert r.status_code == 422


def test_job_lifecycle(client, tmp_path):
    # le job tourne en tâche de fond ; TestClient l'exécute avant de rendre la réponse
    r = client.post("/jobs", files=_files(), data={"athlete": "Test"})
    assert r.status_code == 200
    job_id = r.json()["id"]
    assert r.json()["status"] == "queued"

    got = client.get(f"/jobs/{job_id}")
    assert got.status_code == 200
    body = got.json()
    assert body["status"] in {"done", "error", "running"}
    assert body["verdict"] in {"🟢", "🟠", "🔴", None}

    # Exigence de confidentialité (CLAUDE.md) : l'archive d'entraînement brute
    # est purgée dès la fin du job — upload/ ne doit plus exister.
    if body["status"] in {"done", "error"}:
        assert not (tmp_path / "data" / "jobs" / job_id / "upload").exists()


def test_unknown_job_404(client):
    assert client.get("/jobs/inconnu").status_code == 404
    assert client.get("/jobs/inconnu/report").status_code == 404


def test_startup_sweeps_orphan_jobs_and_previews(tmp_path, monkeypatch):
    """R8 : au démarrage, les jobs « running » orphelins d'un crash passent en erreur et
    leurs uploads (PII) + les dossiers preview-* sont purgés."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    from twin_engine.api import create_app
    from twin_engine.config import load_config
    from twin_engine.jobs import JobStore

    cfg = load_config()
    store = JobStore(cfg.data_dir / "jobs.sqlite")
    store.create("orphan", depth="full", athlete="X", race_name="Y")
    store.update("orphan", status="running")
    upload = cfg.data_dir / "jobs" / "orphan" / "upload"
    upload.mkdir(parents=True)
    (upload / "archive.zip").write_bytes(b"pii")
    stray = cfg.data_dir / "preview-stray"
    stray.mkdir(parents=True)

    client = TestClient(create_app(load_config()))
    body = client.get("/jobs/orphan").json()
    assert body["status"] == "error" and "redémarrage" in body["error"]
    assert not upload.exists() and not stray.exists()


def test_job_error_is_sanitized(client):
    """R8 : le champ error public ne fuit ni chemins ni queue de log — détail en journal serveur."""
    files = _files()
    files["course_gpx"] = ("course.gpx", b"<gpx></gpx>", "application/gpx+xml")  # → ValueError
    r = client.post("/jobs", files=files, data={"athlete": "T"})
    body = client.get(f"/jobs/{r.json()['id']}").json()
    assert body["status"] == "error"
    assert "journaux du serveur" in body["error"]
    assert "/" not in body["error"]                 # aucun chemin interne divulgué


def test_report_served_when_pdf_present(client, tmp_path):
    """Le PDF est servi quand le job en a un (plomberie testée sans XeLaTeX)."""
    store = client.app.state.store
    job_id = "fakejob"
    store.create(job_id, depth="full", athlete="Test", race_name="Course")
    dummy = tmp_path / "report.pdf"
    dummy.write_bytes(b"%PDF-1.5\n%fake\n")
    store.update(job_id, status="done", verdict="🟢", pdf_path=str(dummy))

    r = client.get(f"/jobs/{job_id}/report")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    # le job expose bien l'URL de rapport
    assert client.get(f"/jobs/{job_id}").json()["report_url"] == f"/jobs/{job_id}/report"
