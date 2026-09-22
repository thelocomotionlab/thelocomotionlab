"""Les routes du tableau de bord, derrière le jeton d'administration.

Chemins vus d'ici : ``/tableau-de-bord/…``. Caddy les expose sous ``/twin/tableau-de-bord/…``
et retire le préfixe au passage (``infra/caddy/conf.d/api.caddy``) — c'est ce qui
réconcilie les chemins du récapitulatif §5 avec ceux servis sur l'internet.

Sans ``TWIN_ADMIN_TOKEN`` dans l'environnement, ce routeur répond 404 partout : le
service se comporte alors comme s'il ne servait pas ces routes du tout. Avec un jeton
configuré mais faux ou absent de la requête : 401, sans détail.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from . import file as _file
from .magasin import Magasin
from .serrures import Serrures, Tentatives, adresse_du_visiteur


def exige_admin(request: Request) -> None:
    """La serrure de Valentin, posée sur chaque route de ce routeur.

    Jeton absent de l'environnement → 404 : on ne dit pas qu'une porte existe si on n'a
    pas de quoi l'ouvrir. Jeton présent mais requête sans le bon → 401, sans détail :
    « non autorisé » et rien d'autre, pas de longueur attendue, pas de format."""
    serrures: Serrures = request.app.state.serrures
    if not serrures.admin_servie:
        raise HTTPException(status_code=404, detail="not_found")
    if not serrures.admin_ouvre(request.headers.get("authorization")):
        raise HTTPException(status_code=401, detail="non_autorise")


def exige_cle(request: Request, ref: str) -> str:
    """La serrure de l'athlète : la clé du lien, sur le plan qu'elle désigne.

    Rend l'usage qu'elle ouvre — ``partage`` ou ``prive`` — et **404 pour tout le
    reste** : clé absente, clé fausse, référence inconnue, secret non configuré. Jamais
    403 : un 403 confirmerait que la référence existe, et c'est précisément ce qu'on ne
    veut pas confirmer à quelqu'un qui cherche.

    Les échecs se comptent par adresse. Passé la borne, l'adresse reçoit la même 404 —
    elle n'apprend pas qu'elle a été repérée, et l'athlète qui s'est trompé de lien
    retrouve la porte ouverte dès qu'il colle le bon.
    """
    serrures: Serrures = request.app.state.serrures
    tentatives: Tentatives = request.app.state.tentatives
    ip = adresse_du_visiteur(request)
    if tentatives.fermee(ip):
        raise HTTPException(status_code=404, detail="not_found")

    usage = serrures.usage_de(ref, request.query_params.get("k"))
    if usage is None or not request.app.state.magasin.plans.existe(ref):
        tentatives.rate(ip)
        raise HTTPException(status_code=404, detail="not_found")
    tentatives.reussi(ip)
    return usage


def routeur_admin() -> APIRouter:
    routeur = APIRouter(prefix="/tableau-de-bord", dependencies=[Depends(exige_admin)])

    @routeur.get("/file")
    def lire_la_file(request: Request) -> dict:
        """Ce qui attend, la course la plus proche en tête (récapitulatif §5.1).

        Les demandes ouvertes sont listées à part : elles ne sont pas des dossiers, elles
        sont des questions posées sur un dossier."""
        magasin: Magasin = request.app.state.magasin
        plans = {p["id"]: p for p in magasin.plans.lister()}
        courses = {c["id"]: c for c in magasin.courses.lister()}
        vue = _file.construire(
            athletes=magasin.athletes.lister(), plans=plans, courses=courses
        )
        vue["demandes"] = [
            d for d in magasin.demandes.lister() if d.get("statut") == "ouverte"
        ]
        return vue

    return routeur


__all__ = ["exige_admin", "exige_cle", "routeur_admin"]
