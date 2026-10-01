"""Le registre committé : deux livres, les statuts des athlètes, et ce qui leur est commun.

Rangement (``docs/twin-registre/`` par défaut) :

* ``banc/<run>.json`` — le livre **banc**, rétrospectif : un fichier par run, jamais
  réécrit ; l'en-tête dit ce qui l'a produit (:mod:`.runs`) ;
* ``servi.json`` — le livre **servi**, prospectif : une entrée par plan servi puis couru ;
  une entrée dont le résultat est saisi ne change plus, sauf correction motivée, gardée ;
* ``athletes.json`` — le statut ``dev`` / ``frais`` de chaque athlète et son journal ;
* ``quarantaines.json`` — les entrées sorties des statistiques, avec leur motif, quel que
  soit le run ;
* ``a_part.json`` — les courses mises à part, avec leur motif : hors des agrégats,
  rapportées à part, quel que soit le run ;
* ``passages.json`` — les heures de passage réelles d'une course, communes à tous les runs
  qui la rejouent et à son entrée servie.

Agrégats seulement : pseudonymes, chiffres, heures à des kilomètres publics.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

from .statuts import STATUT_DEV, STATUT_FRAIS, basculer, statut_a_la_date

LIVRE_BANC = "banc"
LIVRE_SERVI = "servi"

DEFAULT_RACINE = Path(__file__).resolve().parents[5] / "docs" / "twin-registre"

_COMMENTAIRES = {
    "athletes.json": "Statut de chaque athlète au registre (dev / frais), daté et journalisé. "
                     "Une décision ne compte que les athlètes frais à sa date.",
    "quarantaines.json": "Entrées sorties des statistiques, avec leur motif ; valables pour "
                         "tous les runs qui les rejouent.",
    "a_part.json": "Courses mises à part, avec leur motif : hors des agrégats, rapportées "
                   "à part, pour tous les runs qui les rejouent.",
    "passages.json": "Heures de passage réelles aux points de découpage des courses passées "
                     "(agrégats : des heures à des kilomètres publics).",
    "servi.json": "Livre servi : les plans servis puis courus. Une entrée dont le résultat est "
                  "saisi ne change plus, sauf correction motivée gardée dans « corrections ».",
}


def cle(e: dict) -> tuple[str, str, str]:
    return (str(e.get("athlete") or ""), str(e.get("race") or ""), str(e.get("date") or ""))


def a_un_resultat(e: dict) -> bool:
    return e.get("official_time_h") is not None or bool(e.get("dnf"))


def _lire(chemin: Path) -> dict:
    try:
        return json.loads(chemin.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _ecrire(chemin: Path, donnees: dict) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    tmp = chemin.with_name(f"{chemin.name}.tmp")
    tmp.write_text(json.dumps(donnees, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, chemin)


def lire_entrees(chemin: str | Path) -> tuple[dict | None, list[dict]]:
    """``(en-tête, entrées)`` d'un fichier de run, du livre servi, ou d'un registre à
    l'ancien format (un seul fichier ``{"entries": …}``, sans en-tête)."""
    brut = _lire(Path(chemin))
    return brut.get("run"), list(brut.get("entries") or [])


