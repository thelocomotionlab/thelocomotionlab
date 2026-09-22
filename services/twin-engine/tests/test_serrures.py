"""Les deux serrures du tableau de bord, et la File qu'elles gardent.

Ce que ces tests gardent : une porte sans jeton n'existe pas, une mauvaise clé ne dit
rien de plus qu'une référence inconnue, et les compteurs de la File partitionnent.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from twin_engine.config import load_config
from twin_engine.tableau_de_bord import file as F
from twin_engine.tableau_de_bord import objets as O
from twin_engine.tableau_de_bord.serrures import (
    LONGUEUR_CLE,
    Serrures,
    Tentatives,
    adresse_du_visiteur,
)

JETON = "jeton-de-test-0123456789"
SECRET = "secret-de-cles-de-test"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("TWIN_ADMIN_TOKEN", JETON)
    monkeypatch.setenv("TWIN_KEYS_SECRET", SECRET)
    from twin_engine.api import create_app

    return TestClient(create_app(load_config()))


@pytest.fixture
def client_sans_jeton(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.delenv("TWIN_ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("TWIN_KEYS_SECRET", raising=False)
    from twin_engine.api import create_app

    return TestClient(create_app(load_config()))


# --------------------------------------------------------------------------- #
# La serrure de Valentin (§4.1)
# --------------------------------------------------------------------------- #
def test_sans_jeton_configure_la_porte_nexiste_pas(client_sans_jeton):
    """404, pas 401 : on ne signale pas une porte qu'on n'a pas de quoi ouvrir."""
    r = client_sans_jeton.get("/tableau-de-bord/file")
    assert r.status_code == 404


@pytest.mark.parametrize("entete", [
    None, "", "Bearer", "Bearer ", "Bearer mauvais", JETON,
    f"bearer {JETON}", f"Bearer {JETON} ", f"Bearer {JETON}x",
])
def test_un_mauvais_jeton_donne_401_sans_detail(client, entete):
    entetes = {} if entete is None else {"Authorization": entete}
    r = client.get("/tableau-de-bord/file", headers=entetes)
    assert r.status_code == 401
    assert r.json() == {"detail": "non_autorise"}


def test_le_bon_jeton_ouvre(client):
    r = client.get("/tableau-de-bord/file", headers={"Authorization": f"Bearer {JETON}"})
    assert r.status_code == 200
    assert set(r.json()) == {"compteurs", "dossiers", "demandes"}


def test_la_comparaison_du_jeton_est_en_temps_constant():
    """Une comparaison naïve fuit le jeton, caractère par caractère, à qui sait mesurer."""
    import inspect

    from twin_engine.tableau_de_bord import serrures

    source = inspect.getsource(serrures.Serrures.admin_ouvre)
    assert "compare_digest" in source


# --------------------------------------------------------------------------- #
# La serrure de l'athlète (§4.2)
# --------------------------------------------------------------------------- #
def test_une_cle_fait_32_caracteres_hexadecimaux():
    cle = Serrures(keys_secret=SECRET).cle("LL-NICE26-VAL-3F2A", "partage")
    assert len(cle) == LONGUEUR_CLE == 32
    assert all(c in "0123456789abcdef" for c in cle)


def test_les_deux_cles_dun_plan_different():
    s = Serrures(keys_secret=SECRET)
    deux = s.les_deux_cles("LL-X")
    assert set(deux) == {"partage", "prive"} and deux["partage"] != deux["prive"]


def test_une_cle_ne_vaut_que_pour_son_plan():
    s = Serrures(keys_secret=SECRET)
    assert s.usage_de("LL-A", s.cle("LL-B", "prive")) is None
    assert s.usage_de("LL-A", s.cle("LL-A", "prive")) == "prive"
    assert s.usage_de("LL-A", s.cle("LL-A", "partage")) == "partage"


def test_une_cle_change_avec_le_secret():
    assert Serrures(keys_secret="un").cle("LL-X", "prive") != \
           Serrures(keys_secret="deux").cle("LL-X", "prive")


@pytest.mark.parametrize("k", [None, "", "  ", "0" * 32, "pas-une-cle"])
def test_ce_qui_nest_pas_une_cle_nouvre_rien(k):
    assert Serrures(keys_secret=SECRET).usage_de("LL-X", k) is None


def test_sans_secret_aucune_cle_nest_posee():
    with pytest.raises(RuntimeError):
        Serrures().cle("LL-X", "prive")
    assert Serrures().usage_de("LL-X", "n'importe quoi") is None


def test_un_usage_inconnu_est_une_erreur_de_programme():
    with pytest.raises(ValueError):
        Serrures(keys_secret=SECRET).cle("LL-X", "administrateur")


def test_une_reference_inconnue_repond_404_comme_une_mauvaise_cle(client):
    """Jamais 403 : un 403 confirmerait que la référence existe."""
    s = Serrures(keys_secret=SECRET)
    inexistante = client.get(f"/plans/LL-INCONNU?k={s.cle('LL-INCONNU', 'prive')}")
    sans_cle = client.get("/plans/LL-INCONNU")
    assert inexistante.status_code == sans_cle.status_code == 404


# --------------------------------------------------------------------------- #
# Le compteur d'essais (§2.1 du chantier)
# --------------------------------------------------------------------------- #
def test_la_porte_se_ferme_apres_trop_dessais_rates():
    t = Tentatives(par_ip=3, fenetre_s=60)
    for _ in range(3):
        assert not t.fermee("1.2.3.4")
        t.rate("1.2.3.4")
    assert t.fermee("1.2.3.4")
    assert not t.fermee("5.6.7.8"), "une adresse n'en ferme pas une autre"


def test_une_bonne_cle_efface_lardoise():
    """La borne vise les essais, pas les gens : l'athlète qui finit par coller le bon
    lien retrouve sa page."""
    t = Tentatives(par_ip=2, fenetre_s=60)
    t.rate("1.2.3.4")
    t.reussi("1.2.3.4")
    t.rate("1.2.3.4")
    assert not t.fermee("1.2.3.4")


def test_le_compteur_oublie_ce_qui_sort_de_la_fenetre():
    t = Tentatives(par_ip=2, fenetre_s=0.05)
    t.rate("1.2.3.4")
    t.rate("1.2.3.4")
    assert t.fermee("1.2.3.4")
    import time

    time.sleep(0.06)
    assert not t.fermee("1.2.3.4")


def test_le_compteur_ne_grossit_pas_sans_fin():
    """Sans ménage, une pluie d'adresses ferait de la limite de débit la fuite."""
    t = Tentatives(par_ip=3, fenetre_s=600, plafond_ips=64)
    for i in range(400):
        t.rate(f"10.0.{i // 256}.{i % 256}")   # 400 adresses TOUTES fraîches
    assert len(t._echecs) <= 64


