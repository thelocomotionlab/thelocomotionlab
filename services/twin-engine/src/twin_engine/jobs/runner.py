"""Exécution d'un job en arrière-plan (in-process), avec purge des fichiers bruts.

Pas de file externe ni de worker : le pipeline tourne dans une tâche d'arrière-plan
FastAPI. À la fin, l'archive brute et le répertoire d'upload sont supprimés (garde-fou
confidentialité) ; on ne conserve que les documents et l'état du job.

**Un seul job à la fois sur le VPS** (récapitulatif §5.2). Le verrou est ce qui fait la
file : un job créé pendant qu'un autre tourne reste ``en_file`` jusqu'à ce que la place
se libère, puis passe ``en_cours``. C'est aussi ce qui borne la mémoire du conteneur —
une passe d'archive plus un rendu XeLaTeX en même temps, ce n'est pas la même facture.

La référence et la date du rapport sont **fournies par l'appelant**. Le job ne les
invente pas : une référence dérivée de l'id du job changerait à chaque génération
(récapitulatif §3.3), et une date prise ici rendrait le PDF non reproductible — donc le
golden intestable.
"""

from __future__ import annotations

import logging
import shutil
import threading
from datetime import datetime
from pathlib import Path

from ..config import Config
from ..course import RaceSpec
from ..pipeline import run_full
from ..tableau_de_bord.objets import JOB_ECHEC, JOB_EN_COURS, JOB_FINI
from .store import JobStore

logger = logging.getLogger(__name__)

# Un job à la fois. Ce n'est pas un réglage de performance : c'est la contrainte
# d'exploitation du VPS, qui héberge aussi le proxy, le direct et la liste.
_UNE_PLACE = threading.BoundedSemaphore(1)


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
    report_ref: str,
    report_date: datetime,
) -> None:
    with _UNE_PLACE:
        _run_job_locked(
            job_id=job_id, store=store, cfg=cfg, job_dir=job_dir,
            training_path=training_path, course_gpx=course_gpx, race=race, athlete=athlete,
            report_ref=report_ref, report_date=report_date,
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
    report_ref: str,
    report_date: datetime,
) -> None:
    store.modifier(job_id, statut=JOB_EN_COURS)
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
            report_ref=report_ref,
            report_date=report_date,
            etape=lambda texte: store.avancer(job_id, texte),
        )
        pdf_path = ""
        if result.pdf_path:
            final = job_dir / "report.pdf"
            shutil.copy(result.pdf_path, final)
            pdf_path = str(final)
        store.modifier(
            job_id,
            statut=JOB_FINI,
            avancement="",
            resultat=result.to_dict(),
            pdf=pdf_path,
        )
    except Exception as exc:  # noqa: BLE001 — on remonte l'erreur dans l'état du job
        # le détail (qui peut contenir des chemins internes, ex. queue de log XeLaTeX) reste
        # dans les journaux serveur ; le client ne voit qu'un message aseptisé.
        logger.exception("job %s en échec", job_id)
        store.modifier(
            job_id,
            statut=JOB_ECHEC,
            avancement="",
            erreur=f"{type(exc).__name__} : échec du traitement (détails dans les journaux du serveur)",
        )
    finally:
        # purge l'upload (archive brute + trace), garde figures/tex/report.pdf
        shutil.rmtree(job_dir / "upload", ignore_errors=True)


