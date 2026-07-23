#!/usr/bin/env python3
"""rapatrier-depots.py — rapatrie les archives de la cohorte Twin en local, puis purge le VPS.

La règle du labo : les archives ne vivent que le temps de l'analyse — ce script
les fait vivre UNIQUEMENT sur ton poste, et dépouille le VPS dès que possible.

Usage (depuis n'importe où, Python 3 standard, aucune dépendance) :

    TWIN_DEPOT_ADMIN_TOKEN=xxx services/twin-depot/scripts/rapatrier-depots.py [DOSSIER]

- DOSSIER : destination locale (défaut : ~/LocomotionLab/depots-twin) ;
  chaque dépôt y crée <référence LL-TWIN-…>/ avec l'archive + depot.json
  (les métadonnées : après la purge, elles n'existent plus que là).
- TWIN_DEPOT_URL : base de l'API (défaut : https://depot.thelocomotionlab.com/twin).

Sécurité du geste : le téléchargement est streamé vers un .part, la taille ET
le SHA-256 sont comparés à ceux calculés PAR LE SERVICE au moment du dépôt, et
la purge côté VPS n'a lieu QU'APRÈS cette vérification. En cas d'échec, rien
n'est purgé et le fichier partiel est supprimé — relancer suffit.
"""

import hashlib
import json
import os
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


def main() -> None:
    token = os.environ.get("TWIN_DEPOT_ADMIN_TOKEN", "").strip()
    if not token:
        sys.exit("TWIN_DEPOT_ADMIN_TOKEN manquant — préfixe la commande ou exporte la variable.")
    base = os.environ.get("TWIN_DEPOT_URL", "https://depot.thelocomotionlab.com/twin").rstrip("/")
    dest_root = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/LocomotionLab/depots-twin")

    try:
        with requete(f"{base}/depots", token) as r:
            depots = json.load(r)["depots"]
    except urllib.error.HTTPError as e:
        indice = " (jeton invalide ou routes admin désactivées ?)" if e.code in (401, 404) else ""
        sys.exit(f"Listing impossible : HTTP {e.code}{indice}")

    if not depots:
        print("Aucun dépôt en attente sur le VPS — rien à rapatrier.")
        return

    print(f"{len(depots)} dépôt(s) à rapatrier vers {dest_root}")
    echecs = 0
    for d in depots:
        ref, nom, taille, attendu = d["reference"], d["nomFichier"], d["taille"], d["sha256"]
        dossier = os.path.join(dest_root, ref)
        os.makedirs(dossier, exist_ok=True)
        cible = os.path.join(dossier, nom)

        # Métadonnées d'abord : après la purge, elles n'existent plus que là.
        with open(os.path.join(dossier, "depot.json"), "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)

        if os.path.exists(cible) and sha256_de(cible) == attendu:
            print(f"• {ref} : déjà présent et vérifié localement ({nom})", end="")
        else:
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
            except Exception as e:  # réseau, HTTP, disque : rien de purgé, on continue.
                if os.path.exists(part):
                    os.remove(part)
                print(f" ÉCHEC ({e}) — dépôt CONSERVÉ sur le VPS.")
                echecs += 1
                continue
            if recu != taille or h.hexdigest() != attendu:
                os.remove(part)
                print(" ÉCHEC (taille ou SHA-256 différent) — dépôt CONSERVÉ sur le VPS.")
                echecs += 1
                continue
            os.replace(part, cible)
            print(" ok, SHA-256 vérifié.", end="")

        # Purge côté VPS — uniquement une fois l'archive vérifiée en local.
        try:
            with requete(f"{base}/depots/{d['id']}", token, method="DELETE") as r:
                json.load(r)
            print(f" → purgé du VPS. [{dossier}]")
        except Exception as e:
            print(f" ⚠ purge VPS impossible ({e}) — le fichier local est bon, relance pour purger.")
            echecs += 1

    print(f"Terminé : {len(depots) - echecs}/{len(depots)} dépôt(s) rapatrié(s) et purgé(s).")
    if echecs:
        sys.exit(1)


if __name__ == "__main__":
    main()
