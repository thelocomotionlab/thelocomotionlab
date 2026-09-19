"""La géométrie du parcours : ce qui la fixe, ce qui n'a pas le droit de la bouger.

Le golden couvrait la prédiction, pas la trace. Entre deux rapports de septembre 2026, la
distance, le D+ et les dénivelés par segment ont bougé sans qu'aucune ligne de
``course/profile.py`` ne change : le carnet de route avait été remplacé, et la trace avec.
Ces tests épinglent la géométrie d'un parcours de référence et nomment ce qui la déplace.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import numpy as np
import pytest

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course

CFG = load_config()
FIX = Path(__file__).parent / "fixtures"

# Tolérances DÉCLARÉES du test. Sur les totaux, un pour mille : la chaîne est déterministe,
# seul un changement de règle les déplace. Sur un segment, un demi pour cent ou deux mètres —
# le plus grand des deux — parce qu'un segment court amplifie l'arrondi de ses bornes.
TOL_TOTAL = 0.001
TOL_SEGMENT_REL = 0.005
TOL_SEGMENT_ABS = 2.0


def parcours_reference() -> bytes:
    """Un parcours de montagne déterministe : 170 km, quatre grands cols et du bruit de GPS.

    Écrit ici plutôt que déposé en fixture : une trace de 8 000 points pèse un mégaoctet, et
    ce qu'on épingle, c'est le calcul, pas le fichier.
    """
    n, length_m = 8000, 170_000.0
    rng = np.random.default_rng(20260919)
    lat0, lon0 = 44.1, 7.0
    u = np.linspace(0.0, 1.0, n + 1)
    ele = (900.0
           + 700.0 * np.sin(2 * np.pi * u * 4.0)
           + 500.0 * np.sin(2 * np.pi * u * 1.3)
           + np.convolve(rng.normal(0.0, 18.0, n + 1), np.ones(25) / 25, mode="same"))
    pts = []
    for i, uu in enumerate(u):
        x = length_m * uu
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        pts.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}">'
                   f'<ele>{ele[i]:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(pts)}</trkseg></trk></gpx>').encode()


CARNET = (0.0, 8.1, 16.5, 30.3, 38.9, 51.4, 65.0, 69.7, 84.8, 95.1,
          112.4, 124.4, 130.9, 142.9, 150.0, 159.1, 169.7)
NOMS = ("Départ", "Le Pont", "La Cabane", "Le Col", "La Source", "Le Refuge", "La Combe",
        "Le Hameau", "Le Plan", "Les Granges", "La Chapelle", "Le Bourg", "La Crête",
        "Le Village", "La Vallée", "Le Plateau", "Arrivée")


def _course(aid=CARNET, noms=NOMS, cfg=CFG):
    race = RaceSpec(name="Parcours de référence", aid_km=aid, aid_names=noms)
    return build_course(parcours_reference(), race, cfg)


# --------------------------------------------------------------------------- #
# Ce qui est épinglé : la géométrie du parcours de référence, totaux et segments
# --------------------------------------------------------------------------- #
ATTENDU_TOTAL = {"length_km": 169.7, "dplus_m": 5945.6, "dminus_m": 5471.7, "deq_km": 185.03}
ATTENDU_SEGMENTS = [
    (1, 844.0, 0.0), (2, 121.3, 156.8), (3, 0.0, 993.0), (4, 344.1, 27.1),
    (5, 855.8, 0.8), (6, 7.7, 1126.3), (7, 0.0, 521.5), (8, 529.6, 286.3),
    (9, 616.1, 2.4), (10, 7.1, 1158.8), (11, 597.9, 83.9), (12, 795.9, 0.0),
    (13, 533.3, 101.2), (14, 0.0, 550.3), (15, 5.2, 458.5), (16, 687.5, 4.8),
]


def test_the_reference_course_geometry_is_pinned():
    """Distance, D+, D−, Deq et le D+/D− de chaque segment. Si un de ces chiffres bouge sans
    qu'une règle ait changé, c'est une régression — pas une amélioration silencieuse."""
    c = _course()
    for cle, attendu in ATTENDU_TOTAL.items():
        obtenu = float(getattr(c, cle))
        assert abs(obtenu - attendu) <= TOL_TOTAL * attendu, f"{cle} : {obtenu} ≠ {attendu}"
    assert len(c.segments) == len(ATTENDU_SEGMENTS)
    for seg, (idx, dplus, dminus) in zip(c.segments, ATTENDU_SEGMENTS):
        assert seg.index == idx
        for nom, obtenu, attendu in (("D+", seg.dplus_m, dplus), ("D−", seg.dminus_m, dminus)):
            tol = max(TOL_SEGMENT_REL * attendu, TOL_SEGMENT_ABS)
            assert abs(obtenu - attendu) <= tol, f"segment {idx} {nom} : {obtenu} ≠ {attendu}"


def test_the_roadbook_moves_the_segments_but_never_the_totals():
    """La leçon de la régression de septembre : changer le carnet de route change la distance
    AFFICHÉE et le découpage, jamais le D+ ni le D− mesurés sur la trace. Un total qui bouge
    accuse la trace ou le lissage, jamais le carnet."""
    ancien = (0.0, 8.1, 16.5, 28.9, 38.0, 50.1, 63.7, 68.4, 83.5, 93.8,
              109.8, 121.8, 128.3, 140.4, 147.4, 156.5, 167.2)
    a, b = _course(aid=ancien), _course()
    assert a.dplus_m == b.dplus_m and a.dminus_m == b.dminus_m
    assert a.deq_km == b.deq_km
    # la grille s'arrête un pas avant la fin de la trace : la distance affichée est celle du
    # carnet à quelques mètres près, jamais autre chose
    assert abs(a.length_km - 167.2) < 0.01 and abs(b.length_km - 169.7) < 0.01
    # et les segments, eux, ne couvrent plus le même terrain
    assert [round(s.dminus_m) for s in a.segments] != [round(s.dminus_m) for s in b.segments]


def test_only_the_smoothing_window_moves_the_totals():
    """Le lissage de l'altimétrie est la SEULE règle de config qui déplace le D+ : on mesure
    de combien, pour qu'un écart observé puisse être attribué ou écarté."""
    from dataclasses import replace

    mesures = {}
    for w in (100.0, 150.0, 200.0):
        cfg = replace(CFG, course=replace(CFG.course, smooth_window_m=w))
        mesures[w] = _course(cfg=cfg).dplus_m
    assert mesures[100.0] > mesures[150.0] > mesures[200.0]
    # une fenêtre à 100 m au lieu de 150 ne gagne qu'environ 1 % de D+ : un écart de 3 %
    # entre deux rapports ne peut pas venir de là
    assert abs(mesures[100.0] / mesures[150.0] - 1.0) < 0.02


