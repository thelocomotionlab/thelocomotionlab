"""Orchestration du moteur — deux profondeurs (twin-theory : depth preview/full).

``preview`` : ingestion + jumeau + calibration + prédiction + **suffisance + fourchette**
(rapide, pas de PDF). C'est ce que renvoie POST /preview pour décider AVANT paiement.

``full`` (pacing + figures + rapport) est ajouté aux commits 8–9. Ce module porte le
chaînage commun et la suppression des archives brutes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .calibration import UltraCalibration, build_calibration
from .config import Config
from .course import CourseProfile, RaceSpec, build_course
from .ingest import CanonicalActivity, IngestResult, ingest_path
from .pacing import PacingPlan, build_pacing
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
    progress=None,
) -> PreviewResult:
    """De l'archive brute + la trace de course au verdict. **Purge l'archive** après parsing."""
    result: IngestResult = ingest_path(training_path, purge_source=purge_source, progress=progress)
    course = build_course(course_gpx, race, cfg)
    return analyze_preview(result.running, course, cfg, n_skipped=len(result.skipped))


@dataclass
class FullResult:
    preview: PreviewResult
    plan: PacingPlan
    pdf_path: Path | None
    figures: dict

    def to_dict(self) -> dict:
        d = self.preview.to_dict()
        d["plan"] = self.plan.to_dict()
        d["pdf"] = str(self.pdf_path) if self.pdf_path else None
        d["figures"] = self.figures
        return d


def analyze_full(
    activities: list[CanonicalActivity],
    course: CourseProfile,
    race: RaceSpec,
    cfg: Config,
    *,
    out_dir: Path,
    athlete: str,
    n_skipped: int = 0,
    report_ref: str = "LL-TWIN",
    report_version: str = "v1.0",
    report_date: datetime | None = None,
    render_pdf: bool = True,
) -> FullResult:
    """Chaîne complète jusqu'au PDF (pacing + figures + rapport LaTeX).

    Import paresseux du module report (matplotlib/jinja) : la profondeur preview ne le
    charge pas. Si la prédiction est impossible (🔴), on s'arrête au preview sans PDF.
    """
    preview = analyze_preview(activities, course, cfg, n_skipped=n_skipped)
    if preview.prediction is None:
        return FullResult(preview=preview, plan=None, pdf_path=None, figures={})  # type: ignore[arg-type]

    plan = build_pacing(course, preview.prediction, race, cfg)

    out_dir = Path(out_dir)
    figures: dict = {}
    pdf_path: Path | None = None
    if render_pdf:
        from .report import build_pdf, build_report_context, generate_figures

        fig_dir = out_dir / "figures"
        figures = generate_figures(
            course, preview.twin, preview.calibration, preview.prediction, plan, race, fig_dir
        )
        context = build_report_context(
            course=course, twin=preview.twin, calibration=preview.calibration,
            prediction=preview.prediction, plan=plan, race=race, sufficiency=preview.sufficiency,
            cfg=cfg, athlete=athlete, report_ref=report_ref, report_version=report_version,
            report_date=report_date,
        )
        pdf_path = build_pdf(context, fig_dir, out_dir / "tex")

    return FullResult(preview=preview, plan=plan, pdf_path=pdf_path, figures=figures)


def run_full(
    *,
    training_path: str | Path,
    course_gpx: bytes,
    race: RaceSpec,
    cfg: Config,
    out_dir: Path,
    athlete: str,
    purge_source: bool = True,
    render_pdf: bool = True,
    report_date: datetime | None = None,
    progress=None,
) -> FullResult:
    """De l'archive brute au PDF. **Purge l'archive** après parsing."""
    result: IngestResult = ingest_path(training_path, purge_source=purge_source, progress=progress)
    course = build_course(course_gpx, race, cfg)
    return analyze_full(
        result.running, course, race, cfg, out_dir=Path(out_dir), athlete=athlete,
        n_skipped=len(result.skipped), render_pdf=render_pdf, report_date=report_date,
    )


__all__ = ["PreviewResult", "FullResult", "analyze_preview", "analyze_full", "run_preview", "run_full"]
