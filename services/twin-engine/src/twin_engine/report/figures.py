"""Figures matplotlib aux couleurs de la marque (twin-theory §7).

Porte figs.py, paramétré : prend les objets en mémoire (parcours, jumeau, calibration,
prédiction, plan) au lieu de relire des fichiers, et écrit les PNG dans un dossier de
sortie. Police Ubuntu depuis le template embarqué ; palette Locomotion Lab.
"""

from __future__ import annotations

import threading
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.font_manager as fm  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.backends.backend_agg import FigureCanvasAgg  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402
from matplotlib.ticker import FuncFormatter, NullFormatter  # noqa: E402

from .charte import FONT_FAMILY, FONT_FILES, hexa  # noqa: E402
from .feuille import night_km_ranges  # noqa: E402

# palette : les tokens de la charte (report/charte.py = theme.css), jamais une valeur en dur
SAGE = hexa("primary")
GOLD = hexa("accent")
GOLDINK = hexa("accent_ink")
TERRA = hexa("deep")
TEXT = hexa("text")
BG = hexa("bg")
GRID = hexa("hairline")
DEEPGRID = hexa("gauge_full")
GREEN = hexa("success")
FAINT = hexa("faint")
SOFT = hexa("soft")

_FONTS_DIR = Path(__file__).parent / "latex" / "template" / "fonts"


def _init_style() -> None:
    """Style de marque appliqué UNE fois à l'import (verrou d'import CPython → thread-safe).

    Le rendu utilise l'API OBJET (Figure/FigureCanvasAgg), jamais pyplot : le gestionnaire
    de figures global de pyplot n'est pas thread-safe et deux jobs FastAPI concurrents
    entrelaçaient leurs figures (corruption). Après l'import, rcParams n'est plus jamais
    muté — seulement lu à la création des figures."""
    try:
        for f in FONT_FILES:
            fp = _FONTS_DIR / f
            if fp.exists():
                fm.fontManager.addfont(str(fp))
        matplotlib.rcParams["font.family"] = FONT_FAMILY
    except Exception:  # noqa: BLE001 — police = cosmétique, on dégrade
        pass
    matplotlib.rcParams.update({
        "font.size": 10, "text.color": TEXT, "axes.labelcolor": TEXT,
        "xtick.color": TEXT, "ytick.color": TEXT, "axes.edgecolor": FAINT,
        "figure.facecolor": BG, "axes.facecolor": BG, "savefig.facecolor": BG,
        "axes.linewidth": 0.8, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.7,
        "hatch.linewidth": 0.7,
    })


_init_style()

# matplotlib n'est PAS thread-safe de bout en bout même en API objet : le parseur mathtext
# (ticks « 10^n » des axes log) partage des caches pyparsing entre threads → ParseException
# sous jobs concurrents. On sérialise donc le RENDU (quelques centaines de ms par rapport,
# négligeable devant XeLaTeX) ; l'API objet reste, elle, garante de l'absence de fuite d'état
# entre figures (pas de registre pyplot global).
_RENDER_LOCK = threading.Lock()


def fr_num(x: float, decimals: int = 1) -> str:
    """Nombre à la française : virgule décimale, espace fine aux milliers, zéros de fin
    retirés. Toutes les graduations, légendes et titres des figures passent par ici — c'est
    ce qui garantit qu'une même grandeur ne sorte pas deux fois arrondie autrement."""
    s = f"{x:,.{decimals}f}".replace(",", "\u202f").replace(".", ",")
    return s.rstrip("0").rstrip(",") if "," in s else s


def _fr_axes(*axes, x: int = 0, y: int = 0) -> None:
    """Graduations à la française sur les axes donnés (x/y = nombre de décimales)."""
    for ax in axes:
        ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _p, n=x: fr_num(v, n)))
        ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _p, n=y: fr_num(v, n)))



