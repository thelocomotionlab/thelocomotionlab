"""Les huit sorties de l'analyse de référence de Nice 2026, sur le fichier de course réel.

Actif seulement si ``TWIN_NICE2026_GPX`` désigne le GPX COROS de la course (hors git) :

    TWIN_NICE2026_GPX=/chemin/nice-2026.gpx pytest services/twin-engine -k nice_2026

Deux vérifications : le fichier décodé par le moteur (horloge réparée, grille à la
seconde, cadence et distance de la montre) rend les valeurs de référence relevées sur le
fichier brut, et les deux lectures, brute et décodée, s'accordent entre elles. Ces valeurs
décrivent la course ; elles ne sont pas des cibles du modèle.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.analyses import nice_2026_descentes as nice  # noqa: E402

GPX = os.environ.get("TWIN_NICE2026_GPX")
fichier_reel = pytest.mark.skipif(not GPX or not Path(GPX).exists(),
                                  reason="TWIN_NICE2026_GPX absent (fichier de course hors git)")

MIN = 1.0 / 60.0

# (valeur, tolérance) : la tolérance couvre l'arrondi de la sortie imprimée
REFERENCE = {
    "arrets_h": (4 + 13 / 60, 1.5 * MIN),
    "mouvement_h": (30 + 51 / 60, 1.5 * MIN),
    "descente_avant_marche": (0.07, 0.006),
    "descente_apres_marche": (0.35, 0.006),
    "hache_avant": (0.20, 0.006),
    "hache_apres": (0.69, 0.006),
    "hache_avant_h": (56 / 60, 1.5 * MIN),
    "hache_apres_h": (3 + 7 / 60, 1.5 * MIN),
    "bascules_avant": (0.43, 0.006),
    "bascules_apres": (1.22, 0.006),
    "fc_apres_courable": (147.0, 0.6),
    "fc_apres_hache": (133.0, 0.6),
    "perte_min": (67.0, 0.6),
    "fatigue_min": (36.0, 0.6),
    "terrain_min": (31.0, 0.6),
    "surcout_hache_frais": (0.08, 0.006),
    "surcout_hache_fatigue": (0.18, 0.006),
}
FORME = {"Minetti": (19, 48, 51), "κ avant course": (9, 26, 26), "κ, descente sans borne": (7, 16, 19)}


@pytest.fixture(scope="module")
def decodee():
    return nice.analyser(nice.lire_activite(GPX))


@pytest.fixture(scope="module")
def brute():
    return nice.analyser(nice.lire_gpx(GPX))


def _segment(o, nom):
    return next(s for s in o["segments"] if s["vers"] == nom)


def _verifier(o):
    for cle, (valeur, tol) in REFERENCE.items():
        assert o[cle] == pytest.approx(valeur, abs=tol), cle
    assert o["mouvement_reel_h"] / o["mouvement_plan_h"] - 1 == pytest.approx(-0.047, abs=0.0006)
    assert _segment(o, "Isola")["mouvement_reel_sur_plan"] == pytest.approx(1.31, abs=0.006)
    assert _segment(o, "Tourrette-Levens")["mouvement_reel_sur_plan"] == pytest.approx(1.39, abs=0.006)
    courable = [1 - r["apres_courable"] / r["avant"] for r in o["vitesses"]]
    hachee = [1 - r["apres_hache"] / r["avant"] for r in o["vitesses"]]
    assert np.nanmin(courable) == pytest.approx(0.10, abs=0.006)
    assert np.nanmax(courable) == pytest.approx(0.25, abs=0.006)
    assert np.nanmin(hachee) == pytest.approx(0.30, abs=0.006)
    assert np.nanmax(hachee) == pytest.approx(0.35, abs=0.006)
    for nom, attendu in FORME.items():
        assert np.round(o["forme"][nom]) == pytest.approx(attendu, abs=0.6), nom


@fichier_reel
def test_raw_file_gives_the_reference_values(brute):
    _verifier(brute)


@fichier_reel
def test_decoded_activity_gives_the_reference_values(decodee):
    _verifier(decodee)


@fichier_reel
def test_raw_and_decoded_readings_agree(brute, decodee):
    assert decodee["horloge"] and len(decodee["horloge"]) == len(brute["horloge"])
    for cle in REFERENCE:
        assert decodee[cle] == pytest.approx(brute[cle], rel=0.01, abs=0.01), cle
    for a, b in zip(brute["segments"], decodee["segments"]):
        assert b["mouvement_reel_sur_plan"] == pytest.approx(a["mouvement_reel_sur_plan"], abs=0.01)
    for nom in FORME:
        assert decodee["forme"][nom] == pytest.approx(brute["forme"][nom], abs=1.0)


# --------------------------------------------------------------------------- #
# Toujours actif : le script tourne sur une course synthétique, par ses deux lectures
# --------------------------------------------------------------------------- #
@pytest.mark.filterwarnings("ignore::RuntimeWarning")
def test_reference_analysis_runs_on_a_synthetic_race(tmp_path):
    """Une course en dents de scie (±15 %) dont les descentes de la fin se font en partie
    à la marche, avec deux accidents d'horloge : les deux lectures s'accordent et voient
    les descentes hachées là où elles sont."""
    from _gpx_coros import gpx_coros, point

    pts, d, alt = [], 0.0, 1000.0
    n = 9000
    for i in range(n):
        phase = (d // 500.0) % 2                     # 500 m de montée, 500 m de descente
        fin = d > 12_000.0
        marche = fin and phase == 1 and (i // 40) % 2 == 0
        v = 1.0 if phase == 0 else (1.3 if marche else 2.6)
        cad = 55.0 if (phase == 0 or marche) else 86.0
        t = float(i)
        if i == 2000:
            t += 2 * nice.SAUT_HORLOGE_S              # horodatage isolé aberrant
        if i >= 6000:
            t -= 20.0                                 # recul d'horloge
        pts.append(point(t, d, alt, hr=140.0, cad_per_foot=cad))
        d += v
        alt += v * (0.15 if phase == 0 else -0.15)
    chemin = tmp_path / "course.gpx"
    chemin.write_bytes(gpx_coros(pts))

    brute = nice.analyser(nice.lire_gpx(str(chemin)))
    decodee = nice.analyser(nice.lire_activite(str(chemin)))
    assert len(brute["horloge"]) == len(decodee["horloge"]) == 2
    assert decodee["hache_apres"] > decodee["hache_avant"]
    assert decodee["descente_apres_marche"] > decodee["descente_avant_marche"]
    for cle in ("arrets_h", "mouvement_h", "descente_avant_marche", "descente_apres_marche",
                "hache_avant", "hache_apres"):
        assert decodee[cle] == pytest.approx(brute[cle], abs=0.02), cle
    for nom in FORME:
        assert decodee["forme"][nom] == pytest.approx(brute["forme"][nom], abs=1.0)