class _FausseRequete:
    def __init__(self, entetes, host=None):
        self.headers = entetes
        self.client = type("C", (), {"host": host})() if host else None


def test_ladresse_lue_est_celle_du_visiteur_pas_du_proxy():
    """Derrière Caddy, request.client.host est le proxy : une limite posée dessus serait
    une limite globale, et le premier venu fermerait la porte à tout le monde."""
    assert adresse_du_visiteur(_FausseRequete(
        {"x-forwarded-for": "203.0.113.7, 10.0.0.1"}, host="10.0.0.1")) == "203.0.113.7"
    assert adresse_du_visiteur(_FausseRequete({}, host="10.0.0.1")) == "10.0.0.1"
    assert adresse_du_visiteur(_FausseRequete({})) == "inconnu"


def test_cloudflare_a_le_dernier_mot_sur_ladresse():
    """CF-Connecting-IP est écrasé par Cloudflare à chaque passage ; X-Forwarded-For,
    lui, est seulement ALLONGÉ par Caddy — son premier maillon reste déclaratif."""
    assert adresse_du_visiteur(_FausseRequete({
        "cf-connecting-ip": "198.51.100.9",
        "x-forwarded-for": "1.1.1.1, 10.0.0.1",
    }, host="10.0.0.1")) == "198.51.100.9"


# --------------------------------------------------------------------------- #
# CORS — le site et l'API sont sur deux domaines
# --------------------------------------------------------------------------- #
def test_le_prefligh_du_tableau_de_bord_annonce_authorization(client):
    """C'est l'en-tête Authorization qui rend le préflight obligatoire, même sur un GET."""
    connue = load_config().api.origins[0]
    r = client.options("/tableau-de-bord/file", headers={"origin": connue})
    assert r.status_code == 204
    assert r.headers["access-control-allow-origin"] == connue
    assert "authorization" in r.headers["access-control-allow-headers"]


def test_une_origine_inconnue_nobtient_rien(client):
    r = client.options("/tableau-de-bord/file", headers={"origin": "https://ailleurs.example"})
    assert "access-control-allow-origin" not in r.headers


