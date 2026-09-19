"""Les montées du parcours : découpage à hystérésis, classement en kilomètres verticaux,
pentes moyennes — et ce que le rapport en dit."""

from __future__ import annotations

import math

import pytest

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.course.montees import descentes, montees, pentes

CFG = load_config()


def _gpx(profil, n: int = 4000, length_m: float = 60_000.0) -> bytes:
    """Une trace plein est-ouest dont l'altitude suit ``profil(u)``, u de 0 à 1."""
    lat0, lon0 = 44.0, 6.0
    pts = []
    for i in range(n + 1):
        x = length_m * i / n
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        pts.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}">'
                   f'<ele>{profil(x / length_m):.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(pts)}</trkseg></trk></gpx>').encode()


def _course(profil):
    return build_course(_gpx(profil), RaceSpec(name="Essai"), CFG)


def _triangle(u):
    return 6000 * u if u <= 0.5 else 6000 * (1 - u)

def test_a_single_climb_is_read_whole():
    liste = montees(_course(_triangle))
    assert len(liste) == 1
    m = liste[0]
    assert m.denivele_m == pytest.approx(3000, abs=20)
    assert m.from_km == pytest.approx(0.0, abs=0.2)
    assert m.to_km == pytest.approx(30.0, abs=0.3)
    assert m.grade_pct == pytest.approx(10.0, abs=0.3)


def test_a_dip_does_not_cut_a_climb_but_a_real_descent_does():
    """Un faux plat descendant ne fait pas deux montées ; une vraie descente, si."""
    def creux(taille):
        def f(u):
            if u < 0.30: return 4000 * u                       # noqa: E701
            if u < 0.34: return 1200 - taille * (u - 0.30) / 0.04   # noqa: E701
            if u < 0.60: return 1200 - taille + 3000 * (u - 0.34)   # noqa: E701
            return max(1980 - taille - 6000 * (u - 0.60), 0)
        return f

    petit = montees(_course(creux(25)))
    grand = montees(_course(creux(300)))
    assert len(petit) == 1 and petit[0].denivele_m == pytest.approx(1980, abs=60)
    assert len(grand) == 2


def test_a_bump_under_the_threshold_is_not_a_climb():
    def bosse(u):
        if u < 0.40: return 3000 * u                            # noqa: E701  montée de 1 200 m
        if u < 0.60: return 1200 - 6000 * (u - 0.40)            # noqa: E701  retour à zéro
        if u < 0.75: return 1000 * (u - 0.60)                   # noqa: E701  bosse de 150 m
        return 150 - 600 * (u - 0.75)

    liste = montees(_course(bosse))
    assert len(liste) == 1 and liste[0].denivele_m == pytest.approx(1200, abs=40)


def test_slopes_are_read_uphill_and_downhill_separately():
    """Une « pente moyenne » sur un aller-retour vaut zéro : ce qui se lit, c'est la pente
    quand ça monte, celle quand ça descend, et la part de chacune."""
    p = pentes(_course(_triangle), plat_pct=CFG.course.flat_grade_pct)
    assert p["up_pct"] == pytest.approx(10.0, abs=0.3)
    assert p["down_pct"] == pytest.approx(-10.0, abs=0.3)
    assert p["part_up_pct"] == pytest.approx(50, abs=1)
    assert p["part_down_pct"] == pytest.approx(50, abs=1)

def test_climbs_and_descents_are_read_with_the_same_rule():
    """Le découpage sert les deux sens : c'est ce qui permet de comparer la plus grosse
    montée et la plus grosse descente d'un parcours sans changer de règle en route."""
    haut = montees(_course(_triangle))
    bas = descentes(_course(_triangle))
    assert len(haut) == 1 and len(bas) == 1
    assert haut[0].denivele_m == pytest.approx(bas[0].denivele_m, rel=0.02)
    assert haut[0].grade_pct > 0 > bas[0].grade_pct
