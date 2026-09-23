"""Le socle du tableau de bord : la référence, les objets, le magasin, la file.

Ce que ces tests gardent, ce sont des PROMESSES écrites dans le récapitulatif
(`docs/twin-tableau-de-bord-api.md`) : des noms de champs qu'on ne peut plus changer
sans migrer le volume, une référence qui ne bouge pas d'une génération à l'autre, et
un fichier qui reste la vérité même après un arrêt brutal.
"""

from __future__ import annotations

import json
import re

import pytest

from twin_engine.jobs import JobStore
from twin_engine.tableau_de_bord import objets as O
from twin_engine.tableau_de_bord.magasin import Collection, Magasin
from twin_engine.tableau_de_bord.reference import empreinte, reference_de_plan

# Le filtre que l'API applique à une référence avant d'en faire un chemin (api/app.py).
_REF_OK = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")

_VAL = dict(athlete_id="ath-1", pseudo="Val", course_id="crs-1",
            course_nom="Nice Côte d'Azur by UTMB · 100M", edition=2026)


# --------------------------------------------------------------------------- #
# La référence (§2.2 du chantier, §3.3 du récapitulatif)
# --------------------------------------------------------------------------- #
def test_la_reference_est_stable_dune_generation_a_lautre():
    """L'exigence du §2.2 : regénérer ne déplace pas le plan."""
    refs = {reference_de_plan(**_VAL) for _ in range(5)}
    assert refs == {"LL-NICE26-VAL-" + empreinte("ath-1", "crs-1")}


def test_la_reference_se_lit():
    assert reference_de_plan(**_VAL).startswith("LL-NICE26-VAL-")


def test_la_reference_ne_depend_daucun_job():
    """Elle ne connaît que l'athlète, la course et l'édition — rien du passage.

    Une grep sur le source dirait n'importe quoi (les commentaires parlent des jobs) :
    ce qui fait foi, c'est ce que la fonction accepte."""
    import inspect

    assert set(inspect.signature(reference_de_plan).parameters) == {
        "athlete_id", "pseudo", "course_id", "course_nom", "edition"}


def test_deux_pseudos_identiques_ne_se_marchent_pas_dessus():
    a = reference_de_plan(**{**_VAL, "athlete_id": "ath-1"})
    b = reference_de_plan(**{**_VAL, "athlete_id": "ath-2"})
    assert a != b and a.rsplit("-", 1)[0] == b.rsplit("-", 1)[0]


def test_changer_dedition_change_la_reference():
    assert reference_de_plan(**_VAL) != reference_de_plan(**{**_VAL, "edition": 2027})


@pytest.mark.parametrize("nom,pseudo", [
    ("Nice Côte d'Azur by UTMB · 100M", "Val"),
    ("", ""),
    ("Écrins — Grande Traversée", "Rémi"),
    ("100 Miles", "J-P"),
])
def test_la_reference_est_toujours_un_chemin_sur(nom, pseudo):
    """Elle sert à composer un chemin sur le volume : accents et ponctuation dehors."""
    ref = reference_de_plan(athlete_id="a", pseudo=pseudo, course_id="c",
                            course_nom=nom, edition=2026)
    assert _REF_OK.fullmatch(ref), ref


# --------------------------------------------------------------------------- #
# Les objets (§3) — les noms de champs sont un contrat, pas un goût
# --------------------------------------------------------------------------- #
def test_athlete_porte_les_champs_du_recapitulatif():
    d = O.Athlete(id="a1").to_dict()
    assert set(d) == {"id", "pseudo", "email", "prenom", "montre", "consent_at",
                      "depot_id", "archive", "ingestion", "jumeau", "niveau", "plans"}
    assert set(d["archive"]) == {"nom", "taille", "sha256", "recue_le"}
    assert set(d["ingestion"]) == {"statut", "le", "erreur"}
    assert set(d["jumeau"]) == {"vc_kmh", "E", "durabilite_pct", "n_vrais_ultras",
                                "n_avec_fc", "donnees_jusquau", "plus_long_h",
                                "plus_gros_dplus_m"}
    assert set(d["niveau"]) == {"nom", "raisons"}