def test_une_reponse_derreur_porte_aussi_les_entetes(client):
    """Sans eux, le navigateur cache le message et le client n'affiche qu'un échec
    réseau — le pire moment pour perdre le détail."""
    connue = load_config().api.origins[0]
    r = client.get("/tableau-de-bord/file", headers={"origin": connue})
    assert r.status_code == 401
    assert r.headers["access-control-allow-origin"] == connue


# --------------------------------------------------------------------------- #
# La File (§5.1) — les compteurs partitionnent
# --------------------------------------------------------------------------- #
def _athlete(statut=O.INGESTION_INGERE, plans=()):
    return O.Athlete(id="a", pseudo="Val", ingestion=O.Ingestion(statut=statut),
                     plans=list(plans)).to_dict()


@pytest.mark.parametrize("ingestion,plan,attendu", [
    (O.INGESTION_RECU, None, F.INGERER),
    (O.INGESTION_EN_COURS, None, F.INGERER),
    (O.INGESTION_ILLISIBLE, None, F.INGERER),
    (O.INGESTION_INGERE, None, F.COMPOSER),
    (O.INGESTION_INGERE, {"statut": O.PLAN_A_COMPOSER}, F.PUBLIER),
    (O.INGESTION_INGERE, {"statut": O.PLAN_GENERE}, F.PUBLIER),
    (O.INGESTION_INGERE, {"statut": O.PLAN_PUBLIE}, F.ENVOYER),
    (O.INGESTION_INGERE, {"statut": O.PLAN_ENVOYE}, F.RIEN),
    (O.INGESTION_INGERE, {"statut": O.PLAN_FIGE}, F.SAISIR_RESULTAT),
    (O.INGESTION_INGERE, {"statut": O.PLAN_FIGE, "resultat": {"abandon": True}}, F.RIEN),
    (O.INGESTION_INGERE, {"statut": O.PLAN_FIGE, "resultat": {"officiel_h": 33.6}}, F.RIEN),
])
def test_le_verbe_suivant_est_le_prochain_geste(ingestion, plan, attendu):
    assert F.verbe_suivant(_athlete(ingestion), plan) == attendu


def test_les_compteurs_partitionnent():
    """Chaque dossier est dans une case, et une seule : un nombre qui monte quelque part
    est un nombre qui descend ailleurs."""
    dossiers = [{"suivant": v} for v in
                (F.INGERER, F.COMPOSER, F.PUBLIER, F.ENVOYER, F.SAISIR_RESULTAT, F.RIEN)]
    compteurs = F.compter(dossiers)
    assert sum(compteurs.values()) == len(dossiers)
    assert compteurs["a_publier_ou_envoyer"] == 2   # publier et envoyer partagent leur case
    assert set(compteurs) == set(F.COMPTEURS)


def test_tout_verbe_a_sa_case():
    assert set(F.CASES) == {F.INGERER, F.COMPOSER, F.PUBLIER, F.ENVOYER,
                            F.SAISIR_RESULTAT, F.RIEN}
    assert set(F.CASES.values()) == set(F.COMPTEURS)


def test_la_course_la_plus_proche_est_en_tete():
    athletes = [
        O.Athlete(id="a1", pseudo="Ana", plans=["LL-A"]).to_dict(),
        O.Athlete(id="a2", pseudo="Bo", plans=["LL-B"]).to_dict(),
        O.Athlete(id="a3", pseudo="Cy").to_dict(),          # pas encore de course
    ]
    plans = {"LL-A": {"id": "LL-A", "ref": "LL-A", "course_id": "c2"},
             "LL-B": {"id": "LL-B", "ref": "LL-B", "course_id": "c1"}}
    courses = {"c1": {"id": "c1", "nom": "Tôt", "depart_le": "2026-04-01T06:00:00+02:00"},
               "c2": {"id": "c2", "nom": "Tard", "depart_le": "2026-09-25T13:00:00+02:00"}}
    vue = F.construire(athletes=athletes, plans=plans, courses=courses)
    assert [d["prenom"] for d in vue["dossiers"]] == ["Bo", "Ana", "Cy"]
    assert sum(vue["compteurs"].values()) == 3


def test_la_file_vide_ne_ment_pas(client):
    vue = client.get("/tableau-de-bord/file",
                     headers={"Authorization": f"Bearer {JETON}"}).json()
    assert vue["dossiers"] == [] and vue["demandes"] == []
    assert sum(vue["compteurs"].values()) == 0
