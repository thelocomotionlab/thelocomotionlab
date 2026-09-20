"""Les faits du rapport : six calculs sur des données existantes, et rien d'autre.

Chaque fonction rend des valeurs BRUTES (nombres, textes en clair) ou ``None`` quand la
mesure n'existe pas. Aucune n'invente de catégorie, d'échelle ni de barème : ce qui ne se
calcule pas ne s'écrit pas. La mise en forme (virgule française, échappement LaTeX) se fait
à l'injection, dans ``context``.

  1. ``contre_son_passe`` — la course en regard des ultras de calibration de l'athlète.
  2. ``deux_intensites``  — l'intensité de cette course et celle de ses ultras passés.
  3. ``ventilation``      — où passe le temps prévu : montée, terrain roulant, descente, arrêts.
  4. ``cout_dune_erreur`` — ce que coûtent une journée sans forme et un départ trop rapide.
  5. ``trois_moments``    — la plus grosse montée, la plus grosse descente, le plus long segment.
  6. ``segments_lourds``  — les segments qui prennent le plus de temps, et ce qu'ils pèsent.
  6. ``lever_du_jour``    — où l'athlète sera au lever du soleil, et à quelle heure.
"""

from __future__ import annotations

import datetime as dt

import numpy as np

from ..course.montees import descentes, montees
from ..pacing.plan import fmt_clock
from ..pacing.sun import sun_times


# --------------------------------------------------------------------------- #
# 1. La course comparée à son propre passé
# --------------------------------------------------------------------------- #
def contre_son_passe(prediction, course, plan, calibration) -> list[dict]:
    """Ce que cette course demande, en multiples de ce que l'athlète a déjà fait.

    Une ligne par mesure disponible sur SES ultras de calibration : durée, D+, plus longue
    descente continue, nuits. Une mesure absente de ses fichiers ne donne pas de ligne — on
    ne comble pas un trou par une valeur de population.
    """
    ultras = list(getattr(calibration, "genuine", ()) or ())
    if not ultras:
        return []
    out: list[dict] = []

    def _ligne(cle: str, quoi: str, valeur: float, records: list[float], unite: str,
               quand: str | None = None) -> None:
        if not records:
            return
        record = max(records)
        if record <= 0:
            return
        out.append({"cle": cle, "quoi": quoi, "valeur": float(valeur), "record": float(record),
                    "ratio": float(valeur) / float(record), "ecart": float(valeur) - float(record),
                    "unite": unite, "quand": quand})

    def _date(records: list[tuple[float, str | None]]) -> str | None:
        if not records:
            return None
        return max(records, key=lambda r: r[0])[1]

    durees = [(u.elapsed_hours or u.hours, u.date) for u in ultras]
    _ligne("duree", "ton plus long ultra", prediction.finish_hours,
           [d for d, _ in durees], "h", _date(durees))

    dplus = [(float(u.dplus_m), u.date) for u in ultras if u.dplus_m]
    _ligne("dplus", "ton plus gros dénivelé", float(course.dplus_m),
           [d for d, _ in dplus], "m", _date(dplus))

    desc = [(float(u.longest_descent_m), u.date) for u in ultras
            if getattr(u, "longest_descent_m", None)]
    plus_longue = max((d.denivele_m for d in descentes(course)), default=0.0)
    if plus_longue > 0:
        _ligne("descente", "ta plus longue descente", plus_longue,
               [d for d, _ in desc], "m", _date(desc))

    nuits_course = len(plan.night_runs)
    nuits = [(float(u.n_nights), u.date) for u in ultras if getattr(u, "n_nights", None) is not None]
    if nuits_course > 0:
        _ligne("nuits", "ton maximum de nuits", float(nuits_course),
               [n for n, _ in nuits], "nuit", _date(nuits))
    return out


