"""Les profils de configuration servis au plan : défaut, référence, expérimental."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from twin_engine.config import load_config  # noqa: E402
from twin_engine.profils import PROFILS, config_du_profil, lister, surcharges  # noqa: E402
from twin_engine.registre.runs import drapeaux_hors_defaut, empreinte_config  # noqa: E402

CFG = load_config()


def test_the_default_profile_is_the_shipped_configuration():
    assert config_du_profil(CFG, "defaut") is CFG
    assert [p["nom"] for p in lister()] == list(PROFILS)
    assert surcharges("defaut") == []
    with pytest.raises(ValueError):
        surcharges("inconnu")


def test_a_profile_is_a_list_of_overrides_that_the_registre_can_read_back():
    exp = config_du_profil(CFG, "experimental")
    flags = drapeaux_hors_defaut(exp)
    assert set(flags) == {s.split("=")[0] for s in surcharges("experimental")}
    assert empreinte_config(exp) != empreinte_config(CFG)
    # la référence est vide tant qu'aucun run n'a gardé de drapeau hors du défaut
    assert config_du_profil(CFG, "reference") is CFG


def test_profiles_come_from_the_configuration_file(tmp_path):
    chemin = tmp_path / "twin.config.json"
    chemin.write_text(json.dumps({"profils": {"reference": {"description": "Val",
                                                            "drapeaux": ["pacing.fade_delta=0.1"]}}}))
    assert surcharges("reference", chemin) == ["pacing.fade_delta=0.1"]
    assert config_du_profil(CFG, "reference", chemin).pacing.fade_delta == 0.1
    assert surcharges("experimental", chemin) == []
    assert lister(chemin)[1]["description"] == "Val"
    assert surcharges("reference", tmp_path / "absent.json") == []


# --------------------------------------------------------------------------- tableau de bord
sys.path.insert(0, str(Path(__file__).parent))
from test_ingestion import ADMIN, REF_CLI, _importer, _prevenir, client, dossier_du_cli  # noqa: E402,F401

from twin_engine.tableau_de_bord import generation as G  # noqa: E402
from twin_engine.tableau_de_bord import objets as O  # noqa: E402
from twin_engine.tableau_de_bord.routes_plans import lire_les_reglages  # noqa: E402


def test_a_plan_chooses_its_profile_and_a_version_keeps_what_served():
    assert lire_les_reglages({"profil": "experimental"}, None).profil == "experimental"
    assert lire_les_reglages({}, None).profil == "defaut"
    with pytest.raises(ValueError):
        lire_les_reglages({"profil": "audacieux"}, None)
    plan = O.Plan.from_dict(O.Plan(ref="LL-X", reglages=O.Reglages(profil="reference")).to_dict())
    assert plan.reglages.profil == "reference"

    servie, garde = G.configuration_de_la_version(CFG, "experimental")
    assert garde["profil"] == "experimental" and garde["surcharges"] == surcharges("experimental")
    assert garde["empreinte"] == empreinte_config(servie)
    assert garde["drapeaux"] == drapeaux_hors_defaut(servie, defauts=CFG)
    # une version se rejoue sous les surcharges qu'elle garde, pas sous le profil d'aujourd'hui
    rejouee = G.cfg_de_la_version(CFG, {"configuration": {"surcharges": ["pacing.fade_delta=0.1"]}})
    assert rejouee.pacing.fade_delta == 0.1
    assert G.cfg_de_la_version(CFG, {}) is CFG


def test_the_registre_keeps_the_profile_that_served_the_plan(client, dossier_du_cli):
    athlete_id = _prevenir(client).json()["athlete_id"]
    client.app.state.magasin.athletes.modifier(athlete_id, pseudo="Val")
    assert _importer(client, dossier_du_cli, athlete_id=athlete_id).status_code == 200
    vue = client.get(f"/tableau-de-bord/plans/{REF_CLI}", headers=ADMIN).json()
    assert [p["nom"] for p in vue["profils"]] == ["defaut", "reference", "experimental"]
    # la version a été générée sous le profil expérimental
    version = client.app.state.magasin.plans.repertoire(REF_CLI) / "v1" / "version.json"
    resume = json.loads(version.read_text(encoding="utf-8"))
    _, garde = G.configuration_de_la_version(CFG, "experimental")
    resume["configuration"] = garde
    version.write_text(json.dumps(resume), encoding="utf-8")
    r = client.put(f"/tableau-de-bord/plans/{REF_CLI}/result", headers=ADMIN, json={"officiel_h": "30:00"})
    assert r.status_code == 200, r.text
    [ligne] = client.get("/tableau-de-bord/registre", headers=ADMIN).json()["lignes"]
    assert ligne["profil"] == "experimental"
    [entree] = client.get("/tableau-de-bord/registre/export", headers=ADMIN).json()["entries"]
    assert entree["configuration"]["profil"] == "experimental"
    assert entree["configuration"]["drapeaux"] == garde["drapeaux"]
    assert "surcharges" not in entree["configuration"]
