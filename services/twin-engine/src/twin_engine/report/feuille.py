"""La feuille à emporter : tableau de marche (recto) et logistique (verso), dérivés du plan.

Un seul endroit calcule ce que l'athlète lit en course — les lignes du tableau, les deux
parties de la course, la consigne de chaque segment, les sections de nuit, les points de
contact et leurs fenêtres, la nutrition quand elle est déclarée. Les gabarits LaTeX ne font
que poser ; ils ne calculent rien et n'écrivent aucune valeur en dur.

Les textes sortent d'ici en clair (pas de LaTeX) : l'échappement se fait à l'injection,
dans ``context``. Seules les durées nommées ``*_hm`` sont déjà composées (espaces fines) et
s'injectent telles quelles.
"""

from __future__ import annotations

from ._format import fr, hm, hm_plain

# --------------------------------------------------------------------------- #
# Points de contact : ce que la spec déclare, et ce qu'on suppose faute de mieux
# --------------------------------------------------------------------------- #


def contact_points(race, n_segments: int) -> tuple[tuple[int, ...], bool]:
    """(index de segments dont la FIN est un point de contact, déclaré ou supposé).

    Priorité : ``crew`` (le règlement de course, avec ses notes), puis
    ``crew_access_indices``, puis — à défaut de toute déclaration — les bases majeures, qui
    ne sont qu'une hypothèse : le second membre du couple vaut alors ``False`` et la feuille
    le dit en toutes lettres.
    """
    last = n_segments - 1  # l'arrivée est servie à part
    crew = tuple(i - 1 for i in race.crew_aid_indices if 0 < i < last + 1)
    if crew:
        return tuple(sorted(set(crew))), True
    declared = tuple(i for i in race.crew_access_indices if 0 <= i < last)
    if declared:
        return declared, True
    majors = tuple(i for i in race.major_base_indices if 0 <= i < last)
    if majors:
        return majors, False
    return tuple(range(max(last, 0))), False


def contact_notes(race) -> dict[int, str]:
    """{index de ravitaillement: note de l'assistance} — vide quand la spec n'en porte pas.

    La clé est l'index dans ``aid_names``, qui est aussi le ``SegmentPlan.index`` du segment
    qui s'y termine (les segments du plan sont numérotés à partir de 1).
    """
    return {c.aid_index: c.note.strip() for c in race.crew if c.note and c.note.strip()}


# --------------------------------------------------------------------------- #
# Les deux parties de la course
# --------------------------------------------------------------------------- #