# --------------------------------------------------------------------------- #
# 2. Les deux intensités
# --------------------------------------------------------------------------- #
def deux_intensites(prediction, twin, calibration) -> dict | None:
    """L'intensité prévue de cette course et celle de ses ultras passés, sur la même échelle.

    Rien sans vitesse critique plausible : sans elle, aucun « % de VC » n'est affichable.
    Le rang dit combien de ses ultras se sont courus PLUS FORT que ce que cette course demande.
    """
    cs = getattr(twin, "critical_speed", None)
    ultras = list(getattr(calibration, "genuine", ()) or ())
    if cs is None or not getattr(cs, "plausible", True) or not cs.vc_kmh or not ultras:
        return None
    if prediction.vc_fraction is None:
        return None
    parts = sorted((u.vga_kmh / cs.vc_kmh for u in ultras), reverse=True)
    course = float(prediction.vc_fraction)
    plus_bas = sum(1 for p in parts if p < course)      # ultras courus MOINS fort
    plus_forts = sum(1 for p in parts if p > course)
    return {
        "course_pct": 100.0 * course,
        "ultras_pct": 100.0 * float(np.mean(parts)),
        "mini_pct": 100.0 * parts[-1],
        "maxi_pct": 100.0 * parts[0],
        "n": len(parts),
        "plus_forts": plus_forts,
        "plus_bas": plus_bas,
        # le rang se compte du côté où la course tombe : dire « plus fort qu'un seul de tes
        # douze » quand elle est tout en bas, c'est dire l'inverse de ce qui compte
        "rang": plus_bas + 1 if plus_bas <= plus_forts else plus_forts + 1,
        "par_le_bas": plus_bas <= plus_forts,
        "vc_kmh": float(cs.vc_kmh),
    }


# --------------------------------------------------------------------------- #
# 3. Où passe le temps
# --------------------------------------------------------------------------- #
def ventilation(plan, course, cfg) -> dict | None:
    """Le temps prévu ventilé en montée, terrain roulant, descente et arrêts.

    Le plan donne une vitesse ajustée par segment ; la grille donne, point par point, la
    distance équivalente et la pente. Le temps d'un point est donc sa distance équivalente
    divisée par la vitesse ajustée de son segment — la somme redonne exactement le temps de
    mouvement du plan. Le seuil qui sépare les trois terrains est ``course.flat_grade_pct``,
    un choix déclaré que le rapport nomme.
    """
    segs = plan.segments
    if not segs:
        return None
    deq = np.asarray(course.deq_grid_m, float)
    grade = np.asarray(course.grade, float) * 100.0
    off = np.asarray(course.off_km_grid, float)
    seuil = float(cfg.course.flat_grade_pct)

    heures = np.zeros(grade.size, dtype=float)
    debut = 0
    for seg in segs:
        fin = int(np.argmin(np.abs(off - seg.off1)))
        if fin <= debut or seg.v_ga_kmh <= 0:
            debut = max(fin, debut)
            continue
        pas_km = np.diff(deq[debut:fin + 1]) / 1000.0
        heures[debut + 1:fin + 1] = pas_km / seg.v_ga_kmh
        debut = fin

    monte, descend = grade > seuil, grade < -seuil
    roulant = ~monte & ~descend
    t_move = float(heures.sum())
    t_stops = float(plan.t_stops_h)
    total = t_move + t_stops
    if total <= 0:
        return None
    parts = [
        ("montee", "en montée", float(heures[monte].sum()), float(100.0 * monte.sum() / grade.size)),
        ("roulant", "sur terrain roulant", float(heures[roulant].sum()),
         float(100.0 * roulant.sum() / grade.size)),
        ("descente", "en descente", float(heures[descend].sum()),
         float(100.0 * descend.sum() / grade.size)),
        ("arrets", "à l'arrêt", t_stops, 0.0),
    ]
    return {
        "seuil_pct": seuil,
        "total_h": total,
        "parts": [{"cle": c, "quoi": q, "heures": h, "part_pct": 100.0 * h / total,
                   "part_distance_pct": d} for c, q, h, d in parts],
    }


