"""Le walk-forward du banc : rejouer une course passée avec ce que le moteur savait la veille.

``ArchiveCache`` décode une archive une fois et la rejoue à N coupures ; ``backtest_race``
fabrique l'entrée de registre d'une course (coupure la veille, ou ``until``). Servi au banc
en ligne de commande (``tools/backtest``, ``tools/banc``) et au tableau de bord (« Rejouer au
banc », ``tableau_de_bord.banc``).
"""

from __future__ import annotations

import re
import sys
from datetime import date, timedelta
from pathlib import Path

from ..course import RaceSpec, build_course
from ..ingest import iter_activities
from ..pipeline import analyze_preview_from_twin
from ..twin.model import build_twin_from_contributions
from ..twin.record import iter_contributions
from .blocs import bloc_course, bloc_domaine, bloc_modele, bloc_prediction, sous_le_domaine
from .forme import bloc_forme


def parse_time_h(value) -> float | None:
    """Temps officiel → heures décimales. Accepte ``26:30:00``, ``26:30``, ``26h30``,
    ``26h``, un nombre (heures). ``None``/vide → None (ex. abandon)."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().lower()
    m = re.fullmatch(r"(\d+):(\d{1,2})(?::(\d{1,2}))?", s)
    if m:
        h, mn, sec = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
        return h + mn / 60.0 + sec / 3600.0
    m = re.fullmatch(r"(\d+)h(\d{1,2})?", s)
    if m:
        return int(m.group(1)) + int(m.group(2) or 0) / 60.0
    raise ValueError(f"temps officiel illisible : {value!r} (attendu HH:MM[:SS], 26h30 ou heures)")


class ArchiveCache:
    """L'archive décodée UNE fois, rejouable à N coupures temporelles.

    Le décodage (FIT/TCX/GPX + ``process_activity``) domine tout le reste ; une coupure ne
    fait que RETIRER des activités. Rejouer 13 courses coûtait donc 13 décodages complets
    de l'archive — une nuit sur une archive Coros fournie. Ici : un seul décodage, puis un
    filtre par date et une ré-agrégation instantanée par course.

    Les résultats sont identiques au chemin direct (mêmes agrégats, même ordre, donc mêmes
    départages à égalité) — c'est ce que vérifie ``test_backtest_tools``.
    """

    def __init__(self, archive: Path, cfg, *, stream=None,
                 skipped: list[dict] | None = None, bavard: bool = True) -> None:
        """``stream`` : un flux d'activités déjà ouvert (un « tee » qui mesure autre chose au
        passage, cf. tools/banc) — sinon le cache ouvre l'archive lui-même. ``skipped`` est
        la liste des rejets d'ingestion du flux fourni (comptés après consommation).
        ``bavard`` : le décompte sur la sortie d'erreur (outils en ligne de commande)."""
        self.cfg = cfg
        if skipped is None:
            skipped = []
        if stream is None:
            stream = iter_activities(archive, running_only=True, skipped=skipped,
                                     progress=self._progress if bavard else None)
        # on ne garde QUE des agrégats : aucun tableau 1 Hz ne survit à cette ligne
        self.contributions = list(iter_contributions(stream, cfg))
        self.n_skipped = len(skipped)
        if bavard:
            print(f"\r  archive décodée : {len(self.contributions)} activités "
                  f"({self.n_skipped} écartées à l'ingestion) — rejouable sans re-décodage.",
                  file=sys.stderr, flush=True)

    @staticmethod
    def _progress(n: int, name: str) -> None:
        if n % 100 == 0:
            print(f"\r  décodage de l'archive : {n} fichiers…", end="", file=sys.stderr,
                  flush=True)

    def preview_at(self, course, until: date, target_hours=None, race=None):
        """Jumeau + prédiction « ce que le moteur savait au soir du ``until`` ».

        Anti-fuite identique au chemin direct : postérieures ET non datées écartées.
        ``race`` : la spec de course (calendrier, chaleur, ravitos) — donnée de course, pas
        de l'athlète, donc hors du périmètre de la coupure.
        """
        kept = [c for c in self.contributions
                if c.start_date is not None and c.start_date <= until]
        n_excluded = len(self.contributions) - len(kept)
        twin = build_twin_from_contributions(kept, self.cfg)
        return analyze_preview_from_twin(
            twin, course, self.cfg, n_ingested=len(kept), n_skipped=self.n_skipped,
            n_excluded_until=n_excluded, analysis_date=until, target_hours=target_hours,
            race=race,
        )


