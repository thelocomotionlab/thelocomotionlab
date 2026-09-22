"""``POST /rendu`` : la boucle d'amendement vue du navigateur.

L'athlète change ses arrêts sur la page de son rapport, la page renvoie ce qu'il a changé,
et il récupère SES documents refaits — livret, feuille à emporter, fiches d'assistance,
calendrier, trace. Pas un aperçu : les documents.

Ce que ces tests tiennent : l'endpoint ne lit aucune archive, n'écrit rien, ne garde rien,
et n'accepte d'amender que les trois champs du formulaire.
"""

from __future__ import annotations

import datetime as dt
import io
import json
import shutil
import sys
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent))

from test_report_v3 import CFG, _triangle_gpx, race_spec, scenario   # noqa: E402
from twin_engine import dossier                                      # noqa: E402
from twin_engine.config import load_config                           # noqa: E402

HAS_TEX = shutil.which("xelatex") is not None and shutil.which("biber") is not None
SANS_TEX = pytest.mark.skipif(not HAS_TEX, reason="XeLaTeX/biber absents (validés dans l'image Docker)")
DATE = dt.datetime(2026, 9, 16, 10, 0)
REF = "LL-TWIN-RENDU01"


@pytest.fixture(scope="module")
def payload_dossier() -> dict:
    """Le dossier du scénario doré, tel qu'il voyagerait en JSON."""
    course, twin, cal, pred, plan, race, suf = scenario()
    return dossier.to_payload(course_gpx=_triangle_gpx(), race=race, twin=twin, calibration=cal,
                              prediction=pred, sufficiency=suf, athlete="Camille & Léo",
                              report_ref=REF, report_date=DATE)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    from twin_engine.api import create_app

    return TestClient(create_app(load_config()))


def _noms(reponse) -> list[str]:
    with zipfile.ZipFile(io.BytesIO(reponse.content)) as z:
        return sorted(z.namelist())


# --------------------------------------------------------------------------- #
@SANS_TEX
def test_an_amended_report_comes_back_whole(client, payload_dossier):
    """Plan ET fiche : l'athlète repart avec tout le jeu, pas avec le livret seul. Une
    feuille qui dit autre chose que le livret, c'est le doute au kilomètre 70."""
    r = client.post("/rendu", json={"dossier": payload_dossier,
                                    "amendement": {"reglages": [{"aid_index": 2, "stop_min": 20}]}})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    assert r.headers["x-rendu-reference"] == REF
    assert REF in r.headers["content-disposition"]
    assert _noms(r) == ["feuille.pdf", "fiches.pdf", "plan.gpx", "plan.ics", "rapport.pdf"]
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        for nom in ("rapport.pdf", "feuille.pdf", "fiches.pdf"):
            assert z.read(nom).startswith(b"%PDF"), f"{nom} n'est pas un PDF"


@SANS_TEX
def test_only_the_sheet_when_that_is_all_that_is_asked(client, payload_dossier):
    """Réimpression de dernière minute : la feuille et les fiches, sans refaire les pages du
    livret. C'est ce qu'on veut à minuit la veille, quand un arrêt vient de bouger."""
    r = client.post("/rendu", json={"dossier": payload_dossier, "feuille_seule": True})
    assert r.status_code == 200, r.text
    assert "rapport.pdf" not in _noms(r)
    assert {"feuille.pdf", "fiches.pdf"} <= set(_noms(r))


@SANS_TEX
def test_the_amendment_reaches_the_documents(client, payload_dossier):
    """Un arrêt allongé change les documents — sinon l'athlète cliquerait dans le vide."""
    sans = client.post("/rendu", json={"dossier": payload_dossier})
    avec = client.post("/rendu", json={"dossier": payload_dossier,
                                       "amendement": {"reglages": [{"aid_index": 2, "stop_min": 45}]}})
    assert sans.status_code == 200 and avec.status_code == 200
    with zipfile.ZipFile(io.BytesIO(sans.content)) as a, zipfile.ZipFile(io.BytesIO(avec.content)) as b:
        assert a.read("plan.ics") != b.read("plan.ics")


@SANS_TEX
def test_the_render_leaves_nothing_behind(client, payload_dossier, tmp_path):
    """Rendu SANS ÉTAT : ce qui entre est un dossier, ce qui sort est un ZIP, et le
    répertoire de travail disparaît avec la requête. Rien de l'athlète ne reste sur le
    disque du service."""
    data = tmp_path / "data"
    avant = sorted(p.name for p in data.iterdir()) if data.exists() else []
    assert client.post("/rendu", json={"dossier": payload_dossier}).status_code == 200
    apres = sorted(p.name for p in data.iterdir())
    assert not [n for n in apres if n.startswith("rendu-")], "un répertoire de rendu est resté"
    assert apres == avant or set(apres) - set(avant) <= {"jobs"}


