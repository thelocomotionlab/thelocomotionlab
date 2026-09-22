"""Course ↔ RaceSpec : l'aller-retour ne doit rien perdre.

Le banc d'essai est `examples/nice-100m.json`, la course de référence — la vraie, celle
du cas Valentin. Si la traduction perd un champ, tout ce que le tableau de bord raconte
ensuite est faux, et le rapport sort avec un ravitaillement en moins sans que personne
le voie.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from twin_engine.course import RaceSpec
from twin_engine.tableau_de_bord import objets as O
from twin_engine.tableau_de_bord.traduction import (
    course_vers_racespec,
    racespec_vers_course,
)

EXEMPLES = Path(__file__).parents[1] / "examples"

# Les champs de RaceSpec qui appartiennent à la COURSE : la traduction doit les rendre
# à l'identique.
CHAMPS_DE_COURSE = (
    "name", "aid_km", "aid_names", "start_time", "lat", "lon", "tz_offset_h",
    "major_base_indices", "phases", "official_dplus_m", "technicity_pct", "heat_c",
)

# Ceux qui appartiennent à UN ATHLÈTE : ils arrivent par le Plan, au moment de la
# génération, et la Course n'a aucune raison de les connaître.
CHAMPS_DU_PLAN = ("nutrition", "target_hours", "reglages", "crew")

# L'ancienne façon de dire l'assistance, remplacée par `crew` qui prime (cf. spec.py).
CHAMPS_ABANDONNES = ("crew_access_indices",)


@pytest.fixture(scope="module")
def nice() -> RaceSpec:
    return RaceSpec.from_dict(json.loads((EXEMPLES / "nice-100m.json").read_text("utf-8")))


def _aller_retour(spec: RaceSpec) -> RaceSpec:
    return course_vers_racespec(racespec_vers_course(spec, id="c1", slug="test"))


# --------------------------------------------------------------------------- #
# Le test que le chantier exige (§3) : Nice, champ par champ
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("champ", CHAMPS_DE_COURSE)
def test_nice_survit_a_laller_retour(nice, champ):
    assert getattr(_aller_retour(nice), champ) == getattr(nice, champ)


def test_aucun_champ_de_racespec_nest_oublie():
    """La garde de la garde.

    Le test ci-dessus ne vérifie que les champs qu'on a pensé à lister : un champ ajouté
    à RaceSpec demain passerait à travers, perdu en silence à chaque aller-retour. Ici,
    tout champ de RaceSpec doit être rangé quelque part — à la course, à l'athlète, ou
    explicitement abandonné. Ajouter un champ oblige à trancher."""
    from dataclasses import fields

    tous = {f.name for f in fields(RaceSpec)}
    classes = set(CHAMPS_DE_COURSE) | set(CHAMPS_DU_PLAN) | set(CHAMPS_ABANDONNES)
    assert tous - classes == set(), (
        f"champ(s) de RaceSpec non classé(s) : {sorted(tous - classes)} — "
        "à ranger dans CHAMPS_DE_COURSE, CHAMPS_DU_PLAN ou CHAMPS_ABANDONNES"
    )
    assert classes - tous == set(), f"champ(s) fantôme(s) : {sorted(classes - tous)}"


def test_les_ravitaillements_de_nice_sont_tous_la(nice):
    course = racespec_vers_course(nice, id="c1")
    assert len(course.ravitaillements) == len(nice.aid_km) == 17
    assert course.ravitaillements[0].nom == "Auron (départ)"
    assert course.ravitaillements[0].km == 0.0
    assert course.ravitaillements[-1].km == nice.aid_km[-1]


def test_lassistance_de_nice_retrouve_ses_sept_points(nice):
    course = racespec_vers_course(nice, id="c1")
    assert [r.index for r in course.ravitaillements if r.assistance] == \
           list(nice.crew_aid_indices)
    assert len(nice.crew) == 7


def test_les_bases_majeures_de_nice_sont_les_bonnes(nice):
    course = racespec_vers_course(nice, id="c1")
    assert [r.index for r in course.ravitaillements if r.base_majeure] == [3, 7, 10]


def test_ledition_se_deduit_de_lannee_du_depart(nice):
    """Une spec n'a pas de champ « édition », et la référence d'un plan en dépend."""
    assert racespec_vers_course(nice, id="c1").edition == 2026


def test_le_dplus_officiel_de_nice_est_conserve(nice):
    assert racespec_vers_course(nice, id="c1").officiel.dplus_m == 8900


# --------------------------------------------------------------------------- #
# Ce que la Course ne porte pas, et ne doit pas porter
# --------------------------------------------------------------------------- #
def test_la_course_ne_porte_rien_dun_athlete(nice):
    """Nutrition, objectif et notes d'assistance appartiennent au Plan : une course est
    la même pour tous ceux qui la courent."""
    champs = set(racespec_vers_course(nice, id="c1").to_dict())
    assert not champs & {"nutrition", "cible_h", "target_hours", "objectif"}

    rendu = course_vers_racespec(racespec_vers_course(nice, id="c1"))
    assert rendu.nutrition.declared is False, "les débits sont déclarés par l'athlète"
    assert rendu.target_hours is None, "l'objectif est un réglage de plan"
    assert all(c.note == "" for c in rendu.crew), "les notes d'assistance sont du plan"


# --------------------------------------------------------------------------- #
# Les phases — le point où « sans perte » se joue
# --------------------------------------------------------------------------- #
def _course_avec_phases(phases):
    return O.Course(
        id="c1", nom="Test", edition=2026,
        depart_le="2026-09-25T13:00:00+02:00",
        ravitaillements=[
            O.Ravitaillement(index=0, nom="Départ", km=0.0),
            O.Ravitaillement(index=1, nom="Col", km=38.9),
            O.Ravitaillement(index=2, nom="Base", km=95.1),
            O.Ravitaillement(index=3, nom="Arrivée", km=169.7),
        ],
        phases=phases,
    )


def test_une_phase_posee_sur_un_ravitaillement_traverse_sans_bouger():
    course = _course_avec_phases([
        O.PhaseCourse(nom="Retenue", du_km=0.0, au_km=95.1, note="ne pas partir vite"),
        O.PhaseCourse(nom="Exécution", du_km=95.1, au_km=169.7),
    ])
    spec = course_vers_racespec(course)
    assert [(p.name, p.from_aid_index, p.note) for p in spec.phases] == [
        ("Retenue", 0, "ne pas partir vite"),
        ("Exécution", 2, ""),
    ]
    # et le retour retrouve les mêmes bornes, note comprise
    retour = racespec_vers_course(spec, id="c1")
    assert [(p.nom, p.du_km, p.au_km, p.note) for p in retour.phases] == [
        ("Retenue", 0.0, 95.1, "ne pas partir vite"),
        ("Exécution", 95.1, 169.7, ""),
    ]


def test_une_phase_entre_deux_ravitaillements_est_refusee_au_lieu_detre_arrondie():
    """C'est le cœur de la décision : le rapport découpe par segments, donc une borne
    à 47,3 km n'est pas représentable. L'arrondir en silence ferait glisser la phase ;
    on refuse, et l'éditeur aimante les bandes pour que ça n'arrive jamais."""
    with pytest.raises(ValueError, match="aucun ravitaillement"):
        course_vers_racespec(_course_avec_phases([O.PhaseCourse(nom="X", du_km=47.3)]))


def test_un_km_qui_tombe_juste_au_flottant_pres_passe():
    """Un JSON relu ne rend pas toujours le même flottant au bit près."""
    course = _course_avec_phases([O.PhaseCourse(nom="X", du_km=38.900_000_000_1)])
    assert course_vers_racespec(course).phases[0].from_aid_index == 1


def test_sans_phases_le_moteur_garde_sa_coupure_a_lui(nice):
    """Vide, le moteur coupe en deux à la moitié du temps prévu. On ne lui impose rien."""
    assert course_vers_racespec(racespec_vers_course(nice, id="c1")).phases == ()


# --------------------------------------------------------------------------- #
# Les champs qui ont demandé une décision
# --------------------------------------------------------------------------- #
def test_la_chaleur_est_en_degres_et_le_reste():
    """Le récapitulatif écrit « chaleur_pct » ; le moteur attend des °C, et son format
    ne bouge pas. Le champ porte l'unité qu'il transporte."""
    course = _course_avec_phases([])
    course.chaleur_c = 28.0
    course.technicite_pct = 12.0
    spec = course_vers_racespec(course)
    assert spec.heat_c == 28.0 and spec.technicity_pct == 12.0
    retour = racespec_vers_course(spec, id="c1")
    assert retour.chaleur_c == 28.0 and retour.technicite_pct == 12.0


def test_une_chaleur_non_declaree_reste_non_declaree():
    """Sans température, le moteur n'applique aucun coût de chaleur. Mettre 0 °C
    voudrait dire « il gèlera », ce qui est une tout autre affirmation."""
    assert course_vers_racespec(_course_avec_phases([])).heat_c is None


def test_le_fuseau_vient_de_lhorodatage_lui_meme():
    course = _course_avec_phases([])
    course.depart_le = "2026-10-22T22:00:00+04:00"
    assert course_vers_racespec(course).tz_offset_h == 4.0
    course.depart_le = "2026-01-15T06:30:00-05:00"
    assert course_vers_racespec(course).tz_offset_h == -5.0


def test_les_ravitaillements_sont_remis_dans_lordre():
    """L'éditeur pose un ravitaillement au clic, donc pas forcément dans l'ordre ;
    RaceSpec, lui, exige des kilomètres croissants."""
    course = O.Course(
        id="c1", nom="Test",
        ravitaillements=[
            O.Ravitaillement(index=0, nom="Arrivée", km=42.0),
            O.Ravitaillement(index=1, nom="Départ", km=0.0),
            O.Ravitaillement(index=2, nom="Milieu", km=21.0, assistance=True),
        ],
    )
    spec = course_vers_racespec(course)
    assert spec.aid_km == (0.0, 21.0, 42.0)
    assert spec.aid_names == ("Départ", "Milieu", "Arrivée")
    assert spec.crew_aid_indices == (1,), "l'assistance suit son ravitaillement, pas son rang"


def test_un_arret_impose_devient_un_reglage():
    course = O.Course(
        id="c1", nom="Test",
        ravitaillements=[
            O.Ravitaillement(index=0, nom="Départ", km=0.0),
            O.Ravitaillement(index=1, nom="Base", km=50.0, arret_min=20.0),
            O.Ravitaillement(index=2, nom="Arrivée", km=100.0),
        ],
    )
    spec = course_vers_racespec(course)
    assert [(r.aid_index, r.stop_min) for r in spec.reglages] == [(1, 20.0)]
    assert [r.arret_min for r in racespec_vers_course(spec, id="c1").ravitaillements] == \
           [None, 20.0, None]


def test_une_course_vide_ne_fait_pas_tomber_la_traduction():
    """L'éditeur crée la course AVANT la trace : identité seule, aucun ravitaillement."""
    spec = course_vers_racespec(O.Course(id="c1", nom="Nouvelle", edition=2027))
    assert spec.name == "Nouvelle" and spec.aid_km == () and spec.has_aid_stations is False
