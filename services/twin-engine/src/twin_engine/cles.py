"""Les clés d'un plan, et le lien qui les porte.

Deux clés par plan, dérivées de la référence et d'un secret serveur (``TWIN_KEYS_SECRET``) :
celle de ``partage``, que l'athlète donne à son assistance, et la ``prive``, qu'il reçoit
par email. La serrure de l'API (``tableau_de_bord.serrures``) les vérifie ; le rapport les
imprime dans son QR code. Les deux lisent ce module : une clé calculée à deux endroits par
deux codes finirait par ne plus ouvrir la porte qu'elle désigne.

Le secret ne vient que de l'environnement. Sans lui, pas de clé : le lien imprimé est
alors celui de la page sans clé, qui répond 404 — c'est le cas d'un rapport fabriqué sur
une machine qui n'a pas le secret du serveur, et le CLI le dit.
"""

from __future__ import annotations

import hmac
import os
from hashlib import sha256
from urllib.parse import quote

USAGE_PARTAGE = "partage"
USAGE_PRIVE = "prive"
USAGES = (USAGE_PARTAGE, USAGE_PRIVE)

# 32 caractères hexadécimaux, soit 128 bits d'empreinte. Tronquer un HMAC est sûr ;
# 128 bits ne se devinent pas, et une clé se colle dans un lien.
LONGUEUR_CLE = 32

VARIABLE_DU_SECRET = "TWIN_KEYS_SECRET"


def secret_de_lenvironnement(env=None) -> str:
    env = env if env is not None else os.environ
    return env.get(VARIABLE_DU_SECRET, "")


def cle_du_plan(secret: str, ref: str, usage: str) -> str:
    """HMAC-SHA256 de ``ref + usage`` sous le secret, tronqué à 32 caractères."""
    if usage not in USAGES:
        raise ValueError(f"usage inconnu : {usage!r} (attendus : {', '.join(USAGES)})")
    if not secret:
        raise RuntimeError(f"{VARIABLE_DU_SECRET} manquant : aucune clé ne peut être posée")
    empreinte = hmac.new(secret.encode("utf-8"), f"{ref}{usage}".encode("utf-8"), sha256)
    return empreinte.hexdigest()[:LONGUEUR_CLE]


def lien_du_plan(base: str, ref: str, *, usage: str = USAGE_PRIVE,
                 secret: str | None = None) -> str:
    """L'adresse de la page d'un plan, clé comprise quand le secret est connu."""
    adresse = f"{base.rstrip('/')}/{quote(ref, safe='')}"
    secret = secret_de_lenvironnement() if secret is None else secret
    if not secret:
        return adresse
    return f"{adresse}?k={cle_du_plan(secret, ref, usage)}"


__all__ = ["LONGUEUR_CLE", "USAGES", "USAGE_PARTAGE", "USAGE_PRIVE", "VARIABLE_DU_SECRET",
           "cle_du_plan", "lien_du_plan", "secret_de_lenvironnement"]