def _nue(ax, *, grilles: list[float], etiquettes: list[str] | None = None,
         axe_bas: bool = True) -> None:
    """La toile des figures du rapport : pas de cadre, pas de graduations, rien qu'une ligne
    de sol et quelques filets horizontaux annotés dans la figure.

    Une figure de rapport n'est pas une planche scientifique : le cadre, les ergots et les
    axes nommés prennent la place et n'apprennent rien de plus qu'un chiffre posé sur le
    filet qu'il mesure.
    """
    for bord in ("top", "right", "left"):
        ax.spines[bord].set_visible(False)
    ax.spines["bottom"].set_visible(axe_bas)
    ax.spines["bottom"].set_color(TEXT)
    ax.spines["bottom"].set_linewidth(0.9)
    ax.tick_params(left=False, bottom=False, labelleft=False, labelbottom=False)
    ax.grid(False)
    x0, x1 = ax.get_xlim()
    for i, y in enumerate(grilles):
        ax.axhline(y, color=GRID, lw=0.7, zorder=0)
        if etiquettes:
            ax.annotate(etiquettes[i], xy=(x0, y), xytext=(2, 3), textcoords="offset points",
                        fontsize=6.8, color=SOFT, va="bottom", ha="left", annotation_clip=False)


def _graduations_x(ax, valeurs: list[float], textes: list[str], *, fin: str | None = None,
                   ergots: bool = True) -> None:
    """Les kilomètres : un ergot sous la ligne de sol et sa valeur dessous.

    La graduation vit SOUS l'axe, jamais dans l'aire de tracé : une verticale par
    ravitaillement hachait le relief en seize tranches et cachait ce qu'il fallait lire.
    """
    y0 = ax.get_ylim()[0]
    if ergots:
        ax.set_xticks(list(valeurs))
        ax.tick_params(axis="x", bottom=True, length=2.4, width=0.8, color=SOFT,
                       labelbottom=False)
    for i, (v, t) in enumerate(zip(valeurs, textes)):
        ax.annotate(t, xy=(v, y0), xytext=(0, -8), textcoords="offset points",
                    fontsize=6.8, color=SOFT, va="top",
                    ha="left" if i == 0 else "center", annotation_clip=False)
    if fin:
        ax.annotate(fin, xy=(ax.get_xlim()[1], y0), xytext=(0, -8), textcoords="offset points",
                    fontsize=6.8, color=SOFT, va="top", ha="right", annotation_clip=False)


def _pas_km(longueur: float) -> float:
    """Un pas de graduation rond qui donne six à neuf repères : 5, 10, 20, 25 ou 50 km."""
    for pas in (5.0, 10.0, 20.0, 25.0, 50.0, 100.0):
        if longueur / pas <= 9:
            return pas
    return 100.0


def _paliers(lo: float, hi: float, combien: int = 3) -> list[float]:
    """Trois ou quatre valeurs rondes entre deux bornes : 500, 1 000, 2 000, 5 000..."""
    span = max(hi - lo, 1e-9)
    brut = span / (combien + 1)
    exposant = 10.0 ** np.floor(np.log10(brut))
    for m in (1, 2, 2.5, 5, 10):
        pas = m * exposant
        if span / pas <= combien + 1.4:
            break
    valeurs = []
    v = np.ceil(lo / pas) * pas
    while v < hi and len(valeurs) < combien + 1:
        if v > lo:
            valeurs.append(float(v))
        v += pas
    return valeurs


def _fig_profil(course, ax, *, title: bool = True, nuits: tuple = ()) -> None:
    """Le profil : le relief et les heures de nuit. Rien d'autre — ni catégorie, ni étiquette
    posée sur le relief, ni verticale par ravitaillement : seize traits hachaient la montagne
    en seize tranches et cachaient ce qu'il fallait lire."""
    off = np.asarray(course.off_km_grid, float)
    es = np.asarray(course.alt_smooth_m, float)
    ymin, ymax = float(es.min()), float(es.max())
    pad = (ymax - ymin) * 0.08
    ax.set_xlim(float(off.min()), float(off.max()))
    ax.set_ylim(ymin, ymax + pad)
    ax.fill_between(off, es, ymin, color=GRID, lw=0, zorder=1)
    # la nuit : une trame diagonale bleu-vert, du sol au plafond ; elle se lit sans légende
    for km0, km1 in nuits:
        ax.axvspan(km0, km1, facecolor="none", edgecolor=SAGE, hatch="///", lw=0,
                   alpha=0.55, zorder=2)
    ax.plot(off, es, color=TERRA, lw=1.4, zorder=4, solid_joinstyle="round")
    _nue(ax, grilles=_paliers(ymin, ymax + pad),
         etiquettes=[f"{fr_num(v, 0)} m" for v in _paliers(ymin, ymax + pad)])
    fin = float(off.max())
    pas = _pas_km(fin)
    # la dernière graduation ronde s'efface si elle vient toucher le kilomètre d'arrivée
    marques = [v for v in np.arange(pas, fin, pas) if fin - v > pas * 0.45]
    _graduations_x(ax, [0.0, *marques], ["km 0", *(fr_num(v, 0) for v in marques)],
                   fin=fr_num(course.length_km, 1))