class Depot:
    """Le registre committé, rangé sous ``racine``."""

    def __init__(self, racine: str | Path = DEFAULT_RACINE):
        self.racine = Path(racine)
        self.banc = self.racine / "banc"

    def _chemin(self, nom: str) -> Path:
        return self.racine / nom

    def _charger(self, nom: str, cle_liste: str, defaut):
        return _lire(self._chemin(nom)).get(cle_liste, defaut)

    def _sauver(self, nom: str, cle_liste: str, valeur) -> None:
        _ecrire(self._chemin(nom), {"_comment": _COMMENTAIRES[nom], cle_liste: valeur})

    # -- statuts ------------------------------------------------------------- #
    def athletes(self) -> dict[str, dict]:
        return dict(self._charger("athletes.json", "athletes", {}))

    def marquer(self, athlete: str, statut: str, *, le: str, par: str, motif: str) -> dict:
        fiches = self.athletes()
        fiches[athlete] = basculer(fiches.get(athlete), statut, le=le, par=par, motif=motif)
        self._sauver("athletes.json", "athletes", dict(sorted(fiches.items())))
        return fiches[athlete]

    def fusionner_statuts(self, fiches: dict[str, dict]) -> list[str]:
        """Ajoute les lignes de journal venues d'ailleurs (export du tableau de bord) ; le
        statut courant suit la dernière ligne. Rend les athlètes dont le statut a bougé."""
        courantes = self.athletes()
        bouges: list[str] = []
        for athlete, fiche in (fiches or {}).items():
            avant = courantes.get(athlete) or {"statut": STATUT_FRAIS, "depuis": None, "journal": []}
            vus = {json.dumps(x, sort_keys=True) for x in avant.get("journal") or []}
            journal = list(avant.get("journal") or [])
            journal += [x for x in fiche.get("journal") or []
                        if json.dumps(x, sort_keys=True) not in vus]
            journal.sort(key=lambda x: str(x.get("le") or ""))
            derniere = journal[-1] if journal else None
            apres = {"statut": derniere["statut"] if derniere else STATUT_FRAIS,
                     "depuis": derniere["le"] if derniere else None, "journal": journal}
            if apres != avant:
                bouges.append(athlete)
            courantes[athlete] = apres
        self._sauver("athletes.json", "athletes", dict(sorted(courantes.items())))
        return bouges

    # -- quarantaines ----------------------------------------------------------- #
    def quarantaines(self) -> dict[tuple[str, str, str], str]:
        return {cle(q): q["motif"] for q in self._charger("quarantaines.json", "quarantaines", [])}

    def mettre_en_quarantaine(self, athlete: str, race: str, date: str, motif: str,
                              le: str) -> None:
        liste = [q for q in self._charger("quarantaines.json", "quarantaines", [])
                 if cle(q) != (athlete, race, date)]
        liste.append({"athlete": athlete, "race": race, "date": date, "motif": motif, "le": le})
        self._sauver("quarantaines.json", "quarantaines", sorted(liste, key=cle))

    # -- à part ------------------------------------------------------------------ #
    def a_part(self) -> dict[tuple[str, str, str], str]:
        return {cle(q): q["motif"] for q in self._charger("a_part.json", "courses", [])}

    def mettre_a_part(self, athlete: str, race: str, date: str, motif: str, le: str) -> None:
        liste = [q for q in self._charger("a_part.json", "courses", [])
                 if cle(q) != (athlete, race, date)]
        liste.append({"athlete": athlete, "race": race, "date": date, "motif": motif, "le": le})
        self._sauver("a_part.json", "courses", sorted(liste, key=cle))

    # -- passages --------------------------------------------------------------- #
    def passages(self) -> dict[tuple[str, str, str], dict]:
        return {cle(c): c["passages"] for c in self._charger("passages.json", "courses", [])}

    def ecrire_passages(self, lignes: Iterable[tuple[str, str, str, dict]]) -> None:
        courant = {cle(c): c for c in self._charger("passages.json", "courses", [])}
        for athlete, race, date, pas in lignes:
            courant[(athlete, race, date)] = {"athlete": athlete, "race": race, "date": date,
                                              "passages": pas}
        self._sauver("passages.json", "courses", sorted(courant.values(), key=cle))

    # -- livre servi ------------------------------------------------------------ #
    def servi(self) -> list[dict]:
        return list(self._charger("servi.json", "entries", []))

    def importer_servi(self, entrees: Iterable[dict]) -> dict[str, list[str]]:
        """Fusionne des entrées servies. Une entrée dont le résultat est saisi ne change plus :
        une différence est refusée, sauf si l'entrée entrante porte ``correction`` (le motif),
        auquel cas l'ancienne version est gardée dans ``corrections``."""
        lignes = self.servi()
        index = {cle(e): i for i, e in enumerate(lignes)}
        rapport: dict[str, list[str]] = {"ajoutees": [], "completees": [], "inchangees": [],
                                         "refusees": [], "corrigees": []}
        for e in entrees:
            e = {k: v for k, v in e.items() if k != "livre"}
            k = cle(e)
            nom = " · ".join(k)
            if k not in index:
                index[k] = len(lignes)
                lignes.append(e)
                rapport["ajoutees"].append(nom)
                continue
            ancienne = lignes[index[k]]
            if json.dumps(ancienne, sort_keys=True) == json.dumps(e, sort_keys=True):
                rapport["inchangees"].append(nom)
                continue
            if not a_un_resultat(ancienne):
                lignes[index[k]] = e
                rapport["completees"].append(nom)
                continue
            motif = str(e.get("correction") or "").strip()
            if not motif:
                rapport["refusees"].append(nom)
                continue
            historique = list(ancienne.get("corrections") or [])
            historique.append({k2: v for k2, v in ancienne.items() if k2 != "corrections"})
            lignes[index[k]] = {**e, "corrections": historique}
            rapport["corrigees"].append(nom)
        self._sauver("servi.json", "entries", sorted(lignes, key=cle))
        return rapport

    # -- livre banc ------------------------------------------------------------- #
    def runs(self) -> list[dict]:
        """Les en-têtes des runs du banc, du plus ancien au plus récent."""
        out = []
        for chemin in sorted(self.banc.glob("*.json")):
            entete, _ = lire_entrees(chemin)
            if entete:
                out.append({**entete, "_fichier": chemin.name})
        return sorted(out, key=lambda r: (str(r.get("le") or ""), r.get("id") or ""))

    def chemin_du_run(self, ref: str) -> Path:
        """Un identifiant de run (ou son début), ou un chemin de fichier."""
        p = Path(ref)
        if p.suffix == ".json" and p.exists():
            return p
        runs = self.runs()
        exacts = [self.banc / r["_fichier"] for r in runs if str(r["id"]) == ref]
        candidats = exacts or [self.banc / r["_fichier"] for r in runs
                               if str(r["id"]).startswith(ref)]
        if len(candidats) != 1:
            raise LookupError(f"run « {ref} » : {len(candidats)} correspondance(s) dans {self.banc}")
        return candidats[0]

    def dernier_run(self, *, label: str | None = None, sans_drapeau: bool = False) -> str | None:
        """L'identifiant du run le plus récent (de cette étiquette, ou sans aucun drapeau hors
        défaut) ; ``None`` sans run. Sans étiquette demandée, les variantes d'un passage
        (``variante_de``) ne comptent pas : écrites après le run de base, parfois dans la même
        seconde, elles le masqueraient selon l'ordre de leurs identifiants."""
        runs = [r for r in self.runs()
                if (r.get("label") == label if label is not None else not r.get("variante_de"))
                and (not sans_drapeau or not r.get("drapeaux"))]
        return runs[-1]["id"] if runs else None

    def importer_run(self, entete: dict, entrees: list[dict]) -> bool:
        """Range tel quel un run venu d'ailleurs (le livre banc du tableau de bord) ; False
        s'il est déjà là sous son identifiant."""
        chemin = self.banc / f"{entete['id']}.json"
        if chemin.exists():
            return False
        _ecrire(chemin, {"run": entete, "entries": entrees})
        return True

    def ecrire_run(self, entete: dict, entrees: list[dict]) -> Path:
        """Écrit un nouveau run. Un run ne se réécrit jamais : si l'identifiant est déjà pris
        (deux passes dans la même seconde), il reçoit un suffixe ``-2``, ``-3``…"""
        base, n = entete["id"], 1
        chemin = self.banc / f"{base}.json"
        while chemin.exists():
            n += 1
            chemin = self.banc / f"{base}-{n}.json"
        entete = {**entete, "id": chemin.stem}
        _ecrire(chemin, {"run": entete, "entries": [{k: v for k, v in e.items() if k != "livre"}
                                                    for e in entrees]})
        return chemin

    # -- lecture annotée -------------------------------------------------------- #
    def annoter(self, entrees: list[dict], livre: str, *, jour: str | None = None) -> list[dict]:
        """Les entrées prêtes à juger : leur livre, le statut de l'athlète (au jour ``jour``,
        sinon le statut courant ; à défaut l'ancien ``dev_set``), leur quarantaine, leur mise à
        part et leurs passages quand l'entrée ne les porte pas."""
        fiches = self.athletes()
        quarantaines = self.quarantaines()
        a_part = self.a_part()
        passages = self.passages()
        out = []
        for e in entrees:
            k = cle(e)
            a = dict(e)
            a["livre"] = livre
            if k[0] in fiches:
                a["statut"] = statut_a_la_date(fiches[k[0]], jour)
            else:
                a["statut"] = STATUT_DEV if e.get("dev_set") else STATUT_FRAIS
            if k in quarantaines and not a.get("quarantine"):
                a["quarantine"] = quarantaines[k]
            if k in a_part:
                a["a_part"] = a_part[k]
            if k in passages and not a.get("passages"):
                a["passages"] = passages[k]
            out.append(a)
        return out


__all__ = ["DEFAULT_RACINE", "Depot", "LIVRE_BANC", "LIVRE_SERVI", "a_un_resultat", "cle",
           "lire_entrees"]
