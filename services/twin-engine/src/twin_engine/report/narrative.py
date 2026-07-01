"""Couche pédagogique du rapport — TOUT est GÉNÉRÉ à partir des valeurs calculées.

Divulgation progressive : pour chaque notion, le rapport donne une intuition en
langage clair + une interprétation (« ce que ça change pour toi »), avant le détail/la
formule. Ce module produit ces textes à partir des objets calculés (jumeau, calibration,
prédiction, plan, parcours). **Aucune prose codée en dur spécifique à un athlète ou une
course** : ce sont des squelettes de phrases remplis par les valeurs → changer un
paramètre change le texte (testable).

Règle : ce module NE FAIT AUCUN calcul scientifique. Il lit des résultats déjà calculés
et applique des seuils de *présentation* (profil, intensité…) pour choisir la formulation.
"""

from __future__ import annotations

from ..minetti import grade_factor
from ._format import fr, hm, tex_escape

# --- seuils de PRÉSENTATION (rendu uniquement, pas de la science) -------------
E_ENDURANT = 1.15          # exposant d'endurance : élevé → profil orienté ultra (twin-theory §2.5)
E_RAPIDE = 1.05
DURAB_EXCELLENT = 15.0     # découplage (%) : bas = garde son efficacité longtemps
DURAB_BON = 25.0
VC_FRAC_TRES_BAS = 0.70    # intensité de course / VC : très en dessous du plafond
VC_FRAC_SOUTENU = 0.85

PCT = r"\%"  # « % » en LaTeX


def _pct(x, decimals=0):
    return f"{fr(x, decimals)}\\,{PCT}"


# --------------------------------------------------------------------------- #
# Profil d'athlète + récit d'ouverture
# --------------------------------------------------------------------------- #
def _profile_word(twin) -> str | None:
    if twin.endurance_E is None:
        return None
    if twin.endurance_E >= E_ENDURANT:
        return "endurant"
    if twin.endurance_E <= E_RAPIDE:
        return "rapide"
    return "équilibré"


def _durability_word(twin) -> str | None:
    d = twin.durability_pct
    if d is None:
        return None
    if d <= DURAB_EXCELLENT:
        return "excellente"
    if d <= DURAB_BON:
        return "bonne"
    return "à surveiller"


_PROFILE_EXPLAIN = {
    "endurant": "ton moteur est calibré pour les très longues durées — c'est le terrain de jeu d'un ultra",
    "rapide": "tu as de la vitesse pure ; sur très long, l'enjeu sera de la rationner",
    "équilibré": "tu combines vitesse et endurance, sans excès marqué dans un sens",
}
_DURABILITY_EXPLAIN = {
    "excellente": "tu gardes ton efficacité même après des heures d'effort",
    "bonne": "tu tiens bien la distance, avec une usure progressive maîtrisée",
    "à surveiller": "ton efficacité baisse sensiblement en fin d'effort — à gérer en course",
}


def opening_narrative(twin, calibration, prediction) -> str:
    """2–3 phrases qui synthétisent le profil et annoncent la suite, en langage clair."""
    parts: list[str] = []
    pw = _profile_word(twin)
    if pw:
        # « nettement <pw> » s'accorde avec « profil » (masc.) → pas de genre supposé sur l'athlète
        parts.append(f"Ton profil est nettement \\textbf{{{pw}}} : {_PROFILE_EXPLAIN[pw]}.")
    dw = _durability_word(twin)
    if dw and twin.durability_pct is not None:
        # en Synthèse on évite le jargon « découplage » (défini plus loin) : langage clair
        parts.append(
            f"Ta r\\'esistance \\`a la fatigue est \\textbf{{{dw}}} "
            f"({_pct(twin.durability_pct)} de perte d'efficacit\\'e en fin de longue sortie) : {_DURABILITY_EXPLAIN[dw]}."
        )
    if prediction is not None:
        closing = f"On pr\\'edit ton arriv\\'ee autour de \\textbf{{{hm(prediction.finish_hours)}}}"
        if prediction.vc_fraction is not None and prediction.vc_fraction < VC_FRAC_TRES_BAS:
            closing += (
                f", \\`a seulement \\textbf{{{_pct(prediction.vc_fraction * 100)}}} de ta vitesse critique : "
                "ta vitesse pure n'est jamais la limite, ce sont l'endurance, la durabilit\\'e et le "
                "ravitaillement qui d\\'ecideront"
            )
        if prediction.cross_validation is None:
            closing += " (\\`a confirmer : peu d'ultras comparables pour valider la m\\'ethode sur toi)"
        closing += ". On d\\'ecoupe ensuite l'effort segment par segment, avec des fen\\^etres horaires."
        parts.append(closing)
    else:
        parts.append(
            "Faute d'assez d'ultras comparables, on reste prudent sur la pr\\'ediction : "
            "prends les chiffres qui suivent comme un ordre de grandeur."
        )
    return " ".join(parts)


