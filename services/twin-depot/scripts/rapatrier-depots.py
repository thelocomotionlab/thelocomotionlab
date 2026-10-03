#!/usr/bin/env python3
"""rapatrier-depots.py — copie en local les archives de la cohorte Twin, sans rien effacer du VPS.

Les archives restent sur le VPS (chiffrées, le temps de conservation accepté par l'athlète) :
le moteur y relit l'archive d'un athlète pour rejouer ses courses. Ce script en fait une copie
de travail sur ton poste, pour les analyses ; le relancer ne retélécharge que ce qui manque.

Usage (depuis n'importe où, Python 3 standard, aucune dépendance) :

    TWIN_DEPOT_ADMIN_TOKEN=xxx services/twin-depot/scripts/rapatrier-depots.py [DOSSIER]
    TWIN_DEPOT_ADMIN_TOKEN=xxx services/twin-depot/scripts/rapatrier-depots.py [DOSSIER] --purger LL-TWIN-…

- DOSSIER : destination locale (défaut : ~/LocomotionLab/depots-twin) ; chaque dépôt y crée
  <référence LL-TWIN-…>/ avec l'archive + depot.json (les métadonnées du dépôt).
- --purger RÉFÉRENCE : la demande de suppression d'un athlète — efface ce dépôt du VPS
  (archive et métadonnées) et sa copie locale. Son jumeau et ses plans s'effacent depuis le
  tableau de bord (fiche de l'athlète).
- TWIN_DEPOT_URL : base de l'API (défaut : https://depot.thelocomotionlab.com/twin).

Sécurité du geste : le téléchargement est streamé vers un .part, la taille ET le SHA-256 sont
comparés à ceux calculés PAR LE SERVICE au moment du dépôt ; en cas d'échec, le fichier
partiel est supprimé — relancer suffit.
"""

import argparse
import hashlib
import json
import os
import shutil
import sys
import urllib.error
import urllib.request

CHUNK = 1 << 20  # 1 Mo


def requete(url: str, token: str, method: str = "GET"):
    r = urllib.request.Request(url, method=method, headers={"Authorization": f"Bearer {token}"})
    return urllib.request.urlopen(r, timeout=120)


def sha256_de(chemin: str) -> str:
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(CHUNK), b""):
            h.update(bloc)
    return h.hexdigest()


def purger(base: str, token: str, depots: list, reference: str, dest_root: str) -> None:
    """Efface un dépôt du VPS et sa copie locale (demande de suppression de l'athlète)."""
    d = next((x for x in depots if x["reference"] == reference), None)
    if d is None:
        print(f"{reference} : aucun dépôt de cette référence sur le VPS.")
    else:
        try:
            with requete(f"{base}/depots/{d['id']}", token, method="DELETE") as r:
                json.load(r)
        except Exception as e:  # réseau, HTTP : rien d'effacé en local non plus
            sys.exit(f"{reference} : purge VPS impossible ({e}) — rien n'a été effacé.")
        print(f"{reference} : effacé du VPS.")
    dossier = os.path.join(dest_root, reference)
    if os.path.isdir(dossier):
        shutil.rmtree(dossier)
        print(f"{reference} : copie locale effacée ({dossier}).")
    print("Reste à effacer son jumeau et ses plans : tableau de bord, fiche de l'athlète.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Copie en local les archives de la cohorte Twin.")
    ap.add_argument("dossier", nargs="?", default="~/LocomotionLab/depots-twin")
    ap.add_argument("--purger", metavar="RÉFÉRENCE",
                    help="efface ce dépôt du VPS et sa copie locale (demande de suppression)")
    args = ap.parse_args()
    token = os.environ.get("TWIN_DEPOT_ADMIN_TOKEN", "").strip()
    if not token:
        sys.exit("TWIN_DEPOT_ADMIN_TOKEN manquant — préfixe la commande ou exporte la variable.")
    base = os.environ.get("TWIN_DEPOT_URL", "https://depot.thelocomotionlab.com/twin").rstrip("/")
    dest_root = os.path.expanduser(args.dossier)

    try:
        with requete(f"{base}/depots", token) as r:
            depots = json.load(r)["depots"]
    except urllib.error.HTTPError as e:
        indice = " (jeton invalide ou routes admin désactivées ?)" if e.code in (401, 404) else ""
        sys.exit(f"Listing impossible : HTTP {e.code}{indice}")

    if args.purger:
        purger(base, token, depots, args.purger, dest_root)
        return

    if not depots:
        print("Aucun dépôt sur le VPS — rien à copier.")
        return

    print(f"{len(depots)} dépôt(s) sur le VPS, copie vers {dest_root}")
    echecs = nouveaux = 0
    for d in depots:
        ref, nom, taille, attendu = d["reference"], d["nomFichier"], d["taille"], d["sha256"]
        dossier = os.path.join(dest_root, ref)
        os.makedirs(dossier, exist_ok=True)
        cible = os.path.join(dossier, nom)
        with open(os.path.join(dossier, "depot.json"), "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)

        if os.path.exists(cible) and sha256_de(cible) == attendu:
            continue
        print(f"• {ref} : {nom} ({taille / 1048576:.1f} Mo)…", end="", flush=True)
        part = cible + ".part"
        h = hashlib.sha256()
        recu = 0
        try:
            with requete(f"{base}/depots/{d['id']}/archive", token) as r, open(part, "wb") as f:
                while True:
                    bloc = r.read(CHUNK)
                    if not bloc:
                        break
                    h.update(bloc)
                    f.write(bloc)
                    recu += len(bloc)
        except Exception as e:  # réseau, HTTP, disque : on continue avec les suivants
            if os.path.exists(part):
                os.remove(part)
            print(f" ÉCHEC ({e}).")
            echecs += 1
            continue
        if recu != taille or h.hexdigest() != attendu:
            os.remove(part)
            print(" ÉCHEC (taille ou SHA-256 différent).")
            echecs += 1
            continue
        os.replace(part, cible)
        nouveaux += 1
        print(f" ok, SHA-256 vérifié. [{dossier}]")

    print(f"Terminé : {nouveaux} nouvelle(s) archive(s), {len(depots) - nouveaux - echecs} déjà là"
          + (f", {echecs} échec(s) — relance pour réessayer." if echecs else "."))
    if echecs:
        sys.exit(1)


if __name__ == "__main__":
    main()
