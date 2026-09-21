"""Le dossier d'un rapport : de quoi le REJOUER sans l'archive d'entraînement.

Un athlète qui amende son plan sur la page de son rapport (arrêts, consignes, nutrition,
notes d'assistance) doit récupérer le document refait — pas un aperçu, le document. Or
refaire le document demande tout l'état du calcul : le parcours, le jumeau, la calibration,
la prédiction, la garde de suffisance. Ce que ça ne demande PAS, c'est l'archive : aucun de
ces amendements ne touche ce que l'athlète sait faire. S'arrêter cinq minutes de plus à un
ravitaillement ne change pas sa vitesse critique.

Ce module écrit cet état une fois, à la production du rapport, et sait le relire pour
relancer EXACTEMENT la même chaîne (``build_pacing`` → contexte → gabarits). Un seul chemin
de code, donc aucune dérive possible entre le document d'origine et le document amendé —
c'est la règle qui tient tout le rapport, appliquée à sa régénération.

Ce qui est gardé, et pourquoi :

  * la **trace** du parcours (compressée) — le profil se recalcule d'elle, il ne se
    sérialise pas : trente mille points d'altitude pèsent plus que la trace qui les porte ;
  * le **carnet de route**, seul objet que les amendements touchent ;
  * le **jumeau**, la **calibration**, la **prédiction** et la **suffisance** — déjà
    calculés, jamais recalculés ici ;
  * l'athlète, la référence et la date d'édition, pour que le document refait soit le même
    document.

Aucune donnée brute d'activité : les résumés gardés sont les agrégats que le jumeau porte
déjà, ceux-là mêmes que l'annexe publie.
"""

from __future__ import annotations

import base64
import datetime as dt
import gzip
import json
from dataclasses import fields, is_dataclass
from pathlib import Path
from typing import Any

import numpy as np

from . import calibration as _cal
from . import predict as _pred
from . import sufficiency as _suf
from .course import spec as _spec
from .twin import model as _model
from .twin import record as _rec

VERSION = 1

# Les classes qu'un dossier peut porter. Une classe absente d'ici ne se relit pas : c'est
# voulu — le dossier est un format, pas un vidage de mémoire.
_CLASSES: dict[str, type] = {
    c.__name__: c
    for c in (
        _spec.CrewAccess, _spec.Nutrition, _spec.Reglage, _spec.Phase, _spec.RaceSpec,
        _model.CriticalSpeed, _model.Twin,
        _rec.ActivitySummary, _rec.RecordPoint, _rec.RecordCurve,
        _cal.GenuineUltra, _cal.UltraCalibration, _cal.DomainDemand,
        _pred.CrossValidation, _pred.Prediction,
        _suf.Criterion, _suf.Sufficiency,
    )
}


# --------------------------------------------------------------------------- #
# Encodage : des dataclasses, des tableaux numpy, des dates — et rien d'autre
# --------------------------------------------------------------------------- #
def _encode(v: Any) -> Any:
    if is_dataclass(v) and not isinstance(v, type):
        nom = type(v).__name__
        if nom not in _CLASSES:
            raise TypeError(f"dossier : classe non déclarée « {nom} »")
        return {"_c": nom, "v": {f.name: _encode(getattr(v, f.name)) for f in fields(v)}}
    if isinstance(v, np.ndarray):
        return {"_np": [_encode(x) for x in v.tolist()]}
    if isinstance(v, (np.floating, np.integer, np.bool_)):
        return v.item()
    if isinstance(v, dt.datetime):
        return {"_dt": v.isoformat()}
    if isinstance(v, dt.date):
        return {"_d": v.isoformat()}
    if isinstance(v, Path):
        return {"_p": str(v)}
    if isinstance(v, tuple):
        return {"_t": [_encode(x) for x in v]}
    if isinstance(v, list):
        return [_encode(x) for x in v]
    if isinstance(v, dict):
        return {"_m": [[_encode(k), _encode(x)] for k, x in v.items()]}
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    raise TypeError(f"dossier : type non sérialisable « {type(v).__name__} »")


