"""CLI : rejoue un cas de bout en bout en local (preview, sans XeLaTeX requis)."""

from __future__ import annotations

import json
import math
from pathlib import Path

from twin_engine.cli import main

FIX = Path(__file__).parent / "fixtures"


def _triangle(n=200):
    lat0, lon0 = 43.70, 7.26
    rows = []
    for i in range(n + 1):
        x = 12000.0 * i / n
        ele = 1200.0 * (x / 6000.0) if x <= 6000 else 1200.0 * (2 - x / 6000.0)
        dlon = x / (111_320.0 * math.cos(math.radians(lat0)))
        rows.append(f'<trkpt lat="{lat0:.6f}" lon="{lon0 + dlon:.6f}"><ele>{ele:.1f}</ele></trkpt>')
    return ('<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{"".join(rows)}</trkseg></trk></gpx>').encode()


def test_cli_preview_runs(tmp_path, capsys, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    course = tmp_path / "course.gpx"
    course.write_bytes(_triangle())
    race = tmp_path / "race.json"
    race.write_text(json.dumps({"name": "T", "aid_km": [0, 6, 12], "aid_names": ["d", "s", "a"]}))
    training = tmp_path / "perso.gpx"
    training.write_bytes((FIX / "sample.gpx").read_bytes())

    rc = main(["preview", "--training", str(training), "--course", str(course), "--race", str(race)])
    assert rc == 0
    out = capsys.readouterr()
    # le JSON de résultat est sur stdout, le résumé humain sur stderr
    payload = json.loads(out.out)
    assert payload["verdict"] in {"🟢", "🟠", "🔴"}
    assert "Verdict de suffisance" in out.err
    # archive conservée par défaut en CLI (pas de --purge)
    assert training.exists()


def test_cli_missing_race_returns_2(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    course = tmp_path / "c.gpx"
    course.write_bytes(_triangle())
    rc = main(["preview", "--training", str(FIX / "sample.gpx"), "--course", str(course),
               "--race", str(tmp_path / "absent.json")])
    assert rc == 2


def test_cli_until_filters_and_rejects_bad_date(tmp_path, capsys, monkeypatch):
    """--until : date invalide → code 2 ; date valide antérieure aux données → tout est
    écarté (compteur affiché), le pipeline dégrade proprement (🔴, pas de crash)."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    course = tmp_path / "course.gpx"
    course.write_bytes(_triangle())
    training = tmp_path / "perso.gpx"
    training.write_bytes((FIX / "sample.gpx").read_bytes())

    rc = main(["preview", "--training", str(training), "--course", str(course),
               "--until", "20-02-2026"])
    assert rc == 2
    assert "date invalide" in capsys.readouterr().err

    rc = main(["preview", "--training", str(training), "--course", str(course),
               "--until", "1990-01-01"])
    assert rc == 0
    out = capsys.readouterr()
    payload = json.loads(out.out)
    assert payload["verdict"] == "🔴"
    assert payload["ingestion"]["excluded_after_until"] >= 1
    assert "écartée" in out.err
