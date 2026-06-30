"""État des jobs (SQLite) + exécution en arrière-plan in-process."""

from __future__ import annotations

from .runner import run_job
from .store import JobStore

__all__ = ["JobStore", "run_job"]