def _decode(v: Any) -> Any:
    if isinstance(v, list):
        return [_decode(x) for x in v]
    if not isinstance(v, dict):
        return v
    if "_c" in v:
        cls = _CLASSES[v["_c"]]
        return cls(**{k: _decode(x) for k, x in v["v"].items()})
    if "_np" in v:
        return np.asarray([_decode(x) for x in v["_np"]])
    if "_dt" in v:
        return dt.datetime.fromisoformat(v["_dt"])
    if "_d" in v:
        return dt.date.fromisoformat(v["_d"])
    if "_p" in v:
        return Path(v["_p"])
    if "_t" in v:
        return tuple(_decode(x) for x in v["_t"])
    if "_m" in v:
        return {_decode(k): _decode(x) for k, x in v["_m"]}
    return {k: _decode(x) for k, x in v.items()}


# --------------------------------------------------------------------------- #
# Écrire, relire
# --------------------------------------------------------------------------- #
class Dossier:
    """L'état d'un rapport, prêt à être rejoué. Les objets sont ceux du moteur."""

    __slots__ = ("course_gpx", "race", "twin", "calibration", "prediction", "sufficiency",
                 "athlete", "report_ref", "report_date", "version")

    def __init__(self, *, course_gpx: bytes, race, twin, calibration, prediction, sufficiency,
                 athlete: str, report_ref: str, report_date, version: int = VERSION):
        self.course_gpx = course_gpx
        self.race = race
        self.twin = twin
        self.calibration = calibration
        self.prediction = prediction
        self.sufficiency = sufficiency
        self.athlete = athlete
        self.report_ref = report_ref
        self.report_date = report_date
        self.version = version


def to_payload(*, course_gpx: bytes, race, twin, calibration, prediction, sufficiency,
               athlete: str, report_ref: str, report_date) -> dict:
    """Le dossier en objet JSON-able. La trace part compressée : c'est la pièce lourde."""
    return {
        "version": VERSION,
        "athlete": athlete,
        "report_ref": report_ref,
        "report_date": _encode(report_date),
        "course_gpx_gz": base64.b64encode(gzip.compress(course_gpx, 9)).decode("ascii"),
        "race": _encode(race),
        "twin": _encode(twin),
        "calibration": _encode(calibration),
        "prediction": _encode(prediction),
        "sufficiency": _encode(sufficiency),
    }


def from_payload(payload: dict) -> Dossier:
    """Relit un dossier. Une version inconnue s'arrête ici plutôt que de rendre un document
    faux : un format qui change sans le dire est pire qu'un format qui refuse."""
    version = int(payload.get("version", 0))
    if version != VERSION:
        raise ValueError(f"dossier de version {version}, ce moteur lit la version {VERSION}")
    return Dossier(
        course_gpx=gzip.decompress(base64.b64decode(payload["course_gpx_gz"])),
        race=_decode(payload["race"]),
        twin=_decode(payload["twin"]),
        calibration=_decode(payload["calibration"]),
        prediction=_decode(payload["prediction"]),
        sufficiency=_decode(payload["sufficiency"]),
        athlete=payload["athlete"],
        report_ref=payload["report_ref"],
        report_date=_decode(payload["report_date"]),
        version=version,
    )


def ecrire(chemin: str | Path, **kwargs) -> Path:
    """Écrit le dossier à ``chemin`` (JSON compact) et rend son chemin."""
    p = Path(chemin)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(to_payload(**kwargs), ensure_ascii=False, separators=(",", ":")),
                 encoding="utf-8")
    return p


def lire(chemin: str | Path) -> Dossier:
    return from_payload(json.loads(Path(chemin).read_text(encoding="utf-8")))


