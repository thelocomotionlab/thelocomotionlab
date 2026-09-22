"""Les deux serrures, et ce qu'il faut pour les poser devant un proxy.

**Valentin** entre par un jeton d'administration (``TWIN_ADMIN_TOKEN``) en
``Authorization: Bearer``, sur toute route ``/tableau-de-bord/*``. Même pattern que
``ATELIER_ADMIN_TOKEN`` : jeton absent de l'environnement → les routes n'existent pas
(404, comme si le service ne les servait pas) ; mauvais jeton → 401 sans détail.

**L'athlète** entre par une clé dans son lien, sur ``/plans/{ref}/*``. Deux clés par
plan, dérivées de la référence et d'un secret serveur (``TWIN_KEYS_SECRET``) : celle de
partage, qu'il donne à son assistance, et la privée, qu'il reçoit par email.

Une clé fausse et une référence inconnue rendent la **même** 404. Jamais 403 : un 403
confirmerait que la référence existe, et la référence est justement ce qu'on cherche à
ne pas confirmer.

Devant Caddy, ``request.client.host`` est l'adresse du proxy, pas celle du visiteur :
une limite « par IP » posée dessus serait une limite globale, et le premier venu
fermerait la porte à tout le monde. On lit donc les en-têtes du proxy, dans l'ordre que
tient déjà ``atelier-api`` (``services/atelier-api/src/server.ts``).
"""

from __future__ import annotations

import hmac
import os
import threading
import time
from hashlib import sha256

# Les deux usages, tels que le plan les range (récapitulatif §3.3 : `cles`).
USAGE_PARTAGE = "partage"
USAGE_PRIVE = "prive"
USAGES = (USAGE_PARTAGE, USAGE_PRIVE)

# Longueur d'une clé : 32 caractères hexadécimaux, soit 128 bits d'empreinte. Tronquer
# un HMAC est sûr ; 128 bits ne se devinent pas, et une clé se colle dans un lien.
LONGUEUR_CLE = 32


class Serrures:
    """Les secrets du service, lus une fois au démarrage.

    Ils ne viennent QUE de l'environnement : rien de tout cela n'a le droit d'exister
    dans le dépôt (cf. ``docs/secrets.md``, ``infra/.env.example``)."""

    def __init__(self, *, admin_token: str = "", keys_secret: str = "",
                 internal_secret: str = ""):
        self.admin_token = admin_token
        self.keys_secret = keys_secret
        self.internal_secret = internal_secret

    @classmethod
    def depuis_environnement(cls, env=None) -> "Serrures":
        env = env if env is not None else os.environ
        return cls(
            admin_token=env.get("TWIN_ADMIN_TOKEN", ""),
            keys_secret=env.get("TWIN_KEYS_SECRET", ""),
            internal_secret=env.get("TWIN_INTERNAL_SECRET", ""),
        )

    # -- la serrure de Valentin --------------------------------------------- #
    @property
    def admin_servie(self) -> bool:
        """Sans jeton configuré, les routes d'administration ne sont pas servies."""
        return bool(self.admin_token)

    def admin_ouvre(self, autorisation: str | None) -> bool:
        """Comparaison en temps constant : une comparaison naïve fuit le jeton, caractère
        par caractère, à qui sait mesurer."""
        if not self.admin_token:
            return False
        return hmac.compare_digest(autorisation or "", f"Bearer {self.admin_token}")

    # -- la serrure de l'athlète -------------------------------------------- #
    @property
    def cles_servies(self) -> bool:
        return bool(self.keys_secret)

    def cle(self, ref: str, usage: str) -> str:
        """La clé d'un plan pour un usage : HMAC-SHA256 de ``ref + usage``."""
        if usage not in USAGES:
            raise ValueError(f"usage inconnu : {usage!r} (attendus : {', '.join(USAGES)})")
        if not self.keys_secret:
            raise RuntimeError("TWIN_KEYS_SECRET manquant : aucune clé ne peut être posée")
        empreinte = hmac.new(self.keys_secret.encode("utf-8"),
                             f"{ref}{usage}".encode("utf-8"), sha256)
        return empreinte.hexdigest()[:LONGUEUR_CLE]

    def les_deux_cles(self, ref: str) -> dict[str, str]:
        return {usage: self.cle(ref, usage) for usage in USAGES}

    def usage_de(self, ref: str, k: str | None) -> str | None:
        """Ce que cette clé ouvre sur ce plan — ``None`` si elle n'ouvre rien.

        Les deux usages sont TOUJOURS essayés, sans court-circuit : s'arrêter au premier
        qui tombe juste dirait, au chronomètre, laquelle des deux clés on tient."""
        if not k or not self.cles_servies:
            return None
        trouve = None
        for usage in USAGES:
            if hmac.compare_digest(self.cle(ref, usage), k):
                trouve = usage
        return trouve