# --------------------------------------------------------------------------- #
# Pédagogie par concept — « intuition » + « pour toi »
# --------------------------------------------------------------------------- #
def vc_pourtoi(twin, prediction) -> str | None:
    cs = twin.critical_speed
    if cs is None:
        return None
    s = (
        f"Ta vitesse critique (\\textasciitilde{{}}{fr(cs.vc_kmh, 1)}\\,km/h) est ton \\textbf{{seuil}} : "
        "au-dessus, l'effort se paie vite ; en dessous, tu peux tenir longtemps."
    )
    if prediction is not None and prediction.vc_fraction is not None:
        frac = prediction.vc_fraction
        s += (
            f" Sur cet ultra tu cours \\`a \\textbf{{{_pct(frac * 100)}}} de cette VC"
        )
        if frac < VC_FRAC_TRES_BAS:
            s += " — tr\\`es loin du plafond : garde de la marge, surtout au d\\'epart."
        else:
            s += " — une intensit\\'e d\\'ej\\`a soutenue pour la distance : la r\\'egularit\\'e sera cl\\'e."
    return s


def minetti_example(cfg) -> str:
    """Exemple concret CALCULÉ : coût d'un mètre à +15 % et à −15 % vs plat."""
    f_up = float(grade_factor(0.15, cfg.course.cr0))
    f_down = float(grade_factor(-0.15, cfg.course.cr0))
    return (
        f"\\`A \\textbf{{+15\\,{PCT} de pente}}, courir un m\\`etre \\og~co\\^ute~\\fg\\ comme "
        f"\\textbf{{{fr(f_up, 2)}\\,m}} \\`a plat ; \\`a \\textbf{{$-$15\\,{PCT}}}, comme seulement "
        f"\\textbf{{{fr(f_down, 2)}\\,m}}. C'est pour \\c{{c}}a qu'on ne raisonne pas en kilom\\`etres "
        "bruts mais en \\emph{distance \\'equivalente \\`a plat}."
    )


def deq_pourtoi(course) -> str:
    return (
        f"Tes {fr(course.length_km, 0)}\\,km de montagne \\og~p\\`esent~\\fg\\ comme "
        f"\\textbf{{{fr(course.deq_km, 0)}\\,km \\`a plat}} : c'est ce chiffre, pas la distance "
        "affich\\'ee, qui d\\'etermine ton temps. Chaque mont\\'ee que tu vois sur le profil est "
        "d\\'ej\\`a \\og~convertie~\\fg\\ dans ce calcul."
    )


def endurance_intuition() -> str:
    return (
        "En clair : c'est ta capacit\\'e \\`a \\textbf{garder de la vitesse quand la dur\\'ee s'allonge}. "
        "Plus l'exposant est \\'elev\\'e, plus ton moteur est taill\\'e pour le tr\\`es long."
    )


def endurance_pourtoi(twin) -> str | None:
    if twin.endurance_E is None:
        return None
    pw = _profile_word(twin)
    tail = {
        "endurant": "c'est un atout majeur sur un ultra : tu d\\'eclines peu par rapport \\`a ta vitesse de base.",
        "rapide": "ton point fort est plut\\^ot la vitesse ; sur ultra, appuie-toi sur la r\\'egularit\\'e.",
        "équilibré": "un profil polyvalent : ni sprinteur ni pur diesel.",
    }.get(pw, "")
    return f"Ton exposant vaut \\textbf{{{fr(twin.endurance_E, 2)}}} — {tail}"


