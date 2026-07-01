"""Ingestion des exports RGPD Polar Flow (« Export your data ») — JSON propriétaire.

Le fixture ``polar_export_fixture.zip`` décalque un export réel (entièrement anonymisé :
aucun e-mail, ``deviceId`` = « ANON », fichiers ``account-*`` vides) :

* ~1367 ``.json`` **à plat**, aucun zip imbriqué, aucun ``.fit/.tcx/.gpx`` ;
* catégories réelles : ``activity-*`` (suivi journalier), ``training-target-*`` (planifié),
  ``247ohr_*``, ``sleep_*``, ``fitness-test-*``, ``account-*``… et ``training-session-*`` ;
* seules **6 séances** portent des échantillons (le reste est en résumé-seul / placeholder) :
  **3 course** (``sport.id`` ``"1"``), 1 vélo (``"2"``), 1 intérieur (``"83"``), 1 HIIT (``"34"``) ;
  intérieur et HIIT sont en **FC seule** (ni distance, ni vitesse, ni GPS).

On vérifie qu'on obtient **exactement 3 activités de course** au schéma canonique, et que tout
le reste est écarté — sport lu DANS le JSON (jamais d'après le nom ni ``summarizedActivities``).
"""

from __future__ import annotations

import json
import zipfile
from collections import Counter
from pathlib import Path

import numpy as np
import pytest

from twin_engine.ingest import ingest_path, parse_bytes
from twin_engine.ingest.canonical import NotActivityData
from twin_engine.ingest.polar import parse_polar

FIX = Path(__file__).parent / "fixtures"
POLAR = FIX / "polar_export_fixture.zip"


@pytest.fixture(scope="module")
def polar_running():
    return ingest_path(POLAR, running_only=True)


@pytest.fixture(scope="module")
def polar_full():
    return ingest_path(POLAR)


# --------------------------------------------------------------------------- #
# Intégration sur le fixture réel.
def test_polar_export_keeps_exactly_three_running(polar_running):
    """3 courses exactement ; vélo/intérieur/HIIT/résumés/autres catégories écartés."""
    result = polar_running
    assert len(result.activities) == 3
    assert all(a.is_running for a in result.activities)
    assert all(a.source_format == "polar" for a in result.activities)
    assert Counter(a.sport for a in result.activities) == {"running": 3}
    # seul le vélo (données valides mais sport ≠ course) part en « ignoré » ; intérieur et
    # HIIT sont en FC seule → ignorés en silence (NotActivityData), pas comptés comme skippés.
    assert [s["reason"] for s in result.skipped] == ["sport ignoré: cycling"]


def test_polar_running_have_canonical_channels(polar_running):
    """Chaque course est normalisée : distance monotone, FC, GPS, vitesse en m/s (pas km/h)."""
    for a in polar_running.activities:
        assert a.n > 300                                   # séances de plusieurs minutes à 1 Hz
        assert np.all(np.diff(a.dist_m) >= -1e-9)          # distance monotone
        assert float(a.dist_m[-1]) > 500                   # distance plausible
        assert a.has_hr and a.has_altitude
        assert np.isfinite(a.lat).any()                    # trace GPS fusionnée (course extérieure)
        # SPEED Polar est en km/h : sans conversion, vmax dépasserait ~8 m/s (≈ 29 km/h)
        assert 0.0 < float(np.nanmax(a.speed_ms)) < 8.0


def test_polar_full_breakdown_excludes_non_running(polar_full):
    """Sans filtre : 3 course + 1 vélo ; intérieur/HIIT (FC seule) et tout le bruit écartés."""
    result = polar_full
    assert Counter(a.sport for a in result.activities) == {"running": 3, "cycling": 1}
    assert len(result.running) == 3
    sports = {a.sport for a in result.activities}
    assert "indoor" not in sports and "hiit" not in sports
    assert result.skipped == []                            # bruit pré-filtré, cardio ignoré en silence


def test_polar_names_are_anonymised(polar_full):
    """Garde-fou PII : noms anonymisés, aucun identifiant/e-mail ne survit."""
    for a in polar_full.activities:
        assert a.source_name.startswith("activity-") and a.source_name.endswith(".json")
        assert "@" not in a.source_name


