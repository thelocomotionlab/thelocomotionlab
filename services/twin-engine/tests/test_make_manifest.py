"""Générateur de manifestes (tools/make_manifest) : squelette, dates devinées, protections."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # racine twin-engine → tools/

from tools.make_manifest import main as mm_main  # noqa: E402

GPX_WITH_TIME = (
    '<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
    '<trk><trkseg><trkpt lat="43.7" lon="7.26"><ele>10</ele>'
    "<time>2024-03-16T08:31:02Z</time></trkpt></trkseg></trk></gpx>"
).encode()
GPX_NO_TIME = (
    '<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1">'
    '<trk><trkseg><trkpt lat="43.7" lon="7.26"><ele>10</ele></trkpt></trkseg></trk></gpx>'
).encode()


def _tree(tmp_path):
    base = tmp_path / "cas_validation"
    adir = base / "Léa Test"
    (adir / "traces").mkdir(parents=True)
    (adir / "archives").mkdir()
    (adir / "traces" / "ecotrail-2024.gpx").write_bytes(GPX_WITH_TIME)
    (adir / "traces" / "course-mystere.gpx").write_bytes(GPX_NO_TIME)
    (adir / "archives" / "export.zip").write_bytes(b"zip")
    out = tmp_path / "manifests"
    return base, out


def test_manifest_skeleton_dates_and_relative_paths(tmp_path, capsys):
    base, out = _tree(tmp_path)
    rc = mm_main(["Léa Test", "--base", str(base), "--out-dir", str(out)])
    assert rc == 0
    path = out / "manifest-lea-test.json"          # nom du fichier : accents/espaces aplatis
    man = json.loads(path.read_text(encoding="utf-8"))
    assert man["athlete"] == "Léa Test" and man["dev_set"] is False
    # l'archive pointe le DOSSIER archives/ (fusion multi-exports), en chemin relatif valide
    assert (out / man["archive"]).resolve() == (base / "Léa Test" / "archives").resolve()
    assert len(man["races"]) == 2
    dated, undated = man["races"]                   # les datées d'abord, réservés à la fin
    assert dated["name"] == "Ecotrail 2024"
    assert dated["date"] == "2024-03-16"            # devinée depuis la balise <time> du GPX
    assert dated["official_time"] == ""             # à remplir à la main
    assert (out / dated["gpx"]).resolve().name == "ecotrail-2024.gpx"
    assert undated["date"] == "AAAA-MM-JJ"
    err = capsys.readouterr().err
    assert "À FAIRE" in err and "official_time" in err


def test_manifest_refuses_overwrite_without_force(tmp_path):
    base, out = _tree(tmp_path)
    assert mm_main(["Léa Test", "--base", str(base), "--out-dir", str(out)]) == 0
    marker = out / "manifest-lea-test.json"
    marker.write_text('{"athlete": "édité à la main"}', encoding="utf-8")
    assert mm_main(["Léa Test", "--base", str(base), "--out-dir", str(out)]) == 2
    assert "édité à la main" in marker.read_text(encoding="utf-8")   # rien d'écrasé
    assert mm_main(["Léa Test", "--base", str(base), "--out-dir", str(out), "--force"]) == 0
    assert json.loads(marker.read_text(encoding="utf-8"))["athlete"] == "Léa Test"


def test_manifest_errors_cleanly_without_traces(tmp_path):
    base = tmp_path / "cas_validation"
    (base / "Vide").mkdir(parents=True)
    assert mm_main(["Vide", "--base", str(base), "--out-dir", str(tmp_path / "m")]) == 2
