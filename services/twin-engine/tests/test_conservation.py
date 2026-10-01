"""La conservation des données de la cohorte : échéances, purge quotidienne, anonymat du
registre, jumeaux périmés."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from twin_engine.config import load_config, override_config  # noqa: E402
from twin_engine.tableau_de_bord import conservation as C  # noqa: E402

CFG = load_config()


def _athlete(**over):
    return {"id": "a1", "pseudo": "Chloé", "consentement_version": "2026-10",
            "consentement_le": "2026-10-01T10:00:00+00:00",
            "archive": {"recue_le": "2026-10-01T10:00:00+00:00"},
            "ingestion": {"statut": "ingere", "le": "2026-10-02T08:00:00+00:00"}, **over}


def test_deadlines_follow_the_consent():
    a = _athlete()
    assert C.echeance(a, [], {}, CFG) == date(2027, 4, 2)
    assert C.echeance_archive(a, [], {}, CFG) == date(2027, 4, 2)
    # le texte d'avant promettait la suppression après analyse : l'archive part à l'ingestion
    ancien = _athlete(consentement_version="2026-07")
    assert C.echeance_archive(ancien, [], {}, CFG) == date(2026, 10, 2)
    assert C.echeance(ancien, [], {}, CFG) == date(2027, 4, 2)
    assert C.echeance_archive(_athlete(consentement_version="", ingestion={"statut": "recu"}),
                              [], {}, CFG) is None
    # sans date de consentement, la réception de l'archive en tient lieu
    assert C.echeance(_athlete(consentement_le=""), [], {}, CFG) == date(2027, 4, 2)
    assert C.echeance({"id": "x"}, [], {}, CFG) is None


def test_a_race_after_the_deadline_raises_an_alert_and_can_extend_it():
    a = _athlete()
    plans = [{"id": "P1", "course_id": "c1", "depart_le": ""}]
    courses = {"c1": {"depart_le": "2027-06-26T04:00:00+02:00"}}
    e = C.etat(a, plans, courses, CFG, aujourdhui=date(2026, 10, 2))
    assert e["jusquau"] == "2027-04-02" and e["jours_restants"] == 182
    assert e["courses_apres_echeance"] == ["P1"] and e["conservation"] is True
    prolonge = override_config(CFG, "cohorte.prolonger_apres_course=true")
    e2 = C.etat(a, plans, courses, prolonge, aujourdhui=date(2026, 10, 2))
    assert e2["jusquau"] == "2027-07-26" and e2["courses_apres_echeance"] == []


# --------------------------------------------------------------------------- purge
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dataclasses import replace  # noqa: E402

from test_ingestion import ADMIN, DEPOT, _prevenir, client  # noqa: E402,F401

from twin_engine.tableau_de_bord import objets as O  # noqa: E402
from twin_engine.tableau_de_bord import purge as P  # noqa: E402


def _actif(client):
    cfg = client.app.state.cfg
    client.app.state.cfg = replace(cfg, cohorte=replace(cfg.cohorte, purge="active"))
    return client.app.state.cfg


def _echu(client, version="2026-10"):
    """Un athlète ingéré, consentement de janvier : son échéance (juillet) est passée."""
    client.app.state.depot.depots = [{**DEPOT, "consentementVersion": version}]
    athlete_id = _prevenir(client).json()["athlete_id"]
    m = client.app.state.magasin
    m.athletes.modifier(athlete_id, consentement_version=version,
                        consentement_le="2026-01-05T10:00:00+00:00",
                        registre={"statut": "dev", "depuis": "2026-01-10",
                                  "journal": [{"le": "2026-01-10", "statut": "dev",
                                               "par": "Valentin", "motif": "Val, cas de référence"}]})
    ref = "LL-NICE26-VAL-0001"
    m.plans.ecrire(O.Plan(ref=ref, athlete_id=athlete_id).to_dict())
    m.registre.ecrire({"id": ref, "fige_le": "2026-02-01T00:00:00+00:00",
                       "entree": {"athlete": "Val", "race": "Nice", "date": "2026-01-20"},
                       "ligne": {"ref": ref, "athlete": "Val", "date": "2026-01-20"},
                       "corrections": [], "pseudo": "Val",
                       "fiche": {"statut": "dev", "depuis": "2026-01-10",
                                 "journal": [{"le": "2026-01-10", "statut": "dev",
                                              "par": "Valentin", "motif": "Val, cas de référence"}]}})
    client.app.state.store.creer("job-x", type="ingestion", athlete_id=athlete_id)
    client.app.state.store.modifier("job-x", statut="fini")
    return athlete_id, ref


def test_simulation_counts_and_erases_nothing(client):
    athlete_id, ref = _echu(client)
    m = client.app.state.magasin
    ligne = client.post("/tableau-de-bord/conservation/purge", headers=ADMIN).json()
    assert ligne["mode"] == "simulation" and ligne["athletes"] == 1 and ligne["plans"] == 1
    assert m.athletes.lire(athlete_id) is not None and m.registre.lire(ref) is not None
    assert client.app.state.depot.supprimes == []
    vue = client.get("/tableau-de-bord/conservation", headers=ADMIN).json()
    assert vue["mode"] == "simulation" and vue["journal"][-1] == ligne
    [a] = vue["athletes"]
    assert a["jusquau"] == "2026-07-07" and a["jours_restants"] < 0 and a["archive_conservee"]


def test_an_expired_athlete_is_erased_and_his_registre_entries_become_anonymous(client):
    _actif(client)
    athlete_id, ref = _echu(client)
    m = client.app.state.magasin
    ligne = P.purger(m, client.app.state.cfg, depot=client.app.state.depot,
                     jobs=client.app.state.store, aujourdhui=date(2026, 10, 1))
    assert (ligne["athletes"], ligne["archives"], ligne["plans"],
            ligne["entrees_anonymisees"], ligne["echecs"]) == (1, 1, 1, 1, 0)
    assert m.athletes.lire(athlete_id) is None and m.plans.lire(ref) is None
    assert client.app.state.depot.supprimes == [DEPOT["id"]]
    assert client.app.state.store.lire("job-x") is None
    [g] = m.registre.lister()
    assert g["id"].startswith("anonyme-") and "VAL" not in g["id"]
    assert g["pseudo"] == g["entree"]["athlete"] == g["ligne"]["athlete"]
    assert g["ligne"]["ref"] == g["id"]
    assert g["fiche"]["journal"] == [{"le": "2026-01-10", "statut": "dev"}]
    texte = str(g)
    assert "Val" not in texte.replace("Valeur", "")
    assert P.journal(m)[-1] == ligne


def test_the_old_consent_loses_its_archive_after_ingestion_and_keeps_the_rest(client):
    _actif(client)
    athlete_id = _prevenir(client).json()["athlete_id"]       # dépôt sans version : l'ancien texte
    a = client.app.state.magasin.athletes.lire(athlete_id)
    assert a["ingestion"]["statut"] == "ingere" and a["consentement_version"] == ""
    assert client.app.state.depot.supprimes == [DEPOT["id"]]
    assert a["archive"]["purgee_le"] and a["jumeau"]["n_vrais_ultras"] is not None
    vue = client.get(f"/tableau-de-bord/athletes/{athlete_id}", headers=ADMIN).json()
    assert vue["archive_conservee"] is False and vue["conservation"]["conservation"] is False


def test_a_new_consent_keeps_its_archive(client):
    _actif(client)
    client.app.state.depot.depots = [{**DEPOT, "consentementVersion": "2026-10"}]
    athlete_id = _prevenir(client).json()["athlete_id"]
    a = client.app.state.magasin.athletes.lire(athlete_id)
    assert a["consentement_version"] == "2026-10" and a["consentement_le"] == DEPOT["createdAt"]
    assert client.app.state.depot.supprimes == [] and not a["archive"]["purgee_le"]
    assert a["jumeau_produit_par"]["empreinte"]


def test_a_depot_that_does_not_answer_is_retried_and_never_recreates_the_athlete(client):
    _actif(client)
    athlete_id, _ = _echu(client)
    depot = client.app.state.depot
    m = client.app.state.magasin
    depot.panne = True
    ligne = P.purger(m, client.app.state.cfg, depot=depot, jobs=client.app.state.store)
    assert ligne["echecs"] >= 1 and m.athletes.lire(athlete_id) is None
    assert P.en_attente_de_purge(m) == [DEPOT["id"]]
    depot.panne = False
    assert client.post("/tableau-de-bord/file/refresh", headers=ADMIN).json()["rattrapes"] == []
    P.purger(m, client.app.state.cfg, depot=depot, jobs=client.app.state.store)
    assert depot.supprimes == [DEPOT["id"]] and P.en_attente_de_purge(m) == []


def test_stale_twins_are_reingested_one_at_a_time(client):
    client.app.state.depot.depots = [{**DEPOT, "consentementVersion": "2026-10"}]
    athlete_id = _prevenir(client).json()["athlete_id"]
    m = client.app.state.magasin
    assert client.post("/tableau-de-bord/athletes/reingerer-un-perime",
                       headers=ADMIN).json() == {"athlete_id": None, "job_id": None, "restants": 0}
    m.athletes.modifier(athlete_id, jumeau_produit_par={"commit": "ancien", "empreinte": "x"})
    assert client.get(f"/tableau-de-bord/athletes/{athlete_id}", headers=ADMIN).json()["perime"]
    r = client.post("/tableau-de-bord/athletes/reingerer-un-perime", headers=ADMIN).json()
    assert r["athlete_id"] == athlete_id and r["job_id"] and r["restants"] == 0
    assert not client.get(f"/tableau-de-bord/athletes/{athlete_id}", headers=ADMIN).json()["perime"]
    # une archive purgée ne se ré-ingère plus
    m.athletes.modifier(athlete_id, jumeau_produit_par={"commit": "ancien", "empreinte": "x"},
                        archive={**m.athletes.lire(athlete_id)["archive"], "purgee_le": "2026-10-01"})
    assert client.post("/tableau-de-bord/athletes/reingerer-un-perime",
                       headers=ADMIN).json()["athlete_id"] is None


def test_a_redeposit_keeps_the_registre_status(client):
    athlete_id = _prevenir(client).json()["athlete_id"]
    m = client.app.state.magasin
    m.athletes.modifier(athlete_id, registre={"statut": "dev", "depuis": "2026-09-20",
                                              "journal": [{"le": "2026-09-20", "statut": "dev"}]})
    client.app.state.depot.depots = [{**DEPOT, "id": "dep-2", "consentementVersion": "2026-10",
                                      "createdAt": "2026-09-30T10:00:00.000Z"}]
    _prevenir(client, depot_id="dep-2")
    a = m.athletes.lire(athlete_id)
    assert a["registre"]["statut"] == "dev" and a["depot_id"] == "dep-2"
    assert a["consentement_version"] == "2026-10"
