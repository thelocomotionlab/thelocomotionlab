"""Du dépôt à l'athlète : l'appel interne, l'ingestion, la fiche.

Ce que ces tests gardent : un dépôt ne se perd pas, une archive ne survit pas à son
analyse, et le niveau posé sur l'athlète ne dépend d'aucune course.
"""

from __future__ import annotations

import io
import shutil
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from twin_engine.config import load_config
from twin_engine.tableau_de_bord import objets as O
from twin_engine.tableau_de_bord.depot import DepotIndisponible
from twin_engine.tableau_de_bord.ingestion import (
    ArchiveIllisible,
    analyser_larchive,
    resumer_le_jumeau,
)
from twin_engine.tableau_de_bord.routes import identifiant_dathlete

FIX = Path(__file__).parent / "fixtures"
JETON = "jeton-de-test-0123456789"
SECRET_INTERNE = "secret-interne-de-test"

DEPOT = {
    "id": "dep-1",
    "reference": "LL-TWIN-2026-0001",
    "prenom": "Val",
    "nom": "Ferreira",
    "email": "Val@Example.Test",
    "montre": "garmin",
    "consent": True,
    "nomFichier": "garmin.gpx",
    "taille": 12345,
    "sha256": "abc123",
    "createdAt": "2026-09-13T10:00:00.000Z",
}


class FauxDepot:
    """Le service de dépôt, sans le service de dépôt."""

    def __init__(self, depots=None, archive: Path | None = None, panne: bool = False):
        self.depots = list(depots if depots is not None else [DEPOT])
        self.archive = archive or (FIX / "sample.gpx")
        self.panne = panne
        self.telechargements: list[str] = []

    def lister(self):
        if self.panne:
            raise DepotIndisponible("dépôt injoignable : pour de faux")
        return list(self.depots)

    def trouver(self, depot_id):
        return next((d for d in self.lister() if d["id"] == depot_id), None)

    def telecharger(self, depot_id, destination: Path):
        if self.panne:
            raise DepotIndisponible("archive illisible : pour de faux")
        self.telechargements.append(depot_id)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(self.archive, destination)
        return destination


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("TWIN_ADMIN_TOKEN", JETON)
    monkeypatch.setenv("TWIN_KEYS_SECRET", "secret-de-cles")
    monkeypatch.setenv("TWIN_INTERNAL_SECRET", SECRET_INTERNE)
    from twin_engine.api import create_app

    app = create_app(load_config())
    app.state.depot = FauxDepot()
    return TestClient(app)


ADMIN = {"Authorization": f"Bearer {JETON}"}


def _prevenir(client, depot_id="dep-1", secret=SECRET_INTERNE):
    return client.post("/twin/internal/deposits",
                       json={"depot_id": depot_id, "secret": secret})


# --------------------------------------------------------------------------- #
# L'appel interne (§2.3, §5.1)
# --------------------------------------------------------------------------- #
def test_un_depot_cree_un_athlete_et_met_lingestion_en_file(client):
    r = _prevenir(client)
    assert r.status_code == 200
    corps = r.json()
    assert corps["athlete_id"] == identifiant_dathlete("val@example.test")

    athlete = client.get(f"/tableau-de-bord/athletes/{corps['athlete_id']}",
                         headers=ADMIN).json()
    assert athlete["prenom"] == "Val" and athlete["montre"] == "garmin"
    assert athlete["consent_at"] == "2026-09-13T10:00:00.000Z"
    assert athlete["archive"]["sha256"] == "abc123"
    assert athlete["depot_id"] == "dep-1"


def test_lidentite_ne_se_croit_pas_sur_parole(client):
    """La charge ne porte que l'id ; l'identité est relue sur le dépôt."""
    r = client.post("/twin/internal/deposits", json={
        "depot_id": "dep-1", "secret": SECRET_INTERNE,
        "email": "pirate@ailleurs.test", "prenom": "Quelqu'un d'autre",
    })
    athlete = client.get(f"/tableau-de-bord/athletes/{r.json()['athlete_id']}",
                         headers=ADMIN).json()
    assert athlete["email"] == "Val@Example.Test" and athlete["prenom"] == "Val"


