"""Les extraits OpenStreetMap qui couvrent les courses et les sorties (index Geofabrik)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_phase5_pente import _sawtooth_gpx  # noqa: E402

from twin_engine.carte.extraits import extrait_de, lire_index, mailles  # noqa: E402


def _carre(o, s, e, n):
    return [[o, s], [e, s], [e, n], [o, n], [o, s]]


def _index(*extraits) -> dict:
    """Un index au format Geofabrik : (id, nom, anneaux…)."""
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature",
         "properties": {"id": i, "name": nom,
                        "urls": {"pbf": f"https://download.geofabrik.de/{i}-latest.osm.pbf"}},
         "geometry": {"type": "MultiPolygon", "coordinates": [list(anneaux)]}}
        for i, nom, *anneaux in extraits]}


INDEX = _index(("pays", "Pays", _carre(0, 40, 10, 50), _carre(4, 44, 5, 45)),   # un trou
               ("region", "Région", _carre(2, 42, 4, 44)),
               ("enclave", "Enclave", _carre(4, 44, 5, 45)),
               ("ailleurs", "Ailleurs", _carre(20, 40, 30, 50)))


def test_each_position_takes_the_smallest_extract_that_holds_it():
    ex = lire_index(INDEX)
    assert [e.id for e in ex][:2] == ["enclave", "region"]
    lat = [43.0, 47.0, 44.5, 60.0, 45.0, float("nan")]
    lon = [3.0, 8.0, 4.5, 60.0, 25.0, 1.0]
    assert extrait_de(lat, lon, ex) == ["region", "pays", "enclave", None, "ailleurs", None]
    m = mailles([45.001, 45.002, 45.019, float("nan")], [6.001, 6.003, 6.001, 1.0])
    assert m.shape == (2, 2)


def test_the_tool_lists_the_extracts_a_race_needs_and_what_the_folder_lacks(tmp_path, monkeypatch, capsys):
    import tools.carte as carte

    monkeypatch.setattr(carte, "_taille", lambda url: 300_000_000)
    index = tmp_path / "index.json"
    index.write_text(json.dumps(_index(("alpes", "Alpes", _carre(5, 44, 7, 46)),
                                       ("pays", "Pays", _carre(0, 40, 10, 50)))), encoding="utf-8")
    (tmp_path / "course.gpx").write_bytes(_sawtooth_gpx())
    mp = tmp_path / "m.json"
    mp.write_text(json.dumps({"athlete": "T", "archive": "absente", "races": [
        {"name": "Dent", "date": "2026-06-01", "gpx": "course.gpx"}]}), encoding="utf-8")
    dossier = tmp_path / "osm"
    argv = ["extraits", str(mp), "--sans-archives", "--index", str(index), "--dossier", str(dossier)]
    assert carte.main(argv) == 0
    md = capsys.readouterr().out
    assert "| Alpes (`alpes`) | T · Dent | — | non |" in md and "Pays" not in md
    assert f"curl -L -o {dossier / 'alpes-latest.osm.pbf'} https://download.geofabrik.de/alpes-latest.osm.pbf" in md
    assert "0.3 Go annoncés" in md
    (dossier / "alpes-latest.osm.pbf").write_bytes(b"")
    assert carte.main(argv) == 0
    assert "Tous les extraits nécessaires sont dans le dossier." in capsys.readouterr().out
