"""Parcours : Minetti, Deq, découpage. Validation sur un profil synthétique connu.

Le golden test sur le vrai parcours Nice (→ segments.json) s'active quand la trace GPX
est fournie (cf. test_golden.py). Ici on valide la MÉCANIQUE sur une géométrie maîtrisée.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.minetti import cost_of_running, grade_factor

EXAMPLES = Path(__file__).parents[1] / "examples"


def test_minetti_reference_values():
    # Cr(0) = 3.6 exactement ; facteur de pente = 1 à plat
    assert abs(float(cost_of_running(0.0)) - 3.6) < 1e-9
    assert abs(float(grade_factor(0.0, 3.6)) - 1.0) < 1e-9
    # en montée, f > 1 ; en descente douce, f < 1
    assert float(grade_factor(0.10, 3.6)) > 1.0
    assert float(grade_factor(-0.10, 3.6)) < 1.0
    # plafond appliqué
    assert float(grade_factor(0.45, 3.6, cap=3.0)) == 3.0


def _triangle_gpx(climb_m=1000.0, half_km=5.0, n=400) -> bytes:
    """Profil triangulaire : montée régulière puis descente symétrique.

    Avance vers l'est pour une distance horizontale ≈ 2*half_km ; altitude monte de 0
    à climb_m puis redescend. D+ attendu ≈ climb_m (un peu rogné par le lissage).
    """
    lat0, lon0 = 43.70, 7.26
    total = 2 * half_km * 1000.0
    pts = []
    for i in range(n + 1):
        x = total * i / n
        ele = climb_m * (x / (half_km * 1000.0)) if x <= half_km * 1000.0 \
            else climb_m * (2 - x / (half_km * 1000.0))
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        pts.append((lat0, lon0 + dlon, ele))
    rows = "\n".join(
        f'<trkpt lat="{a:.6f}" lon="{b:.6f}"><ele>{c:.2f}</ele></trkpt>' for a, b, c in pts
    )
    return (
        '<?xml version="1.0"?>'
        '<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>'
        f"{rows}</trkseg></trk></gpx>"
    ).encode()


def test_triangle_profile_dplus_and_deq():
    cfg = load_config()
    race = RaceSpec(
        name="Triangle test",
        aid_km=(0.0, 5.0, 10.0),
        aid_names=("départ", "sommet", "arrivée"),
    )
    course = build_course(_triangle_gpx(), race, cfg)

    # longueur officielle respectée (rescale)
    assert abs(course.length_km - 10.0) < 0.05
    # D+ ≈ 1000 m (le lissage 150 m rogne légèrement le sommet)
    assert 950 < course.dplus_m < 1000
    assert abs(course.dplus_m - course.dminus_m) < 5  # symétrique
    # Deq > distance réelle (la pente coûte) et cohérent par segment
    assert course.deq_km > course.length_km
    assert len(course.segments) == 2
    seg_deq = sum(s.deq_km for s in course.segments)
    assert abs(seg_deq - course.deq_km) < 0.2
    seg_dplus = sum(s.dplus_m for s in course.segments)
    assert abs(seg_dplus - course.dplus_m) < 5
    # 1er segment monte, 2e descend
    assert course.segments[0].mean_grade_pct > 0
    assert course.segments[1].mean_grade_pct < 0


def test_dplus_per_km():
    cfg = load_config()
    race = RaceSpec("T", (0.0, 10.0), ("a", "b"))
    course = build_course(_triangle_gpx(), race, cfg)
    assert abs(course.dplus_per_km - course.dplus_m / course.length_km) < 1e-9


def test_nice_spec_loads_from_json():
    race = RaceSpec.from_json(EXAMPLES / "nice-100m.json")
    assert race.n_segments == 16
    assert race.official_finish_km == 167.2
    assert race.major_base_indices == (4, 8, 11)
    assert race.start_time is not None and race.start_time.hour == 13
    assert race.lat == 43.703


def test_spec_validation_rejects_mismatch():
    import pytest

    with pytest.raises(ValueError):
        RaceSpec("bad", (0.0, 5.0), ("only-one",))
    with pytest.raises(ValueError):
        RaceSpec("bad", (0.0, 5.0, 3.0), ("a", "b", "c"))  # non croissant


# --------------------------------------------------------------------------- #
# Mode GPX-only : aucun ravitaillement → distance depuis la trace + découpage auto.
def test_empty_spec_is_gpx_only():
    race = RaceSpec(name="Sans ravitos")
    assert not race.has_aid_stations
    assert race.official_finish_km is None
    assert race.n_segments == 0
    assert RaceSpec().name == "Course"  # défaut


def test_gpx_only_distance_and_dplus_come_from_trace():
    cfg = load_config()
    # course de 32 km horizontaux, +1000 m : AUCUN aid_km fourni
    course = build_course(_triangle_gpx(climb_m=1000.0, half_km=16.0), RaceSpec(name="Crasse"), cfg)
    # longueur = celle du GPX (3D), pas un chiffre officiel imposé
    assert 32.0 < course.length_km < 33.0
    assert 950 < course.dplus_m < 1000            # D+ depuis la trace (lissage rogne un peu)
    assert abs(course.dplus_m - course.dminus_m) < 5
    assert course.deq_km > course.length_km        # la pente coûte


def test_gpx_only_auto_segmentation_every_10km():
    cfg = load_config()
    course = build_course(_triangle_gpx(climb_m=1000.0, half_km=16.0), RaceSpec(name="C"), cfg)
    # ~32,1 km → bornes 0/10/20/30/arrivée = 4 segments
    assert len(course.segments) == 4
    assert course.segments[0].frm == "Départ"
    assert course.segments[1].frm == "km 10"
    assert course.segments[-1].to == "Arrivée"
    # cohérence : la somme des segments reconstitue le total
    assert abs(sum(s.dplus_m for s in course.segments) - course.dplus_m) < 5
    assert abs(sum(s.off_len for s in course.segments) - course.length_km) < 0.1


def test_gpx_only_short_course_single_segment():
    cfg = load_config()
    course = build_course(_triangle_gpx(climb_m=200.0, half_km=3.0), RaceSpec(name="C"), cfg)
    assert len(course.segments) == 1            # < 10 km → départ→arrivée
    assert course.segments[0].frm == "Départ" and course.segments[0].to == "Arrivée"


def test_custom_segment_length_is_configurable():
    import dataclasses

    cfg = load_config()
    cfg5 = dataclasses.replace(cfg, course=dataclasses.replace(cfg.course, default_segment_km=5.0))
    course = build_course(_triangle_gpx(climb_m=1000.0, half_km=16.0), RaceSpec(name="C"), cfg5)
    assert len(course.segments) == 7            # ~32 km / 5 → 0,5,…,30,arrivée
