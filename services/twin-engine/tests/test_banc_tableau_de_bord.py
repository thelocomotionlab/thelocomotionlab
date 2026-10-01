"""« Rejouer au banc » depuis le tableau de bord : l'archive conservée, la trace du jour en
guise de parcours, un run au livre banc du tableau de bord, l'anonymat à l'effacement."""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_backtest_tools import _activity_gpx  # noqa: E402
from test_ingestion import ADMIN, DEPOT, FauxDepot, _prevenir, client  # noqa: E402,F401

from twin_engine.tableau_de_bord import banc as B  # noqa: E402


def _archive(tmp_path) -> Path:
    chemin = tmp_path / "archive.zip"
    with zipfile.ZipFile(chemin, "w") as z:
        for i, (jour, minutes, v) in enumerate([
            ("2025-03-15", 40, 3.1), ("2025-06-10", 70, 2.9), ("2025-09-02", 55, 3.0),
            ("2026-01-20", 90, 2.8), ("2026-04-05", 45, 3.2),
        ]):
            z.writestr(f"act{i}.gpx", _activity_gpx(jour, minutes=minutes, v_ms=v))
    return chemin


def _athlete(client, tmp_path):
    client.app.state.depot = FauxDepot(depots=[{**DEPOT, "consentementVersion": "2026-10",
                                                "nomFichier": "archive.zip"}],
                                       archive=_archive(tmp_path))
    return _prevenir(client).json()["athlete_id"]


def test_a_race_is_replayed_on_the_retained_archive(client, tmp_path):
    athlete_id = _athlete(client, tmp_path)
    cfg = client.app.state.cfg
    r = client.post(f"/tableau-de-bord/athletes/{athlete_id}/banc", headers=ADMIN,
                    json={"courses": [{"date": "2026-04-05", "officiel": "0:45:00",
                                       "nom": "Trail du printemps"}]})
    assert r.status_code == 200
    job = client.app.state.store.lire(r.json()["job_id"])
    assert job["statut"] == "fini", job.get("erreur")
    [run] = sorted(B.registre_du_tableau_de_bord(cfg).banc.glob("*.json"))
    brut = json.loads(run.read_text(encoding="utf-8"))
    [e] = brut["entries"]
    assert brut["run"]["livre"] == "banc" and brut["run"]["label"] == "tableau-de-bord"
    assert e["athlete"] == "Val" and e["athlete_id"] == athlete_id
    assert e["race"] == "Trail du printemps" and e["until"] == "2026-04-04"
    assert e["official_time_h"] == 0.75 and e["source"] == "tableau-de-bord"
    trace = client.app.state.magasin.athletes.repertoire(athlete_id) / "banc" / "2026-04-05.gpx"
    assert trace.exists()
    assert B.entrees_de(cfg, athlete_id)[0]["date"] == "2026-04-05"
    vue = client.get(f"/tableau-de-bord/athletes/{athlete_id}/ultras", headers=ADMIN).json()
    assert vue["archive_conservee"] is True and isinstance(vue["ultras"], list)
    # l'export porte le run, sans l'identifiant interne
    export = client.get("/tableau-de-bord/registre/export", headers=ADMIN).json()
    [r_export] = export["banc"]
    assert "athlete_id" not in r_export["entries"][0]
    # effacé : la trace part, les entrées deviennent anonymes
    assert client.delete(f"/tableau-de-bord/athletes/{athlete_id}", headers=ADMIN).status_code == 204
    assert not trace.exists()
    [e2] = json.loads(run.read_text(encoding="utf-8"))["entries"]
    assert e2["athlete"].startswith("anonyme-") and "athlete_id" not in e2 and e2["race_meta"] is None


def test_the_bench_refuses_what_it_cannot_replay(client, tmp_path):
    athlete_id = _athlete(client, tmp_path)
    url = f"/tableau-de-bord/athletes/{athlete_id}/banc"
    assert client.post(url, headers=ADMIN, json={"courses": []}).status_code == 422
    assert client.post(url, headers=ADMIN,
                       json={"courses": [{"date": "2026-04-05"}]}).status_code == 422
    r = client.post(url, headers=ADMIN, json={"courses": [{"date": "2024-01-01", "officiel": "5:00"}]})
    job = client.app.state.store.lire(r.json()["job_id"])
    assert job["statut"] == "echec" and "aucune activité" in job["erreur"]
    m = client.app.state.magasin
    m.athletes.modifier(athlete_id, archive={**m.athletes.lire(athlete_id)["archive"],
                                             "purgee_le": "2026-10-01"})
    assert client.post(url, headers=ADMIN,
                       json={"courses": [{"date": "2026-04-05", "officiel": "0:45"}]}).status_code == 409


def test_the_import_files_the_dashboard_runs_once(tmp_path):
    from tools.registre import importer
    from twin_engine.registre import Depot

    export = tmp_path / "export.json"
    run = {"run": {"id": "20261001-120000-tableau-de-bord-abc123", "livre": "banc"},
           "entries": [{"athlete": "Chloé", "race": "X", "date": "2026-04-05"}]}
    export.write_text(json.dumps({"entries": [], "athletes": {}, "banc": [run]}), encoding="utf-8")
    depot = Depot(tmp_path / "registre")
    assert importer(export, depot)["runs_importes"] == [run["run"]["id"]]
    assert importer(export, depot)["runs_importes"] == []
    assert (depot.banc / f"{run['run']['id']}.json").exists()