def durability_pourtoi(twin) -> str | None:
    if twin.durability_pct is None:
        return (
            "Ta durabilit\\'e n'a pas pu \\^etre chiffr\\'ee (fr\\'equence cardiaque absente de la "
            "majorit\\'e de tes sorties) : c'est une \\textbf{inconnue} \\`a garder en t\\^ete."
        )
    dw = _durability_word(twin)
    advice = {
        "excellente": "tu peux viser une d\\'erive tr\\`es l\\'eg\\`ere : tiens ton allure, elle paiera.",
        "bonne": "la d\\'erive contr\\^ol\\'ee du plan est faite pour toi : pars sans t'emballer.",
        "à surveiller": "\\textbf{garde de la marge au d\\'epart} : ta fin de course se jouera surtout sur la gestion.",
    }.get(dw, "")
    return (
        f"\\textbf{{{_pct(twin.durability_pct)}}} de d\\'ecouplage : {advice} "
        "C'est l'un des deux vrais facteurs limitants d'un ultra (avec le ravitaillement)."
    )


def prediction_pourtoi(prediction) -> str:
    return (
        f"Vise \\textbf{{{hm(prediction.finish_hours)}}}. \\`A cette intensit\\'e, ce n'est pas une "
        "question de vitesse pure mais d'\\textbf{ex\\'ecution} : r\\'egularit\\'e, ravitaillement, "
        "gestion des descentes. La fourchette dit l'incertitude, pas un objectif \\`a battre."
    )


def intensity_feeling(prediction) -> str | None:
    if prediction.vc_fraction is None:
        return None
    frac = prediction.vc_fraction
    if frac < VC_FRAC_TRES_BAS:
        return (
            "Au d\\'epart, \\c{c}a doit te para\\^itre \\textbf{trop facile}. C'est normal et voulu : "
            "\\`a cette intensit\\'e, l'erreur classique est de partir trop vite. Retiens-toi."
        )
    if frac < VC_FRAC_SOUTENU:
        return "Au d\\'epart, l'allure doit sembler \\textbf{confortable mais pr\\'esente} : ne la d\\'epasse pas."
    return "L'intensit\\'e cible est \\textbf{engag\\'ee} : reste \\`a l'\\'ecoute des signaux de fatigue pr\\'ecoce."


def cv_pourtoi(prediction) -> str | None:
    cv = prediction.cross_validation
    if cv is None:
        return None
    return (
        f"On a re-pr\\'edit chacun de tes ultras pass\\'es \\emph{{sans lui}}, puis compar\\'e au r\\'eel : "
        f"en moyenne \\textbf{{{_pct(cv.mae_pct, 1)}}} d'\\'ecart. Autrement dit, la m\\'ethode s'est "
        "d\\'ej\\`a \\textbf{prouv\\'ee sur toi} — ce n'est pas une promesse en l'air."
    )


# --------------------------------------------------------------------------- #
# Segments-clés (extrêmes réels du parcours) + stratégie de course
# --------------------------------------------------------------------------- #
def key_segments(course) -> dict:
    climb = max(course.segments, key=lambda s: s.dplus_m)
    descent = max(course.segments, key=lambda s: s.dminus_m)
    return {"climb": climb, "descent": descent}


def demande_key_sentence(course) -> str:
    k = key_segments(course)
    c, d = k["climb"], k["descent"]
    return (
        f"Deux segments ressortent : la \\textbf{{plus grosse mont\\'ee}} vers \\textbf{{{tex_escape(c.to)}}} "
        f"(+{fr(c.dplus_m, 0)}\\,m, pente moyenne {fr(c.mean_grade_pct, 0)}\\,{PCT}), et la "
        f"\\textbf{{plus grosse descente}} vers \\textbf{{{tex_escape(d.to)}}} ($-${fr(d.dminus_m, 0)}\\,m). "
        "Ce sont eux qui structurent l'effort."
    )


def _night_clock(plan):
    """(heure de début, heure de fin) de la plus longue section de nuit, ou None."""
    runs, cur = [], []
    for s in plan.segments:
        if s.night:
            cur.append(s)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    if not runs:
        return None
    longest = max(runs, key=len)
    return longest[0].arr_clock, longest[-1].arr_clock, longest[0].off1, longest[-1].off1


