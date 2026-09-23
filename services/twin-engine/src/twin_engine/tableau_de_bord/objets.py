"""Les trois objets du tableau de bord et les deux objets de service.

Les noms de champs sont ceux du récapitulatif (``docs/twin-tableau-de-bord-api.md`` §3)
et ne se choisissent pas ici : ils sont écrits tels quels dans les fichiers JSON du
volume, donc les renommer serait une migration. Le test ``test_objets`` les vérifie un
par un.

Les objets sont MUTABLES : un athlète change de statut d'ingestion, un plan gagne des
versions. Ils se sérialisent en dictionnaires plats de types JSON — pas de date Python,
pas de tuple : ce qui sort d'ici s'écrit tel quel et se relit sans décodeur.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields, is_dataclass
from datetime import datetime, timezone
from typing import Any

# -- vocabulaire ------------------------------------------------------------- #
# Les états d'une ingestion, dans l'ordre où ils arrivent (§3.1).
INGESTION_RECU = "recu"
INGESTION_EN_COURS = "en_cours"
INGESTION_INGERE = "ingere"
INGESTION_ILLISIBLE = "illisible"

# Les deux niveaux servis (§3.1, §6 du chantier). Le moteur rend un verdict 🟢/🟠/🔴 ;
# 🔴 seul dit que l'archive ne porte pas de quoi calibrer.
NIVEAU_BASE = "base"
NIVEAU_CALIBRE = "calibre"
_VERDICTS_CALIBRES = ("🟢", "🟠")

# Les états d'un plan (§3.3).
PLAN_A_COMPOSER = "a_composer"
PLAN_GENERE = "genere"
PLAN_PUBLIE = "publie"
PLAN_ENVOYE = "envoye"
PLAN_FIGE = "fige"
PLAN_RESULTAT = "resultat"

# Les types et les états d'un job (§3.4).
JOB_INGESTION = "ingestion"
JOB_GENERATION = "generation"
JOB_AMENDEMENT = "amendement"
JOB_EN_FILE = "en_file"
JOB_EN_COURS = "en_cours"
JOB_FINI = "fini"
JOB_ECHEC = "echec"

COURSE_BROUILLON = "brouillon"
COURSE_PUBLIEE = "publiee"

DEMANDE_OUVERTE = "ouverte"
DEMANDE_REPONDUE = "repondue"


def maintenant() -> str:
    """L'horodatage des objets : ISO 8601 en UTC, comparable comme une chaîne."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def niveau_du_verdict(verdict: str | None) -> str:
    """Le verdict du moteur, dit dans les deux mots du tableau de bord.

    🟢 et 🟠 donnent un plan calibré — l'orange porte des réserves, pas une
    incapacité, et elles sont affichées à côté. 🔴 dit que l'archive ne porte pas
    de quoi calibrer : c'est le plan de base."""
    return NIVEAU_CALIBRE if verdict in _VERDICTS_CALIBRES else NIVEAU_BASE


# -- sérialisation ----------------------------------------------------------- #
def _en_json(valeur: Any) -> Any:
    if is_dataclass(valeur) and not isinstance(valeur, type):
        return {k: _en_json(v) for k, v in asdict(valeur).items()}
    if isinstance(valeur, dict):
        return {k: _en_json(v) for k, v in valeur.items()}
    if isinstance(valeur, (list, tuple)):
        return [_en_json(v) for v in valeur]
    return valeur


def _depuis(cls: type, brut: Any):
    """Construit une dataclass en ignorant les clés qu'elle ne connaît pas.

    Un fichier écrit par une version antérieure se relit donc sans exploser ; ce qu'il
    porte en trop est perdu à la première réécriture, ce qui est le comportement voulu."""
    if not isinstance(brut, dict):
        return cls()
    connus = {f.name for f in fields(cls)}
    return cls(**{k: v for k, v in brut.items() if k in connus})


# --------------------------------------------------------------------------- #
# 3.1 Athlète
# --------------------------------------------------------------------------- #
@dataclass
class Archive:
    """Ce qu'on sait de l'archive déposée. L'archive elle-même n'est pas dans l'objet :
    elle vit dans le service de dépôt le temps de l'ingestion, puis chez Valentin."""

    nom: str = ""
    taille: int = 0
    sha256: str = ""
    recue_le: str = ""


@dataclass
class Ingestion:
    statut: str = INGESTION_RECU
    le: str = ""
    erreur: str = ""


@dataclass
class Jumeau:
    """Les chiffres du jumeau, tels que l'écran Athlète les montre. Vide tant que
    l'archive n'est pas ingérée — aucune valeur n'est devinée."""

    vc_kmh: float | None = None
    E: float | None = None
    durabilite_pct: float | None = None
    n_vrais_ultras: int | None = None
    n_avec_fc: int | None = None
    donnees_jusquau: str = ""
    plus_long_h: float | None = None
    plus_gros_dplus_m: float | None = None


