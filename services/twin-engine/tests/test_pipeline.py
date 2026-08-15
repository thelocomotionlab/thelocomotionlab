"""Pipeline preview : chaînage ingestion→jumeau→calibration→prédiction→suffisance."""

from __future__ import annotations

import math

from twin_engine.config import load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.ingest.canonical import CanonicalActivity
from twin_engine.pipeline import analyze_preview, run_preview

CFG = load_config()


def _flat_run(v, dur):
    t = list(range(dur + 1))
    return CanonicalActivity.from_samples(
        timestamps=t, dist_m=[v * s for s in t], speed_ms=[v] * len(t),
        alt_m=[100.0] * len(t), hr=[140] * len(t), sport="running",
        source_format="fit", source_name="syn",
    )


def _triangle_gpx(n=300):
    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(n + 1):
        x = 10000.0 * i / n
        ele = 1000.0 * (x / 5000.0) if x <= 5000 else 1000.0 * (2 - x / 5000.0)
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


def _course():
    race = RaceSpec("Test", (0.0, 5.0, 10.0), ("d", "s", "a"))
    return build_course(_triangle_gpx(), race, CFG)


def test_analyze_preview_structure():
    acts = [_flat_run(3.2, 700), _flat_run(3.0, 3000), _flat_run(2.9, 5400)]
    result = analyze_preview(acts, _course(), CFG)
    d = result.to_dict()
    assert d["verdict"] in {"🟢", "🟠", "🔴"}
    assert "sufficiency" in d and d["sufficiency"]["criteria"]
    assert d["twin"]["vc_kmh"] is not None
    assert d["course"]["deq_km"] > d["course"]["length_km"]
    assert d["ingestion"]["ingested"] == 3
    # C8 : le pipeline évalue la fraîcheur (ici activités non datées → « non évaluable »)
    names = [c["name"] for c in d["sufficiency"]["criteria"]]
    assert "Fraîcheur des données" in names


def test_run_preview_purges_archive(tmp_path):
    """End-to-end depuis un .gpx + purge de l'archive brute (confidentialité)."""
    from pathlib import Path

    # une activité d'entraînement réelle (fixture) déposée comme archive
    src = Path(__file__).parent / "fixtures" / "sample.gpx"
    upload = tmp_path / "perso.gpx"
    upload.write_bytes(src.read_bytes())

    race = RaceSpec("Test", (0.0, 5.0, 10.0), ("d", "s", "a"))
    result = run_preview(training_path=upload, course_gpx=_triangle_gpx(), race=race,
                         cfg=CFG, purge_source=True)
    assert not upload.exists()                 # archive purgée
    assert result.sufficiency.verdict in {"🟢", "🟠", "🔴"}


def test_until_excludes_posterior_and_undated_and_anchors_freshness():
    """Coupure backtest (``until``) : les activités postérieures ET non datées sont écartées
    (anti-fuite — on ne peut pas certifier qu'une activité sans date est antérieure), et
    « aujourd'hui » (fraîcheur) devient la date de coupure, pas la date du replay."""
    from datetime import date, datetime

    def _dated_run(v, dur, iso):
        t = list(range(dur + 1))
        return CanonicalActivity.from_samples(
            timestamps=t, dist_m=[v * s for s in t], speed_ms=[v] * len(t),
            alt_m=[100.0] * len(t), hr=[140] * len(t), sport="running",
            source_format="fit", source_name="syn",
            start_time=datetime.fromisoformat(f"{iso}T08:00:00+00:00"),
        )

    acts = [
        _dated_run(3.2, 700, "2026-01-05"),
        _dated_run(3.0, 3000, "2026-02-01"),
        _dated_run(2.9, 5400, "2026-02-15"),
        _dated_run(3.1, 3600, "2026-05-01"),   # postérieure à la coupure → écartée
        _flat_run(3.0, 1800),                  # non datée → écartée (anti-fuite)
    ]
    res = analyze_preview(acts, _course(), CFG, until=date(2026, 2, 20))
    assert res.n_ingested == 3
    assert res.n_excluded_until == 2
    d = res.to_dict()
    assert d["ingestion"] == {"ingested": 3, "skipped": 0, "excluded_after_until": 2}
    # fraîcheur ancrée sur la coupure : dernière activité 15/02, « analyse du » 20/02 → 5 j
    fresh = next(c for c in d["sufficiency"]["criteria"] if c["name"] == "Fraîcheur des données")
    assert fresh["value"] == 5

    # un analysis_date EXPLICITE garde la priorité sur la coupure
    res_exp = analyze_preview(acts, _course(), CFG, until=date(2026, 2, 20),
                              analysis_date=date(2026, 3, 1))
    fresh_exp = next(c for c in res_exp.to_dict()["sufficiency"]["criteria"]
                     if c["name"] == "Fraîcheur des données")
    assert fresh_exp["value"] == 14

    # sans coupure : tout passe (comportement historique inchangé)
    res_all = analyze_preview(acts, _course(), CFG)
    assert res_all.n_ingested == 5 and res_all.n_excluded_until == 0


# --------------------------------------------------------------------------- #
# Mode OBJECTIF (ADR 0002) : câblage bout en bout dans analyze_full.
def _ultras():
    """Quatre efforts longs synthétiques : de quoi obtenir une prédiction."""
    return [_flat_run(2.6, 11 * 3600), _flat_run(2.5, 12 * 3600),
            _flat_run(2.4, 14 * 3600), _flat_run(2.7, 10 * 3600 + 600)]


def _full(target_hours, tmp_path):
    from twin_engine.pipeline import analyze_full

    race = RaceSpec("T", (0.0, 5.0, 10.0), ("d", "s", "a"), target_hours=target_hours)
    course = build_course(_triangle_gpx(), race, CFG)
    return analyze_full(_ultras(), course, race, CFG, out_dir=tmp_path, athlete="X",
                        render_pdf=False)


def test_target_in_race_spec_anchors_the_plan(tmp_path):
    result = _full(13.0, tmp_path)
    assert result.preview.prediction is not None
    assert result.target is not None and result.target.plan_ok
    assert result.plan.anchor == "target" and result.plan.anchor_hours == 13.0
    # la PRÉDICTION reste calculée et exposée : le mode s'ajoute, il ne remplace pas
    d = result.to_dict()
    assert d["prediction"] is not None
    assert d["target"]["regime"] == result.target.regime


def test_refused_target_leaves_the_plan_on_the_prediction(tmp_path):
    """Cible sous le domaine de calibration : le garde-fou §9.9 interdit l'ancrage."""
    result = _full(2.0, tmp_path)
    assert result.target is not None and result.target.plan_ok is False
    assert result.target.regime == "hors_domaine"
    assert result.plan.anchor == "prediction"      # le refus n'ampute pas le rapport
    assert result.to_dict()["target"]["plan_ok"] is False


def test_no_target_leaves_everything_untouched(tmp_path):
    race = RaceSpec("T", (0.0, 5.0, 10.0), ("d", "s", "a"))
    course = build_course(_triangle_gpx(), race, CFG)
    from twin_engine.pipeline import analyze_full

    result = analyze_full(_ultras(), course, race, CFG, out_dir=tmp_path, athlete="X",
                          render_pdf=False)
    assert result.target is None
    assert result.plan.anchor == "prediction"
    assert result.to_dict()["target"] is None