def run_ingestion(
    *,
    job_id: str,
    store: JobStore,
    magasin,
    cfg: Config,
    athlete_id: str,
    archive_locale: Path | None = None,
    depot=None,
) -> None:
    """Ingère l'archive d'un athlète — même file, même place unique que la génération.

    Une ingestion, c'est le décodage d'une archive entière : c'est le plus gros poste de
    mémoire et de processeur du service. Elle passe donc par le MÊME verrou qu'un rendu,
    pas par un second à côté — sinon deux d'entre eux se rencontrent un jour, et le
    conteneur meurt de l'addition."""
    # Import local : l'ingestion tire numpy et tout le moteur ; le module de la file, lui,
    # est importé au démarrage de l'API.
    from ..tableau_de_bord.ingestion import ingerer_un_athlete

    with _UNE_PLACE:
        store.modifier(job_id, statut=JOB_EN_COURS)
        try:
            athlete = ingerer_un_athlete(
                athlete_id=athlete_id, magasin=magasin, cfg=cfg,
                archive_locale=archive_locale, depot=depot,
                avancer=lambda texte: store.avancer(job_id, texte),
            )
            store.modifier(
                job_id, statut=JOB_FINI, avancement="",
                resultat={"athlete_id": athlete_id,
                          "niveau": (athlete.get("niveau") or {}).get("nom"),
                          "jumeau": athlete.get("jumeau")},
            )
        except Exception as exc:  # noqa: BLE001 — l'erreur vit dans l'état du job
            logger.exception("ingestion %s en échec", job_id)
            store.modifier(
                job_id, statut=JOB_ECHEC, avancement="",
                erreur=f"{type(exc).__name__} : échec de l'ingestion "
                       "(détails dans les journaux du serveur)",
            )
        finally:
            if archive_locale is not None:
                # L'archive envoyée à la main ne survit pas non plus à son analyse.
                shutil.rmtree(archive_locale.parent, ignore_errors=True)


def _message_sur(exc: Exception, quoi: str) -> str:
    """Ce que le client lit d'un échec. Les refus du tableau de bord sont écrits pour
    Valentin (« la course n'a pas de trace… ») et ne portent aucun chemin : ils passent
    tels quels. Le reste — une compilation LaTeX, un fichier illisible — peut porter
    l'intérieur du conteneur, et reste dans les journaux."""
    from ..tableau_de_bord.generation import GenerationImpossible
    from ..tableau_de_bord.jumeau import JumeauIllisible

    if isinstance(exc, (GenerationImpossible, JumeauIllisible)):
        return str(exc)
    return f"{type(exc).__name__} : échec {quoi} (détails dans les journaux du serveur)"


def run_generation(*, job_id: str, store: JobStore, magasin, cfg: Config, ref: str,
                   report_date: datetime | None = None) -> None:
    """Une version de plus pour un plan, depuis le jumeau gardé (récapitulatif §5.4)."""
    from ..tableau_de_bord.generation import generer_une_version

    with _UNE_PLACE:
        store.modifier(job_id, statut=JOB_EN_COURS)
        try:
            plan = generer_une_version(
                ref=ref, magasin=magasin, cfg=cfg, report_date=report_date,
                etape=lambda texte: store.avancer(job_id, texte),
            )
            store.modifier(job_id, statut=JOB_FINI, avancement="",
                           resultat={"ref": ref, "version": plan.get("version"),
                                     "prediction": plan.get("prediction")})
        except Exception as exc:  # noqa: BLE001 — l'erreur vit dans l'état du job
            logger.exception("génération %s (%s) en échec", job_id, ref)
            store.modifier(job_id, statut=JOB_ECHEC, avancement="",
                           erreur=_message_sur(exc, "de la génération"))


def run_amendement(*, job_id: str, store: JobStore, magasin, cfg: Config, ref: str,
                   numero: int | None = None) -> None:
    """Les documents d'une version refaits avec les amendements de l'athlète (§5.8)."""
    from ..tableau_de_bord.generation import amender_la_version

    with _UNE_PLACE:
        store.modifier(job_id, statut=JOB_EN_COURS)
        try:
            plan = amender_la_version(
                ref=ref, magasin=magasin, cfg=cfg, numero=numero,
                etape=lambda texte: store.avancer(job_id, texte),
            )
            store.modifier(job_id, statut=JOB_FINI, avancement="",
                           resultat={"ref": ref,
                                     "version": numero or plan.get("version_publiee")
                                     or plan.get("version")})
        except Exception as exc:  # noqa: BLE001 — l'erreur vit dans l'état du job
            logger.exception("amendement %s (%s) en échec", job_id, ref)
            store.modifier(job_id, statut=JOB_ECHEC, avancement="",
                           erreur=_message_sur(exc, "de l'amendement"))


__all__ = ["run_amendement", "run_generation", "run_ingestion", "run_job"]