def test_course_porte_les_champs_du_recapitulatif():
    d = O.Course(id="c1").to_dict()
    assert set(d) == {"id", "slug", "nom", "edition", "depart_le", "lat", "lon", "gpx",
                      "geometrie", "officiel", "seuil_ecart_pct", "ravitaillements",
                      "technicite_pct", "chaleur_c", "phases", "soleil", "statut"}
    assert set(O.Ravitaillement().__dict__) == {"index", "nom", "km", "base_majeure",
                                                "assistance", "arret_min"}
    assert set(d["geometrie"]) == {"distance_km", "dplus_m", "dminus_m", "alt_max", "alt_min"}
    assert set(d["officiel"]) == {"dplus_m", "distance_km", "dminus_m"}


def test_plan_porte_les_champs_du_recapitulatif():
    d = O.Plan(ref="LL-X").to_dict()
    assert set(d) == {"id", "ref", "athlete_id", "course_id", "version",
                      "version_publiee", "depart_le", "statut",
                      "reglages", "amendements", "prediction", "documents",
                      "publie_le", "envoye_le", "cles", "resultat"}
    assert set(d["reglages"]) == {"mode", "cible_h", "tolerance_pct", "politique_arrets", "assistance",
                                  "nutrition", "consignes"}
    assert set(d["prediction"]) == {"central_h", "fourchette", "bornes", "arrivee_le",
                                    "niveau"}
    assert set(d["cles"]) == {"partage", "prive"}
    assert set(d["resultat"]) == {"officiel_h", "abandon", "saisi_par"}
    # la référence EST l'identité : le magasin range le plan sous elle
    assert d["id"] == d["ref"] == "LL-X"


def test_demande_porte_les_champs_du_recapitulatif():
    assert set(O.Demande(id="d1").to_dict()) == {"id", "plan_ref", "quoi", "pourquoi",
                                                 "recue_le", "statut", "reponse",
                                                 "repondue_le"}


def test_un_objet_se_relit_tel_quil_a_ete_ecrit():
    """Aller-retour JSON sans perte : c'est ce que le volume fait à chaque démarrage."""
    a = O.Athlete(id="a1", pseudo="Val", email="val@example.test",
                  archive=O.Archive(nom="garmin.zip", taille=12, sha256="ab"),
                  niveau=O.Niveau(nom=O.NIVEAU_CALIBRE, raisons=["4 vrais ultras"]),
                  plans=["LL-NICE26-VAL-0000"])
    assert O.Athlete.from_dict(json.loads(json.dumps(a.to_dict()))).to_dict() == a.to_dict()


def test_un_champ_inconnu_ne_fait_pas_tomber_la_relecture():
    """Un fichier écrit par une version d'avant se relit ; ce qu'il porte en trop tombe."""
    a = O.Athlete.from_dict({"id": "a1", "pseudo": "Val", "lubie": 1,
                             "niveau": {"nom": "calibre", "vieux_champ": 2}})
    assert a.pseudo == "Val" and a.niveau.nom == "calibre"


# --------------------------------------------------------------------------- #
# Le niveau servi (§3.1) — 🟢 et 🟠 calibrent, 🔴 non
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("verdict,attendu", [
    ("🟢", O.NIVEAU_CALIBRE), ("🟠", O.NIVEAU_CALIBRE),
    ("🔴", O.NIVEAU_BASE), (None, O.NIVEAU_BASE), ("", O.NIVEAU_BASE),
])
def test_le_verdict_se_dit_en_deux_mots(verdict, attendu):
    assert O.niveau_du_verdict(verdict) == attendu


# --------------------------------------------------------------------------- #
# Le magasin (§3.5) — le fichier est la vérité
# --------------------------------------------------------------------------- #
def test_le_fichier_est_la_verite(tmp_path):
    c = Collection(tmp_path / "athletes", fichier="athlete.json")
    c.ecrire(O.Athlete(id="a1", pseudo="Val").to_dict())
    assert json.loads((tmp_path / "athletes" / "a1" / "athlete.json").read_text())["pseudo"] == "Val"
    # un magasin neuf, sans rien en mémoire, retrouve tout sur le volume
    assert Collection(tmp_path / "athletes", fichier="athlete.json").lire("a1")["pseudo"] == "Val"


def test_lindex_ne_rend_jamais_lobjet_quil_garde(tmp_path):
    """Modifier ce qu'on a lu ne modifie pas le magasin — sinon deux requêtes se
    marcheraient dessus sans passer par le disque."""
    c = Collection(tmp_path / "x")
    c.ecrire({"id": "1", "n": [1]})
    lu = c.lire("1")
    lu["n"].append(2)
    assert c.lire("1")["n"] == [1]