def _fig_record(twin, calibration, ax) -> None:
    rec = twin.record
    flat = [(p.duration_s, p.vga) for p in rec.points if p.flat]
    cont = [(p.duration_s, p.vga) for p in rec.points if not p.flat]
    if cont:
        c = np.array(cont)
        ax.scatter(c[:, 0] / 60, c[:, 1] * 3.6, s=20, color=DEEPGRID,
                   label="courbe record (ajustée pente)", zorder=3)
    if flat:
        fl = np.array(flat)
        ax.scatter(fl[:, 0] / 60, fl[:, 1] * 3.6, s=34, color=TERRA,
                   label="efforts plats propres (VC)", zorder=4)
    cs = twin.critical_speed
    if cs is not None:
        tt = np.linspace(600, 21600, 200)
        ax.plot(tt / 60, (cs.vc_ms * tt + cs.dprime_m) / tt * 3.6, color=GOLDINK, lw=1.6,
                label=f"modèle VC = {fr_num(cs.vc_kmh, 1)} km/h")
        ax.axhline(cs.vc_kmh, color=SAGE, lw=1.2, ls=(0, (4, 3)))
    if calibration.genuine:
        g = np.array([(u.hours * 60, u.vga_kmh) for u in calibration.genuine])
        ax.scatter(g[:, 0], g[:, 1], s=30, marker="D", color=GREEN,
                   label="vrais ultras", zorder=4)
    ax.set_xscale("log")
    ax.set_xlabel("durée (min, log)")
    ax.set_ylabel("vitesse ajustée (km/h)")
    _fr_axes(ax, y=1)
    ax.xaxis.set_minor_formatter(NullFormatter())
    ax.legend(fontsize=7.4, framealpha=0.9, edgecolor=GRID, loc="upper right")
    ax.set_title("Courbe record ajustée et vitesse critique", fontsize=10.5,
                 color=TERRA, weight="bold", loc="left")




def _fig_cumul(plan, prediction, race, ax, interval_label: str = "50") -> None:
    """L'heure de passage cumulée et sa bande. Ce que la bande est se dit dans la légende de
    la page, pas dans un cartouche posé sur la courbe."""
    segs = plan.segments
    offs = [0.0] + [s.off1 for s in segs]
    cum = [0.0] + [s.cum_clock_h for s in segs]
    lo = [0.0] + [s.lo_h for s in segs]
    hi = [0.0] + [s.hi_h for s in segs]
    on_target = getattr(plan, "anchor", "prediction") == "target"
    ax.set_xlim(0.0, max(offs))
    ax.set_ylim(0.0, max(hi) * 1.06)
    ax.fill_between(offs, lo, hi, color=SAGE, alpha=0.45, lw=0, zorder=1)
    ax.plot(offs, cum, color=TERRA, lw=1.6, zorder=3, solid_joinstyle="round")
    ax.scatter(offs[1:], cum[1:], s=10, color=TERRA, zorder=4)
    # en mode objectif, la prédiction reste sur la même figure : l'écart doit se voir
    if on_target and prediction is not None:
        ax.axhline(prediction.finish_hours, color=SOFT, lw=1.0, ls=(0, (5, 3)), zorder=2)
    paliers = _paliers(0.0, max(hi) * 1.06, combien=3)
    _nue(ax, grilles=paliers, etiquettes=[f"{fr_num(v, 0)} h" for v in paliers])
    fin = max(offs)
    pas = _pas_km(fin)
    marques = [v for v in np.arange(pas, fin, pas) if fin - v > pas * 0.45]
    _graduations_x(ax, [0.0, *marques], ["km 0", *(fr_num(v, 0) for v in marques)],
                   fin=fr_num(fin, 1))