def race_spec_from_meta(name: str, meta: dict | None) -> RaceSpec:
    """Spec minimale d'une course sans ``race_json`` : le calendrier (départ local, position,
    fuseau solaire) lu dans les métadonnées de l'activité du jour — l'heure et le lieu d'un
    départ de course sont des données de course, pas une performance de l'athlète. Sans
    métadonnées : spec nominale (mode GPX-only, écart de nuit nul)."""
    if not meta:
        return RaceSpec(name=name)
    return RaceSpec(name=name, start_time=meta["start_local"], lat=float(meta["lat"]),
                    lon=float(meta["lon"]), tz_offset_h=float(meta["tz"]))


def backtest_race(cache: "ArchiveCache", race_entry: dict, cfg, *, base: Path,
                  race_meta: dict | None = None, passages: dict | None = None) -> dict:
    """Rejoue UNE course passée : coupure la veille (ou ``until`` du manifeste) → entrée
    de registre. Une prédiction impossible (🔴) est consignée telle quelle : le refus du
    moteur est une information, pas un échec du banc. ``race_meta`` : calendrier de la
    course (cf. :func:`race_spec_from_meta`) quand le manifeste n'a pas de ``race_json``.
    ``passages`` : ceux de la course, quand on les a — l'entrée porte alors la forme du plan
    jugée contre eux (``forme``)."""
    race_date = date.fromisoformat(race_entry["date"])
    until = (date.fromisoformat(race_entry["until"]) if race_entry.get("until")
             else race_date - timedelta(days=1))
    if until >= race_date:
        raise ValueError(f"{race_entry['name']} : la coupure ({until}) doit précéder la course "
                         f"({race_date}) — fuite de données sinon")
    gpx_path = (Path(base) / race_entry["gpx"]).resolve()
    if race_entry.get("race_json"):
        race = RaceSpec.from_json((Path(base) / race_entry["race_json"]).resolve())
    else:
        race = race_spec_from_meta(race_entry["name"], race_meta)

    course = build_course(gpx_path.read_bytes(), race, cfg)
    result = cache.preview_at(course, until, target_hours=race.target_hours, race=race)
    pred = result.prediction
    actual_h = None if race_entry.get("dnf") else parse_time_h(race_entry.get("official_time"))

    # Les blocs de l'entrée viennent du moteur (twin_engine.registre) : le tableau de bord
    # consigne ses courses courues par les mêmes fonctions, donc dans les mêmes unités.
    entry: dict = {
        "race": race_entry["name"],
        "date": race_entry["date"],
        "until": until.isoformat(),
        "dnf": bool(race_entry.get("dnf", False)),
        "official_time_h": None if actual_h is None else round(actual_h, 3),
        "course": bloc_course(result.course),
        "model": bloc_modele(twin=result.twin, calibration=result.calibration,
                             sufficiency=result.sufficiency, cfg=cfg,
                             n_activities_used=result.n_ingested,
                             n_excluded_until=result.n_excluded_until,
                             n_skipped_ingest=result.n_skipped),
        "race_meta": None if race_meta is None else {
            "start_local": race_meta["start_local"].isoformat(),
            "lat": round(float(race_meta["lat"]), 2), "lon": round(float(race_meta["lon"]), 2),
            "tz": race_meta["tz"], "source": "activité du jour"},
        "prediction": None,
    }
    entry["below_domain"] = sous_le_domaine(actual_h, pred, cfg)
    entry["domain_demand"] = bloc_domaine(result.sufficiency)
    if pred is not None:
        entry["prediction"] = bloc_prediction(pred, actual_h)
        forme = bloc_forme(result.course, race, pred, cfg, passages)
        if forme is not None:
            entry["forme"] = forme
    return entry


__all__ = ["ArchiveCache", "backtest_race", "parse_time_h", "race_spec_from_meta"]
