"""Le jumeau d'un athlète, gardé sous une forme que le moteur sait RELIRE.

L'archive d'entraînement est lue une fois, à l'ingestion, puis supprimée. Tout ce qui
vient ensuite — chaque plan, chaque version, sur n'importe quelle course — repart du
jumeau et de la calibration. Il faut donc les garder entiers : un résumé (vitesse
critique, endurance…) suffit à la fiche de l'athlète, pas à une prédiction.

Ils sont écrits avec l'encodeur du dossier (``twin_engine.dossier``) : c'est le format
que le moteur relit déjà pour refaire un rapport amendé, déjà éprouvé sur les mêmes
objets. Pas de second format à maintenir.
"""

from __future__ import annotations

from pathlib import Path

from .. import dossier as _dossier
from .magasin import ecrire_json, lire_json

# Ce que porte un fichier de jumeau. Un fichier sans cette marque — ou d'une version du
# dossier que ce moteur ne lit pas — ne se relit pas : on redemande l'ingestion plutôt
# que de décoder de travers.
FORMAT = "twin-engine/jumeau"


class JumeauIllisible(RuntimeError):
    """Pas de jumeau relisible pour cet athlète : il faut (ré)ingérer son archive."""


def ecrire_le_jumeau(repertoire: Path, twin, calibration) -> None:
    ecrire_json(Path(repertoire) / "jumeau.json", {
        "format": FORMAT, "version": _dossier.VERSION, "twin": _dossier._encode(twin),
    })
    ecrire_json(Path(repertoire) / "calibration.json", {
        "format": FORMAT, "version": _dossier.VERSION,
        "calibration": _dossier._encode(calibration),
    })


def _lire(repertoire: Path, nom: str, cle: str):
    brut = lire_json(Path(repertoire) / nom)
    if not isinstance(brut, dict) or brut.get("format") != FORMAT:
        raise JumeauIllisible(
            f"{nom} absent ou d'un format ancien : ré-ingère l'archive de cet athlète"
        )
    if brut.get("version") != _dossier.VERSION:
        raise JumeauIllisible(
            f"{nom} en version {brut.get('version')}, ce moteur lit la version "
            f"{_dossier.VERSION} : ré-ingère l'archive"
        )
    return _dossier._decode(brut[cle])


def lire_le_jumeau(repertoire: Path):
    return _lire(repertoire, "jumeau.json", "twin")


def lire_la_calibration(repertoire: Path):
    return _lire(repertoire, "calibration.json", "calibration")


__all__ = ["FORMAT", "JumeauIllisible", "ecrire_le_jumeau", "lire_la_calibration",
           "lire_le_jumeau"]
