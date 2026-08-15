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

from ..config import NarrativeParams
from ..minetti import grade_factor
from ._format import fr, hm, tex_escape

# --- seuils de PRÉSENTATION ----------------------------------------------------
# Exposant de Riegel = DÉCLIN de l'allure quand la durée s'allonge (orthogonal à la VC, qui mesure
# la vitesse — les deux sont indépendants). BAS (proche de 1) = tient très bien l'allure (diesel) ;
# ÉLEVÉ = décline plus nettement.
# Les seuils vivent en CONFIG (bloc « narrative » de twin.config.json, cf. CLAUDE.md « aucune
# constante en dur ») ; chaque fonction accepte ``cfg`` et retombe sur les défauts sans lui
# (compatibilité tests/appels directs). ``_DEFAULTS`` = mêmes valeurs que NarrativeParams.
_DEFAULTS = NarrativeParams()

PCT = r"\%"  # « % » en LaTeX


def _pct(x, decimals=0):
    return f"{fr(x, decimals)}\\,{PCT}"


def _ncfg(cfg) -> NarrativeParams:
    """Seuils de présentation : ceux de la config si fournie, sinon les défauts."""
    return getattr(cfg, "narrative", None) or _DEFAULTS


def vc_frac_band(frac: float | None, cfg=None) -> str | None:
    """Bande d'intensité (« low » / « sustained » / « high ») comparée sur le POURCENTAGE
    AFFICHÉ (arrondi entier) : deux athlètes qui lisent le même « ≈ 70 % » reçoivent le
    même conseil — jamais deux formulations opposées selon la 3ᵉ décimale."""
    if frac is None:
        return None
    p = _ncfg(cfg)
    pct = round(frac * 100)
    if pct < round(p.vc_frac_low * 100):
        return "low"
    if pct < round(p.vc_frac_sustained * 100):
        return "sustained"
    return "high"


# --------------------------------------------------------------------------- #
# Profil d'athlète + récit d'ouverture
# --------------------------------------------------------------------------- #
def _profile_word(twin, cfg=None) -> str | None:
    """Catégorie de PRÉSENTATION sur l'axe du déclin (jamais la vitesse pure).

    ``diesel`` (exposant bas, décline peu) · ``équilibré`` (déclin modéré, cas de référence) ·
    ``fade`` (exposant élevé, décline plus nettement)."""
    p = _ncfg(cfg)
    if twin.endurance_E is None:
        return None
    if twin.endurance_E <= p.e_diesel:
        return "diesel"
    if twin.endurance_E >= p.e_fade:
        return "fade"
    return "équilibré"


def _durability_word(twin, cfg=None) -> str | None:
    p = _ncfg(cfg)
    d = twin.durability_pct
    if d is None:
        return None
    if d <= p.durability_excellent_pct:
        return "excellente"
    if d <= p.durability_good_pct:
        return "bonne"
    return "à surveiller"


# « headline » (mis en gras) + explication, tous deux sur l'axe du DÉCLIN, jamais la vitesse.
_PROFILE_HEADLINE = {
    "diesel": "tr\\`es endurant",
    "équilibré": "bien endurant",
    "fade": "moins endurant sur la dur\\'ee",
}
_PROFILE_EXPLAIN = {
    "diesel": "ton allure baisse tr\\`es peu quand les heures s'accumulent. C'est le moteur d'endurance qu'il faut pour le tr\\`es long",
    "équilibré": "ton allure baisse peu quand l'effort s'allonge, un d\\'eclin mod\\'er\\'e et pr\\'evisible",
    "fade": "ton allure baisse plus vite que la moyenne quand la course s'\\'etire. Il faudra rationner l'effort d\\`es le d\\'epart",
}
_DURABILITY_EXPLAIN = {
    "excellente": "ton efficacité tient, même après de longues heures",
    "bonne": "l'usure existe mais elle reste progressive et prévisible",
    "à surveiller": "ton efficacité chute nettement en fin d'effort, c'est le point à gérer en course",
}