@SANS_TEX
def test_a_deposited_dossier_is_found_by_its_reference(client, payload_dossier, tmp_path):
    """La page n'a pas à porter deux cents kilo-octets : elle envoie une référence, le
    service retrouve le dossier déposé sous ce nom."""
    depot = tmp_path / "data" / "dossiers"
    depot.mkdir(parents=True, exist_ok=True)
    (depot / f"{REF}.json").write_text(json.dumps(payload_dossier, ensure_ascii=False),
                                       encoding="utf-8")
    r = client.post("/rendu", json={"ref": REF,
                                    "amendement": {"crew": [{"aid_index": 3, "note": "soupe"}]}})
    assert r.status_code == 200, r.text
    assert r.headers["x-rendu-reference"] == REF


def test_an_unknown_reference_is_a_404(client):
    assert client.post("/rendu", json={"ref": "LL-TWIN-INCONNU"}).status_code == 404


def test_a_reference_cannot_climb_out_of_its_directory(client, payload_dossier, tmp_path):
    """La référence compose un chemin : elle ne peut pas désigner un fichier d'à côté."""
    piege = tmp_path / "data" / "secret.json"
    piege.parent.mkdir(parents=True, exist_ok=True)
    piege.write_text(json.dumps(payload_dossier), encoding="utf-8")
    for ref in ("../secret", "..%2Fsecret", "/etc/passwd", "a/b"):
        assert client.post("/rendu", json={"ref": ref}).status_code == 422


def test_a_payload_without_a_dossier_is_refused(client):
    r = client.post("/rendu", json={"amendement": {"reglages": []}})
    assert r.status_code == 422 and "ref" in r.json()["detail"]


def test_an_unreadable_dossier_is_refused(client):
    assert client.post("/rendu", json={"dossier": {"version": 1}}).status_code == 422


def test_a_dossier_of_another_version_is_refused(client, payload_dossier):
    r = client.post("/rendu", json={"dossier": {**payload_dossier, "version": 99}})
    assert r.status_code == 422 and "version" in r.json()["detail"]


def test_the_form_cannot_amend_what_it_does_not_offer(client, payload_dossier):
    """Un champ glissé au passage ne change pas la prédiction, la cible ou la course : la
    page amende les arrêts, les consignes, l'assistance et la nutrition, et rien d'autre."""
    for fragment in ({"target_hours": 12}, {"aid_km": [0, 1, 2]}, {"name": "Autre course"}):
        r = client.post("/rendu", json={"dossier": payload_dossier, "amendement": fragment})
        assert r.status_code == 422, fragment
        assert "non amendable" in r.json()["detail"]


def test_an_amendment_that_is_not_an_object_is_refused(client, payload_dossier):
    r = client.post("/rendu", json={"dossier": payload_dossier, "amendement": [1, 2]})
    assert r.status_code == 422


def test_an_oversized_payload_is_refused_before_it_is_read(client, payload_dossier):
    """Un dossier pèse ~200 Kio. Au-delà de la borne, on refuse sur l'entête plutôt que de
    charger le corps en mémoire."""
    borne = load_config().api.rendu_max_kio * 1024
    r = client.post("/rendu", content=b"{}", headers={
        "content-type": "application/json", "content-length": str(borne + 1)})
    assert r.status_code == 413


def test_the_browser_only_gets_cors_from_a_known_origin(client, payload_dossier):
    """L'allowlist vit dans la config du service (twin.config.json, bloc api)."""
    connue = load_config().api.origins[0]
    r = client.options("/rendu", headers={"origin": connue})
    assert r.status_code == 204 and r.headers["access-control-allow-origin"] == connue
    autre = client.options("/rendu", headers={"origin": "https://ailleurs.example"})
    assert "access-control-allow-origin" not in autre.headers


# --------------------------------------------------------------------------- #
def test_the_rate_guard_holds_the_line():
    """Un rendu, c'est XeLaTeX plus biber : quelques secondes de processeur. L'endpoint
    étant le seul joignable depuis un navigateur, il compte lui-même plutôt que de s'en
    remettre à ce qu'il y a devant."""
    from twin_engine.api.app import _Debit

    d = _Debit(simultanes=2, par_minute=3)
    assert d.prendre() and d.prendre()
    d.rendre()
    d.rendre()
    assert d.prendre()                 # le troisième de la minute passe encore
    d.rendre()
    assert not d.prendre(), "le quatrième de la minute aurait dû être refusé"


def test_the_rate_guard_never_leaks_a_slot():
    """Une place reprise à chaque rendu, même quand le rendu échoue — sinon le service se
    ferme tout seul après quelques erreurs."""
    from twin_engine.api.app import _Debit

    d = _Debit(simultanes=1, par_minute=100)
    for _ in range(5):
        assert d.prendre()
        d.rendre()