def race_strategy(course, plan) -> list[dict]:
    """Recommandations opérationnelles GÉNÉRÉES : nuit, plus grosse montée/descente, ravito."""
    items: list[dict] = []
    night = _night_clock(plan)
    if night:
        h0, h1, km0, km1 = night
        when = f" ({h0} \\`a {h1})" if h0 and h1 else ""
        items.append({
            "title": "\\'Eclairage et nuit",
            "body": (
                f"Section de nuit autour du \\textbf{{km\\,{fr(km0, 0)} au km\\,{fr(km1, 0)}}}{when} : "
                "frontale charg\\'ee \\textbf{+ batterie/pile de rechange}, et de quoi avoir chaud "
                "(la temp\\'erature chute la nuit, surtout en altitude)."
            ),
        })
    k = key_segments(course)
    c, d = k["climb"], k["descent"]
    items.append({
        "title": "Discipline dans la plus grosse mont\\'ee",
        "body": (
            f"Vers \\textbf{{{tex_escape(c.to)}}} (+{fr(c.dplus_m, 0)}\\,m \\`a {fr(c.mean_grade_pct, 0)}\\,{PCT}) : "
            "\\textbf{garde de la marge}, marche d\\`es que \\c{c}a devient raide (souvent plus efficace "
            "que courir), et ne \\og~grille pas d'allumettes~\\fg\\ ici — la course se gagne plus loin."
        ),
    })
    items.append({
        "title": "Protection des quadriceps en descente",
        "body": (
            f"La plus grosse descente m\\`ene vers \\textbf{{{tex_escape(d.to)}}} ($-${fr(d.dminus_m, 0)}\\,m) : "
            "\\textbf{foul\\'ee courte}, cadence \\'elev\\'ee, contr\\^ole. C'est l\\`a que se joue la casse "
            "musculaire qui peut ruiner la fin de course — m\\^eme si tu te sens bien, retiens-toi."
        ),
    })
    items.append({
        "title": "Ravitaillement",
        "body": (
            "Le ravitaillement est l'\\textbf{autre} facteur limitant : mange et bois \\textbf{avant} "
            "d'avoir faim ou soif, r\\'eguli\\`erement. Un creux \\'energ\\'etique co\\^ute bien plus cher "
            "que les minutes pass\\'ees \\`a un ravito."
        ),
    })
    return items


# --------------------------------------------------------------------------- #
# Légendes auto-explicatives (data-driven quand pertinent)
# --------------------------------------------------------------------------- #
def caption_record(twin, calibration) -> str:
    base = (
        "\\`A lire : pour chaque dur\\'ee, ta meilleure vitesse ajust\\'ee \\`a la pente. "
        "Les efforts plats \\og~propres~\\fg\\ (terracotta) calent la vitesse critique ; "
        "les losanges verts sont tes vrais ultras."
    )
    cs = twin.critical_speed
    if cs and calibration.genuine:
        mean_ultra = sum(u.vga_kmh for u in calibration.genuine) / len(calibration.genuine)
        frac = mean_ultra / cs.vc_kmh
        base += f" Ils tournent \\`a \\textbf{{{_pct(frac * 100)}}} de ta VC"
        # l'affirmation qualitative suit la valeur (pas d'« en dessous » si la fraction est haute)
        base += (
            " : un ultra se court tr\\`es loin sous le plafond."
            if frac < VC_FRAC_TRES_BAS
            else " : d\\'ej\\`a proche de ton seuil pour des efforts aussi longs."
        )
    return base


def caption_validation(prediction) -> str:
    cv = prediction.cross_validation
    base = (
        "\\`A lire : chaque point est un de tes ultras, pr\\'edit \\emph{sans lui}. "
        "Plus c'est proche de la diagonale, mieux la m\\'ethode te conna\\^it."
    )
    if cv:
        base += f" Ici, \\`a \\textbf{{{_pct(cv.mae_pct, 1)}}} pr\\`es en moyenne (bande $\\pm$5\\,{PCT})."
    return base