def opening_narrative(twin, calibration, prediction, cfg=None) -> str:
    """2–3 phrases qui synthétisent le profil et annoncent la suite, en langage clair."""
    parts: list[str] = []
    pw = _profile_word(twin, cfg)
    if pw:
        # headline masculin (s'accorde avec « profil ») → aucun genre supposé sur l'athlète
        parts.append(f"Ton profil est \\textbf{{{_PROFILE_HEADLINE[pw]}}} : {_PROFILE_EXPLAIN[pw]}.")
    dw = _durability_word(twin, cfg)
    if dw and twin.durability_pct is not None:
        # en Synthèse on évite le jargon « découplage » (défini plus loin) : langage clair
        parts.append(
            f"R\\'esistance \\`a la fatigue : \\textbf{{{dw}}}, avec {_pct(twin.durability_pct)} "
            f"de perte d'efficacit\\'e en fin de longue sortie — {_DURABILITY_EXPLAIN[dw]}."
        )
    if prediction is not None:
        closing = f"On pr\\'edit ton arriv\\'ee autour de \\textbf{{{hm(prediction.finish_hours)}}}"
        if vc_frac_band(prediction.vc_fraction, cfg) == "low":
            closing += (
                f", \\`a {_pct(prediction.vc_fraction * 100)} de ta vitesse critique seulement : "
                "la vitesse ne sera pas le sujet. L'endurance, la durabilit\\'e et le "
                "ravitaillement d\\'ecideront"
            )
        if prediction.cross_validation is None:
            closing += " (\\`a confirmer : peu d'ultras comparables pour valider la m\\'ethode sur toi)"
        closing += (". La suite d\\'ecoupe l'effort segment par segment, avec des fen\\^etres "
                    "horaires plut\\^ot que des heures s\\`eches.")
        parts.append(closing)
    else:
        parts.append(
            "Faute d'assez d'ultras comparables, la pr\\'ediction reste prudente : "
            "prends les chiffres qui suivent comme un ordre de grandeur, pas comme un plan ferme."
        )
    return " ".join(parts)


# --------------------------------------------------------------------------- #
# Pédagogie par concept — « intuition » + « pour toi »
# --------------------------------------------------------------------------- #
def vc_pourtoi(twin, prediction, cfg=None) -> str | None:
    cs = twin.critical_speed
    # VC non plausible → on ne présente PAS ce chiffre comme « ton seuil » (cohérent avec
    # predict.vc_fraction=None et le masquage de l'encadré VC dans le contexte).
    if cs is None or not getattr(cs, "plausible", True):
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
        if vc_frac_band(frac, cfg) == "low":
            s += " — tr\\`es loin du plafond : garde de la marge, surtout au d\\'epart."
        else:
            s += " — une intensit\\'e d\\'ej\\`a soutenue pour la distance : la r\\'egularit\\'e sera cl\\'e."
    return s


def minetti_example(cfg) -> str:
    """Exemple concret CALCULÉ : coût d'un mètre à ±(pente d'exemple config) vs plat."""
    g = _ncfg(cfg).minetti_example_grade
    f_up = float(grade_factor(g, cfg.course.cr0))
    f_down = float(grade_factor(-g, cfg.course.cr0))
    g_pct = fr(g * 100, 0)
    return (
        f"\\`A \\textbf{{+{g_pct}\\,{PCT} de pente}}, courir un m\\`etre \\og~co\\^ute~\\fg\\ comme "
        f"\\textbf{{{fr(f_up, 2)}\\,m}} \\`a plat ; \\`a \\textbf{{$-${g_pct}\\,{PCT}}}, comme seulement "
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
        "En clair : la vitesse \\`a laquelle ton allure soutenable \\textbf{baisse quand la dur\\'ee "
        "s'allonge} — ind\\'ependant de ta vitesse pure, que mesure la VC. Exposant bas (proche "
        "de 1) : tu gardes ton allure sur le tr\\`es long. Exposant \\'elev\\'e : tu d\\'eclines "
        "davantage. Il est mesur\\'e sur tes efforts jusqu'\\`a quelques heures, puis prolong\\'e "
        "vers les dur\\'ees d'ultra : un descripteur de tendance, pas une garantie."
    )


def endurance_pourtoi(twin, cfg=None) -> str | None:
    if twin.endurance_E is None:
        return None
    pw = _profile_word(twin, cfg)
    tail = {
        "diesel": "sur un ultra, c'est un vrai avantage : ton allure de croisi\\`ere descend peu.",
        "équilibré": "un socle solide : le d\\'eclin reste mod\\'er\\'e quand la dur\\'ee s'allonge.",
        "fade": "ton allure baisse plus vite sur le tr\\`es long ; la r\\'egularit\\'e et la gestion de l'effort compteront double.",
    }.get(pw, "")
    return f"Ton exposant vaut \\textbf{{{fr(twin.endurance_E, 2)}}} — {tail}"