# --------------------------------------------------------------------------- #
# 4. Deux scénarios de forme, et le risque des arrêts
# --------------------------------------------------------------------------- #
def deux_scenarios(prediction, course, twin, calibration, cfg, *,
                   forme_pct: float = 10.0) -> dict:
    """La même prédiction sur un athlète un peu moins bien, puis un peu mieux.

    C'est le point fixe rejoué avec toutes les vitesses multipliées par (1 ∓ forme), arrêts
    et nuit compris : deux vraies prédictions, pas deux règles de trois.

    Ce que ce bloc ne contient PAS, et pourquoi : le coût d'un départ trop rapide. Le moteur
    mesure le découplage d'un effort mené normalement et prescrit une dérive de plan ; ni
    l'un ni l'autre ne dit ce qu'une erreur de rythme fait payer. Le chiffrer demanderait un
    barème qu'aucune donnée ici ne soutient.
    """
    from ..predict import predict_finish

    env = getattr(prediction, "env_factor", None) or 1.0
    stops = getattr(prediction, "stops_hours", None)
    out = {"forme_pct": forme_pct}
    for cle, signe in (("moins", -1.0), ("plus", +1.0)):
        p = predict_finish(course.deq_km, course.dplus_per_km, twin, calibration, cfg,
                           env_factor=env * (1.0 + signe * forme_pct / 100.0),
                           spec_stops_h=stops)
        out[cle] = {"heures": float(p.finish_hours),
                    "ecart_h": float(p.finish_hours - prediction.finish_hours)}
    return out


def risque_des_arrets(plan, calibration, cfg) -> dict | None:
    """Ce que le plan retranche pour les arrêts, contre ce que l'athlète s'arrête vraiment.

    C'est le plus gros écart évitable d'un plan d'ultra, et il est mesurable : la politique
    du plan d'un côté, le taux d'arrêt mesuré sur ses propres ultras de l'autre, appliqué à
    son temps de mouvement. None quand aucun de ses ultras n'a d'arrêts mesurés — on ne
    compare pas un plan à une valeur de population.
    """
    import numpy as np

    from ..calibration import stops_statistics

    genuine = list(getattr(calibration, "genuine", ()) or ())
    if not genuine:
        return None
    w = (np.asarray(calibration.weights, dtype=float)
         if getattr(calibration, "weights", None) is not None
         and len(calibration.weights) == len(genuine) else np.ones(len(genuine)))
    st = stops_statistics(genuine, w, cfg)
    if st.get("origin") != "ultras" or not st.get("n"):
        return None

    plan_h = float(plan.t_stops_h)
    move_h = float(plan.t_move_h)
    mesure_h = float(st["rate"]) * move_h
    n_arrets = sum(1 for s in plan.segments if s.stop_min > 0)
    return {
        "plan_h": plan_h,
        "plan_n": n_arrets,
        "mesure_h": mesure_h,
        "mesure_min_par_h": 60.0 * float(st["rate"]),
        "n_ultras": int(st["n"]),
        "ecart_h": mesure_h - plan_h,
    }


def depart_concret(plan, calibration) -> dict | None:
    """À quoi ressemble le départ, en allure, et de combien il est plus lent que ses ultras.

    « Ça va te paraître trop facile » ne veut rien dire tant qu'on ne donne pas le chiffre de
    la montre. On donne les deux : l'allure terrain du premier segment (ce que la montre
    affiche) et l'écart en allure AJUSTÉE à la pente — la seule comparable d'un terrain à
    l'autre — avec la moyenne de ses ultras.
    """
    segs = plan.segments
    ultras = [u for u in getattr(calibration, "genuine", ()) or () if u.vga_kmh > 0]
    if not segs or not ultras:
        return None
    seg = segs[0]
    if seg.v_ga_kmh <= 0:
        return None
    moyenne_vga = sum(u.vga_kmh for u in ultras) / len(ultras)
    plan_ajuste = 60.0 / seg.v_ga_kmh
    ultras_ajuste = 60.0 / moyenne_vga
    return {
        "km": float(seg.off1),
        "vers": seg.to,
        "pace_terrain_min_km": float(seg.pace_min_km),
        "pace_ajustee_min_km": plan_ajuste,
        "ultras_ajustee_min_km": ultras_ajuste,
        "ecart_min_km": plan_ajuste - ultras_ajuste,
        "n_ultras": len(ultras),
    }


# À moins de ce kilométrage d'un point de passage, un morceau « finit » à ce point ; au-delà,
# il se situe par rapport au dernier point franchi.
PRES_KM = 1.0


