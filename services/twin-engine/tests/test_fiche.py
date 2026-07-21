"""Fiche participant·e : rendu Jinja→LaTeX, échappement, empreinte, endpoint."""

from __future__ import annotations

import shutil

import pytest
from fastapi.testclient import TestClient

from twin_engine.config import load_config
from twin_engine.fiche import build_pdf, empreinte, latex_escape, render_tex


def _payload(**over) -> dict:
    base = {
        "participant": {
            "prenom": "Camille",
            "nom": "Ferrand",
            "email": "camille@example.org",
            "telephone": "06 12 34 56 78",
        },
        "urgence": {"nom": "Jean Ferrand", "telephone": "06 98 76 54 32"},
        "mineur": {"actif": False, "nom": "", "prenom": "", "date_naissance": ""},
        "atelier": {
            "intitule": "Atelier test",
            "date": "Samedi 12 septembre 2026 · 18h – 19h30",
            "lieu": "Parc la Poya, Fontaine",
            "duree": "1 h 30",
            "contexte": "en extérieur, sur terrain naturel",
            "encadrant": "Valentin Fer",
        },
        "consignes": {
            "liste": [
                {"titre": "Échauffe-toi.", "texte": "L'échauffement guidé est obligatoire."},
                {"titre": "Retire-toi quand tu veux.", "texte": "Jamais un échec."},
                {"titre": "Amortis tes réceptions.", "texte": "Genoux fléchis, 50 cm max."},
            ],
            "mineur": "plafonds réduits de moitié et parade systématique.",
        },
        "sante": {
            "attestation": True,
            "commentaire_libre": "",
            "questions": ["Question A ?", "Question B ?"],
        },
        "image": {"autorise": False, "supports": "le site", "duree": "3 ans"},
        "consentement": {
            "consignes": True,
            "majeur": True,
            "exactitude": True,
            "autorite_parentale": False,
            "soins_urgence": False,
        },
        "assurance": {"assureur": "AsurTest", "numero": "123"},
        "responsable": {"nom": "Valentin Fer", "email": "contact@thelocomotionlab.com"},
        "dossier": {"reference": "LL-ATL-2026-0001"},
        "preuve": {"horodatage": "2026-09-08 21:14:03", "ip": "192.0.2.1"},
    }
    base.update(over)
    return base


def test_render_resout_tout():
    tex = render_tex(_payload())
    assert r"\VAR{" not in tex
    assert r"\BLOCK{" not in tex
    assert "Camille" in tex and "LL-ATL-2026-0001" in tex


def test_boucles_consignes_et_sante():
    tex = render_tex(_payload())
    assert tex.count(r"\item \textbf{") == 3  # les 3 consignes du payload
    assert "Question A ?" in tex and "Question B ?" in tex
    # contenu modifié → rendu modifié (source unique côté page)
    p = _payload()
    p["consignes"]["liste"].append({"titre": "Nouvelle.", "texte": "Ajoutée depuis la page."})
    assert "Ajoutée depuis la page." in render_tex(p)


def test_echappement_injection():
    p = _payload()
    p["sante"]["commentaire_libre"] = r"\input{/etc/passwd} & 100% de $gain_#1 <ok>"
    tex = render_tex(p)
    assert r"\input{/etc/passwd}" not in tex
    assert r"\textbackslash{}input" in tex
    assert r"\&" in tex and r"\%" in tex and r"\$" in tex and r"\_" in tex
    assert r"\textless{}" in tex and r"\textgreater{}" in tex


def test_coche_jamais_echappee():
    tex = render_tex(_payload())
    assert r"\LLcoche" in tex  # attestation santé cochée
    assert r"\LLvide" in tex  # image.autorise=False → case « J'autorise » vide
    assert r"\textbackslash{}LLcoche" not in tex


def test_variante_mineur():
    adulte = render_tex(_payload())
    assert "Je certifie être majeur·e." in adulte
    assert "Mineur participant" not in adulte

    p = _payload()
    p["mineur"] = {"actif": True, "prenom": "Lou", "nom": "Ferrand", "date_naissance": "12/03/2013"}
    p["consentement"].update({"majeur": False, "autorite_parentale": True, "soins_urgence": True})
    mineur = render_tex(p)
    assert "Mineur participant" in mineur and "Lou" in mineur
    assert "autorité parentale" in mineur
    assert "Je certifie être majeur·e." not in mineur
    assert "plafonds réduits de moitié" in mineur


def test_empreinte_scelle_les_donnees_hors_preuve():
    a = _payload()
    b = _payload()
    b["preuve"] = {"horodatage": "autre", "ip": "203.0.113.9"}
    assert empreinte(a) == empreinte(b)  # la preuve n'entre pas dans le sceau

    c = _payload()
    c["participant"]["prenom"] = "Autre"
    assert empreinte(a) != empreinte(c)


def test_latex_escape_booleen_et_none():
    assert latex_escape(None) == ""
    assert latex_escape(True) == "oui"
    assert latex_escape(False) == "non"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    from twin_engine.api import create_app

    return TestClient(create_app(load_config()))


def test_endpoint_fiche_payload_invalide(client):
    reponse = client.post("/fiche", json={"participant": {}})
    assert reponse.status_code == 422
    assert "manquant" in reponse.json()["detail"]


@pytest.mark.skipif(shutil.which("xelatex") is None, reason="xelatex absent")
def test_endpoint_fiche_pdf(client):
    reponse = client.post("/fiche", json=_payload())
    assert reponse.status_code == 200
    assert reponse.headers["content-type"] == "application/pdf"
    assert reponse.content.startswith(b"%PDF")
    assert reponse.headers["X-Fiche-Reference"] == "LL-ATL-2026-0001"


@pytest.mark.skipif(shutil.which("xelatex") is None, reason="xelatex absent")
def test_build_pdf(tmp_path):
    pdf = build_pdf(_payload(), tmp_path)
    assert pdf.exists() and pdf.stat().st_size > 10_000