def durability_pourtoi(twin, cfg=None) -> str | None:
    if twin.durability_pct is None:
        return (
            "Ta durabilit\\'e n'a pas pu \\^etre chiffr\\'ee (fr\\'equence cardiaque absente de la "
            "majorit\\'e de tes sorties) : c'est une \\textbf{inconnue} \\`a garder en t\\^ete."
        )
    dw = _durability_word(twin, cfg)
    advice = {
        "excellente": "tu peux viser une d\\'erive tr\\`es l\\'eg\\`ere : tiens ton allure, elle paiera.",
        "bonne": "la d\\'erive contr\\^ol\\'ee du plan est faite pour toi : pars sans t'emballer.",
        "à surveiller": "\\textbf{garde de la marge au d\\'epart} : ta fin de course se jouera surtout sur la gestion.",
    }.get(dw, "")
    return (
        f"\\textbf{{{_pct(twin.durability_pct)}}} de d\\'ecouplage : {advice} "
        "Avec le ravitaillement, c'est ce qui d\\'ecide vraiment d'un ultra."
    )


def prediction_pourtoi(prediction) -> str:
    return (
        f"Vise \\textbf{{{hm(prediction.finish_hours)}}}. \\`A cette intensit\\'e, tout se joue sur "
        "l'ex\\'ecution : r\\'egularit\\'e, ravitaillement, gestion des descentes. La fourchette "
        "d\\'ecrit l'incertitude ; ce n'est pas un objectif \\`a battre."
    )


def intensity_feeling(prediction, cfg=None) -> str | None:
    band = vc_frac_band(prediction.vc_fraction, cfg)
    if band is None:
        return None
    if band == "low":
        return (
            "Au d\\'epart, l'allure para\\^itra \\textbf{trop facile}. C'est pr\\'evu : \\`a cette "
            "intensit\\'e, l'erreur classique est de partir trop vite les premi\\`eres heures."
        )
    if band == "sustained":
        return "Au d\\'epart, l'allure doit sembler \\textbf{confortable mais pr\\'esente} : ne la d\\'epasse pas."
    return "L'intensit\\'e cible est \\textbf{engag\\'ee} : reste \\`a l'\\'ecoute des signaux de fatigue pr\\'ecoce."


def cv_pourtoi(prediction) -> str | None:
    cv = prediction.cross_validation
    if cv is None:
        return None
    s = (
        f"On a re-pr\\'edit chacun de tes ultras pass\\'es \\emph{{sans lui}}, puis compar\\'e au r\\'eel : "
        f"en moyenne \\textbf{{{_pct(cv.mae_pct, 1)}}} d'\\'ecart"
    )
    # transparence gate honnête : quand certains plis sont de l'extrapolation (le point retiré
    # n'est pas encadré par les autres), on donne aussi l'erreur d'interpolation — c'est ELLE
    # qui décide du verdict (sufficiency, gate_policy=honest).
    interp = getattr(cv, "mae_interpolation_pct", None)
    if interp is not None and getattr(cv, "n_extrapolation", 0):
        s += (
            f" — dont {_pct(interp, 1)} sur les courses que tes autres ultras encadrent, "
            "le reste \\'etant de l'extrapolation assum\\'ee"
        )
    s += (
        ". La m\\'ethode a donc \\'et\\'e v\\'erifi\\'ee sur tes propres courses "
        "avant de pr\\'edire celle-ci."
    )
    return s


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
            "garde de la marge, marche d\\`es que \\c{c}a devient raide (souvent plus efficace que "
            "courir). Ne grille pas d'allumettes ici : la course se joue bien plus loin."
        ),
    })
    items.append({
        "title": "Protection des quadriceps en descente",
        "body": (
            f"La plus grosse descente m\\`ene vers \\textbf{{{tex_escape(d.to)}}} ($-${fr(d.dminus_m, 0)}\\,m) : "
            "foul\\'ee courte, cadence \\'elev\\'ee, contr\\^ole. C'est l\\`a que se joue la casse "
            "musculaire qui co\\^ute la fin de course, m\\^eme quand les jambes r\\'epondent bien."
        ),
    })
    items.append({
        "title": "Ravitaillement",
        "body": (
            "Le ravitaillement est l'autre facteur limitant : mange et bois \\`a intervalles "
            "r\\'eguliers, avant d'avoir faim ou soif. Un creux \\'energ\\'etique co\\^ute bien plus "
            "cher que les minutes pass\\'ees \\`a un ravito."
        ),
    })
    return items


