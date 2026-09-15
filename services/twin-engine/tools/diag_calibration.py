"""Radiographie de la calibration — POURQUOI la fourchette a la largeur qu'elle a.

`diag_archive` répond à « l'archive contient-elle ce qu'on croit ? ». Ce module répond à la
question d'après : **parmi les vrais ultras retenus, lesquels tirent la régression, avec quel
poids, et lesquels explosent en validation croisée ?** C'est l'instrument qui manquait quand
la fourchette s'élargit sans qu'on sache lequel des trois étages (sélection / pondération /
conforme) en est responsable.

Deux sorties :

1. **Table par ultra** — date, durée, vitesse ajustée, D+/km, découplage, FC moyenne, poids de
   récence, poids de maximalité **décomposé par signal**, et erreur LOO du pli. Une ligne à
   poids 1,00 et erreur 15 % est un poison identifié.
2. **Table de scénarios** — le même jumeau recalibré sous plusieurs réglages, dont
   « **FC ignorée** » qui simule l'état d'AVANT l'ajout des données cardio. C'est la
   comparaison qui tranche « pourquoi la fourchette s'est-elle élargie quand j'ai ajouté la FC ».

⚠ **Portée de la FC.** La fréquence cardiaque n'entre NI dans la courbe record, NI dans la VC,
NI dans l'exposant d'endurance (ceux-là ne lisent que la distance ajustée). Elle n'agit qu'à
l'étage calibration, par deux chemins : le filtre de découplage de `select_genuine_ultras` et
le troisième signal de `maximality_weights`. Le scénario « FC ignorée » neutralise donc
exactement ces deux chemins, à jumeau identique — une VC qui bouge entre deux exports vient
d'ailleurs (nouvelles activités dans l'enveloppe), pas de la FC.

Décomposition de la maximalité : on n'imite pas le calcul, on rappelle la VRAIE fonction du
moteur sous trois configurations emboîtées (absolu seul / + auto-relatif / + FC). Les écarts
entre colonnes SONT la contribution de chaque signal, sans risque de dérive avec `src/`.

Lancement :
    PYTHONPATH=src python -m tools.diag_calibration \
        --training <archive.zip|dossier> --course <parcours.gpx> [--race examples/nice-100m.json]

Rien n'est conservé : mêmes garanties de confidentialité que le produit (agrégats seulement).
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np

from twin_engine.calibration import (
    build_calibration,
    maximality_weights,
    recency_weights,
    select_genuine_ultras,
)
from twin_engine.config import Config, load_config
from twin_engine.course import RaceSpec, build_course
from twin_engine.ingest import iter_activities
from twin_engine.predict import leave_one_out, predict_race
from twin_engine.twin.model import build_twin


# --------------------------------------------------------------------------- #
# Variantes de configuration
# --------------------------------------------------------------------------- #

def _with_calibration(cfg: Config, **kw) -> Config:
    """Copie de la config avec quelques champs du bloc ``calibration`` remplacés."""
    return replace(cfg, calibration=replace(cfg.calibration, **kw))


def _strip_hr(twin):
    """Jumeau identique, mais dont les résumés ne portent AUCUNE information cardiaque.

    Simule l'état d'avant l'ajout de la FC **sans re-décoder l'archive** : la courbe record,
    la VC et l'exposant sont conservés tels quels (la FC ne les touche pas), seuls les deux
    chemins de l'étage calibration sont neutralisés.
    """
    muets = [replace(s, avg_hr=None, decouple_pct=None, has_hr=False) for s in twin.summaries]
    return replace(twin, summaries=muets)


# --------------------------------------------------------------------------- #
# Table par ultra
# --------------------------------------------------------------------------- #

def _signal_columns(genuine, twin, cfg: Config) -> dict[str, np.ndarray]:
    """Poids de maximalité sous trois configurations emboîtées → contribution par signal.

    On appelle la vraie ``maximality_weights`` à chaque fois :
      * ``abs``       — signal absolu seul (référence ``envelope_absolute``, FC retirée) ;
      * ``+auto``     — on rend le signal auto-relatif (``self_relative``, FC toujours retirée) ;
      * ``+fc``       — configuration SERVIE (les trois signaux).
    Les signaux se combinent par un maximum (structure « rescue ») : chaque colonne ne peut donc
    que monter. Une colonne ``+fc`` nettement au-dessus de ``+auto`` = la FC repêche cet ultra.
    """
    sans_fc = [replace(g, avg_hr=None) for g in genuine]
    return {
        "abs": maximality_weights(
            sans_fc, twin, _with_calibration(cfg, maximality_reference="envelope_absolute")
        ),
        "auto": maximality_weights(sans_fc, twin, cfg),
        "fc": maximality_weights(list(genuine), twin, cfg),
    }


def _print_ultras(twin, cfg: Config, out) -> None:
    genuine = select_genuine_ultras(twin.summaries, cfg)
    if not genuine:
        print("Aucun vrai ultra retenu — rien à radiographier.", file=out)
        return

    rec = recency_weights(genuine, cfg)
    sig = _signal_columns(genuine, twin, cfg)
    w_max = sig["fc"]
    w_tot = rec * w_max

    # ``GenuineUltra`` ne porte pas le découplage (il n'a servi qu'au filtre de sélection) :
    # on le relit sur le résumé d'origine, apparié par les champs recopiés tels quels.
    par_cle = {(s.date, s.dist_km, s.dplus_m): s.decouple_pct for s in twin.summaries}
    decouples = [par_cle.get((g.date, g.dist_km, g.dplus_m)) for g in genuine]

    # Erreurs LOO du modèle réellement servi, alignées sur l'ordre des ultras.
    calib = build_calibration(twin, cfg)
    cv = leave_one_out(calib, cfg)
    # ``hard_filter`` retire des ultras de la calibration : l'alignement positionnel ne tient
    # que si la liste servie a la même longueur (cas ``off``/``soft_weight``).
    err = list(cv.errors_pct) if cv and len(cv.errors_pct) == len(genuine) else None
    if cv and err is None:
        print("  (erreurs LOO non alignables sur cette liste — colonne masquée)\n", file=out)

    print(f"\n{'':2} {'date':>10} {'h':>6} {'v_ga':>6} {'D+/km':>6} {'déc.':>6} {'FC':>4} "
          f"{'w_réc':>6} {'abs':>5} {'+auto':>6} {'+fc':>5} {'w_tot':>6} {'LOO %':>7}", file=out)
    print("  " + "-" * 92, file=out)
    for i, g in enumerate(genuine):
        dec = "—" if decouples[i] is None else f"{decouples[i]:.0f}"
        hr = "—" if g.avg_hr is None else f"{g.avg_hr:.0f}"
        loo = "—" if err is None else f"{err[i]:+.1f}"
        # marqueur visuel : ultra à fort poids ET forte erreur = suspect prioritaire
        flag = "!" if (err is not None and w_tot[i] > 0.5 and abs(err[i]) > 10) else " "
        print(f"{flag:2} {g.date or '—':>10} {g.hours:6.1f} {g.vga_kmh:6.2f} "
              f"{g.dplus_per_km:6.1f} {dec:>6} {hr:>4} {rec[i]:6.2f} "
              f"{sig['abs'][i]:5.2f} {sig['auto'][i]:6.2f} {sig['fc'][i]:5.2f} "
              f"{w_tot[i]:6.2f} {loo:>7}", file=out)

    rescue = float(np.sum(sig["fc"] - sig["auto"]))
    print(f"\n  Repêchage NET par le signal FC : +{rescue:.2f} de poids cumulé sur "
          f"{len(genuine)} ultras.", file=out)
    if rescue > 0.5:
        print("  ⚠ La FC remonte sensiblement les poids : le filtre de maximalité est\n"
              "    d'autant moins sélectif AVEC la FC que sans. C'est structurel (les signaux\n"
              "    se combinent par un maximum), pas un accident de données.", file=out)


# --------------------------------------------------------------------------- #
# Table de scénarios
# --------------------------------------------------------------------------- #

def _scenario(nom: str, twin, course, cfg: Config) -> dict:
    calib = build_calibration(twin, cfg)
    pred = predict_race(course, twin, calib, cfg)
    cv = leave_one_out(calib, cfg)
    row = {
        "nom": nom,
        "regime": calib.regime,
        "n": calib.n_genuine,
        "n_eff": calib.n_eff,
        "sigma": calib.sigma_kmh,
        "central": None if pred is None else pred.finish_hours,
        "lo": None if pred is None else pred.interval_low_h,
        "hi": None if pred is None else pred.interval_high_h,
        "src": None if pred is None else pred.interval_source,
        "mae": None if cv is None else cv.mae_pct,
        "mae_in": None if cv is None else cv.mae_interpolation_pct,
        "mae_ex": None if cv is None else cv.mae_extrapolation_pct,
    }
    return row


def _fmt(v, spec: str = "6.2f") -> str:
    return "—" if v is None else format(v, spec)


def _pct(v, width: int) -> str:
    """Pourcentage aligné, ou un tiret occupant la même largeur (pas de « —% »)."""
    return f"{'—':>{width + 1}}" if v is None else f"{v:>{width}.1f}%"


def _print_scenarios(rows: list[dict], out) -> None:
    print(f"\n{'scénario':<28} {'régime':<11} {'n':>3} {'n_eff':>6} {'σ':>5} "
          f"{'central':>8} {'80 % bas':>9} {'80 % haut':>10} {'largeur':>8} "
          f"{'MAE':>6} {'interp':>7} {'extrap':>7} {'source':>22}", file=out)
    print("-" * 140, file=out)
    for r in rows:
        largeur = (
            None if r["lo"] is None or r["hi"] is None
            else 100.0 * (r["hi"] - r["lo"]) / r["central"]
        )
        print(f"{r['nom']:<28} {r['regime']:<11} {r['n']:>3} {_fmt(r['n_eff'])} "
              f"{_fmt(r['sigma'], '5.2f')} {_fmt(r['central'], '8.2f')} "
              f"{_fmt(r['lo'], '9.2f')} {_fmt(r['hi'], '10.2f')} "
              f"{_pct(largeur, 7)} {_pct(r['mae'], 5)} "
              f"{_pct(r['mae_in'], 6)} {_pct(r['mae_ex'], 6)} "
              f"{str(r['src'] or '—'):>22}", file=out)


# --------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="diag_calibration",
        description="Radiographie de la calibration : qui tire la régression, et pourquoi "
                    "la fourchette a cette largeur.",
    )
    p.add_argument("--training", required=True, help="archive d'entraînement (.zip/dossier)")
    p.add_argument("--course", required=True, help="trace GPX du parcours")
    p.add_argument("--race", default=None, help="spec de course JSON (optionnel)")
    args = p.parse_args(argv)

    cfg = load_config()
    race = RaceSpec.from_json(args.race) if args.race else RaceSpec()
    course = build_course(Path(args.course).read_bytes(), race, cfg)

    print(f"Parcours : {course.length_km:.1f} km · {course.dplus_m:.0f} m D+ · "
          f"Deq {course.deq_km:.1f} km · D+/km {course.dplus_per_km:.1f}")
    print("Ingestion de l'archive (une seule passe)…", file=sys.stderr)

    skipped: list[dict] = []
    activities = list(iter_activities(args.training, running_only=True, skipped=skipped))
    twin = build_twin(activities, cfg)
    del activities  # les tableaux 1 Hz ne servent plus ; seuls les agrégats comptent

    cs = twin.critical_speed
    print(f"\nJumeau : VC {'—' if cs is None else f'{cs.vc_kmh:.2f} km/h ± {cs.vc_sd * 3.6:.2f}'}"
          f" · E {_fmt(twin.endurance_E, '.3f')}"
          f" · durabilité {_fmt(twin.durability_pct, '.1f')} %"
          f" · {len(twin.summaries)} activités")

    _print_ultras(twin, cfg, sys.stdout)

    muet = _strip_hr(twin)
    rows = [
        _scenario("servi (config actuelle)", twin, course, cfg),
        _scenario("FC ignorée (avant cardio)", muet, course, cfg),
        _scenario("maximalité off", twin, course, _with_calibration(cfg, maximality_mode="off")),
        _scenario("maximalité hard_filter", twin, course,
                  _with_calibration(cfg, maximality_mode="hard_filter")),
        _scenario("filtre découplage ouvert", twin, course,
                  _with_calibration(cfg, genuine_max_decouple_pct=100.0)),
        _scenario("récence demi-vie 180 j", twin, course,
                  _with_calibration(cfg, recency_halflife_days=180.0)),
    ]
    _print_scenarios(rows, sys.stdout)

    print("\nLecture : comparer « servi » et « FC ignorée » répond à « pourquoi la fourchette\n"
          "s'est-elle élargie avec la FC ». Si la largeur baisse en « FC ignorée », le coupable\n"
          "est l'un des deux chemins cardio (repêchage de maximalité ou filtre de découplage) —\n"
          "les lignes marquées « ! » ci-dessus désignent les ultras concernés.\n"
          "Ces chiffres se collent tels quels dans DIAGNOSTIC.md ; ils ne se supposent pas.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