def _fig_validation(prediction, ax, band_pct: float = 5.0) -> bool:
    """Chaque ultra prédit sans lui-même, contre son temps réel. L'aire de données est carrée :
    la diagonale est le message."""
    cv = prediction.cross_validation
    if cv is None or not cv.points:
        return False
    actual = np.array([p[0] for p in cv.points])
    pred = np.array([p[1] for p in cv.points])
    lo = float(min(actual.min(), pred.min())) - 1
    hi = float(max(actual.max(), pred.max())) + 1
    b = band_pct / 100.0
    ax.fill_between([lo, hi], [lo * (1 - b), hi * (1 - b)], [lo * (1 + b), hi * (1 + b)],
                    color=SAGE, alpha=0.35, lw=0, zorder=1)
    ax.plot([lo, hi], [lo, hi], color=SOFT, lw=0.9, ls=(0, (5, 4)), zorder=2)
    ax.scatter(actual, pred, s=30, color=TERRA, zorder=4)
    ax.set_xlim(lo, hi)
    ax.set_ylim(lo, hi)
    ax.set_aspect("equal")
    for bord in ("top", "right"):
        ax.spines[bord].set_visible(False)
    for bord in ("left", "bottom"):
        ax.spines[bord].set_visible(True)
        ax.spines[bord].set_color(TEXT)
        ax.spines[bord].set_linewidth(0.9)
    ax.grid(False)
    ax.tick_params(length=2.5, width=0.8, color=SOFT, labelsize=7, labelcolor=SOFT, pad=2)
    pas = _paliers(lo, hi, combien=3)
    ax.set_xticks(pas)
    ax.set_yticks(pas)
    _fr_axes(ax)
    ax.annotate("temps réel (h)", xy=(hi, lo), xytext=(0, -16), textcoords="offset points",
                fontsize=6.8, color=SOFT, ha="right", va="top", annotation_clip=False)
    ax.annotate("temps prédit, hors-échantillon (h)", xy=(lo, hi), xytext=(-2, 6),
                textcoords="offset points", fontsize=6.8, color=SOFT, ha="left", va="bottom",
                annotation_clip=False)
    return True


def generate_figures(
    course, twin, calibration, prediction, plan, race, out_dir: Path, cfg=None
) -> dict[str, str]:
    """Écrit les figures dans ``out_dir`` ; renvoie {nom: chemin relatif}."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    figures: dict[str, str] = {}
    # libellés/bandes dérivés de la config (repli sur les valeurs historiques sans cfg)
    band_pct = getattr(getattr(cfg, "sufficiency", None), "cv_error_green_pct", 5.0)
    pace_cfg = getattr(cfg, "pacing", None)
    interval_label = (
        f"{pace_cfg.plan_window_high_pct - pace_cfg.plan_window_low_pct:.0f}"
        if pace_cfg else "50"
    )

    # API objet : chaque figure est un objet indépendant, aucun état global partagé
    def _new(figsize: tuple[float, float]) -> Figure:
        fig = Figure(figsize=figsize)
        FigureCanvasAgg(fig)
        return fig

    def _save(fig: Figure, name: str) -> None:
        fig.tight_layout(pad=0.35)
        fig.savefig(out_dir / f"{name}.png", dpi=170)
        figures[name] = f"{name}.png"

    with _RENDER_LOCK:
        # page 1 : la page porte déjà le nom de la course et ses chiffres — pas de titre
        fig = _new((7.1, 1.95))
        _fig_profil(course, fig.subplots(), title=False, nuits=tuple(night_km_ranges(plan)))
        _save(fig, "profil")

        fig = _new((7.4, 3.0))
        _fig_record(twin, calibration, fig.subplots())
        _save(fig, "record")

        fig = _new((7.1, 1.85))
        _fig_cumul(plan, prediction, race, fig.subplots(), interval_label=interval_label)
        _save(fig, "cumul")

        # la seule figure du rapport : son aire de données reste carrée (la diagonale est
        # son message), la toile est juste assez large pour que les axes restent lisibles
        fig = _new((2.9, 2.9))
        if _fig_validation(prediction, fig.subplots(), band_pct=band_pct):
            _save(fig, "validation")

    return figures


__all__ = ["generate_figures"]