def test_une_ecriture_ne_laisse_pas_de_fichier_a_moitie_ecrit(tmp_path):
    c = Collection(tmp_path / "x")
    for i in range(3):
        c.ecrire({"id": "1", "i": i})
    assert [p.name for p in (tmp_path / "x").iterdir()] == ["1.json"]


def test_un_json_illisible_ne_fait_pas_tomber_le_demarrage(tmp_path):
    (tmp_path / "x").mkdir()
    (tmp_path / "x" / "bon.json").write_text('{"id": "bon"}')
    (tmp_path / "x" / "casse.json").write_text("{ pas du json")
    c = Collection(tmp_path / "x")
    assert [o["id"] for o in c.lister()] == ["bon"]


def test_supprimer_emporte_les_fichiers_compagnons(tmp_path):
    c = Collection(tmp_path / "athletes", fichier="athlete.json")
    c.ecrire(O.Athlete(id="a1").to_dict())
    (c.repertoire("a1") / "jumeau.json").write_text("{}")
    assert c.supprimer("a1") is True
    assert not (tmp_path / "athletes" / "a1").exists() and c.lire("a1") is None


def test_le_magasin_ouvre_les_cinq_collections(tmp_path):
    m = Magasin(tmp_path)
    assert all(len(c) == 0 for c in
               (m.athletes, m.courses, m.plans, m.demandes, m.jobs))


# --------------------------------------------------------------------------- #
# La file de travail (§3.4, §5.7)
# --------------------------------------------------------------------------- #
def test_un_job_nait_en_file(tmp_path):
    s = JobStore(tmp_path)
    job = s.creer("j1", type=O.JOB_INGESTION, athlete_id="a1")
    assert job["statut"] == O.JOB_EN_FILE and job["type"] == O.JOB_INGESTION
    assert s.public("j1")["athlete_id"] == "a1"


def test_lavancement_se_pousse_pendant_que_ca_tourne(tmp_path):
    s = JobStore(tmp_path)
    s.creer("j1")
    s.avancer("j1", "lecture de l'archive")
    assert s.public("j1")["avancement"] == "lecture de l'archive"


def test_un_champ_hors_contrat_est_refuse(tmp_path):
    s = JobStore(tmp_path)
    s.creer("j1")
    with pytest.raises(ValueError):
        s.modifier("j1", nimporte_quoi=1)


def test_la_vue_publique_ne_porte_aucun_chemin_serveur(tmp_path):
    """`/twin/jobs/*` est routé vers l'internet : ce qui sort d'ici est vu du dehors."""
    s = JobStore(tmp_path)
    s.creer("j1")
    s.modifier("j1", statut=O.JOB_FINI, pdf="/data/jobs/j1/report.pdf",
               resultat={"report_ref": "LL-X", "pdf": "/data/jobs/j1/report.pdf",
                         "figures": {"profil": "/data/jobs/j1/figures/profil.pdf"},
                         "livrables": {"plan.gpx": "/data/jobs/j1/plan.gpx"},
                         "verdict": "🟢"})
    vu = s.public("j1")
    assert "pdf" not in vu
    assert set(vu["resultat"]) == {"report_ref", "verdict"}
    assert "/data" not in json.dumps(vu)


def test_le_balayage_clot_ce_quun_crash_a_laisse_en_plan(tmp_path):
    s = JobStore(tmp_path)
    s.creer("en_file")
    s.creer("en_cours")
    s.modifier("en_cours", statut=O.JOB_EN_COURS)
    s.creer("fini")
    s.modifier("fini", statut=O.JOB_FINI)

    assert sorted(s.balayer_interrompus("redémarrage")) == ["en_cours", "en_file"]
    assert s.lire("en_cours")["statut"] == O.JOB_ECHEC
    assert s.lire("fini")["statut"] == O.JOB_FINI


def test_un_job_dune_session_precedente_se_relit(tmp_path):
    """Le service redémarre : la file se reconstruit depuis le volume, pas depuis rien."""
    JobStore(tmp_path).creer("j1", plan_ref="LL-X")
    assert JobStore(tmp_path).public("j1")["plan_ref"] == "LL-X"