class Tentatives:
    """Le compteur d'essais ratés par adresse, en mémoire dans le moteur.

    On ne compte QUE les échecs : un athlète qui recharge sa page ne doit jamais se
    faire fermer la porte. Passé la borne, l'adresse reçoit la même 404 que pour une
    mauvaise clé — elle n'apprend pas qu'elle a été repérée.

    En mémoire veut dire : remis à zéro au redémarrage, et propre à un processus. C'est
    suffisant pour ce que ça garde (deviner un HMAC de 128 bits), et ça n'ajoute ni base
    ni dépendance.
    """

    def __init__(self, *, par_ip: int = 20, fenetre_s: float = 300.0, plafond_ips: int = 4096):
        if par_ip < 1 or fenetre_s <= 0:
            raise ValueError("par_ip ≥ 1 et fenetre_s > 0 attendus")
        self.par_ip = par_ip
        self.fenetre_s = fenetre_s
        self._plafond_ips = max(8, plafond_ips)
        self._echecs: dict[str, list[float]] = {}
        self._verrou = threading.Lock()

    def _recents(self, ip: str, maintenant: float) -> list[float]:
        return [t for t in self._echecs.get(ip, ()) if maintenant - t < self.fenetre_s]

    def fermee(self, ip: str) -> bool:
        """Cette adresse a-t-elle épuisé ses essais ?"""
        with self._verrou:
            return len(self._recents(ip, time.monotonic())) >= self.par_ip

    def rate(self, ip: str) -> None:
        maintenant = time.monotonic()
        with self._verrou:
            self._echecs[ip] = self._recents(ip, maintenant) + [maintenant]
            if len(self._echecs) > self._plafond_ips:
                self._faire_le_menage(maintenant)

    def _faire_le_menage(self, maintenant: float) -> None:
        """Sans ménage, une pluie d'adresses différentes ferait grossir le dictionnaire
        sans fin — la limite de débit deviendrait la fuite qu'elle prétend fermer.

        On jette d'abord ce que la fenêtre a oublié. Si ça ne suffit pas — une rafale
        d'adresses toutes fraîches, exactement ce que fait un attaquant distribué — on
        jette les plus anciennes jusqu'à revenir sous le plafond. Perdre le compte d'une
        adresse la laisse réessayer ; garder une mémoire sans borne tuerait le service.
        Le second risque est le vrai."""
        vivants = {
            autre: restants
            for autre, essais in self._echecs.items()
            if (restants := [t for t in essais if maintenant - t < self.fenetre_s])
        }
        if len(vivants) > self._plafond_ips:
            par_age = sorted(vivants.items(), key=lambda kv: kv[1][-1], reverse=True)
            vivants = dict(par_age[: self._plafond_ips])
        self._echecs = vivants

    def reussi(self, ip: str) -> None:
        """Une bonne clé efface l'ardoise : la borne vise les essais, pas les gens."""
        with self._verrou:
            self._echecs.pop(ip, None)


def adresse_du_visiteur(request) -> str:
    """L'adresse du visiteur, pas celle du proxy. Même ordre qu'``atelier-api``.

    ``CF-Connecting-IP`` d'abord : le sous-domaine est proxifié par Cloudflare, qui pose
    cet en-tête et l'ÉCRASE à chaque passage — un client ne peut donc pas le fabriquer.

    ``X-Forwarded-For`` ensuite, et il ne vaut que par ce qu'il y a devant : Caddy
    AJOUTE l'adresse qu'il constate à ce que le client a envoyé, sans jeter ce qui
    précède. Son premier maillon est donc déclaratif. On l'accepte parce que rien
    n'atteint ce service sans passer par Cloudflare (docs/cloudflare-vps.md) ; sortir le
    domaine du proxy rendrait ce repli truquable, et ce compteur avec lui.
    """
    directe = (request.headers.get("cf-connecting-ip") or "").strip()
    if directe:
        return directe
    transmise = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if transmise:
        return transmise
    client = getattr(request, "client", None)
    return getattr(client, "host", None) or "inconnu"


__all__ = ["LONGUEUR_CLE", "Serrures", "Tentatives", "USAGES", "USAGE_PARTAGE",
           "USAGE_PRIVE", "adresse_du_visiteur"]
