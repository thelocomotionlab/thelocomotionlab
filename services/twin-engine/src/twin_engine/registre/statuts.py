"""Le statut d'un athlète au registre : ``dev`` ou ``frais``, daté, journalisé.

Un athlète est **frais** tant que le moteur n'a pas été réglé sur ses données ; il devient
**de développement** le jour où on regarde ses courses pour mettre le modèle au point. Le
statut est porté par l'athlète, pas par l'entrée : une décision prise à une date ne compte
que les athlètes frais à cette date, quelle que soit la date de leurs courses.

Une fiche : ``{"statut", "depuis", "journal": [{"le", "statut", "par", "motif"}]}``. Le
journal ne se réécrit pas ; le statut à une date se lit sur lui.
"""

from __future__ import annotations

STATUT_DEV = "dev"
STATUT_FRAIS = "frais"
STATUTS = (STATUT_DEV, STATUT_FRAIS)


def fiche_vide() -> dict:
    return {"statut": STATUT_FRAIS, "depuis": None, "journal": []}


def statut_a_la_date(fiche: dict | None, jour: str | None) -> str:
    """Le statut en vigueur au jour ``jour`` (ISO, date ou date-heure) : celui de la dernière
    bascule du journal à cette date ou avant ; ``frais`` avant toute bascule. Sans jour, le
    statut courant."""
    if not fiche:
        return STATUT_FRAIS
    if jour is None:
        return fiche.get("statut") or STATUT_FRAIS
    jour = str(jour)[:10]
    statut = STATUT_FRAIS
    for ligne in sorted(fiche.get("journal") or [], key=lambda x: str(x.get("le") or "")):
        if str(ligne.get("le") or "")[:10] <= jour:
            statut = ligne.get("statut") or statut
    return statut


def basculer(fiche: dict | None, statut: str, *, le: str, par: str, motif: str) -> dict:
    """La fiche après une bascule : statut et date mis à jour, une ligne de plus au journal.
    Un motif est exigé — le journal dit pourquoi un athlète a cessé d'être frais."""
    if statut not in STATUTS:
        raise ValueError(f"statut inconnu : {statut!r} (attendu {' ou '.join(STATUTS)})")
    if not str(motif or "").strip():
        raise ValueError("une bascule de statut demande un motif")
    courante = dict(fiche or fiche_vide())
    journal = list(courante.get("journal") or [])
    journal.append({"le": le, "statut": statut, "par": par, "motif": str(motif).strip()})
    return {**courante, "statut": statut, "depuis": le, "journal": journal}


def frais_a_la_date(fiches: dict[str, dict], jour: str) -> list[str]:
    """Les athlètes frais au jour ``jour``, par ordre alphabétique."""
    return sorted(a for a, f in fiches.items() if statut_a_la_date(f, jour) == STATUT_FRAIS)


__all__ = ["STATUTS", "STATUT_DEV", "STATUT_FRAIS", "basculer", "fiche_vide",
           "frais_a_la_date", "statut_a_la_date"]
