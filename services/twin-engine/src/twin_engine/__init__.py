"""Locomotion Twin — moteur d'analyse.

Du fichier d'entraînement (.fit/.tcx/.gpx, multi-marques) + la trace GPX d'une course
à une prédiction de temps validée par validation croisée et un plan de pacing par
segment avec fenêtres horaires. Méthode complète : docs/twin-theory.md.
"""

from __future__ import annotations

from .config import Config, load_config

__version__ = "0.1.0"

__all__ = ["Config", "load_config", "__version__"]