# --------------------------------------------------------------------------- #
# Légendes auto-explicatives (data-driven quand pertinent)
# --------------------------------------------------------------------------- #
def caption_record(twin, calibration, cfg=None) -> str:
    base = "\\`A lire : pour chaque dur\\'ee, ta meilleure vitesse ajust\\'ee \\`a la pente. "
    # la mention des points terracotta ne s'affiche que si la figure en trace vraiment
    # (VC de repli sans efforts plats → aucun point terracotta, la légende ne doit pas en décrire)
    rec = getattr(twin, "record", None)
    has_flat = bool(getattr(rec, "flat_points", None)) if rec is not None else False
    if has_flat:
        base += (
            "Les efforts plats \\og~propres~\\fg\\ (terracotta) calent la vitesse critique ; "
            "les losanges verts sont tes vrais ultras."
        )
    else:
        base += "Les losanges verts sont tes vrais ultras."
    cs = twin.critical_speed
    # VC non plausible → on n'affiche aucun « % de ta VC » (cohérent avec predict.vc_fraction=None)
    if cs and getattr(cs, "plausible", True) and calibration.genuine:
        mean_ultra = sum(u.vga_kmh for u in calibration.genuine) / len(calibration.genuine)
        frac = mean_ultra / cs.vc_kmh
        # « % de ta VC » des ULTRAS PASSÉS (moyenne historique) — à ne pas confondre avec
        # l'intensité CIBLE de la course prédite, affichée ailleurs : on le dit explicitement.
        base += (
            f" En moyenne, ces ultras pass\\'es se sont courus \\`a \\textbf{{{_pct(frac * 100)}}} "
            "de ta VC (\\`a distinguer de l'intensit\\'e cible de TA course, en Synth\\`ese)"
        )
        # l'affirmation qualitative suit la valeur (pas d'« en dessous » si la fraction est haute)
        base += (
            " : un ultra se court tr\\`es loin sous le plafond."
            if vc_frac_band(frac, cfg) == "low"
            else " : d\\'ej\\`a proche de ton seuil pour des efforts aussi longs."
        )
    return base


def caption_validation(prediction, cfg=None) -> str:
    cv = prediction.cross_validation
    base = (
        "\\`A lire : chaque point est un de tes ultras, pr\\'edit \\emph{sans lui}. "
        "Plus c'est proche de la diagonale, mieux la m\\'ethode te conna\\^it."
    )
    if cv:
        # la bande tracée par la figure = le seuil 🟢 de la validation croisée (config, pas en dur)
        band = getattr(getattr(cfg, "sufficiency", None), "cv_error_green_pct", 5.0)
        base += (
            f" Ici, \\`a \\textbf{{{_pct(cv.mae_pct, 1)}}} pr\\`es en moyenne "
            f"(bande $\\pm${fr(band, 0)}\\,{PCT})."
        )
    return base


def caption_pacing() -> str:
    return (
        "\\`A lire : en terracotta, ta \\textbf{vitesse ajust\\'ee cible} (effort constant, l\\'eg\\`ere "
        "d\\'erive) ; en barres, l'\\textbf{allure r\\'eelle} sur le terrain — lente en mont\\'ee, "
        "rapide en descente, pour un \\emph{m\\^eme} co\\^ut."
    )


def _plan_band_pct(cfg) -> str:
    """Largeur nominale de la fourchette de course (« 50 » par défaut), dérivée du pacing."""
    pace = getattr(cfg, "pacing", None)
    if pace is None:
        return "50"
    return fr(pace.plan_window_high_pct - pace.plan_window_low_pct, 0)