@dataclass
class Niveau:
    nom: str = NIVEAU_BASE
    raisons: list[str] = field(default_factory=list)


@dataclass
class Athlete:
    """Ce qu'une personne est pour le laboratoire, indépendamment de toute course."""

    id: str
    pseudo: str = ""
    email: str = ""
    prenom: str = ""
    montre: str = ""
    consent_at: str = ""
    # Le dépôt d'où vient l'archive : sans lui le moteur ne sait pas quoi télécharger
    # sur twin-depot au moment d'ingérer. Le §3.1 ne le liste pas ; la planche Athlète
    # de la maquette montre bien une ligne « Dépôt ».
    depot_id: str = ""
    archive: Archive = field(default_factory=Archive)
    ingestion: Ingestion = field(default_factory=Ingestion)
    jumeau: Jumeau = field(default_factory=Jumeau)
    niveau: Niveau = field(default_factory=Niveau)
    plans: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return _en_json(self)

    @classmethod
    def from_dict(cls, brut: dict) -> "Athlete":
        return cls(
            id=str(brut["id"]),
            pseudo=str(brut.get("pseudo") or ""),
            email=str(brut.get("email") or ""),
            prenom=str(brut.get("prenom") or ""),
            montre=str(brut.get("montre") or ""),
            consent_at=str(brut.get("consent_at") or ""),
            depot_id=str(brut.get("depot_id") or ""),
            archive=_depuis(Archive, brut.get("archive")),
            ingestion=_depuis(Ingestion, brut.get("ingestion")),
            jumeau=_depuis(Jumeau, brut.get("jumeau")),
            niveau=_depuis(Niveau, brut.get("niveau")),
            plans=list(brut.get("plans") or ()),
        )


# --------------------------------------------------------------------------- #
# 3.2 Course
# --------------------------------------------------------------------------- #
@dataclass
class Gpx:
    nom: str = ""
    points: int = 0
    avec_altitude: bool = False


@dataclass
class Geometrie:
    """Calculée par le moteur à partir de la trace — jamais saisie."""

    distance_km: float | None = None
    dplus_m: float | None = None
    dminus_m: float | None = None
    alt_max: float | None = None
    alt_min: float | None = None


@dataclass
class Officiel:
    """Les chiffres du carnet de route de l'organisateur. Saisis, jamais inventés :
    un champ vide reste vide, et l'écart ne se calcule que sur ce qui est renseigné."""

    dplus_m: float | None = None
    distance_km: float | None = None
    dminus_m: float | None = None


@dataclass
class Ravitaillement:
    index: int = 0
    nom: str = ""
    km: float = 0.0
    base_majeure: bool = False
    assistance: bool = False
    arret_min: float | None = None


@dataclass
class PhaseCourse:
    """Une partie de la course dans la langue de l'athlète.

    ``du_km`` et ``au_km`` tombent TOUJOURS sur un ravitaillement : le rapport découpe
    les phases par segments (``report/feuille.py``), et un segment va d'un ravitaillement
    au suivant. Une phase qui commencerait entre les deux ne serait pas mal rendue, elle
    serait irreprésentable — l'éditeur aimante donc les bandes aux ravitaillements, et
    la traduction vers le moteur n'a plus rien à arrondir.

    ``note`` est le mot pour l'athlète sur cette partie. Le §3.2 ne le liste pas ; sans
    lui, importer une spec qui en porte un le perdrait (``RaceSpec.Phase.note``).
    """

    nom: str = ""
    du_km: float = 0.0
    au_km: float = 0.0
    note: str = ""


@dataclass
class Soleil:
    coucher: str = ""
    lever: str = ""


