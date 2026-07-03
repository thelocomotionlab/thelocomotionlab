"""Banc d'essai rétrospectif (tools/backtest + tools/registre) : fonctions pures + plomberie.

Le banc complet tourne sur les archives réelles (chez Valentin) ; ici on verrouille le
parsing, la fusion idempotente du registre, le score de Winkler, les quantiles groupés,
et un bout-en-bout minimal sur la fixture GPX (prédiction impossible → consignée, pas
d'erreur — le refus du moteur est une information).
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # racine twin-engine → tools/

from tools.backtest import main as backtest_main  # noqa: E402
from tools.backtest import merge_registre, parse_time_h  # noqa: E402
from tools.registre import conformal_order_quantile, pooled_scores, summarize, winkler  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def test_parse_time_h_formats():
    assert parse_time_h("26:30:00") == pytest.approx(26.5)
    assert parse_time_h("26:30") == pytest.approx(26.5)
    assert parse_time_h("26h30") == pytest.approx(26.5)
    assert parse_time_h("26h") == pytest.approx(26.0)
    assert parse_time_h(25.82) == pytest.approx(25.82)
    assert parse_time_h("9:05:30") == pytest.approx(9 + 5 / 60 + 30 / 3600)
    assert parse_time_h(None) is None and parse_time_h("") is None
    with pytest.raises(ValueError):
        parse_time_h("vingt-six heures")


def test_winkler_rewards_narrow_and_punishes_misses():
    # couvert : score = largeur ; sorti de d : + (2/α)·d — un intervalle étroit qui rate
    # PERD face à un large qui couvre (c'est tout l'intérêt du score propre)
    assert winkler(24.0, 28.0, 26.0, 0.2) == pytest.approx(4.0)
    assert winkler(24.0, 28.0, 29.0, 0.2) == pytest.approx(4.0 + 10.0 * 1.0)
    assert winkler(24.0, 28.0, 23.0, 0.5) == pytest.approx(4.0 + 4.0 * 1.0)
    narrow_missing = winkler(25.5, 26.5, 28.0, 0.2)
    wide_covering = winkler(20.0, 30.0, 28.0, 0.2)
    assert wide_covering < narrow_missing


def test_conformal_order_quantile_matches_split_rule():
    scores = np.array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])   # n = 9
    # ⌈(n+1)·q⌉ : q80 → 8e valeur ; q50 → 5e ; borné à n
    assert conformal_order_quantile(scores, 0.8) == pytest.approx(0.8)
    assert conformal_order_quantile(scores, 0.5) == pytest.approx(0.5)
    assert conformal_order_quantile(np.array([1.0]), 0.8) == pytest.approx(1.0)
    assert conformal_order_quantile(np.array([]), 0.8) is None


def _entry(athlete, race, err_pct, sd_rel=0.10, lo=20.0, hi=30.0, actual=25.0, dev=False):
    return {
        "athlete": athlete, "dev_set": dev, "race": race, "date": "2025-06-01",
        "dnf": False, "official_time_h": actual,
        "prediction": {"central_h": actual * (1 + err_pct / 100.0),
                       "plan_low_h": lo + 2, "plan_high_h": hi - 2,
                       "safety_low_h": lo, "safety_high_h": hi,
                       "err_pct": err_pct, "sd_rel": sd_rel,
                       "in_plan": lo + 2 <= actual <= hi - 2,
                       "in_safety": lo <= actual <= hi},
    }


def test_merge_registre_is_idempotent_on_key():
    reg = {"entries": []}
    e1 = {k: v for k, v in _entry("A", "Course X", 5.0).items()
          if k not in ("athlete", "dev_set")}
    merge_registre(reg, "A", False, [e1])
    merge_registre(reg, "A", False, [dict(e1, official_time_h=26.0)])   # même clé → mise à jour
    merge_registre(reg, "A", False, [dict(e1, race="Course Y")])        # autre clé → ajout
    assert len(reg["entries"]) == 2
    assert reg["entries"][0]["official_time_h"] == 26.0


def test_summarize_coverage_bias_and_pooled_grouping():
    entries = [
        _entry("A", "r1", +4.0), _entry("A", "r2", -6.0),
        _entry("B", "r3", +20.0, actual=24.0),          # 24 ∈ [22,28] plan, [20,30] safety
        {"athlete": "C", "dev_set": False, "race": "dnf", "date": "d", "dnf": True,
         "official_time_h": None, "prediction": None},
    ]
    s = summarize(entries)
    assert s["n_finished"] == 3 and s["n_dnf"] == 1
    assert s["bias_pct"] == pytest.approx((4 - 6 + 20) / 3, abs=0.01)
    assert s["plan"]["coverage_pct"] == pytest.approx(100.0)
    assert s["safety"]["coverage_pct"] == pytest.approx(100.0)
    flat, per_ath = pooled_scores(entries)
    assert sorted(per_ath) == ["A", "B"] and len(per_ath["A"]) == 2
    assert flat.max() == pytest.approx(0.20 / 0.10)      # 20 % d'erreur / sd_rel 0,10


def test_backtest_end_to_end_records_refusal(tmp_path, monkeypatch, capsys):
    """Bout-en-bout minimal : une « archive » d'une seule activité (fixture GPX) → le moteur
    refuse de prédire (🔴) ; l'entrée est consignée avec la coupure appliquée, sans crash,
    et la relance est idempotente."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(201):
        x = 12000.0 * i / 200
        ele = 1200.0 * (x / 6000.0) if x <= 6000 else 1200.0 * (2 - x / 6000.0)
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    (tmp_path / "course.gpx").write_bytes(
        ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
         f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode())
    (tmp_path / "archive.gpx").write_bytes((FIX / "sample.gpx").read_bytes())
    manifest = {
        "athlete": "Testeur", "archive": "archive.gpx",
        "races": [{"name": "Course passée", "date": "2030-01-02",
                   "official_time": "10:00:00", "gpx": "course.gpx"}],
    }
    (tmp_path / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    registre = tmp_path / "registre.json"

    for _ in range(2):   # idempotence : deux passages → une seule entrée
        rc = backtest_main([str(tmp_path / "manifest.json"), "--registre", str(registre)])
        assert rc == 0
        capsys.readouterr()
    data = json.loads(registre.read_text(encoding="utf-8"))
    assert len(data["entries"]) == 1
    e = data["entries"][0]
    assert e["athlete"] == "Testeur" and e["until"] == "2030-01-01"
    assert e["prediction"] is None                       # refus consigné, pas d'invention
    assert e["model"]["verdict"] == "🔴"
