"""La fiche que le navigateur relit : elle doit dire ce que le moteur calcule aujourd'hui.

Le tableau de marche se recalcule à deux endroits, dans deux langages : ici et dans
``apps/site/lib/twinTableauMarche.js``, l'aperçu instantané de la page d'annexe — la page
est prérendue, personne n'y a de moteur sous la main. Les deux doivent rendre les mêmes
minutes : une heure de passage affichée que le PDF dément, et l'athlète ne sait plus
laquelle croire au kilomètre 70, de nuit.

Ce test-ci tient une moitié du contrat : la fiche figée porte bien ce que le moteur
calcule. L'autre moitié est dans la suite du site, qui rejoue la même fiche.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from _tableau_de_marche import FICHE, construire   # noqa: E402

REGENERE = os.environ.get("TWIN_REGENERE_LA_FICHE") == "1"


def _arrondie(v, n=6):
    """Les flottants au millionième de minute : la fiche voyage en JSON, pas en mémoire."""
    if isinstance(v, float):
        return round(v, n)
    if isinstance(v, list):
        return [_arrondie(x, n) for x in v]
    if isinstance(v, dict):
        return {k: _arrondie(x, n) for k, x in v.items()}
    return v


def test_the_shared_fixture_says_what_the_engine_computes():
    """La fiche est à jour. Si la règle d'arrêts bouge, ce test tombe AVANT celui du site :
    on refait la fiche, la suite du site la relit, et la divergence se voit tout de suite."""
    frais = _arrondie(construire())
    if REGENERE:
        FICHE.parent.mkdir(parents=True, exist_ok=True)
        FICHE.write_text(json.dumps(frais, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    assert FICHE.exists(), f"fiche absente : la refaire avec TWIN_REGENERE_LA_FICHE=1"
    fige = json.loads(FICHE.read_text(encoding="utf-8"))
    assert fige == frais, ("la fiche partagée ne dit plus ce que le moteur calcule — "
                           "la refaire avec TWIN_REGENERE_LA_FICHE=1, puis relancer la "
                           "suite du site (pnpm -F site test)")


def test_each_stops_model_leaves_its_own_signature():
    """Les trois modèles ne se ressemblent pas, et la fiche doit le montrer — sinon le test
    du site passerait sur une fiche qui n'exerce qu'un seul chemin.

      · ``spec``     — les arrêts s'ajoutent au mouvement : l'arrivée recule d'autant ;
      · ``carved``   — l'horloge est fixe : l'arrivée ne bouge pas, le mouvement se resserre ;
      · ``personal`` — le budget d'arrêts est fixe : l'arrivée ne bouge pas, les arrêts
        libres se resserrent autour de celui que l'athlète a écrit.
    """
    fige = json.loads(FICHE.read_text(encoding="utf-8"))
    par_modele: dict[str, list] = {}
    for c in fige["cas"]:
        par_modele.setdefault(c["modele"], []).append(c)
    assert set(par_modele) == {"carved", "personal", "spec"}

    for modele, cas in par_modele.items():
        arrivees = {round(c["attendu"]["arrivee"], 3) for c in cas}
        mouvements = {round(sum(c["attendu"]["mouvement"]), 3) for c in cas}
        if modele == "spec":
            assert len(arrivees) == len(cas), "spec : l'arrivée devrait suivre les arrêts"
            assert len(mouvements) == 1, "spec : le mouvement ne devrait pas bouger"
        else:
            assert len(arrivees) == 1, f"{modele} : l'arrivée ne devrait pas bouger"
        if modele == "carved":
            assert len(mouvements) == len(cas), "carved : le mouvement devrait se resserrer"
        if modele == "personal":
            assert len(mouvements) == 1, "personal : le mouvement ne devrait pas bouger"
            # l'arrêt écrit est retenu tel quel, les autres se partagent le reste
            for c in cas:
                ecrit = c["reglages"][0]
                k = ecrit["aid_index"] - 1
                assert c["attendu"]["arret"][k] == ecrit["stop_min"]


def test_the_fixture_carries_nothing_but_minutes():
    """La fiche part dans le dépôt : des minutes et des noms de ravitaillement, rien d'autre.
    Les clés sont énumérées plutôt que cherchées — une clé qu'on ajoute sans y penser (une
    trace, une archive, une position) tombe ici avant d'être poussée."""
    fige = json.loads(FICHE.read_text(encoding="utf-8"))
    assert set(fige) == {"commentaire", "ecart_tolere_min", "cas"}
    for c in fige["cas"]:
        assert set(c) == {"modele", "amendement", "segments", "horloge_min", "reglages",
                          "attendu"}
        for s in c["segments"]:
            assert set(s) == {"index", "to", "t_move_min", "stop_min"}
        for r in c["reglages"]:
            assert set(r) <= {"aid_index", "stop_min", "consigne"}
        assert set(c["attendu"]) == {"mouvement", "arret", "cumul", "arrivee"}