# --------------------------------------------------------------------------- #
# Parseur Polar en isolation : robustesse de type, cas tapis, rejets propres.
def _chan(ctype, values, interval=1000):
    return {"type": ctype, "intervalMillis": interval, "values": values}


def _session(sport_id, *, channels, waypoints=None, start="2022-05-01T09:00:00"):
    ex = {"startTime": start, "samples": {"samples": channels}}
    if waypoints is not None:
        ex["routes"] = {"route": {"wayPoints": waypoints}}
    return {"sport": {"id": sport_id}, "startTime": start, "exercises": [ex]}


def _bytes(obj):
    return json.dumps(obj).encode()


def test_sport_id_robust_to_str_or_int():
    """L'identifiant de sport peut être chaîne ou entier → détection de course identique."""
    chans = [_chan("DISTANCE", [0, 3, 6, 9, 12]), _chan("SPEED", [10.8, 10.8, 10.8, 10.8, 10.8])]
    a_int = parse_polar(_bytes(_session(1, channels=chans)), "activity-1.json")
    a_str = parse_polar(_bytes(_session("1", channels=chans)), "activity-2.json")
    assert a_int.is_running and a_str.is_running


def test_treadmill_without_gps_is_kept_via_distance():
    """Course sur tapis : sport course, 0 wayPoint → conservée via distance/vitesse."""
    chans = [_chan("DISTANCE", [0, 3, 6, 9, 12, 15]), _chan("SPEED", [10.8] * 6),
             _chan("HEART_RATE", [150] * 6)]
    act = parse_polar(_bytes(_session("1", channels=chans)), "activity-3.json")
    assert act.is_running
    assert not np.isfinite(act.lat).any()                  # pas de GPS
    assert float(act.dist_m[-1]) == pytest.approx(15.0, abs=1.0)
    assert float(np.nanmax(act.speed_ms)) == pytest.approx(3.0, abs=0.2)   # 10,8 km/h → 3 m/s


def test_non_running_sport_is_classified_not_dropped():
    """Un vélo avec données valides est parsé (sport ≠ course) — le filtre agit en aval."""
    chans = [_chan("DISTANCE", [0, 8, 16, 24, 32]), _chan("SPEED", [28.8] * 5)]
    act = parse_polar(_bytes(_session("2", channels=chans)), "activity-4.json")
    assert act.sport == "cycling" and not act.is_running


def test_hr_only_session_is_ignored_silently():
    """Cardio FC seule (intérieur/HIIT) : pas de locomotion → NotActivityData (silencieux)."""
    chans = [_chan("HEART_RATE", [130, 132, 131, 129, 130]),
             _chan("SPEED", ["NaN", "NaN", "NaN", "NaN", "NaN"])]
    with pytest.raises(NotActivityData):
        parse_polar(_bytes(_session("83", channels=chans)), "activity-5.json")


def test_summary_only_and_non_session_json_are_ignored():
    """Résumé-seul (pas d'échantillons) et json quelconque → NotActivityData, pas d'erreur."""
    summary_only = {"sport": {"id": "1"}, "exercises": [{"startTime": "2022-05-01T09:00:00"}]}
    with pytest.raises(NotActivityData):
        parse_polar(_bytes(summary_only), "activity-6.json")
    with pytest.raises(NotActivityData):
        parse_polar(_bytes({"foo": "bar"}), "activity-7.json")
    with pytest.raises(NotActivityData):
        parse_polar(b"not json at all", "activity-8.json")


def test_polar_dispatch_via_parse_bytes():
    """Le dispatch de format route bien « .json » vers l'adaptateur Polar."""
    chans = [_chan("DISTANCE", [0, 3, 6, 9]), _chan("SPEED", [10.8] * 4)]
    act = parse_bytes(_bytes(_session("1", channels=chans)), "activity-00001.json")
    assert act.source_format == "polar" and act.is_running


def test_single_summary_only_zip_yields_nothing(tmp_path):
    """Un zip de séances résumé-seul (≥1 Ko) ne produit aucune activité et aucun skip bruyant."""
    big_summary = {"sport": {"id": "1"}, "note": "x" * 2000,
                   "exercises": [{"startTime": "2022-05-01T09:00:00"}]}
    z = tmp_path / "polar.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("training-session-2022-05-01-1-abc.json", _bytes(big_summary))
    result = ingest_path(z, running_only=True)
    assert result.activities == [] and result.skipped == []
