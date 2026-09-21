"""Orchestration du moteur — deux profondeurs (twin-theory : depth preview/full).

``preview`` : ingestion + jumeau + calibration + prédiction + **suffisance + fourchette**
(rapide, pas de PDF). C'est ce que renvoie POST /preview pour décider AVANT paiement.

``full`` : preview + pacing + figures + rapport PDF (analyze_full/run_full,
ci-dessous). Ce module porte le chaînage commun et la suppression des archives
brutes.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from typing import Any, Iterable

from .calibration import UltraCalibration, build_calibration
from .config import Config
from .course import CourseProfile, RaceSpec, build_course
from .feasibility import TargetAssessment, assess_target
from .ingest import CanonicalActivity, iter_activities, purge_path
from .pacing import PacingPlan, build_pacing
from .pacing.plan import fade_delta_from_splits
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
    # mode OBJECTIF (ADR 0002) : verdict de faisabilité, calculé dès le preview pour que la
    # question « mon objectif tient-il ? » ait une réponse AVANT paiement, sans PDF.
    target: TargetAssessment | None = None

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
            "target": None if self.target is None else self.target.to_dict(),
        }


def analyze_preview(
    activities: Iterable[CanonicalActivity],
    course: CourseProfile,
    cfg: Config,
    *,
    n_skipped: int = 0,
    analysis_date: date | None = None,
    until: date | None = None,
    target_hours: float | None = None,
    race: RaceSpec | None = None,
) -> PreviewResult:
    """Chaîne numérique complète (sans figures/PDF) → verdict + fourchette.

    ``race`` (Phase 2) : la spec de course nourrit la prédiction elle-même — calendrier pour
    la nuit, chaleur déclarée, politique d'arrêts — quand les termes correspondants sont
    activés ; absente, la prédiction est celle de la seule géométrie du parcours.

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
    return analyze_preview_from_twin(
        twin, course, cfg, n_ingested=n_seen, n_skipped=n_skipped,
        n_excluded_until=n_excluded, analysis_date=analysis_date, target_hours=target_hours,
        race=race,
    )


def analyze_preview_from_twin(
    twin: Twin,
    course: CourseProfile,
    cfg: Config,
    *,
    n_ingested: int,
    n_skipped: int = 0,
    n_excluded_until: int = 0,
    analysis_date: date | None = None,
    target_hours: float | None = None,
    race: RaceSpec | None = None,
) -> PreviewResult:
    """Aval du jumeau : calibration → prédiction → suffisance (+ verdict d'objectif).

    Séparé d':func:`analyze_preview` pour le banc walk-forward, qui construit N jumeaux
    (une coupure par course) à partir d'un SEUL décodage d'archive — tout ce qui suit ne
    coûte rien, c'est le décodage qui coûte. Un seul chemin de calcul pour les deux usages.
    """
    # coût de pente personnel (Phase 5, C1) : le parcours est servi sous les mêmes facteurs
    # que la vitesse ajustée des efforts de la calibration ; None = loi de Minetti, profil intact
    slope = twin.slope_factors(cfg)
    if slope is not None:
        course = course.with_slope_cost(*slope)
    calibration = build_calibration(twin, cfg)
    prediction = predict_race(course, twin, calibration, cfg, race)
    sufficiency = assess_sufficiency(
        twin, calibration, prediction, cfg, analysis_date=analysis_date or date.today()
    )
    # mode OBJECTIF (ADR 0002) : le verdict se calcule ICI, pas plus loin — c'est la réponse
    # à « mon objectif tient-il ? », et elle doit exister sans PDF (décision avant paiement).
    target = (
        assess_target(target_hours, course, twin, prediction, cfg)
        if target_hours is not None else None
    )

    return PreviewResult(
        sufficiency=sufficiency,
        prediction=prediction,
        twin=twin,
        calibration=calibration,
        course=course,
        n_ingested=n_ingested,
        n_skipped=n_skipped,
        n_excluded_until=n_excluded_until,
        target=target,
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
        result = analyze_preview(stream, course, cfg, analysis_date=analysis_date, until=until,
                                 target_hours=race.target_hours, race=race)
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
    # rapport v2 : ce qui accompagne le PDF (fiche, bracelet, ICS, GPX, annexe), {nom: chemin}
    livrables: dict[str, Path] = field(default_factory=dict)
    report_ref: str = "LL-TWIN"

    def to_dict(self) -> dict:
        d = self.preview.to_dict()
        d["plan"] = self.plan.to_dict()
        d["pdf"] = str(self.pdf_path) if self.pdf_path else None
        d["figures"] = self.figures
        d["target"] = None if self.target is None else self.target.to_dict()
        d["livrables"] = {k: str(v) for k, v in self.livrables.items()}
        d["report_ref"] = self.report_ref
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
    report_version: str | None = None,
    report_date: datetime | None = None,
    render_pdf: bool = True,
    feuille_only: bool = False,
    analysis_date: date | None = None,
    until: date | None = None,
) -> FullResult:
    """Chaîne complète jusqu'au PDF (pacing + figures + rapport LaTeX + livrables).

    Import paresseux du module report (matplotlib/jinja) : la profondeur preview ne le
    charge pas. Si la prédiction est impossible (🔴), on s'arrête au preview sans PDF.
    """
    preview = analyze_preview(activities, course, cfg, n_skipped=n_skipped,
                              analysis_date=analysis_date, until=until,
                              target_hours=race.target_hours, race=race)
    if preview.prediction is None:
        return FullResult(preview=preview, plan=None, pdf_path=None, figures={},  # type: ignore[arg-type]
                          target=preview.target)

    # MODE OBJECTIF (ADR 0002) : la cible n'ancre le plan que si le verdict de faisabilité
    # (calculé au preview) l'autorise — un objectif hors des bornes de sécurité se rend en
    # ÉCART chiffré, pas en plan de course. Dans les deux cas la prédiction reste calculée,
    # affichée et consignée : le mode s'ajoute, il ne remplace pas.
    target = preview.target

    # le parcours SERVI (coût de pente personnel compris) est celui du preview
    plan, pdf_path, figures, livrables = rendre_documents(
        course=preview.course, twin=preview.twin, calibration=preview.calibration,
        prediction=preview.prediction, sufficiency=preview.sufficiency, target=target,
        race=race, cfg=cfg, out_dir=out_dir, athlete=athlete, report_ref=report_ref,
        report_version=report_version, report_date=report_date, render_pdf=render_pdf,
        feuille_only=feuille_only,
    )
    return FullResult(preview=preview, plan=plan, pdf_path=pdf_path, figures=figures,
                      target=target, livrables=livrables, report_ref=report_ref)