def test_sans_consentement_aucune_date_nest_supposee(client):
    client.app.state.depot = FauxDepot([{**DEPOT, "consent": False}])
    r = _prevenir(client)
    athlete = client.get(f"/tableau-de-bord/athletes/{r.json()['athlete_id']}",
                         headers=ADMIN).json()
    assert athlete["consent_at"] == ""


@pytest.mark.parametrize("secret", ["", "mauvais", None])
def test_un_mauvais_secret_interne_est_refuse(client, secret):
    charge = {"depot_id": "dep-1"}
    if secret is not None:
        charge["secret"] = secret
    assert client.post("/twin/internal/deposits", json=charge).status_code == 401


def test_sans_secret_configure_la_route_nexiste_pas(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("TWIN_INTERNAL_SECRET", raising=False)
    from twin_engine.api import create_app

    c = TestClient(create_app(load_config()))
    assert c.post("/twin/internal/deposits", json={"depot_id": "x"}).status_code == 404


def test_un_depot_inconnu_est_un_404(client):
    assert _prevenir(client, "dep-inexistant").status_code == 404


def test_un_depot_injoignable_est_un_502_pas_un_500(client):
    client.app.state.depot = FauxDepot(panne=True)
    assert _prevenir(client).status_code == 502


def test_le_meme_email_ne_cree_pas_deux_athletes(client):
    """C'est l'email qui le reconnaît à sa deuxième course (§3.1)."""
    premier = _prevenir(client).json()["athlete_id"]
    client.app.state.depot = FauxDepot([{**DEPOT, "id": "dep-2", "sha256": "def456"}])
    second = _prevenir(client, "dep-2").json()["athlete_id"]
    assert premier == second

    athlete = client.get(f"/tableau-de-bord/athletes/{second}", headers=ADMIN).json()
    assert athlete["archive"]["sha256"] == "def456" and athlete["depot_id"] == "dep-2"


def test_un_athlete_qui_redepose_ne_perd_pas_ses_plans(client):
    athlete_id = _prevenir(client).json()["athlete_id"]
    magasin = client.app.state.magasin
    magasin.athletes.modifier(athlete_id, plans=["LL-NICE26-VAL-0001"], pseudo="Valou")
    client.app.state.depot = FauxDepot([{**DEPOT, "id": "dep-2"}])
    _prevenir(client, "dep-2")
    encore = magasin.athletes.lire(athlete_id)
    assert encore["plans"] == ["LL-NICE26-VAL-0001"] and encore["pseudo"] == "Valou"


def test_lemail_ne_se_lit_pas_dans_lidentifiant():
    """Un id voyage dans des URL et des journaux ; une adresse n'a rien à y faire."""
    oid = identifiant_dathlete("val@example.test")
    assert "val" not in oid and "@" not in oid and len(oid) == 16
    assert oid == identifiant_dathlete("  VAL@Example.TEST  ")


# --------------------------------------------------------------------------- #
# L'ingestion (§2.5, §5.2)
# --------------------------------------------------------------------------- #
def test_lingestion_pose_le_jumeau_la_calibration_et_le_niveau(client):
    """TestClient exécute la tâche de fond avant de rendre la réponse."""
    athlete_id = _prevenir(client).json()["athlete_id"]
    athlete = client.get(f"/tableau-de-bord/athletes/{athlete_id}", headers=ADMIN).json()

    assert athlete["ingestion"]["statut"] == O.INGESTION_INGERE
    assert athlete["niveau"]["nom"] in {O.NIVEAU_BASE, O.NIVEAU_CALIBRE}
    repertoire = client.app.state.magasin.athletes.repertoire(athlete_id)
    assert (repertoire / "jumeau.json").exists()
    assert (repertoire / "calibration.json").exists()


def test_larchive_ne_survit_pas_a_son_analyse(client, tmp_path):
    _prevenir(client)
    restes = list((tmp_path / "data").glob("ingestion-*"))
    assert restes == [], f"temporaires laissés derrière : {restes}"


def test_une_archive_illisible_se_lit_comme_telle(client, tmp_path):
    """Pas « échec du traitement » : la File doit pouvoir dire quoi redemander."""
    casse = tmp_path / "pas-une-archive.gpx"
    casse.write_bytes(b"ceci n'est ni du Garmin, ni du Strava, ni du Coros")
    client.app.state.depot = FauxDepot(archive=casse)
    athlete_id = _prevenir(client).json()["athlete_id"]
    athlete = client.get(f"/tableau-de-bord/athletes/{athlete_id}", headers=ADMIN).json()
    assert athlete["ingestion"]["statut"] == O.INGESTION_ILLISIBLE
    # Le message doit dire quoi redemander, pas « échec du traitement ».
    assert "Garmin" in athlete["ingestion"]["erreur"]
    assert athlete["jumeau"]["vc_kmh"] is None, "aucun chiffre ne doit être inventé"


def test_lingestion_est_un_job_quon_peut_suivre(client):
    job_id = _prevenir(client).json()["job_id"]
    job = client.get(f"/jobs/{job_id}").json()
    assert job["type"] == O.JOB_INGESTION
    assert job["statut"] in {O.JOB_FINI, O.JOB_ECHEC}
    assert job["athlete_id"] == identifiant_dathlete("val@example.test")


def test_ingerer_a_la_main_relance_une_ingestion(client):
    athlete_id = _prevenir(client).json()["athlete_id"]
    client.app.state.depot.telechargements.clear()
    r = client.post(f"/tableau-de-bord/athletes/{athlete_id}/ingest", headers=ADMIN)
    assert r.status_code == 200 and r.json()["job_id"]
    assert client.app.state.depot.telechargements == ["dep-1"]


def test_ingerer_un_athlete_sans_depot_le_dit(client):
    magasin = client.app.state.magasin
    magasin.athletes.ecrire(O.Athlete(id="orphelin", pseudo="Sans dépôt").to_dict())
    r = client.post("/tableau-de-bord/athletes/orphelin/ingest", headers=ADMIN)
    assert r.status_code == 409 and "archive" in r.json()["detail"]


def test_reingerer_avec_mon_archive(client, tmp_path):
    """Le chemin « je la renvoie depuis mon ordi », quand le moteur a changé (§5.2)."""
    athlete_id = _prevenir(client).json()["athlete_id"]
    client.app.state.depot.telechargements.clear()
    r = client.post(
        f"/tableau-de-bord/athletes/{athlete_id}/archive", headers=ADMIN,
        files={"archive": ("perso.gpx", (FIX / "sample.gpx").read_bytes(),
                           "application/gpx+xml")},
    )
    assert r.status_code == 200
    assert client.app.state.depot.telechargements == [], "le dépôt n'a rien à faire ici"
    assert list((tmp_path / "data").glob("archive-*")) == []


def test_une_ingestion_manquee_se_rattrape_au_rafraichir(client):
    """Le filet, pour le jour où l'appel du dépôt est tombé."""
    r = client.post("/tableau-de-bord/file/refresh", headers=ADMIN)
    assert r.status_code == 200
    assert len(r.json()["rattrapes"]) == 1
    # Un second passage ne crée rien : l'athlète est déjà là.
    assert client.post("/tableau-de-bord/file/refresh",
                       headers=ADMIN).json()["rattrapes"] == []


def test_le_rafraichir_dit_quand_le_depot_ne_repond_pas(client):
    client.app.state.depot = FauxDepot(panne=True)
    assert client.post("/tableau-de-bord/file/refresh", headers=ADMIN).status_code == 502


# --------------------------------------------------------------------------- #
# La fiche athlète (§5.2)
# --------------------------------------------------------------------------- #
def test_la_fiche_porte_les_plans_en_entier(client):
    athlete_id = _prevenir(client).json()["athlete_id"]
    magasin = client.app.state.magasin
    magasin.plans.ecrire(O.Plan(ref="LL-X", athlete_id=athlete_id).to_dict())
    magasin.athletes.modifier(athlete_id, plans=["LL-X", "LL-DISPARU"])

    fiche = client.get(f"/tableau-de-bord/athletes/{athlete_id}", headers=ADMIN).json()
    assert [p["ref"] for p in fiche["plans"]] == ["LL-X"]


def test_un_athlete_inconnu_est_un_404(client):
    assert client.get("/tableau-de-bord/athletes/personne",
                      headers=ADMIN).status_code == 404


def test_supprimer_emporte_tout(client):
    athlete_id = _prevenir(client).json()["athlete_id"]
    magasin = client.app.state.magasin
    magasin.plans.ecrire(O.Plan(ref="LL-X", athlete_id=athlete_id).to_dict())
    magasin.athletes.modifier(athlete_id, plans=["LL-X"])
    # un plan que le reflet a manqué part quand même : c'est le plan qui dit à qui il est
    magasin.plans.ecrire(O.Plan(ref="LL-Y", athlete_id=athlete_id).to_dict())
    magasin.plans.ecrire(O.Plan(ref="LL-AUTRE", athlete_id="quelquun").to_dict())
    magasin.demandes.ecrire(O.Demande(id="d1", plan_ref="LL-Y", quoi="x").to_dict())
    repertoire = magasin.athletes.repertoire(athlete_id)

    assert client.delete(f"/tableau-de-bord/athletes/{athlete_id}",
                         headers=ADMIN).status_code == 204
    assert magasin.athletes.lire(athlete_id) is None
    assert magasin.plans.lire("LL-X") is None and magasin.plans.lire("LL-Y") is None
    assert magasin.demandes.lire("d1") is None, "ses demandes restaient, notes comprises"
    assert magasin.plans.lire("LL-AUTRE") is not None
    assert not repertoire.exists(), "le jumeau et la calibration restaient sur le disque"


def test_on_ne_supprime_pas_un_athlete_en_plein_travail(client):
    athlete_id = _prevenir(client).json()["athlete_id"]
    client.app.state.store.creer("job-1", type="ingestion", athlete_id=athlete_id)
    assert client.delete(f"/tableau-de-bord/athletes/{athlete_id}",
                         headers=ADMIN).status_code == 409
    assert client.app.state.magasin.athletes.lire(athlete_id) is not None


def test_la_file_montre_le_dossier_et_son_verbe(client):
    _prevenir(client)
    vue = client.get("/tableau-de-bord/file", headers=ADMIN).json()
    assert len(vue["dossiers"]) == 1
    assert vue["dossiers"][0]["prenom"] == "Val"
    assert vue["dossiers"][0]["suivant"] == "composer"   # ingéré, pas encore de plan
    assert vue["compteurs"]["a_composer"] == 1
    assert sum(vue["compteurs"].values()) == 1


# --------------------------------------------------------------------------- #
# Le niveau ne dépend d'aucune course
# --------------------------------------------------------------------------- #
def test_le_niveau_se_pose_sans_course():
    """C'est une propriété de l'ARCHIVE : l'athlète n'a pas encore choisi sa course.

    Le critère « domaine de calibration », lui, compare un parcours au domaine du
    moteur — il appartient au plan, et n'entre donc pas ici."""
    cfg = load_config()
    twin, calibration, suffisance, _ = analyser_larchive(
        FIX / "sample.gpx", cfg=cfg, analysis_date=date(2026, 9, 22)
    )
    assert suffisance.verdict in {"🟢", "🟠", "🔴"}
    assert not any("Domaine de calibration" == c.name for c in suffisance.criteria)

    jumeau = resumer_le_jumeau(twin, calibration).__dict__
    assert set(jumeau) == {"vc_kmh", "E", "durabilite_pct", "n_vrais_ultras", "n_avec_fc",
                           "donnees_jusquau", "plus_long_h", "plus_gros_dplus_m"}
    assert jumeau["n_vrais_ultras"] == len(calibration.genuine)


def test_une_archive_vide_ne_passe_pas_pour_un_jumeau(tmp_path):
    """L'ingestion écarte les fichiers qu'elle ne sait pas lire sans jamais lever : sans
    garde-fou, une archive entièrement écartée produirait un jumeau vide, tranquillement."""
    casse = tmp_path / "rien.gpx"
    casse.write_bytes(b"pas du GPX du tout")
    with pytest.raises(ArchiveIllisible):
        analyser_larchive(casse, cfg=load_config())


def test_lavancement_dit_ce_qui_se_passe_au_present(client):
    etapes: list[str] = []
    analyser_larchive(FIX / "sample.gpx", cfg=load_config(), avancer=etapes.append)
    assert etapes == ["lecture de l'archive", "calcul du jumeau"]
    assert all(len(e.split()) <= 4 for e in etapes)


# --------------------------------------------------------------------------- #
# L'import d'un plan fabriqué au CLI (§2.6, §5.4)
# --------------------------------------------------------------------------- #
import datetime as dt  # noqa: E402
import json  # noqa: E402
import sys  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
from test_report_v3 import _triangle_gpx, scenario  # noqa: E402

from twin_engine import dossier as dossier_mod  # noqa: E402

REF_CLI = "LL-TRIA26-VAL-IMPORT"


@pytest.fixture(scope="module")
def dossier_du_cli() -> bytes:
    """Le dossier tel qu'il sort de l'ordinateur de Valentin."""
    course, twin, cal, pred, plan, race, suf = scenario()
    charge = dossier_mod.to_payload(
        course_gpx=_triangle_gpx(), race=race, twin=twin, calibration=cal,
        prediction=pred, sufficiency=suf, athlete="Val", report_ref=REF_CLI,
        report_date=dt.datetime(2026, 9, 16, 10, 0),
    )
    return json.dumps(charge, ensure_ascii=False).encode("utf-8")


def _pdf(pages: int, largeur: float = 595) -> bytes:
    """Un vrai PDF, minuscule : l'import assemble le PDF unique, il doit pouvoir le lire."""
    from pypdf import PdfWriter

    ecrivain, tampon = PdfWriter(), io.BytesIO()
    for _ in range(pages):
        ecrivain.add_blank_page(width=largeur, height=842)
    ecrivain.write(tampon)
    return tampon.getvalue()


RAPPORT = ("rapport.pdf", _pdf(5))


def _importer(client, dossier_octets, documents=(RAPPORT,), **donnees):
    fichiers = [("dossier", ("dossier.json", dossier_octets, "application/json"))]
    fichiers += [("documents", (nom, contenu, "application/octet-stream"))
                 for nom, contenu in documents]
    return client.post("/tableau-de-bord/plans/import", headers=ADMIN,
                       files=fichiers, data=donnees)


def test_un_plan_fait_au_cli_entre_comme_sil_y_etait_ne(client, dossier_du_cli):
    from pypdf import PdfReader

    r = _importer(client, dossier_du_cli,
                  documents=[RAPPORT, ("feuille.pdf", _pdf(1, 500)),
                             ("fiches.pdf", _pdf(2, 400)),
                             ("annexe.json", b'{"ref": "LL-TRIA26-VAL-IMPORT"}')])
    assert r.status_code == 200, r.text
    assert r.json() == {"ref": REF_CLI, "version": 1,
                        "documents": ["annexe.json", "feuille.pdf", "fiches.pdf",
                                      "rapport.pdf"]}

    plan = client.app.state.magasin.plans.lire(REF_CLI)
    assert plan["statut"] == O.PLAN_GENERE
    assert plan["documents"]["pdf"] == "v1/plan.pdf"
    assert plan["documents"]["feuille_pdf"] == "v1/feuille.pdf"
    assert plan["prediction"]["central_h"] is not None
    assert plan["prediction"]["niveau"] in {O.NIVEAU_BASE, O.NIVEAU_CALIBRE}
    assert plan["depart_le"].startswith("2026-09-25T13:00")

    v1 = client.app.state.magasin.plans.repertoire(REF_CLI) / "v1"
    assert sorted(p.name for p in v1.iterdir()) == [
        "annexe.json", "dossier.json", "feuille.pdf", "plan.pdf", "version.json"]
    # le PDF unique : le rapport, puis la feuille, puis les fiches — comme une génération
    largeurs = [float(p.mediabox.width) for p in PdfReader(v1 / "plan.pdf").pages]
    assert largeurs == [595] * 5 + [500] + [400] * 2
    assert json.loads((v1 / "version.json").read_text())["origine"] == "import"


def test_la_reference_du_papier_est_celle_du_plan(client, dossier_du_cli):
    """Elle est déjà imprimée sur le rapport et dans son QR code : en tirer une autre
    ici casserait le papier déjà sorti."""
    assert _importer(client, dossier_du_cli).json()["ref"] == REF_CLI


def test_reimporter_fait_une_version_de_plus(client, dossier_du_cli):
    assert _importer(client, dossier_du_cli).json()["version"] == 1
    assert _importer(client, dossier_du_cli).json()["version"] == 2
    v2 = client.app.state.magasin.plans.repertoire(REF_CLI) / "v2" / "dossier.json"
    assert v2.exists(), "chaque version garde son dossier"


def test_reimporter_apres_une_restauration_necrase_pas_une_version(client, dossier_du_cli):
    _importer(client, dossier_du_cli)
    _importer(client, dossier_du_cli)
    assert client.post(f"/tableau-de-bord/plans/{REF_CLI}/restore/1",
                       headers=ADMIN).status_code == 200
    assert _importer(client, dossier_du_cli).json()["version"] == 3


def test_limport_se_rattache_a_un_athlete(client, dossier_du_cli):
    athlete_id = _prevenir(client).json()["athlete_id"]
    _importer(client, dossier_du_cli, athlete_id=athlete_id)
    assert client.app.state.magasin.athletes.lire(athlete_id)["plans"] == [REF_CLI]
    # Deux imports ne l'inscrivent pas deux fois.
    _importer(client, dossier_du_cli, athlete_id=athlete_id)
    assert client.app.state.magasin.athletes.lire(athlete_id)["plans"] == [REF_CLI]


def test_un_athlete_inconnu_arrete_limport(client, dossier_du_cli):
    r = _importer(client, dossier_du_cli, athlete_id="personne")
    assert r.status_code == 404
    assert client.app.state.magasin.plans.lire(REF_CLI) is None


def test_une_course_inconnue_arrete_limport(client, dossier_du_cli):
    assert _importer(client, dossier_du_cli, course_id="nulle-part").status_code == 404


def test_un_dossier_illisible_est_un_422(client):
    assert _importer(client, b"{ pas du json").status_code == 422
    assert _importer(client, json.dumps({"version": 999}).encode()).status_code == 422


def test_sans_rapport_pas_dimport(client, dossier_du_cli):
    r = _importer(client, dossier_du_cli, documents=[("feuille.pdf", _pdf(1))])
    assert r.status_code == 422
    assert client.app.state.magasin.plans.lire(REF_CLI) is None
    assert not list(client.app.state.magasin.plans.racine.glob("*/.import-*"))


def test_un_pdf_illisible_est_un_422_pas_un_500(client, dossier_du_cli):
    r = _importer(client, dossier_du_cli, documents=[("rapport.pdf", b"%PDF-1.5\nrien\n")])
    assert r.status_code == 422
    assert "illisible" in r.json()["detail"]


def test_un_document_inattendu_nest_pas_deballe(client, dossier_du_cli):
    """Un import ne déballe pas n'importe quoi dans un répertoire du volume."""
    r = _importer(client, dossier_du_cli,
                  documents=[("../../evade.pdf", b"%PDF"), ("notes.txt", b"bonjour"), RAPPORT])
    assert r.json()["documents"] == ["rapport.pdf"]
    v1 = client.app.state.magasin.plans.repertoire(REF_CLI) / "v1"
    assert sorted(p.name for p in v1.iterdir()) == ["dossier.json", "plan.pdf", "version.json"]


def test_la_fourchette_et_les_bornes_ne_se_confondent_pas(client, dossier_du_cli):
    """Le registre compte « dans la fourchette » (bande de course, 50 %) et « dans les
    bornes » (sécurité, 80 %) : les intervertir fausserait la couverture."""
    from twin_engine.tableau_de_bord.plan import resumer_la_prediction

    d = dossier_mod.from_payload(json.loads(dossier_du_cli))
    vu = resumer_la_prediction(d)
    bornes = [d.prediction.interval_low_h, d.prediction.interval_high_h]
    assert vu.bornes == [round(b, 3) for b in bornes]
    if d.prediction.plan_low_h is not None:
        assert vu.fourchette == [round(d.prediction.plan_low_h, 3),
                                 round(d.prediction.plan_high_h, 3)]
        assert vu.fourchette[0] >= vu.bornes[0] and vu.fourchette[1] <= vu.bornes[1]
