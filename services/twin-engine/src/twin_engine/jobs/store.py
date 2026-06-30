"""État des jobs en SQLite (stockage local simple, pas de Postgres à ce stade).

Une table ``jobs`` ; une connexion par opération (robuste au threadpool de FastAPI) ;
journal WAL. Les fichiers (PDF, figures) vivent dans le dossier de données, pas en base.
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    status      TEXT NOT NULL,          -- queued | running | done | error
    depth       TEXT NOT NULL,          -- preview | full
    athlete     TEXT,
    race_name   TEXT,
    created_at  REAL,
    updated_at  REAL,
    verdict     TEXT,
    error       TEXT,
    result_json TEXT,
    pdf_path    TEXT
)
"""

_UPDATABLE = {"status", "verdict", "error", "result_json", "pdf_path"}


class JobStore:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.execute("PRAGMA journal_mode=WAL")
            c.execute(_SCHEMA)

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

    def create(self, job_id: str, *, depth: str, athlete: str, race_name: str) -> None:
        now = time.time()
        with self._conn() as c:
            c.execute(
                "INSERT INTO jobs(id,status,depth,athlete,race_name,created_at,updated_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (job_id, "queued", depth, athlete, race_name, now, now),
            )

    def update(self, job_id: str, **fields) -> None:
        unknown = set(fields) - _UPDATABLE
        if unknown:
            raise ValueError(f"colonnes non modifiables: {unknown}")
        fields["updated_at"] = time.time()  # noqa: not part of _UPDATABLE check (toujours mis)
        cols = ", ".join(f"{k}=?" for k in fields)
        with self._conn() as c:
            c.execute(f"UPDATE jobs SET {cols} WHERE id=?", [*fields.values(), job_id])

    def get(self, job_id: str) -> dict | None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        return dict(row) if row else None


__all__ = ["JobStore"]
