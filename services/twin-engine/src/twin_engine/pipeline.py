"""Orchestration du moteur — deux profondeurs (twin-theory : depth preview/full).

``preview`` : ingestion + jumeau + calibration + prédiction + **suffisance + fourchette**
(rapide, pas de PDF). C'est ce que renvoie POST /preview pour décider AVANT paiement.

``full`` (pacing + figures + rapport) est ajouté aux commits 8–9. Ce module porte le
chaînage commun et la suppression des archives brutes.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .calibration import UltraCalibration, build_calibration
from .config import Config
from .course import CourseProfile, RaceSpec, build_course
from .ingest import CanonicalActivity, IngestResult, ingest_path
from .predict import Prediction, predict_race
from .sufficiency import Sufficiency, assess_sufficiency
from .twin.model import Twin, build_twin


@dataclass
class PreviewResult:
    sufficiency: Sufficiency
    prediction: Prediction | None
    twin: Twin
    calibration: UltraCalibration
    course: CourseProfile
    n_ingested: int
    n_skipped: int

    def to_dict(self) -> dict:
        pred = self.prediction
        return {
            "verdict": self.sufficiency.verdict,
            "sellable": self.sufficiency.sellable,
            "sufficiency": self.sufficiency.to_dict(),
            "finish_range_h": None
            if pred is None
            else {
                "central": round(pred.finish_hours, 2),
                "low": round(pred.interval_low_h, 2),
                "high": round(pred.interval_high_h, 2),
            },
            "prediction": None if pred is None else pred.to_dict(),
            "twin": self.twin.to_dict(),
            "calibration": self.calibration.to_dict(),
            "course": self.course.to_dict(),
            "ingestion": {"ingested": self.n_ingested, "skipped": self.n_skipped},
        }


def analyze_preview(
    activities: list[CanonicalActivity],
    course: CourseProfile,
    cfg: Config,
    *,
    n_skipped: int = 0,
) -> PreviewResult:
    """Chaîne numérique complète (sans figures/PDF) → verdict + fourchette."""
    twin = build_twin(activities, cfg)
    calibration = build_calibration(twin, cfg)
    prediction = predict_race(course, twin, calibration, cfg)
    sufficiency = assess_sufficiency(twin, calibration, prediction, cfg)
    return PreviewResult(
        sufficiency=sufficiency,
        prediction=prediction,
        twin=twin,
        calibration=calibration,
        course=course,
        n_ingested=len(activities),
        n_skipped=n_skipped,
    )


def run_preview(
    *,
    training_path: str | Path,
    course_gpx: bytes,
    race: RaceSpec,
    cfg: Config,
    purge_source: bool = True,
) -> PreviewResult:
    """De l'archive brute + la trace de course au verdict. **Purge l'archive** après parsing."""
    result: IngestResult = ingest_path(training_path, purge_source=purge_source)
    course = build_course(course_gpx, race, cfg)
    return analyze_preview(result.running, course, cfg, n_skipped=len(result.skipped))


__all__ = ["PreviewResult", "analyze_preview", "run_preview"]
