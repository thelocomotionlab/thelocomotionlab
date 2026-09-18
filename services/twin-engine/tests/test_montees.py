"""Les montées du parcours : découpage à hystérésis, classement en kilomètres verticaux,
pentes moyennes — et ce que le rapport en dit."""

from __future__ import annotations

import math

import pytest

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.course.montees import classe_kv, compte_par_classe, montees, pentes

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


def test_classe_kv_names_the_climb_by_half_vertical_kilometres():
    assert classe_kv(500) == (1, "demi-KV")
    assert classe_kv(1000) == (2, "KV")
    assert classe_kv(1480) == (3, "KV et demi")
    assert classe_kv(2000) == (4, "double KV")
    assert classe_kv(2500)[1] == "2,5 KV"
    assert classe_kv(3000)[1] == "3 KV"
    # un dénivelé se range à la classe la PLUS PROCHE, pas à la classe du dessous
    assert classe_kv(760)[1] == "KV" and classe_kv(740)[1] == "demi-KV"


def test_a_single_climb_is_read_whole():
    liste = montees(_course(_triangle))
    assert len(liste) == 1
    m = liste[0]
    assert m.label == "3 KV"
    assert m.dplus_m == pytest.approx(3000, abs=20)
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
    assert len(petit) == 1 and petit[0].dplus_m == pytest.approx(1980, abs=60)
    assert len(grand) == 2


def test_a_bump_under_the_threshold_is_not_a_climb():
    def bosse(u):
        if u < 0.40: return 3000 * u                            # noqa: E701  montée de 1 200 m
        if u < 0.60: return 1200 - 6000 * (u - 0.40)            # noqa: E701  retour à zéro
        if u < 0.75: return 1000 * (u - 0.60)                   # noqa: E701  bosse de 150 m
        return 150 - 600 * (u - 0.75)

    liste = montees(_course(bosse))
    assert [m.label for m in liste] == ["KV"]                   # la bosse de 150 m ne compte pas


def test_slopes_are_read_uphill_and_downhill_separately():
    """Une « pente moyenne » sur un aller-retour vaut zéro : ce qui se lit, c'est la pente
    quand ça monte, celle quand ça descend, et la part de chacune."""
    p = pentes(_course(_triangle))
    assert p["up_pct"] == pytest.approx(10.0, abs=0.3)
    assert p["down_pct"] == pytest.approx(-10.0, abs=0.3)
    assert p["part_up_pct"] == pytest.approx(50, abs=1)
    assert p["part_down_pct"] == pytest.approx(50, abs=1)


def test_classes_are_counted_from_the_hardest():
    def deux(u):
        if u < 0.25: return 8000 * u                            # noqa: E701
        if u < 0.40: return 2000 - 12000 * (u - 0.25)           # noqa: E701
        if u < 0.65: return 200 + 4000 * (u - 0.40)             # noqa: E701
        return 1200 - 3400 * (u - 0.65)

    compte = compte_par_classe(montees(_course(deux)))
    assert [c["label"] for c in compte] == ["double KV", "KV"]
    assert all(c["n"] == 1 for c in compte)


def test_the_report_says_what_the_course_demands():
    """Le bloc « caractéristiques » du contexte : des phrases, des lignes de tableau, et pas
    un chiffre écrit à la main — la définition du KV elle-même sort du module."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent))
    from test_report_v3 import context

    c = context()[0]["caracteristiques"]
    assert c["n_montees"] == 1 and c["montees"][0]["label"] == "3 KV"
    assert "Une seule montée" in c["resume"] and "3 KV" in c["resume"]
    assert c["plus_dure"] == ""                       # une seule montée : rien à comparer
    assert "demi-KV" in c["legende"] and "double KV" in c["legende"]
    assert c["pente_montee"] == "6,0" and c["part_montee"] == "50"