def _montee_ondulee(periode_m: float, amplitude_m: float) -> bytes:
    """4,7 km de montée à +500 m, ondulée à la période et à l'amplitude données."""
    n, length_m = 2000, 4700.0
    lat0, lon0 = 44.0, 6.0
    pts = []
    for i in range(n + 1):
        x = length_m * i / n
        ele = 500.0 * (x / length_m) + amplitude_m * math.sin(2 * math.pi * x / periode_m)
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        pts.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(pts)}</trkseg></trk></gpx>').encode()


def test_a_continuous_climb_shows_no_descent():
    """Un D− quasi nul sur des kilomètres de montée n'est pas un bug. Une montée régulière
    n'affiche de la descente que si ses ondulations redescendent PLUS FORT qu'elle ne monte :
    à +10,6 % de pente moyenne, une ondulation de ±12 m sur 1 200 m (±6 %) ne redescend jamais,
    une de ±40 m sur 300 m (±84 %) oui. Les deux passent par le même lissage à 150 m."""
    douce = build_course(_montee_ondulee(1200.0, 12.0), RaceSpec(name="Montée"), CFG)
    cassee = build_course(_montee_ondulee(300.0, 40.0), RaceSpec(name="Montée"), CFG)
    assert douce.dplus_m > 470 and douce.dminus_m < 2
    assert cassee.dminus_m > 100


# --------------------------------------------------------------------------- #
# Le parcours RÉEL : épinglé dès que sa trace et ses références sont là
# --------------------------------------------------------------------------- #
REFS_REELLES = FIX / "geometrie-parcours-reel.json"


def _trace_reelle() -> Path | None:
    """La trace du parcours réel, si elle est posée : ``TWIN_COURSE_GPX`` ou le chemin écrit
    dans le fichier de références. Absente, le test est sauté — la trace n'est pas committée."""
    env = os.environ.get("TWIN_COURSE_GPX")
    if env and Path(env).exists():
        return Path(env)
    if REFS_REELLES.exists():
        p = Path(json.loads(REFS_REELLES.read_text(encoding="utf-8")).get("gpx", ""))
        if p.exists():
            return p
    return None


@pytest.mark.skipif(not REFS_REELLES.exists() or _trace_reelle() is None,
                    reason="trace du parcours réel absente (tools/diag_parcours.py --references)")
def test_the_real_course_geometry_is_pinned():
    """Mêmes tolérances que le parcours de référence, sur la vraie trace et le vrai carnet."""
    refs = json.loads(REFS_REELLES.read_text(encoding="utf-8"))
    race = RaceSpec.from_json(refs["race"])
    c = build_course(_trace_reelle().read_bytes(), race, CFG)
    for cle, attendu in refs["total"].items():
        obtenu = float(getattr(c, cle))
        assert abs(obtenu - attendu) <= TOL_TOTAL * abs(attendu), f"{cle} : {obtenu} ≠ {attendu}"
    for seg, att in zip(c.segments, refs["segments"]):
        for nom, obtenu, attendu in (("D+", seg.dplus_m, att["dplus_m"]),
                                     ("D−", seg.dminus_m, att["dminus_m"])):
            tol = max(TOL_SEGMENT_REL * attendu, TOL_SEGMENT_ABS)
            assert abs(obtenu - attendu) <= tol, f"segment {seg.index} {nom} : {obtenu} ≠ {attendu}"
