"""L'équivalent plat d'un vrai ultra dont le canal distance a été sauvé (§9.11) : sa pente
seconde par seconde est inexploitable, son D± total ne l'est pas. Sous
``calibration.rescued_slope=dplus``, il reçoit le surcoût de pente que l'athlète paie par km
de D+ et de D− sur ses autres sorties ; sous ``raw`` (défaut), sa distance brute."""

from __future__ import annotations

import pytest

from twin_engine.calibration import (pente_inexploitable, select_genuine_ultras,
                                     surcout_par_km_de_denivele)
from twin_engine.config import load_config, override_config
from twin_engine.twin.record import ActivitySummary

CFG = load_config()


def _sortie(i, *, dplus=600.0, dminus=600.0, up=4.0, down=-1.2):
    """Une sortie de 2 h à pente exploitable : 4 km de surcoût pour 600 m de D+, −1,2 pour
    600 m de D−."""
    dist = 20.0
    return ActivitySummary(date=f"2025-03-{1 + i:02d}", sport="running", duration_s=7200,
                           dist_km=dist, ga_km=dist + up + down, avg_hr=140, dplus_m=dplus,
                           dminus_m=dminus, decouple_pct=5.0, has_hr=True, has_altitude=True,
                           ga_up_excess_km=up, ga_down_excess_km=down)


def _ultra_sauve(**kw):
    """La Saintélyon de Rapace : 71,5 km en 10,9 h, distance en rafales, D± récupéré."""
    base = dict(date="2024-11-30", sport="running", duration_s=round(10.9 * 3600), dist_km=71.5,
                ga_km=71.5, avg_hr=150, dplus_m=1900.0, dminus_m=2200.0, decouple_pct=None,
                has_hr=True, has_altitude=False, ga_up_excess_km=0.0, ga_down_excess_km=0.0)
    return ActivitySummary(**{**base, **kw})


def test_a_rescued_ultra_gets_the_slope_cost_the_athlete_pays_elsewhere():
    sorties = [_sortie(i) for i in range(12)]
    assert surcout_par_km_de_denivele(sorties, CFG) == pytest.approx((4.0 / 0.6, -1.2 / 0.6))
    ultra = _ultra_sauve()
    assert pente_inexploitable(ultra) and not pente_inexploitable(sorties[0])
    [brut] = select_genuine_ultras(sorties + [ultra], CFG)
    assert brut.vga_kmh == pytest.approx(71.5 / 10.9, rel=1e-3)
    cfg = override_config(CFG, "calibration.rescued_slope=dplus")
    [estime] = select_genuine_ultras(sorties + [ultra], cfg)
    ga = 71.5 + (4.0 / 0.6) * 1.9 + (-1.2 / 0.6) * 2.2
    assert estime.vga_kmh == pytest.approx(ga / 10.9, rel=1e-3)
    # sous un coût de pente personnel, les mêmes facteurs que les autres efforts
    [perso] = select_genuine_ultras(sorties + [ultra], cfg, slope=(0.5, 2.0))
    assert perso.vga_kmh == pytest.approx(
        (71.5 + 0.5 * (4.0 / 0.6) * 1.9 + 2.0 * (-1.2 / 0.6) * 2.2) / 10.9, rel=1e-3)


def test_too_few_measured_runs_or_no_dplus_keep_the_raw_distance():
    cfg = override_config(CFG, "calibration.rescued_slope=dplus")
    peu = [_sortie(i) for i in range(5)]
    assert surcout_par_km_de_denivele(peu, cfg) is None
    [u] = select_genuine_ultras(peu + [_ultra_sauve()], cfg)
    assert u.vga_kmh == pytest.approx(71.5 / 10.9, rel=1e-3)
    # sans D± récupéré (altitude condamnée) : rien à estimer, distance brute
    sans = _ultra_sauve(dplus_m=0.0, dminus_m=0.0)
    assert not pente_inexploitable(sans)
    [u] = select_genuine_ultras([_sortie(i) for i in range(12)] + [sans], cfg)
    assert u.vga_kmh == pytest.approx(71.5 / 10.9, rel=1e-3)