@dataclass
class Course:
    """Le carnet de route d'une épreuve, dans une édition donnée. Construit une fois,
    partagé par tous ses athlètes. Se traduit en ``RaceSpec`` pour le moteur."""

    id: str
    slug: str = ""
    nom: str = ""
    edition: int | None = None
    depart_le: str = ""
    lat: float | None = None
    lon: float | None = None
    gpx: Gpx = field(default_factory=Gpx)
    geometrie: Geometrie = field(default_factory=Geometrie)
    officiel: Officiel = field(default_factory=Officiel)
    seuil_ecart_pct: float = 5.0
    ravitaillements: list[Ravitaillement] = field(default_factory=list)
    technicite_pct: float = 0.0
    # Le récapitulatif écrit « chaleur_pct » ; le moteur attend des DEGRÉS
    # (``RaceSpec.heat_c``), et son format ne bouge pas. Un pourcentage ne se
    # convertit pas en °C : le champ porte donc l'unité qu'il transporte.
    chaleur_c: float | None = None
    phases: list[PhaseCourse] = field(default_factory=list)
    soleil: Soleil = field(default_factory=Soleil)
    statut: str = COURSE_BROUILLON

    def to_dict(self) -> dict:
        return _en_json(self)

    @classmethod
    def from_dict(cls, brut: dict) -> "Course":
        return cls(
            id=str(brut["id"]),
            slug=str(brut.get("slug") or ""),
            nom=str(brut.get("nom") or ""),
            edition=brut.get("edition"),
            depart_le=str(brut.get("depart_le") or ""),
            lat=brut.get("lat"),
            lon=brut.get("lon"),
            gpx=_depuis(Gpx, brut.get("gpx")),
            geometrie=_depuis(Geometrie, brut.get("geometrie")),
            officiel=_depuis(Officiel, brut.get("officiel")),
            seuil_ecart_pct=float(brut.get("seuil_ecart_pct", 5.0)),
            ravitaillements=[_depuis(Ravitaillement, r) for r in brut.get("ravitaillements") or ()],
            technicite_pct=float(brut.get("technicite_pct", 0.0)),
            chaleur_c=brut.get("chaleur_c"),
            phases=[_depuis(PhaseCourse, p) for p in brut.get("phases") or ()],
            soleil=_depuis(Soleil, brut.get("soleil")),
            statut=str(brut.get("statut") or COURSE_BROUILLON),
        )


# --------------------------------------------------------------------------- #
# 3.3 Plan
# --------------------------------------------------------------------------- #
@dataclass
class NutritionReglage:
    eau_l_h: float | None = None
    glucides_g_h: float | None = None


@dataclass
class AssistanceReglage:
    index: int = 0
    note: str = ""


@dataclass
class ConsigneReglage:
    """Ce que Valentin écrit sur une ligne du tableau de marche, colonne « Sur ce segment ».
    ``index`` est celui du ravitaillement qui ferme le segment (1 = la première ligne)."""

    index: int = 0
    texte: str = ""


@dataclass
class Reglages:
    """Ce que Valentin compose. Distinct des amendements, qui viennent de l'athlète."""

    mode: str = "prediction"          # prediction | objectif
    cible_h: float | None = None
    # Demi-largeur de la fenêtre de passage en mode objectif, en % du temps cumulé : 30 h à
    # 3,33 % titre les colonnes 29 h · 30 h · 31 h. Vide : celle de la config du moteur.
    tolerance_pct: float | None = None
    politique_arrets: str = ""
    assistance: list[AssistanceReglage] = field(default_factory=list)
    nutrition: NutritionReglage = field(default_factory=NutritionReglage)
    # Une ligne sans texte ici garde celui que le moteur y pose (nuit, montée, …).
    consignes: list[ConsigneReglage] = field(default_factory=list)


@dataclass
class Amendements:
    """Ce que l'athlète change depuis sa page. Les clés d'``arrets`` et de ``notes``
    sont des index de ravitaillement rendus en texte — JSON n'a pas de clé entière."""

    arrets: dict[str, float] = field(default_factory=dict)
    notes: dict[str, str] = field(default_factory=dict)
    nutrition: NutritionReglage = field(default_factory=NutritionReglage)


@dataclass
class Prediction:
    central_h: float | None = None
    fourchette: list[float] = field(default_factory=list)
    bornes: list[float] = field(default_factory=list)
    arrivee_le: str = ""
    niveau: str = NIVEAU_BASE


@dataclass
class Documents:
    """Chemins relatifs au répertoire de la version — jamais servis tels quels."""

    pdf: str = ""
    feuille_pdf: str = ""
    ics: str = ""
    gpx: str = ""


@dataclass
class Cles:
    partage: str = ""
    prive: str = ""


@dataclass
class Resultat:
    officiel_h: float | None = None
    abandon: bool = False
    saisi_par: str | None = None      # athlete | labo | None