def caption_pacing() -> str:
    return (
        "\\`A lire : en terracotta, ta \\textbf{vitesse ajust\\'ee cible} (effort constant, l\\'eg\\`ere "
        "d\\'erive) ; en barres, l'\\textbf{allure r\\'eelle} sur le terrain — lente en mont\\'ee, "
        "rapide en descente, pour un \\emph{m\\^eme} co\\^ut."
    )


def caption_cumul() -> str:
    return (
        "\\`A lire : ton heure de passage cumul\\'ee. La bande, c'est la \\textbf{fourchette \\`a 80\\,"
        f"{PCT}}} : large vers la fin, car les incertitudes s'additionnent au fil des heures."
    )


def caption_profil(course) -> str:
    k = key_segments(course)
    return (
        f"\\`A lire : le relief r\\'eel de ta course ({fr(course.dplus_m, 0)}\\,m\\,D+). Points dor\\'es : "
        f"les ravitaillements. Le plus dur monte vers \\textbf{{{tex_escape(k['climb'].to)}}}."
    )


def caption_demande() -> str:
    return (
        "\\`A lire : en haut, le d\\'enivel\\'e positif par segment ; en bas, distance r\\'eelle vs "
        "\\'equivalent plat. L'\\'ecart entre les deux barres, c'est la \\og~taxe~\\fg\\ de la pente."
    )


# --------------------------------------------------------------------------- #
# Glossaire (définitions GÉNÉRIQUES, identiques pour tous → pas de la prose perso)
# --------------------------------------------------------------------------- #
GLOSSARY = [
    ("Vitesse critique (VC)", "ton seuil d'effort soutenable : au-dessus, la fatigue s'accumule vite."),
    ("R\\'eserve $D'$", "ta petite \\og~r\\'eserve~\\fg\\ au-del\\`a de la VC, pour les efforts courts (sans impact en ultra)."),
    ("Distance \\'equivalente \\`a plat ($\\Deq$)", "tes kilom\\`etres de montagne convertis en kilom\\`etres \\`a plat \\'equivalents en effort."),
    ("Exposant d'endurance", "\\`a quelle vitesse ton allure soutenable baisse quand la dur\\'ee s'allonge."),
    ("Durabilit\\'e / d\\'ecouplage", "la perte d'efficacit\\'e (allure pour une FC donn\\'ee) en fin de longue sortie."),
    ("Pr\\'ediction auto-coh\\'erente (point fixe)", "ta vitesse d\\'epend de la dur\\'ee, qui d\\'epend de ta vitesse : on r\\'esout les deux ensemble."),
    ("Validation crois\\'ee (leave-one-out)", "rejouer la pr\\'ediction sur chaque ultra pass\\'e \\emph{en l'excluant}, pour mesurer l'erreur r\\'eelle."),
]


# --------------------------------------------------------------------------- #
def build_narrative(course, twin, calibration, prediction, plan, race, cfg) -> dict:
    """Point d'entrée : tous les textes générés, prêts à injecter dans le template."""
    return {
        "opening": opening_narrative(twin, calibration, prediction),
        "vc_pourtoi": vc_pourtoi(twin, prediction),
        "minetti_example": minetti_example(cfg),
        "deq_pourtoi": deq_pourtoi(course),
        "endurance_intuition": endurance_intuition(),
        "endurance_pourtoi": endurance_pourtoi(twin),
        "durability_pourtoi": durability_pourtoi(twin),
        "prediction_pourtoi": prediction_pourtoi(prediction) if prediction else None,
        "intensity_feeling": intensity_feeling(prediction) if prediction else None,
        "cv_pourtoi": cv_pourtoi(prediction) if prediction else None,
        "demande_key": demande_key_sentence(course),
        "strategy": race_strategy(course, plan) if plan else [],
        "caption_profil": caption_profil(course),
        "caption_demande": caption_demande(),
        "caption_record": caption_record(twin, calibration),
        "caption_validation": caption_validation(prediction) if prediction else None,
        "caption_pacing": caption_pacing(),
        "caption_cumul": caption_cumul(),
        "glossary": GLOSSARY,
        "profile_word": _profile_word(twin),
        "durability_word": _durability_word(twin),
    }


__all__ = ["build_narrative"]
