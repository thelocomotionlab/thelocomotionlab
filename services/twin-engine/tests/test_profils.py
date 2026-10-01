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