# --------------------------------------------------------------------------- #
# Amender, puis refaire les documents
# --------------------------------------------------------------------------- #
# Ce qu'un athlète peut amender depuis la page de son rapport, et rien d'autre. Les trois
# champs sont ceux du formulaire (apps/site, FormulairePlan) et du carnet de route : ses
# arrêts et ses consignes, ce que son assistance prépare, ses débits déclarés. Tout le
# reste — la prédiction, le jumeau, la validation — vient de son archive et ne se touche
# pas d'un navigateur.
AMENDABLE = ("reglages", "crew", "nutrition")


def appliquer(race, fragment: dict | None):
    """Le carnet de route, amendé du fragment que la page renvoie.

    Le fragment sort entier par champ (toute la liste des réglages, toute la liste des
    points d'assistance) : recoller un fragment partiel retirerait les points qu'on n'a pas
    touchés. Un champ absent du fragment n'est pas modifié ; un champ inconnu est une
    erreur, jamais un silence.
    """
    from dataclasses import replace

    if not fragment:
        return race
    inconnus = [k for k in fragment if k not in AMENDABLE]
    if inconnus:
        raise ValueError(f"amendement : champ(s) non amendable(s) {inconnus} "
                         f"(attendus : {', '.join(AMENDABLE)})")
    # RaceSpec.from_dict sait lire ces trois champs : on repasse par lui plutôt que de
    # refaire la conversion à la main, pour que la page et le carnet de route restent lus
    # par le même code.
    brut = {**_spec_to_dict(race), **fragment}
    return replace(race, **{k: getattr(_spec.RaceSpec.from_dict(brut), k) for k in AMENDABLE})


def _spec_to_dict(race) -> dict:
    """Le carnet de route sous sa forme JSON, pour le relire amendé."""
    return {
        "name": race.name,
        "aid_km": list(race.aid_km),
        "aid_names": list(race.aid_names),
        "reglages": [{"aid_index": r.aid_index,
                      **({"stop_min": r.stop_min} if r.stop_min is not None else {}),
                      **({"consigne": r.consigne} if r.consigne else {})}
                     for r in race.reglages],
        "crew": [{"aid_index": c.aid_index, "note": c.note} for c in race.crew],
        "nutrition": {"water_l_per_h": race.nutrition.water_l_per_h,
                      "carbs_g_per_h": race.nutrition.carbs_g_per_h},
    }


def regenerer(d: Dossier, fragment: dict | None, *, cfg, out_dir, report_date=None,
              feuille_only: bool = False) -> dict:
    """Refait les documents d'un rapport, amendés — sans l'archive d'entraînement.

    Rejoue la MÊME chaîne que la production d'origine (``pipeline.rendre_documents``) :
    le plan, les figures, le contexte, le rapport, la feuille, les fiches et les livrables.
    Le jumeau, la calibration et la prédiction sont relus tels quels — les amender
    demanderait l'archive, et aucun réglage de la page ne les touche.

    Rend {nom de fichier: chemin}, rapport compris.
    """
    from .course import build_course
    from .feasibility import assess_target
    from .pipeline import rendre_documents

    race = appliquer(d.race, fragment)
    course = build_course(d.course_gpx, race, cfg)
    pente = d.twin.slope_factors(cfg)
    if pente is not None:
        course = course.with_slope_cost(*pente)
    target = (assess_target(race.target_hours, course, d.twin, d.prediction, cfg)
              if race.target_hours else None)

    out = Path(out_dir)
    _, pdf, _, livrables = rendre_documents(
        course=course, twin=d.twin, calibration=d.calibration, prediction=d.prediction,
        sufficiency=d.sufficiency, target=target, race=race, cfg=cfg, out_dir=out,
        athlete=d.athlete, report_ref=d.report_ref,
        report_date=report_date or d.report_date, feuille_only=feuille_only,
    )
    sortie = {nom: chemin for nom, chemin in livrables.items()}
    if pdf is not None:
        sortie["rapport.pdf"] = pdf
    return sortie


__all__ = ["AMENDABLE", "VERSION", "Dossier", "appliquer", "ecrire", "from_payload", "lire",
           "regenerer", "to_payload"]