def rendre_documents(
    *, course, twin, calibration, prediction, sufficiency, target, race: RaceSpec, cfg: Config,
    out_dir: Path, athlete: str, report_ref: str = "LL-TWIN", report_version: str | None = None,
    report_date: datetime | None = None, render_pdf: bool = True, feuille_only: bool = False,
) -> tuple[Any, Path | None, dict, dict]:
    """Du plan aux documents : pacing, figures, contexte, rapport, feuille, fiches, livrables.

    Un SEUL chemin de code pour le document d'origine et pour le document refait après
    amendement (``dossier.regenerer``) : deux chemins finiraient par ne plus dire la même
    chose, et c'est exactement ce qu'on passe son temps à traquer dans ce rapport.

    Rend ``(plan, chemin du rapport, figures, livrables)``.
    """
    plan = build_pacing(
        course, prediction, race, cfg, durability_pct=twin.durability_pct,
        anchor_hours=race.target_hours if (target is not None and target.plan_ok) else None,
        splits_delta=fade_delta_from_splits(calibration),
    )

    out_dir = Path(out_dir)
    figures: dict = {}
    pdf_path: Path | None = None
    livrables: dict[str, Path] = {}
    if render_pdf:
        from .report import build_pdf, build_report_context, generate_figures, write_livrables

        fig_dir = out_dir / "figures"
        figures = generate_figures(course, twin, calibration, prediction, plan, race, fig_dir,
                                   cfg=cfg)
        context = build_report_context(
            course=course, twin=twin, calibration=calibration, prediction=prediction,
            plan=plan, race=race, sufficiency=sufficiency, cfg=cfg, athlete=athlete,
            report_ref=report_ref, report_version=report_version, report_date=report_date,
            target=target,
        )
        # le rapport se pose À CÔTÉ de ce qui l'accompagne (feuille, calendrier, trace,
        # annexe) ; le dossier tex/ ne garde que la source et les journaux.
        # ``feuille_only`` : la feuille à emporter et les fiches seules, pour une
        # réimpression de dernière minute sans refaire les pages du rapport.
        if not feuille_only:
            pdf_path = Path(shutil.copy(build_pdf(context, fig_dir, out_dir / "tex"),
                                        out_dir / "rapport.pdf"))
        # ce qui accompagne le rapport : feuille, fiches d'assistance, calendrier, GPX, annexe
        livrables = write_livrables(
            context=context, course=course, twin=twin, calibration=calibration,
            prediction=prediction, plan=plan, race=race, sufficiency=sufficiency,
            cfg=cfg, out_dir=out_dir, figures_dir=fig_dir, generated_at=report_date,
        )
    return plan, pdf_path, figures, livrables


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
    feuille_only: bool = False,
    report_ref: str = "LL-TWIN",
    report_version: str | None = None,
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
            render_pdf=render_pdf, feuille_only=feuille_only, report_ref=report_ref,
            report_version=report_version, report_date=report_date,
            analysis_date=analysis_date, until=until,
        )
    finally:
        if purge_source:
            purge_path(training_path)
    full.preview.n_skipped = len(skipped)

    # Le dossier rejouable, posé à côté des livrables : il porte l'état du calcul (trace,
    # carnet de route, jumeau, calibration, prédiction, suffisance) pour que le document
    # puisse être REFAIT après amendement sans redemander l'archive. Sans prédiction, il
    # n'y a rien à rejouer.
    if render_pdf and full.preview.prediction is not None:
        from . import dossier as _dossier

        chemin = _dossier.ecrire(
            Path(out_dir) / "dossier.json", course_gpx=course_gpx, race=race,
            twin=full.preview.twin, calibration=full.preview.calibration,
            prediction=full.preview.prediction, sufficiency=full.preview.sufficiency,
            athlete=athlete, report_ref=report_ref,
            report_date=report_date or datetime.now(),
        )
        full.livrables["dossier.json"] = chemin
    return full


__all__ = ["PreviewResult", "FullResult", "analyze_preview", "analyze_preview_from_twin",
           "analyze_full", "run_preview", "run_full"]