def caption_cumul(cfg=None, plan=None) -> str:
    # honnêteté : la bande vient d'un facteur d'échelle GLOBAL sur le scénario (un scénario lent
    # l'est de bout en bout) — pas d'une accumulation d'erreurs indépendantes segment par segment.
    # MODE OBJECTIF (ADR 0002) : même bande à l'écran, sens radicalement différent — la légende
    # doit changer avec, sinon on fait passer une consigne d'exécution pour une probabilité.
    if plan is not None and getattr(plan, "anchor", "prediction") == "target":
        tol = getattr(plan, "window_tolerance_pct", None)
        marge = "" if tol is None else f" ($\\pm$\\,{fr(tol, 1)}\\,{PCT})"
        return (
            f"\\`A lire : ton heure de passage cumul\\'ee \\textbf{{sur ton objectif}}. La bande "
            f"est la \\textbf{{fen\\^etre de passage}}{marge} — une \\emph{{tol\\'erance "
            # ⚠ ligne SANS préfixe f : les accolades ne se doublent pas ici
            "d'ex\\'ecution}, pas une probabilit\\'e d'arriv\\'ee. En tirets, la "
            "\\textbf{pr\\'ediction du moteur} : l'\\'ecart entre les deux, c'est ce que ton "
            "objectif te demande d'aller chercher."
        )
    return (
        f"\\`A lire : ton heure de passage cumul\\'ee. La bande est la \\textbf{{fourchette de "
        f"course}} ({_plan_band_pct(cfg)}\\,{PCT} central) : elle s'\\'elargit avec les heures "
        "parce que l'incertitude porte sur ton \\emph{sc\\'enario d'ensemble} — un jour lent "
        "l'est du d\\'ebut \\`a la fin, pas segment par segment."
    )


def _rel_width(prediction) -> float:
    if prediction is None or prediction.finish_hours <= 0:
        return 0.0
    return (prediction.interval_high_h - prediction.interval_low_h) / prediction.finish_hours


def width_prescription(prediction, cfg=None) -> str | None:
    """Phrase qui ASSUME un intervalle de sécurité large (au-delà du seuil scénarios) : la
    largeur est une information sur l'historique de l'athlète face à ce parcours, pas un
    défaut du plan. None quand l'intervalle est ordinaire — le mode d'emploi des deux
    fourchettes est déjà donné par la note fixe du rapport, inutile de le répéter."""
    pace = getattr(cfg, "pacing", None)
    thresh = pace.scenario_rel_width if pace else 0.35
    if _rel_width(prediction) <= thresh:
        return None
    return (
        "Sur un parcours comme celui-ci, tes courses pass\\'ees ne permettent pas de resserrer "
        "davantage les bornes de s\\'ecurit\\'e : c'est une information honn\\^ete, pas un "
        "d\\'efaut du plan. Pilote sur la fourchette de course ; le tableau de sc\\'enarios du "
        "plan de pacing sert \\`a te recaler en course."
    )


def scenario_intro(cfg=None) -> str:
    """Chapeau du tableau de scénarios (affiché seulement quand l'intervalle est large)."""
    return (
        "L'incertitude sur ce parcours est trop large pour piloter sur une seule heure cible. "
        "Le plan se d\\'ecline donc en \\textbf{trois sc\\'enarios} — \\emph{rapide} et "
        f"\\emph{{prudent}} sont les bornes de la fourchette de course ({_plan_band_pct(cfg)}\\,{PCT} "
        "central). D\\`es les premiers ravitaillements, rep\\`ere la colonne dont tes heures de "
        "passage sont les plus proches : c'est elle qui devient ta r\\'ef\\'erence pour la suite, "
        "pas la colonne centrale."
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
        "opening": opening_narrative(twin, calibration, prediction, cfg),
        "vc_pourtoi": vc_pourtoi(twin, prediction, cfg),
        "minetti_example": minetti_example(cfg),
        "deq_pourtoi": deq_pourtoi(course),
        "endurance_intuition": endurance_intuition(),
        "endurance_pourtoi": endurance_pourtoi(twin, cfg),
        "durability_pourtoi": durability_pourtoi(twin, cfg),
        "prediction_pourtoi": prediction_pourtoi(prediction) if prediction else None,
        "intensity_feeling": intensity_feeling(prediction, cfg) if prediction else None,
        "width_prescription": width_prescription(prediction, cfg) if prediction else None,
        "scenario_intro": scenario_intro(cfg),
        "cv_pourtoi": cv_pourtoi(prediction) if prediction else None,
        "demande_key": demande_key_sentence(course),
        "strategy": race_strategy(course, plan) if plan else [],
        "caption_profil": caption_profil(course),
        "caption_demande": caption_demande(),
        "caption_record": caption_record(twin, calibration, cfg),
        "caption_validation": caption_validation(prediction, cfg) if prediction else None,
        "caption_pacing": caption_pacing(),
        "caption_cumul": caption_cumul(cfg, plan),
        "glossary": GLOSSARY,
        "profile_word": _profile_word(twin, cfg),
        "durability_word": _durability_word(twin, cfg),
    }


__all__ = ["build_narrative"]