def _ou(plan, km: float) -> dict:
    """Où tombe un kilomètre, dans les mots du carnet de route.

    ``{"vers": nom}`` quand le morceau finit au point lui-même, ``{"apres": nom, "km_apres":
    distance}`` quand il s'arrête entre deux points — nommer le ravitaillement SUIVANT ferait
    croire que la montée y monte encore.
    """
    segs = plan.segments
    fin = min(segs, key=lambda s: abs(s.off1 - km))
    if abs(fin.off1 - km) <= PRES_KM:
        return {"vers": fin.to, "apres": None, "km_apres": 0.0}
    passes = [s for s in segs if s.off1 <= km - 1e-6]
    if passes:
        dernier = passes[-1]
        return {"vers": None, "apres": dernier.to, "km_apres": km - dernier.off1}
    return {"vers": None, "apres": None, "km_apres": km}


def _horloge(plan, km: float) -> tuple[str | None, float]:
    """(heure de passage au kilomètre donné, heures depuis le départ), par interpolation du
    cumul du plan. Une seule lecture de l'horloge, partagée par les moments et le lever."""
    segs = plan.segments
    kms = [0.0] + [s.off1 for s in segs]
    cums = [0.0] + [s.cum_clock_h for s in segs]
    h = float(np.interp(km, kms, cums))
    clock = fmt_clock(plan.start_time + dt.timedelta(hours=h)) if plan.start_time else None
    return clock, h


# --------------------------------------------------------------------------- #
# 5. Les trois moments qui décident
# --------------------------------------------------------------------------- #
def trois_moments(plan, course) -> list[dict]:
    """Trois moments, choisis par trois critères explicites et rien d'autre :

    1. la plus grosse montée continue (dénivelé) ;
    2. la plus grosse descente continue (dénivelé) ;
    3. le segment dont la durée prévue est la plus longue.

    Un moment déjà retenu ne se répète pas : si la plus longue durée tombe dans la plus
    grosse montée, on prend le segment suivant par durée.
    """
    segs = plan.segments
    if not segs:
        return []

    def _fenetre(km0: float, km1: float) -> dict:
        """Ce que le plan dit d'un morceau borné en km : quand on y entre, quand on en sort,
        combien de temps il prend, et OÙ il finit.

        Les heures sont interpolées sur le cumul du plan aux kilomètres exacts du morceau —
        un morceau qui s'arrête au milieu d'un segment ne se voit pas prêter l'heure du
        ravitaillement suivant. Le lieu obéit à la même règle : on ne nomme un point de
        passage que si le morceau y finit vraiment (à moins de ``PRES_KM``) ; sinon on situe
        par rapport au dernier point franchi, qui est ce que le coureur vient de voir.
        """
        debut, h0 = _horloge(plan, km0)
        fin, h1 = _horloge(plan, km1)
        dedans = [s for s in segs
                  if s.off1 > km0 + 1e-6 and (s.off1 - s.off_len_km) < km1 - 1e-6]
        suivant = next((s for s in segs if s.off1 >= km1 - 1e-6), segs[-1])
        return {
            "from_km": km0, "to_km": km1,
            "debut_clock": debut, "fin_clock": fin,
            "heures": max(h1 - h0, 0.0),
            "nuit": any(s.night for s in dedans) if dedans else bool(suivant.night),
            **_ou(plan, km1),
        }

    out: list[dict] = []
    haut = max(montees(course), key=lambda m: m.denivele_m, default=None)
    if haut is not None:
        out.append({"cle": "montee", "quoi": "La plus grosse montée",
                    "denivele_m": haut.denivele_m, "longueur_km": haut.length_km,
                    "pente_pct": haut.grade_pct, **_fenetre(haut.from_km, haut.to_km)})
    bas = max(descentes(course), key=lambda d: d.denivele_m, default=None)
    if bas is not None:
        out.append({"cle": "descente", "quoi": "La plus grosse descente",
                    "denivele_m": bas.denivele_m, "longueur_km": bas.length_km,
                    "pente_pct": bas.grade_pct, **_fenetre(bas.from_km, bas.to_km)})

    pris = [(m["from_km"], m["to_km"]) for m in out]
    for seg in sorted(segs, key=lambda s: s.t_move_min + s.stop_min, reverse=True):
        km0 = seg.off1 - seg.off_len_km
        if any(km0 >= a - 1e-6 and seg.off1 <= b + 1e-6 for a, b in pris):
            continue
        out.append({"cle": "segment", "quoi": "Le plus long segment",
                    "denivele_m": seg.dplus_m, "longueur_km": seg.off_len_km,
                    "pente_pct": seg.mean_grade_pct, **_fenetre(km0, seg.off1)})
        break
    return out


