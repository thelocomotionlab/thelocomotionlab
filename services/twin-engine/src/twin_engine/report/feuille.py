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

from ..pacing.plan import fmt_clock
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


def consignes(plan, race, cfg, *, moments=()) -> list[str]:
    """Une poignée de consignes SINGULIÈRES, et des cases vides partout ailleurs.

    Une colonne qui répète cinq fois « marche, mange en montant » ne dit rien : l'œil cesse
    de la lire. N'y figurent donc que des moments uniques sur la feuille :

      * ce que l'athlète a écrit lui-même (``RaceSpec.reglages``) et ce que son assistance
        prépare (``crew``) — sa voix passe avant tout le reste ;
      * l'entrée dans la nuit et le retour du jour ;
      * les trois moments qui décident, posés là où ils COMMENCENT.

    ``moments`` vient de ``report.faits.trois_moments`` : la feuille et la page 2 lisent les
    mêmes objets, donc les mêmes chiffres. Les calculer ici une seconde fois — par exemple le
    D+ du segment au lieu de la montée continue — donnerait deux « plus grosse montée » qui ne
    se ressemblent pas, et le lecteur y verrait une erreur.

    Partout ailleurs la case est vide, et c'est voulu : c'est de la place pour écrire.
    """
    segs = plan.segments
    if not segs:
        return []
    out: list[str] = [""] * len(segs)

    def _poser(i: int, texte: str) -> None:
        if 0 <= i < len(segs) and not out[i] and texte:
            out[i] = texte

    # la voix de l'athlète et de son assistance, d'abord
    for r in race.reglages:
        if r.consigne and r.consigne.strip():
            _poser(r.aid_index - 1, r.consigne.strip())
    for idx, note in contact_notes(race).items():
        _poser(idx - 1, note)

    # la nuit : deux bascules, pas une trame de plus
    for run in plan.night_runs:
        i0 = segs.index(run[0])
        _poser(i0, "la nuit commence")
        i1 = segs.index(run[-1])
        if i1 + 1 < len(segs):
            _poser(i1 + 1, "le jour revient")

    # les trois moments, au segment où ils commencent, avec les chiffres de la page 2.
    # Les milliers se séparent par une espace ORDINAIRE : la consigne est du texte brut,
    # échappé à l'injection, où une espace fine LaTeX ressortirait en toutes lettres.
    def _m(v: float) -> str:
        return f"{int(round(v)):,}".replace(",", " ")

    mots = {
        "montee": lambda m: f"montée de {_m(m['denivele_m'])} m jusqu'au km {fr(m['to_km'], 0)}",
        "descente": lambda m: (f"descente de {_m(m['denivele_m'])} m jusqu'au km "
                               f"{fr(m['to_km'], 0)}"),
        "segment": lambda m: f"le plus long : {hm_plain(m['heures'])}",
    }
    for m in moments:
        texte = mots.get(m.get("cle"))
        if texte is None:
            continue
        depart = next((i for i, s in enumerate(segs)
                       if s.off1 - s.off_len_km <= m["from_km"] + 1e-6 < s.off1), None)
        if depart is not None:
            _poser(depart, texte(m))

    limite = cfg.report.consigne_max_chars
    return [c if len(c) <= limite else c[:limite - 1].rstrip() + "…" for c in out]


# --------------------------------------------------------------------------- #
# Heures de passage : le préfixe de jour ne se répète pas
# --------------------------------------------------------------------------- #


def _split_clock(clock: str | None) -> tuple[str, str]:
    """« sam. 19h28 » → (« sam. », « 19h28 ») ; une heure sans jour reste telle quelle."""
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


def night_km_ranges(plan) -> list[tuple[float, float]]:
    """Les sections de nuit en kilomètres (du km, au km) — la matière brute du profil."""
    segs = plan.segments
    out: list[tuple[float, float]] = []
    for run in plan.night_runs:
        i0 = segs.index(run[0])
        km0 = segs[i0 - 1].off1 if i0 > 0 else 0.0
        out.append((float(km0), float(run[-1].off1)))
    return out


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
            fmt_clock(plan.start_time) if plan.start_time else None)
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


def exact_hours(seg, champ: str) -> float:
    """``cum_clock``, ``lo`` ou ``hi`` d'un segment, non arrondi quand le plan le porte : le
    tableau de marche imprime ses heures depuis ces valeurs-là."""
    exact = getattr(seg, f"{champ}_exact_h", None)
    return float(exact if exact is not None else getattr(seg, f"{champ}_h"))


def safety_ratios(plan, prediction) -> tuple[float, float]:
    """(ratio au plus tôt, ratio au plus tard) appliqués au cumul de chaque passage.

    Étalées sur le temps cumulé du plan, les bornes de sécurité redonnent EXACTEMENT
    l'intervalle de la prédiction à l'arrivée — c'est ce qui garantit que la feuille et la
    première page annoncent la même fenêtre.
    """
    total = exact_hours(plan.segments[-1], "cum_clock") if plan.segments else 0.0
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


__all__ = ["clock_columns", "consignes", "contact_notes", "contact_points", "exact_hours",
           "night_km_ranges", "night_sections",
           "nutrition_rows", "parts", "safety_ratios"]
