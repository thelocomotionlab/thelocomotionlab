"""Les routes de la page de l'athlète, derrière la clé de son lien (récapitulatif §5.8).

Chemins vus d'ici : ``/plans/{ref}…`` ; Caddy les sert sous ``/twin/plans/…``.

Toute route passe par :func:`routes.exige_cle` — une clé fausse, une référence inconnue
et un plan pas encore publié rendent la même 404. Ce que la clé ouvre ensuite dépend de
son usage : la clé de partage LIT, la clé privée lit, amende, demande et saisit.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from ..cles import USAGE_PARTAGE, USAGE_PRIVE
from .cycle import a_un_resultat, est_parti
from .magasin import Magasin
from .objets import (
    DEMANDE_OUVERTE,
    PLAN_RESULTAT,
    Amendements,
    Demande,
    Plan,
    maintenant,
)
from .page import vue_de_partage, vue_privee
from .routes_plans import (
    ARRET_MAX_MIN,
    NOTE_MAX,
    course_du_plan,
    documents_presents,
    lancer_un_amendement,
    liens_du_plan,
    lire_la_nutrition,
    lire_lannexe,
    lire_le_resultat,
    nombre_borne,
    repertoire_de_version,
    servir_un_fichier,
)

# Une page n'a pas à devenir une messagerie : au-delà, les demandes attendent une réponse.
DEMANDES_OUVERTES_MAX = 10
QUOI_MAX = 200
POURQUOI_MAX = 2000


def _plan_publie(request: Request, ref: str) -> Plan:
    """Le plan derrière une clé valide — et publié. Avant « Publier », la page n'existe
    pas : même 404 que pour une mauvaise clé."""
    brut = request.app.state.magasin.plans.lire(ref)
    plan = Plan.from_dict(brut) if brut else None
    if plan is None or not plan.version_publiee:
        raise HTTPException(status_code=404, detail="not_found")
    return plan


def _exige_la_cle_privee(usage: str) -> None:
    # Toujours 404 : répondre 403 dirait à qui tient la clé de partage que la privée existe
    # et qu'il n'en est pas loin.
    if usage != USAGE_PRIVE:
        raise HTTPException(status_code=404, detail="not_found")


def lire_les_amendements(brut, annexe: dict) -> Amendements:
    """Ce que l'athlète envoie, vérifié contre la version qu'il a sous les yeux.

    Un arrêt ne se pose que sur un ravitaillement de passage (ni le départ ni l'arrivée) ;
    une note, que sur un point où son assistance a accès."""
    if not isinstance(brut, dict):
        raise ValueError("amendements illisibles")
    n_ravitaillements = int((annexe.get("course") or {}).get("n_segments") or 0) + 1
    points = {int(c["aid_index"]) for c in (annexe.get("plan") or {}).get("crew") or ()}

    arrets: dict[str, float] = {}
    for cle, minutes in (brut.get("arrets") or {}).items():
        index = int(cle)
        if not 1 <= index <= n_ravitaillements - 2:
            raise ValueError(f"le ravitaillement {index} n'est pas un arrêt de passage")
        valeur = nombre_borne(minutes, nom=f"arrêt au ravitaillement {index}",
                              maxi=ARRET_MAX_MIN)
        if valeur is not None:
            arrets[str(index)] = valeur

    notes: dict[str, str] = {}
    for cle, texte in (brut.get("notes") or {}).items():
        index = int(cle)
        if index not in points:
            raise ValueError(f"le ravitaillement {index} n'est pas un point d'assistance")
        texte = str(texte or "").strip()[:NOTE_MAX]
        if texte:
            notes[str(index)] = texte

    return Amendements(arrets=arrets, notes=notes,
                       nutrition=lire_la_nutrition(brut.get("nutrition")))


def routeur_athlete() -> APIRouter:
    from .routes import exige_cle

    routeur = APIRouter(prefix="/plans")

    @routeur.get("/{ref}")
    def lire_ma_page(ref: str, request: Request) -> dict:
        """Le contenu de la page. Clé de partage : la partie partageable ; clé privée :
        tout, plus les amendements courants et le résultat (§5.8)."""
        usage = exige_cle(request, ref)
        magasin: Magasin = request.app.state.magasin
        plan = _plan_publie(request, ref)
        annexe = lire_lannexe(magasin, ref, plan.version_publiee)
        if annexe is None:
            raise HTTPException(status_code=404, detail="not_found")
        course = course_du_plan(magasin, plan)
        documents = documents_presents(repertoire_de_version(magasin, ref, plan.version_publiee))
        if usage == USAGE_PARTAGE:
            return vue_de_partage(plan.to_dict(), course, annexe, documents=documents)
        demandes = [d for d in magasin.demandes.lister() if d.get("plan_ref") == ref]
        return vue_privee(plan.to_dict(), course, annexe, documents=documents,
                          demandes=demandes,
                          lien_de_partage=liens_du_plan(request, ref).get(USAGE_PARTAGE, ""))

    @routeur.post("/{ref}/amend")
    def amender(ref: str, charge: dict, request: Request, fond: BackgroundTasks) -> dict:
        """Les documents se refont dans la version publiée. Fermé après le départ (§5.8)."""
        _exige_la_cle_privee(exige_cle(request, ref))
        magasin: Magasin = request.app.state.magasin
        plan = _plan_publie(request, ref)
        course = course_du_plan(magasin, plan)
        if est_parti(plan.to_dict(), course):
            raise HTTPException(status_code=409,
                                detail="la course est partie : le plan est figé")
        annexe = lire_lannexe(magasin, ref, plan.version_publiee) or {}
        try:
            plan.amendements = lire_les_amendements(charge, annexe)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        magasin.plans.modifier(ref, amendements=plan.to_dict()["amendements"])
        return {"job_id": lancer_un_amendement(request, fond, plan, plan.version_publiee)}

    @routeur.get("/{ref}/jobs/{job_id}")
    def suivre_mon_amendement(ref: str, job_id: str, request: Request) -> dict:
        """L'état de l'amendement en cours — et de lui seul : un job d'un autre plan n'est
        pas plus lisible ici qu'une autre page."""
        _exige_la_cle_privee(exige_cle(request, ref))
        job = request.app.state.store.lire(job_id)
        if job is None or job.get("plan_ref") != ref:
            raise HTTPException(status_code=404, detail="not_found")
        vu = request.app.state.store.rendre_public(job)
        return {k: vu.get(k) for k in ("id", "type", "statut", "avancement", "erreur", "maj_le")}

    @routeur.post("/{ref}/requests")
    def demander(ref: str, charge: dict, request: Request) -> dict:
        """Une demande qui entre dans la File de Valentin (§5.8)."""
        _exige_la_cle_privee(exige_cle(request, ref))
        magasin: Magasin = request.app.state.magasin
        _plan_publie(request, ref)
        quoi = str(charge.get("quoi") or "").strip()
        pourquoi = str(charge.get("pourquoi") or "").strip()
        if not quoi:
            raise HTTPException(status_code=422, detail="dis ce que tu demandes")
        ouvertes = [d for d in magasin.demandes.lister()
                    if d.get("plan_ref") == ref and d.get("statut") == DEMANDE_OUVERTE]
        if len(ouvertes) >= DEMANDES_OUVERTES_MAX:
            raise HTTPException(status_code=429,
                                detail="tes demandes précédentes attendent encore leur réponse")
        demande = Demande(id=uuid4().hex, plan_ref=ref, quoi=quoi[:QUOI_MAX],
                          pourquoi=pourquoi[:POURQUOI_MAX], recue_le=maintenant())
        magasin.demandes.ecrire(demande.to_dict())
        return demande.to_dict()

    @routeur.put("/{ref}/result")
    def saisir_mon_resultat(ref: str, charge: dict, request: Request) -> dict:
        """Facultatif : par défaut, c'est Valentin qui saisit depuis le classement officiel.
        Un résultat ne se saisit qu'une fois la course partie, et celui du labo fait foi."""
        _exige_la_cle_privee(exige_cle(request, ref))
        magasin: Magasin = request.app.state.magasin
        plan = _plan_publie(request, ref)
        if not est_parti(plan.to_dict(), course_du_plan(magasin, plan)):
            raise HTTPException(status_code=409, detail="la course n'est pas encore partie")
        if plan.resultat.saisi_par == "labo":
            raise HTTPException(status_code=409, detail="le résultat officiel est déjà saisi")
        try:
            plan.resultat = lire_le_resultat(charge, saisi_par="athlete")
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if a_un_resultat(plan.to_dict()):
            plan.statut = PLAN_RESULTAT
        magasin.plans.ecrire(plan.to_dict())
        return {"resultat": plan.to_dict()["resultat"]}

    @routeur.get("/{ref}/{nom}")
    def telecharger(ref: str, nom: str, request: Request):
        """Les fichiers de la version publiée. Les deux clés y ont droit (§5.8)."""
        exige_cle(request, ref)
        plan = _plan_publie(request, ref)
        return servir_un_fichier(
            repertoire_de_version(request.app.state.magasin, ref, plan.version_publiee),
            nom, ref, plan.version_publiee,
        )

    return routeur


__all__ = ["lire_les_amendements", "routeur_athlete"]
