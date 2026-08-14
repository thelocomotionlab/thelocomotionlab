"""Orchestration du moteur — deux profondeurs (twin-theory : depth preview/full).

``preview`` : ingestion + jumeau + calibration + prédiction + **suffisance + fourchette**
(rapide, pas de PDF). C'est ce que renvoie POST /preview pour décider AVANT paiement.

``full`` : preview + pacing + figures + rapport PDF (analyze_full/run_full,
ci-dessous). Ce module porte le chaînage commun et la suppression des archives
brutes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from typing import Iterable

from .calibration import UltraCalibration, build_calibration
from .config import Config
from .course import CourseProfile, RaceSpec, build_course
from .feasibility import TargetAssessment, assess_target
from .ingest import CanonicalActivity, iter_activities, purge_path
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
    n_excluded_until: int = 0   # activités écartées par la coupure temporelle (mode backtest)

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
            "ingestion": {
                "ingested": self.n_ingested,
                "skipped": self.n_skipped,
                "excluded_after_until": self.n_excluded_until,
            },
        }


def analyze_preview(
    activities: Iterable[CanonicalActivity],
    course: CourseProfile,
    cfg: Config,
    *,
    n_skipped: int = 0,
    analysis_date: date | None = None,
    until: date | None = None,
) -> PreviewResult:
    """Chaîne numérique complète (sans figures/PDF) → verdict + fourchette.

    ``activities`` peut être une liste OU un flux (E1) : la courbe record consomme chaque
    activité une seule fois, les tableaux 1 Hz sont libérés au fil de l'eau — mémoire
    O(1 activité) sur les grosses archives. ``analysis_date`` alimente le critère de
    fraîcheur (défaut : date du jour — injectable pour un replay/test déterministe).

    ``until`` = COUPURE TEMPORELLE (mode backtest, revue 2026-07) : toute activité
    postérieure à cette date est écartée AVANT le jumeau — on rejoue honnêtement « ce que
    le moteur aurait su la veille de la course ». Anti-fuite strict : une activité SANS
    date exploitable est aussi écartée (impossible de certifier qu'elle est antérieure).
    Sans ``analysis_date`` explicite, « aujourd'hui » devient la coupure — la fraîcheur
    et le volume récent sont jugés à la date simulée, pas à la date du replay."""
    n_seen = 0
    n_excluded = 0

    def _counting(src: Iterable[CanonicalActivity]):
        nonlocal n_seen
        for act in src:
            n_seen += 1
            yield act

    def _cutoff(src: Iterable[CanonicalActivity]):
        nonlocal n_excluded
        for act in src:
            d = act.start_time.date() if act.start_time else None
            if d is None or d > until:
                n_excluded += 1
                continue
            yield act

    stream = activities if until is None else _cutoff(activities)
    if until is not None and analysis_date is None:
        analysis_date = until

    twin = build_twin(_counting(stream), cfg)
    calibration = build_calibration(twin, cfg)
    prediction = predict_race(course, twin, calibration, cfg)
    sufficiency = assess_sufficiency(
        twin, calibration, prediction, cfg, analysis_date=analysis_date or date.today()
    )
    return PreviewResult(
        sufficiency=sufficiency,
        prediction=prediction,
        twin=twin,
        calibration=calibration,
        course=course,
        n_ingested=n_seen,
        n_skipped=n_skipped,
        n_excluded_until=n_excluded,
    )


def run_preview(
    *,
    training_path: str | Path,
    course_gpx: bytes,
    race: RaceSpec,
    cfg: Config,
    purge_source: bool = True,
    progress=None,
    analysis_date: date | None = None,
    until: date | None = None,
) -> PreviewResult:
    """De l'archive brute + la trace de course au verdict. **Purge l'archive** après analyse.

    Ingestion en FLUX (E1) : les activités 1 Hz traversent la courbe record une à une —
    mémoire O(1 activité) au lieu de plusieurs Go sur les archives de milliers de fichiers.
    La purge est en ``finally`` : elle tient aussi si l'analyse échoue en cours de route."""
    skipped: list[dict] = []
    stream = iter_activities(
        training_path, running_only=True, progress=progress, skipped=skipped
    )
    course = build_course(course_gpx, race, cfg)
    try:
        result = analyze_preview(stream, course, cfg, analysis_date=analysis_date, until=until)
    finally:
        if purge_source:
            purge_path(training_path)
    result.n_skipped = len(skipped)
    return result


@dataclass
class FullResult:
    preview: PreviewResult
    plan: PacingPlan
    pdf_path: Path | None
    figures: dict
    # mode OBJECTIF (ADR 0002) : présent dès qu'une cible a été demandée, y compris quand
    # elle est REFUSÉE (le refus est un livrable). None = rapport en mode prédiction.
    target: TargetAssessment | None = None

    def to_dict(self) -> dict:
        d = self.preview.to_dict()
        d["plan"] = self.plan.to_dict()
        d["pdf"] = str(self.pdf_path) if self.pdf_path else None
        d["figures"] = self.figures
        d["target"] = None if self.target is None else self.target.to_dict()
        return d


def analyze_full(
    activities: Iterable[CanonicalActivity],
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
    analysis_date: date | None = None,
    until: date | None = None,
) -> FullResult:
    """Chaîne complète jusqu'au PDF (pacing + figures + rapport LaTeX).

    Import paresseux du module report (matplotlib/jinja) : la profondeur preview ne le
    charge pas. Si la prédiction est impossible (🔴), on s'arrête au preview sans PDF.
    """
    preview = analyze_preview(activities, course, cfg, n_skipped=n_skipped,
                              analysis_date=analysis_date, until=until)
    if preview.prediction is None:
        return FullResult(preview=preview, plan=None, pdf_path=None, figures={})  # type: ignore[arg-type]

    # MODE OBJECTIF (ADR 0002) : une cible dans la spec de course ouvre un second rendu.
    # Elle n'ancre le plan que si le verdict de faisabilité l'autorise — un objectif hors
    # des bornes de sécurité se rend en ÉCART chiffré, pas en plan de course. Dans les deux
    # cas la prédiction reste calculée, affichée et consignée : le mode s'ajoute, il ne
    # remplace pas.
    target: TargetAssessment | None = None
    if race.target_hours is not None:
        target = assess_target(race.target_hours, course, preview.twin, preview.prediction, cfg)

    plan = build_pacing(
        course, preview.prediction, race, cfg, durability_pct=preview.twin.durability_pct,
        anchor_hours=race.target_hours if (target is not None and target.plan_ok) else None,
    )

    out_dir = Path(out_dir)
    figures: dict = {}
    pdf_path: Path | None = None
    if render_pdf:
        from .report import build_pdf, build_report_context, generate_figures

        fig_dir = out_dir / "figures"
        figures = generate_figures(
            course, preview.twin, preview.calibration, preview.prediction, plan, race, fig_dir,
            cfg=cfg,
        )
        context = build_report_context(
            course=course, twin=preview.twin, calibration=preview.calibration,
            prediction=preview.prediction, plan=plan, race=race, sufficiency=preview.sufficiency,
            cfg=cfg, athlete=athlete, report_ref=report_ref, report_version=report_version,
            report_date=report_date, target=target,
        )
        pdf_path = build_pdf(context, fig_dir, out_dir / "tex")

    return FullResult(preview=preview, plan=plan, pdf_path=pdf_path, figures=figures,
                      target=target)


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
    report_ref: str = "LL-TWIN",
    report_version: str = "v1.0",
    report_date: datetime | None = None,
    progress=None,
    analysis_date: date | None = None,
    until: date | None = None,
) -> FullResult:
    """De l'archive brute au PDF. **Purge l'archive** après analyse (flux E1, cf. run_preview)."""
    skipped: list[dict] = []
    stream = iter_activities(
        training_path, running_only=True, progress=progress, skipped=skipped
    )
    course = build_course(course_gpx, race, cfg)
    try:
        full = analyze_full(
            stream, course, race, cfg, out_dir=Path(out_dir), athlete=athlete,
            render_pdf=render_pdf, report_ref=report_ref, report_version=report_version,
            report_date=report_date, analysis_date=analysis_date, until=until,
        )
    finally:
        if purge_source:
            purge_path(training_path)
    full.preview.n_skipped = len(skipped)
    return full


__all__ = ["PreviewResult", "FullResult", "analyze_preview", "analyze_full", "run_preview", "run_full"]