@dataclass
class Plan:
    """Un athlète × une course × des réglages. C'est l'objet qui a des versions, des
    documents et une page."""

    ref: str
    athlete_id: str = ""
    course_id: str = ""
    version: int = 0
    # La version que la page de l'athlète sert. Le §3.3 ne la liste pas, et sans elle
    # « Publier » ne garderait rien : générer une v2 pour essayer un réglage la montrerait
    # aussitôt à l'athlète, avant que Valentin l'ait regardée. La page suit donc la
    # version PUBLIÉE ; le tableau de bord, la version courante.
    version_publiee: int = 0
    # Le départ que vise la version courante, recopié à chaque génération ou import. La
    # course en bibliothèque fait foi quand elle existe ; un plan importé du CLI n'en a pas
    # toujours, et sans départ il ne saurait jamais qu'il est figé.
    depart_le: str = ""
    statut: str = PLAN_A_COMPOSER
    reglages: Reglages = field(default_factory=Reglages)
    amendements: Amendements = field(default_factory=Amendements)
    prediction: Prediction = field(default_factory=Prediction)
    documents: Documents = field(default_factory=Documents)
    publie_le: str = ""
    envoye_le: str = ""
    cles: Cles = field(default_factory=Cles)
    resultat: Resultat = field(default_factory=Resultat)

    @property
    def id(self) -> str:
        """La référence EST l'identité du plan — le magasin range par ``id``."""
        return self.ref

    def to_dict(self) -> dict:
        # « id » double « ref » pour que le magasin range le plan sous sa référence
        # sans connaître la forme de l'objet.
        return {"id": self.ref, **_en_json(self)}

    @classmethod
    def from_dict(cls, brut: dict) -> "Plan":
        return cls(
            ref=str(brut.get("ref") or brut["id"]),
            athlete_id=str(brut.get("athlete_id") or ""),
            course_id=str(brut.get("course_id") or ""),
            version=int(brut.get("version") or 0),
            version_publiee=int(brut.get("version_publiee") or 0),
            depart_le=str(brut.get("depart_le") or ""),
            statut=str(brut.get("statut") or PLAN_A_COMPOSER),
            reglages=Reglages(
                mode=str((brut.get("reglages") or {}).get("mode") or "prediction"),
                cible_h=(brut.get("reglages") or {}).get("cible_h"),
                tolerance_pct=(brut.get("reglages") or {}).get("tolerance_pct"),
                politique_arrets=str((brut.get("reglages") or {}).get("politique_arrets") or ""),
                assistance=[
                    _depuis(AssistanceReglage, a)
                    for a in (brut.get("reglages") or {}).get("assistance") or ()
                ],
                nutrition=_depuis(
                    NutritionReglage, (brut.get("reglages") or {}).get("nutrition")
                ),
                consignes=[
                    _depuis(ConsigneReglage, c)
                    for c in (brut.get("reglages") or {}).get("consignes") or ()
                ],
            ),
            amendements=Amendements(
                arrets=dict((brut.get("amendements") or {}).get("arrets") or {}),
                notes=dict((brut.get("amendements") or {}).get("notes") or {}),
                nutrition=_depuis(
                    NutritionReglage, (brut.get("amendements") or {}).get("nutrition")
                ),
            ),
            prediction=_depuis(Prediction, brut.get("prediction")),
            documents=_depuis(Documents, brut.get("documents")),
            publie_le=str(brut.get("publie_le") or ""),
            envoye_le=str(brut.get("envoye_le") or ""),
            cles=_depuis(Cles, brut.get("cles")),
            resultat=_depuis(Resultat, brut.get("resultat")),
        )


# --------------------------------------------------------------------------- #
# 3.4 Les deux objets de service
# --------------------------------------------------------------------------- #
@dataclass
class Demande:
    """Ce qu'un athlète demande depuis sa page et qui atterrit dans la File."""

    id: str
    plan_ref: str = ""
    quoi: str = ""
    pourquoi: str = ""
    recue_le: str = field(default_factory=maintenant)
    statut: str = DEMANDE_OUVERTE
    # La réponse de Valentin, partie par email et gardée ici : la page de l'athlète la
    # remontre sous sa demande. Le §3.4 ne les liste pas.
    reponse: str = ""
    repondue_le: str = ""

    def to_dict(self) -> dict:
        return _en_json(self)

    @classmethod
    def from_dict(cls, brut: dict) -> "Demande":
        return _depuis(cls, {**brut, "id": str(brut["id"])})


__all__ = [
    "Amendements", "Archive", "AssistanceReglage", "Athlete", "Cles", "ConsigneReglage", "Course",
    "Demande", "Documents", "Geometrie", "Gpx", "Ingestion", "Jumeau", "Niveau",
    "NutritionReglage", "Officiel", "PhaseCourse", "Plan", "Prediction",
    "Ravitaillement", "Reglages", "Resultat", "Soleil",
    "COURSE_BROUILLON", "COURSE_PUBLIEE",
    "DEMANDE_OUVERTE", "DEMANDE_REPONDUE",
    "INGESTION_EN_COURS", "INGESTION_ILLISIBLE", "INGESTION_INGERE", "INGESTION_RECU",
    "JOB_AMENDEMENT", "JOB_ECHEC", "JOB_EN_COURS", "JOB_EN_FILE", "JOB_FINI",
    "JOB_GENERATION", "JOB_INGESTION",
    "NIVEAU_BASE", "NIVEAU_CALIBRE",
    "PLAN_A_COMPOSER", "PLAN_ENVOYE", "PLAN_FIGE", "PLAN_GENERE", "PLAN_PUBLIE",
    "PLAN_RESULTAT",
    "maintenant", "niveau_du_verdict",
]