# --------------------------------------------------------------------------- #
# Les segments qui pèsent le plus
# --------------------------------------------------------------------------- #
def segments_lourds(plan, *, combien: int = 5) -> dict | None:
    """Les segments qui prennent le plus de temps, et ce qu'ils pèsent ensemble.

    Le critère est la durée d'HORLOGE prévue du segment, arrêt compris : c'est le temps que
    la course prend vraiment. Ni le dénivelé ni la longueur n'entrent en compte — ils sont
    déjà dans le tableau du plan, et un long segment plat ne demande pas le même découpage
    qu'une montée courte.
    """
    segs = plan.segments
    if not segs:
        return None
    total = float(segs[-1].cum_clock_h)
    if total <= 0:
        return None
    lignes, precedent = [], 0.0
    for s in segs:
        cum = float(s.cum_clock_h)
        lignes.append({"nom": s.to, "from_km": float(s.off1 - s.off_len_km),
                       "to_km": float(s.off1), "heures": max(cum - precedent, 0.0)})
        precedent = cum
    top = sorted(lignes, key=lambda x: x["heures"], reverse=True)[:max(combien, 1)]
    maxi = top[0]["heures"]
    cumul = sum(x["heures"] for x in top)
    return {
        "n": len(top),
        "n_total": len(segs),
        "total_h": total,
        "cumul_h": cumul,
        "cumul_pct": 100.0 * cumul / total,
        "lignes": [{**x, "part_pct": 100.0 * x["heures"] / total,
                    "fraction": x["heures"] / maxi if maxi > 0 else 0.0} for x in top],
    }


# --------------------------------------------------------------------------- #
# 6. Le lever du jour
# --------------------------------------------------------------------------- #
def lever_du_jour(plan, race) -> dict | None:
    """Le premier lever de soleil de la course : l'heure, et où l'athlète sera alors.

    None si le départ, la position ou l'arrivée ne sont pas connus, ou si la course se
    termine avant le lever.
    """
    start = plan.start_time
    if start is None or race.lat is None or race.lon is None or not plan.segments:
        return None
    tz = float(race.tz_offset_h or 0.0)
    total_h = float(plan.segments[-1].cum_clock_h)
    for jour in range(0, int(total_h // 24) + 2):
        d = (start + dt.timedelta(days=jour)).date()
        sr, _ = sun_times(d.year, d.month, d.day, race.lat, race.lon, tz)
        lever = dt.datetime.combine(d, dt.time(int(sr // 60), int(sr % 60)), tzinfo=start.tzinfo)
        depuis = (lever - start).total_seconds() / 3600.0
        if 0.0 < depuis < total_h:
            segs = plan.segments
            kms = [0.0] + [s.off1 for s in segs]
            cums = [0.0] + [s.cum_clock_h for s in segs]
            km = float(np.interp(depuis, cums, kms))
            i = min(int(np.searchsorted([s.cum_clock_h for s in segs], depuis)), len(segs) - 1)
            return {
                "heure": f"{int(sr // 60):02d}h{int(sr % 60):02d}",
                "depuis_h": depuis,
                "km": km,
                "vers": segs[i].to,
                "apres": segs[i - 1].to if i > 0 else None,
                "jour": jour,
            }
    return None


__all__ = ["contre_son_passe", "depart_concret", "deux_intensites", "deux_scenarios",
           "lever_du_jour", "risque_des_arrets", "segments_lourds", "trois_moments",
           "ventilation"]
