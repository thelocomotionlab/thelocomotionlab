"""Le registre vivant : calculé depuis les plans qui ont un résultat, compté par niveau
servi, exporté au format du fichier committé (récapitulatif §5.6, §6.3)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parents[1]))
from test_ingestion import (  # noqa: E402,F401
    ADMIN, REF_CLI, _importer, _prevenir, client, dossier_du_cli,
)

from twin_engine.tableau_de_bord import objets as O  # noqa: E402
from twin_engine.tableau_de_bord.registre import resumer  # noqa: E402

REGISTRE_COMMITTE = Path(__file__).parents[3] / "docs" / "twin-registre-couverture.json"


def _plan_couru(client, dossier_du_cli, **resultat) -> dict:
    athlete_id = _prevenir(client).json()["athlete_id"]
    client.app.state.magasin.athletes.modifier(athlete_id, pseudo="Val")
    assert _importer(client, dossier_du_cli, athlete_id=athlete_id).status_code == 200
    r = client.put(f"/tableau-de-bord/plans/{REF_CLI}/result", headers=ADMIN, json=resultat)
    assert r.status_code == 200, r.text
    return client.app.state.magasin.plans.lire(REF_CLI)


def test_une_course_saisie_entre_au_registre_de_son_niveau(client, dossier_du_cli):
    plan = _plan_couru(client, dossier_du_cli, officiel_h="30:00")
    registre = client.get("/tableau-de-bord/registre", headers=ADMIN).json()
    [ligne] = registre["lignes"]
    central = plan["prediction"]["central_h"]
    assert ligne["ref"] == REF_CLI and ligne["athlete"] == "Val"
    assert ligne["officiel_h"] == 30.0 and not ligne["a_saisir"]
    assert ligne["err_pct"] == pytest.approx(100 * (central - 30.0) / 30.0, abs=0.01)
    niveau = plan["prediction"]["niveau"]
    autre = O.NIVEAU_CALIBRE if niveau == O.NIVEAU_BASE else O.NIVEAU_BASE
    assert registre[niveau]["entrees"] == 1 and registre[niveau]["finies"] == 1
    assert registre[niveau]["erreur_moyenne"] == pytest.approx(abs(ligne["err_pct"]), abs=0.05)
    assert registre[autre]["entrees"] == 0 and registre[autre]["erreur_moyenne"] is None


def test_un_abandon_se_compte_sans_entrer_dans_la_moyenne(client, dossier_du_cli):
    plan = _plan_couru(client, dossier_du_cli, abandon=True)
    niveau = plan["prediction"]["niveau"]
    resume = client.get("/tableau-de-bord/registre", headers=ADMIN).json()[niveau]
    assert resume == {"entrees": 1, "finies": 0, "abandons": 1, "erreur_moyenne": None,
                      "biais": None, "fourchette": None, "bornes": None}


def test_un_plan_sans_resultat_nentre_pas_au_registre(client, dossier_du_cli):
    _importer(client, dossier_du_cli)
    assert client.get("/tableau-de-bord/registre", headers=ADMIN).json()["lignes"] == []


def test_lexport_a_la_forme_du_fichier_committe(client, dossier_du_cli):
    _plan_couru(client, dossier_du_cli, officiel_h=31.5)
    export = client.get("/tableau-de-bord/registre/export", headers=ADMIN).json()
    [entree] = export["entries"]
    committe = json.loads(REGISTRE_COMMITTE.read_text(encoding="utf-8"))["entries"][0]
    # mêmes clés que le banc, plus ce que le banc ne sait pas : le niveau servi, la source
    assert set(entree) - set(committe) == {"niveau", "source"}
    # « passages » vient de tools/passages.py, qui lit l'activité de la course elle-même :
    # le tableau de bord ne l'a pas — trois entrées du fichier committé non plus
    assert set(committe) - set(entree) <= {"passages"}
    assert set(entree["model"]) == set(committe["model"])
    assert set(entree["prediction"]) == set(committe["prediction"])
    assert entree["official_time_h"] == 31.5 and entree["dnf"] is False
    assert entree["athlete"] == "Val" and entree["dev_set"] is False


def test_lexport_se_lit_par_loutil_du_registre(client, dossier_du_cli):
    """``tools/registre.py`` compte les entrées du tableau de bord comme celles du banc."""
    from tools.registre import summarize

    _plan_couru(client, dossier_du_cli, officiel_h=31.5)
    entrees = client.get("/tableau-de-bord/registre/export", headers=ADMIN).json()["entries"]
    resume = summarize(entrees)
    assert resume["n_total"] == 1 and resume["n_finished"] == 1
    assert resume["n_no_prediction"] == 0


def test_lexport_ne_porte_ni_nom_ni_email(client, dossier_du_cli):
    _plan_couru(client, dossier_du_cli, officiel_h=31.5)
    texte = json.dumps(client.get("/tableau-de-bord/registre/export", headers=ADMIN).json())
    athlete = client.app.state.magasin.athletes.lister()[0]
    assert athlete["email"] not in texte and "Ferreira" not in texte


def test_le_modele_dune_version_se_garde_a_cote_de_son_dossier(client, dossier_du_cli):
    _plan_couru(client, dossier_du_cli, officiel_h=31.5)
    client.get("/tableau-de-bord/registre", headers=ADMIN)
    garde = client.app.state.magasin.plans.repertoire(REF_CLI) / "v1" / "registre.json"
    assert garde.exists()
    avant = garde.stat().st_mtime_ns
    client.get("/tableau-de-bord/registre", headers=ADMIN)
    assert garde.stat().st_mtime_ns == avant, "relu, pas recalculé"


def test_supprimer_lathlete_garde_son_entree_au_registre(client, dossier_du_cli):
    """Archive, jumeau et plans partent ; la couverture du moteur reste (§5.2)."""
    plan = _plan_couru(client, dossier_du_cli, officiel_h=31.5)
    avant = client.get("/tableau-de-bord/registre", headers=ADMIN).json()
    export_avant = client.get("/tableau-de-bord/registre/export", headers=ADMIN).json()
    assert client.delete(f"/tableau-de-bord/athletes/{plan['athlete_id']}",
                         headers=ADMIN).status_code == 204
    assert client.app.state.magasin.plans.lire(REF_CLI) is None

    apres = client.get("/tableau-de-bord/registre", headers=ADMIN).json()
    [ligne] = apres["lignes"]
    assert ligne["gardee"] is True and ligne["athlete"] == "Val"
    assert {k: v for k, v in ligne.items() if k != "gardee"} == avant["lignes"][0]
    niveau = plan["prediction"]["niveau"]
    assert apres[niveau] == avant[niveau]
    assert client.get("/tableau-de-bord/registre/export",
                      headers=ADMIN).json() == export_avant


def test_supprimer_un_plan_couru_garde_son_entree(client, dossier_du_cli):
    _plan_couru(client, dossier_du_cli, abandon=True)
    assert client.delete(f"/tableau-de-bord/plans/{REF_CLI}", headers=ADMIN).status_code == 204
    [ligne] = client.get("/tableau-de-bord/registre", headers=ADMIN).json()["lignes"]
    assert ligne["abandon"] is True and ligne["gardee"] is True


def test_un_plan_sans_resultat_ne_laisse_rien_au_registre(client, dossier_du_cli):
    _importer(client, dossier_du_cli)
    assert client.delete(f"/tableau-de-bord/plans/{REF_CLI}", headers=ADMIN).status_code == 204
    assert client.app.state.magasin.registre.lister() == []
    assert client.get("/tableau-de-bord/registre", headers=ADMIN).json()["lignes"] == []


def test_un_plan_reimporte_reprend_la_main_sur_son_entree_gardee(client, dossier_du_cli):
    """Le CLI réimporte parfois la même référence : une seule ligne, la vivante."""
    _plan_couru(client, dossier_du_cli, officiel_h=31.5)
    client.delete(f"/tableau-de-bord/plans/{REF_CLI}", headers=ADMIN)
    _importer(client, dossier_du_cli)
    client.put(f"/tableau-de-bord/plans/{REF_CLI}/result", headers=ADMIN,
               json={"officiel_h": 30.0})
    [ligne] = client.get("/tableau-de-bord/registre", headers=ADMIN).json()["lignes"]
    assert ligne["officiel_h"] == 30.0 and "gardee" not in ligne
    [entree] = client.get("/tableau-de-bord/registre/export",
                          headers=ADMIN).json()["entries"]
    assert entree["official_time_h"] == 30.0


def test_le_resume_compte_la_couverture_des_deux_bandes():
    lignes = [
        {"a_saisir": False, "abandon": False, "err_pct": 5.0, "in_plan": True, "in_safety": True},
        {"a_saisir": False, "abandon": False, "err_pct": -15.0, "in_plan": False,
         "in_safety": True},
        {"a_saisir": False, "abandon": True, "err_pct": None, "in_plan": None,
         "in_safety": None},
        {"a_saisir": True, "abandon": False, "err_pct": None, "in_plan": None,
         "in_safety": None},
    ]
    assert resumer(lignes) == {"entrees": 3, "finies": 2, "abandons": 1,
                               "erreur_moyenne": 10.0, "biais": -5.0, "fourchette": 0.5,
                               "bornes": 1.0}


def test_le_registre_est_derriere_le_jeton(client):
    assert client.get("/tableau-de-bord/registre").status_code == 401
    assert client.get("/tableau-de-bord/registre/export").status_code == 401
