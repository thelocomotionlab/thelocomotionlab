"""L'ingestion d'une archive : de l'archive au jumeau, sans course.

Le jumeau, la calibration et le niveau ne dépendent d'**aucune course** : ce sont les
propriétés de l'athlète, et c'est bien pour ça que le récapitulatif les range sur
l'Athlète (§3.1) et pas sur le Plan. On appelle donc les briques du moteur directement
— ``build_twin``, ``build_calibration``, ``assess_sufficiency`` — plutôt que
``run_preview``, qui exige une trace de course qu'on n'a pas encore.

Conséquence sur le niveau : il est posé ici **sans prédiction**, donc sans le critère
« domaine de calibration », qui compare le parcours au domaine du moteur. Ce critère-là
appartient au plan, pas à l'athlète — un même athlète peut être calibré pour un 100 miles
et hors domaine pour un trail de six heures. Le niveau de la fiche dit une seule chose :
*cette archive porte-t-elle de quoi calibrer ?*

L'archive vit dans un répertoire temporaire du volume et disparaît en ``finally``. La
promesse « archives supprimées immédiatement après analyse » doit tenir aussi quand
l'ingestion échoue au milieu.
"""

from __future__ import annotations

import shutil
import tempfile
from datetime import date
from pathlib import Path

from ..calibration import build_calibration
from ..config import Config
from ..ingest import iter_activities
from ..sufficiency import assess_sufficiency
from ..twin.model import build_twin
from .depot import Depot
from .jumeau import ecrire_le_jumeau
from .magasin import Magasin
from .objets import (
    INGESTION_ILLISIBLE,
    INGESTION_INGERE,
    INGESTION_EN_COURS,
    Athlete,
    Ingestion,
    Jumeau,
    Niveau,
    maintenant,
    niveau_du_verdict,
)


class ArchiveIllisible(RuntimeError):
    """L'archive n'a rendu aucune activité exploitable.

    Ce n'est pas une panne du service, et ce n'est pas une ingestion réussie non plus :
    l'ingestion traverse l'archive sans jamais lever — les fichiers qu'elle ne sait pas
    lire sont ÉCARTÉS, un par un, et une archive entièrement écartée produit donc un
    jumeau vide en toute tranquillité. Sans ce garde-fou, un export d'une marque qu'on ne
    gère pas se rangerait dans la File comme « ingéré », avec des chiffres vides, et
    Valentin chercherait longtemps ce qui cloche.
    """


def _maximum(valeurs) -> float | None:
    reels = [v for v in valeurs if v is not None]
    return max(reels) if reels else None


def resumer_le_jumeau(twin, calibration) -> Jumeau:
    """Les huit chiffres que la fiche athlète montre (§3.1).

    Les extrêmes (``plus_long_h``, ``plus_gros_dplus_m``) se lisent sur TOUTES les
    activités, pas seulement sur les vrais ultras : ils disent ce que l'athlète a fait,
    pas ce que le moteur a retenu pour calibrer."""
    cs = twin.critical_speed
    resumes = twin.summaries
    dates = sorted(r.date for r in resumes if r.date)
    return Jumeau(
        vc_kmh=None if cs is None else round(cs.vc_kmh, 2),
        E=None if twin.endurance_E is None else round(twin.endurance_E, 4),
        durabilite_pct=(None if twin.durability_pct is None
                        else round(twin.durability_pct, 1)),
        n_vrais_ultras=len(calibration.genuine),
        n_avec_fc=sum(1 for g in calibration.genuine if g.avg_hr is not None),
        donnees_jusquau=dates[-1] if dates else "",
        plus_long_h=(lambda h: None if h is None else round(h / 3600.0, 1))(
            _maximum(r.duration_s for r in resumes)),
        plus_gros_dplus_m=(lambda d: None if d is None else round(d))(
            _maximum(r.dplus_m for r in resumes)),
    )


def analyser_larchive(archive: Path, *, cfg: Config, avancer=None,
                      analysis_date: date | None = None):
    """Archive → (jumeau, calibration, suffisance). Aucune course n'entre ici."""
    if avancer:
        avancer("lecture de l'archive")
    ecartees: list[dict] = []
    twin = build_twin(
        iter_activities(archive, running_only=True, skipped=ecartees), cfg
    )
    if not twin.summaries:
        raise ArchiveIllisible(
            f"aucune activité de course lisible ({len(ecartees)} fichier(s) écarté(s)) — "
            "ni Garmin, ni Strava, ni Coros, ni Polar"
        )
    if avancer:
        avancer("calcul du jumeau")
    calibration = build_calibration(twin, cfg)
    suffisance = assess_sufficiency(
        twin, calibration, None, cfg, analysis_date=analysis_date or date.today()
    )
    return twin, calibration, suffisance, len(ecartees)


def ingerer_un_athlete(
    *, athlete_id: str, magasin: Magasin, cfg: Config, depot: Depot | None = None,
    archive_locale: Path | None = None, avancer=None,
) -> dict:
    """Ingère l'archive d'un athlète et pose son jumeau, sa calibration et son niveau.

    ``archive_locale`` sert au chemin « je la ré-ingère avec le fichier que j'ai chez
    moi » (§5.2) — sinon l'archive est téléchargée depuis le service de dépôt.
    """
    brut = magasin.athletes.lire(athlete_id)
    if brut is None:
        raise KeyError(athlete_id)
    athlete = Athlete.from_dict(brut)
    athlete.ingestion = Ingestion(statut=INGESTION_EN_COURS, le=maintenant())
    magasin.athletes.ecrire(athlete.to_dict())

    repertoire = magasin.athletes.repertoire(athlete_id)
    temporaire = Path(tempfile.mkdtemp(dir=cfg.data_dir, prefix="ingestion-"))
    try:
        if archive_locale is not None:
            archive = archive_locale
        else:
            if avancer:
                avancer("récupération de l'archive")
            nom = athlete.archive.nom or "archive.zip"
            archive = (depot or Depot()).telecharger(
                athlete.depot_id, temporaire / Path(nom).name
            )

        twin, calibration, suffisance, _ = analyser_larchive(
            archive, cfg=cfg, avancer=avancer
        )

        if avancer:
            avancer("écriture du jumeau")
        # Entiers, et relisibles : chaque plan repartira d'eux, l'archive n'étant plus là.
        ecrire_le_jumeau(repertoire, twin, calibration)

        athlete.jumeau = resumer_le_jumeau(twin, calibration)
        athlete.niveau = Niveau(
            nom=niveau_du_verdict(suffisance.verdict),
            raisons=list(suffisance.reasons),
        )
        athlete.ingestion = Ingestion(statut=INGESTION_INGERE, le=maintenant())
        return magasin.athletes.ecrire(athlete.to_dict())
    except Exception as exc:
        # Ce que Valentin lira dans la File. Le détail technique reste au journal : ici on
        # dit ce qui s'est passé, pas la pile d'appels. Une archive illisible parle
        # d'elle-même ; pour le reste, le type dit au moins de quel côté chercher.
        motif = str(exc) if isinstance(exc, ArchiveIllisible) else f"{type(exc).__name__} : {exc}"
        athlete.ingestion = Ingestion(
            statut=INGESTION_ILLISIBLE, le=maintenant(), erreur=motif[:300],
        )
        magasin.athletes.ecrire(athlete.to_dict())
        raise
    finally:
        # L'archive brute ne survit pas à son analyse, réussie ou non.
        shutil.rmtree(temporaire, ignore_errors=True)


__all__ = ["ArchiveIllisible", "analyser_larchive", "ingerer_un_athlete",
           "resumer_le_jumeau"]