def _cut_index(plan) -> int:
    """Index du segment qui OUVRE la seconde partie : le ravitaillement dont l'heure de
    passage est la plus proche de la moitié du temps prédit."""
    segs = plan.segments
    if len(segs) < 4:
        return max(len(segs) // 2, 1)
    half = segs[-1].cum_clock_h / 2.0
    best = min(range(len(segs) - 1), key=lambda i: abs(segs[i].cum_clock_h - half))
    return min(max(best + 1, 1), len(segs) - 1)


def parts(plan, race) -> list[dict]:
    """Les deux parties de la course : où elles commencent, ce qu'elles demandent, pourquoi.

    La coupure tombe au ravitaillement le plus proche de la mi-temps prédite ; une spec qui
    déclare ses ``phases`` impose ses noms et ses coupures à la place.
    """
    segs = plan.segments
    if not segs:
        return []
    if race.phases:
        starts, names, notes = [], [], []
        for ph in race.phases:
            starts.append(min(max(ph.from_aid_index, 0), len(segs) - 1))
            names.append(ph.name)
            notes.append(ph.note)
    else:
        cut = _cut_index(plan)
        starts = [0, cut]
        names = ["Retenue", "Exécution"]
        notes = [None, None]

    out: list[dict] = []
    for k, start in enumerate(starts):
        end = starts[k + 1] - 1 if k + 1 < len(starts) else len(segs) - 1
        if start > end:
            continue
        block = segs[start:end + 1]
        km0 = segs[start - 1].off1 if start > 0 else 0.0
        km1 = block[-1].off1
        dplus = sum(s.dplus_m for s in block)
        note = notes[k]
        if note is None:
            note = (f"km 0 à {fr(km1, 0)} · {fr(dplus, 0)} m D+ — ça va te paraître trop "
                    "facile, c'est voulu"
                    if k == 0 else
                    f"km {fr(km0, 0)} à l'arrivée · {fr(dplus, 0)} m D+ — c'est ici que le "
                    "plan se gagne")
        out.append({
            "name": names[k], "note": note, "first": start, "last": end,
            "from_km": fr(km0, 0), "to_km": fr(km1, 0), "dplus": fr(dplus, 0),
        })
    return out


# --------------------------------------------------------------------------- #
# La consigne d'un segment : une par segment, jamais deux fois la même, ou rien
# --------------------------------------------------------------------------- #


def _candidates(seg, *, night_in: bool, night_out: bool, note: str, is_contact: bool,
                is_longest: bool, cfg) -> list[str]:
    """Consignes possibles pour un segment, de la plus utile à la moins utile.

    Chacune dit ce que les colonnes voisines ne disent pas ; les colonnes km, D+, D− et
    arrêt portent déjà les chiffres bruts.
    """
    r = cfg.report
    out: list[str] = []
    if night_in:
        out.append("frontale dès la sortie du ravito")
    if night_out:
        out.append("jour levé, range la frontale")
    if note:
        out.append(note)
    if seg.dplus_m >= r.strong_dplus_m and seg.dplus_m >= seg.dminus_m:
        out.append(f"+{fr(seg.dplus_m, 0)} m : marche et mange en montant")
    if seg.dminus_m >= r.strong_dminus_m and seg.dminus_m > seg.dplus_m:
        out.append(f"−{fr(seg.dminus_m, 0)} m : foulée courte, cadence haute")
    if is_longest:
        out.append("le plus long du parcours : "
                   f"{hm_plain(seg.t_move_min / 60.0)} de marche")
    if is_contact:
        out.append("ton assistance t'attend ici")
    return out


def consignes(plan, race, cfg) -> list[str]:
    """Une consigne par segment, déduite de ses chiffres. Deux segments ne portent jamais la
    même ; quand rien de spécifique ne sort, la case reste vide — mieux vaut du blanc que du
    remplissage."""
    segs = plan.segments
    if not segs:
        return []
    starts = {run[0].index for run in plan.night_runs}
    contacts, _ = contact_points(race, len(segs))
    notes = contact_notes(race)
    longest = max(range(len(segs)), key=lambda i: segs[i].t_move_min)
    limit = cfg.report.consigne_max_chars

    used: set[str] = set()
    out: list[str] = []
    for i, seg in enumerate(segs):
        prev_night = segs[i - 1].night if i > 0 else False
        cands = _candidates(
            seg,
            night_in=seg.index in starts,
            night_out=(prev_night and not seg.night),
            note=notes.get(seg.index, ""),
            is_contact=i in contacts,
            is_longest=(i == longest),
            cfg=cfg,
        )
        pick = next((c for c in cands if len(c) <= limit and c not in used), "")
        if pick:
            used.add(pick)
        out.append(pick)
    return out


# --------------------------------------------------------------------------- #
# Heures de passage : le préfixe de jour ne se répète pas
# --------------------------------------------------------------------------- #


def _split_clock(clock: str | None) -> tuple[str, str]:
    """« sam. 19:28 » → (« sam. », « 19:28 ») ; une heure sans jour reste telle quelle."""
    if not clock:
        return "", "—"
    day, _, hour = clock.partition(" ")
    return (day, hour) if hour else ("", day)


def clock_columns(plan, prediction) -> dict:
    """Les trois colonnes d'heures de la feuille, titrées par leur heure d'arrivée.

    Le préfixe de jour n'apparaît qu'au changement de jour : sur une course de trente heures,
    le répéter seize fois ne dit rien et mange la largeur.
    """
    segs = plan.segments
    cols = {"fast": [], "central": [], "cautious": []}
    prev = {"fast": None, "central": None, "cautious": None}
    for seg in segs:
        for key, clock in (("fast", seg.arr_lo_clock), ("central", seg.arr_clock),
                           ("cautious", seg.arr_hi_clock)):
            day, hour = _split_clock(clock)
            cols[key].append({"day": day if day and day != prev[key] else "", "hour": hour})
            if day:
                prev[key] = day
    last = segs[-1] if segs else None
    return {
        "rows": cols,
        "titles": {
            "fast": hm(last.lo_h) if last else "—",
            "central": hm(last.cum_clock_h) if last else "—",
            "cautious": hm(last.hi_h) if last else "—",
        },
    }


# --------------------------------------------------------------------------- #
# Nuit
# --------------------------------------------------------------------------- #


def night_sections(plan) -> list[dict]:
    """Les sections de nuit, dans l'ordre, avec leurs bornes en km et en heure de passage.

    Deux sections sur un parcours qui traverse une nuit puis rattrape la tombée du jour
    suivant : les reporter séparément est la seule lecture honnête.
    """
    segs = plan.segments
    out = []
    for run in plan.night_runs:
        i0 = segs.index(run[0])
        km0 = segs[i0 - 1].off1 if i0 > 0 else 0.0
        start_clock = segs[i0 - 1].arr_clock if i0 > 0 else (
            f"{plan.start_time:%a %H:%M}" if plan.start_time else None)
        hours = sum((s.t_move_min + s.stop_min) / 60.0 for s in run)
        out.append({
            "from_km": fr(km0, 0), "to_km": fr(run[-1].off1, 0),
            "from_name": segs[i0 - 1].to if i0 > 0 else "le départ",
            "to_name": run[-1].to,
            "from_clock": start_clock, "to_clock": run[-1].arr_clock,
            "hours": hours, "hours_hm": hm(hours),
            "n_segments": len(run),
        })
    return out


# --------------------------------------------------------------------------- #
# Fenêtres de sécurité étalées le long du parcours
# --------------------------------------------------------------------------- #


def safety_ratios(plan, prediction) -> tuple[float, float]:
    """(ratio au plus tôt, ratio au plus tard) appliqués au cumul de chaque passage.

    Étalées sur le temps cumulé du plan, les bornes de sécurité redonnent EXACTEMENT
    l'intervalle de la prédiction à l'arrivée — c'est ce qui garantit que la feuille et la
    première page annoncent la même fenêtre.
    """
    total = plan.segments[-1].cum_clock_h if plan.segments else 0.0
    if total <= 0:
        return 1.0, 1.0
    return prediction.interval_low_h / total, prediction.interval_high_h / total


# --------------------------------------------------------------------------- #
# Nutrition : rien n'est inventé
# --------------------------------------------------------------------------- #


def nutrition_rows(plan, race) -> tuple[list[dict], dict | None]:
    """(par segment, totaux) quand les deux débits sont déclarés, sinon des cases vides.

    Sans déclaration de l'athlète, les colonnes eau et ravito existent mais restent blanches :
    le moteur n'invente ni un débit ni une valeur de population.
    """
    n = race.nutrition
    if not n.declared:
        return [{"water": "", "carbs": ""} for _ in plan.segments], None
    rows, water_l, carbs_g = [], 0.0, 0.0
    for seg in plan.segments:
        hours = (seg.t_move_min + seg.stop_min) / 60.0
        w = n.water_l_per_h * hours
        c = n.carbs_g_per_h * hours
        water_l += w
        carbs_g += c
        rows.append({"water": fr(w, 1), "carbs": fr(c, 0)})
    return rows, {
        "water_l": fr(water_l, 1), "carbs_g": fr(carbs_g, 0),
        "water_rate": fr(n.water_l_per_h, 1), "carbs_rate": fr(n.carbs_g_per_h, 0),
    }


__all__ = ["clock_columns", "consignes", "contact_notes", "contact_points", "night_sections",
           "nutrition_rows", "parts", "safety_ratios"]
