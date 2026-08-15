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
from matplotlib.ticker import MultipleLocator  # noqa: E402

# palette Locomotion Lab
SAGE = "#8CB9BD"
GOLD = "#EFB159"
GOLDINK = "#D89A2E"
TERRA = "#B67352"
TEXT = "#333333"
BG = "#FEFBF6"
GRID = "#E7E0D4"
DEEPGRID = "#D8CFBE"
GREEN = "#3F8F5B"

_FONTS_DIR = Path(__file__).parent / "latex" / "template" / "fonts"


def _init_style() -> None:
    """Style de marque appliqué UNE fois à l'import (verrou d'import CPython → thread-safe).

    Le rendu utilise l'API OBJET (Figure/FigureCanvasAgg), jamais pyplot : le gestionnaire
    de figures global de pyplot n'est pas thread-safe et deux jobs FastAPI concurrents
    entrelaçaient leurs figures (corruption). Après l'import, rcParams n'est plus jamais
    muté — seulement lu à la création des figures."""
    try:
        for f in ("Ubuntu-R.ttf", "Ubuntu-M.ttf", "Ubuntu-B.ttf"):
            fp = _FONTS_DIR / f
            if fp.exists():
                fm.fontManager.addfont(str(fp))
        matplotlib.rcParams["font.family"] = "Ubuntu"
    except Exception:  # noqa: BLE001 — police = cosmétique, on dégrade
        pass
    matplotlib.rcParams.update({
        "font.size": 10, "text.color": TEXT, "axes.labelcolor": TEXT,
        "xtick.color": TEXT, "ytick.color": TEXT, "axes.edgecolor": "#B9B2A4",
        "figure.facecolor": BG, "axes.facecolor": BG, "savefig.facecolor": BG,
        "axes.linewidth": 0.8, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.7,
    })


_init_style()

# matplotlib n'est PAS thread-safe de bout en bout même en API objet : le parseur mathtext
# (ticks « 10^n » des axes log) partage des caches pyparsing entre threads → ParseException
# sous jobs concurrents. On sérialise donc le RENDU (quelques centaines de ms par rapport,
# négligeable devant XeLaTeX) ; l'API objet reste, elle, garante de l'absence de fuite d'état
# entre figures (pas de registre pyplot global).
_RENDER_LOCK = threading.Lock()


def _fig_profil(course, ax) -> None:
    off = course.off_km_grid
    es = course.alt_smooth_m
    aid = course.aid_km
    ymin, ymax = float(es.min()), float(es.max())
    pad = (ymax - ymin) * 0.08  # un peu d'air en haut seulement
    ax.fill_between(off, es, ymin, color=SAGE, alpha=0.30, lw=0)
    ax.plot(off, es, color=TERRA, lw=1.3)
    for a in aid[1:-1]:
        ax.axvline(a, color=DEEPGRID, lw=0.7, ls=(0, (3, 3)), zorder=0)
    ax.scatter(aid[1:-1], np.interp(aid[1:-1], off, es), s=14, color=GOLDINK, zorder=5)
    # la courbe colle aux axes (pas de marge en bas / gauche / droite)
    ax.set_xlim(float(off.min()), float(off.max()))
    ax.set_ylim(ymin, ymax + pad)
    ax.margins(x=0)
    ax.set_xlabel("distance officielle (km)")
    ax.set_ylabel("altitude (m)")
    ax.set_title(
        f"Profil altimétrique — {course.name} "
        f"({course.length_km:.0f} km, {course.dplus_m:.0f} m D+)",
        fontsize=10.5, color=TERRA, weight="bold", loc="left",
    )


def _fig_record(twin, calibration, ax) -> None:
    rec = twin.record
    flat = [(p.duration_s, p.vga) for p in rec.points if p.flat]
    cont = [(p.duration_s, p.vga) for p in rec.points if not p.flat]
    if cont:
        c = np.array(cont)
        ax.scatter(c[:, 0] / 60, c[:, 1] * 3.6, s=20, color="#C9BCA6",
                   label="courbe record (ajustée pente)", zorder=3)
    if flat:
        fl = np.array(flat)
        ax.scatter(fl[:, 0] / 60, fl[:, 1] * 3.6, s=34, color=TERRA,
                   label="efforts plats propres (VC)", zorder=4)
    cs = twin.critical_speed
    if cs is not None:
        tt = np.linspace(600, 21600, 200)
        ax.plot(tt / 60, (cs.vc_ms * tt + cs.dprime_m) / tt * 3.6, color=GOLDINK, lw=1.6,
                label=f"modèle VC = {cs.vc_kmh:.2f} km/h")
        ax.axhline(cs.vc_kmh, color=SAGE, lw=1.2, ls=(0, (4, 3)))
    if calibration.genuine:
        g = np.array([(u.hours * 60, u.vga_kmh) for u in calibration.genuine])
        ax.scatter(g[:, 0], g[:, 1], s=30, marker="D", color=GREEN,
                   label="vrais ultras", zorder=4)
    ax.set_xscale("log")
    ax.set_xlabel("durée (min, log)")
    ax.set_ylabel("vitesse ajustée (km/h)")
    ax.legend(fontsize=7.4, framealpha=0.9, edgecolor=GRID, loc="upper right")
    ax.set_title("Courbe record ajustée et vitesse critique", fontsize=10.5,
                 color=TERRA, weight="bold", loc="left")


def _fig_demande(course, ax1, ax2) -> None:
    segs = course.segments
    idx = [s.index for s in segs]
    ax1.bar(idx, [s.dplus_m for s in segs], color=TERRA, alpha=0.85, width=0.7)
    ax1.set_ylabel("D+ (m)")
    ax1.set_title("Demande par segment : dénivelé positif", fontsize=10, color=TERRA,
                  weight="bold", loc="left")
    ax1.grid(axis="x", alpha=0)
    ax2.bar(idx, [s.deq_km for s in segs], color=SAGE, alpha=0.9, width=0.7, label="Deq")
    ax2.bar(idx, [s.off_len for s in segs], color=GOLD, alpha=0.5, width=0.4, label="distance réelle")
    ax2.set_ylabel("km")
    ax2.set_xlabel("segment")
    ax2.legend(fontsize=8, edgecolor=GRID)
    ax2.set_title("Distance réelle vs équivalent plat", fontsize=10, color=TERRA,
                  weight="bold", loc="left")
    ax2.grid(axis="x", alpha=0)
    ax2.xaxis.set_major_locator(MultipleLocator(1))


def _fig_pacing(plan, twin, ax) -> None:
    segs = plan.segments
    idx = [s.index for s in segs]
    vgas = [s.v_ga_kmh for s in segs]
    ax.plot(idx, vgas, "-o", color=TERRA, lw=1.6, ms=4, label="vitesse ajustée cible")
    ax.set_ylabel("vitesse ajustée (km/h)", color=TERRA)
    ax.tick_params(axis="y", labelcolor=TERRA)
    ax.set_xlabel("segment")
    ax.xaxis.set_major_locator(MultipleLocator(1))
    cs = twin.critical_speed
    if cs is not None:
        ax.axhline(cs.vc_kmh, color=SAGE, lw=1.0, ls=(0, (4, 3)))
    ax2 = ax.twinx()
    ax2.bar(idx, [s.pace_min_km for s in segs], color=GOLD, alpha=0.30, width=0.6,
            label="allure réelle (min/km)")
    ax2.set_ylabel("allure réelle (min/km)", color=GOLDINK)
    ax2.tick_params(axis="y", labelcolor=GOLDINK)
    ax2.grid(False)
    ax2.invert_yaxis()
    ax.set_title("Plan de pacing : allure ajustée (fade) + allure réelle terrain",
                 fontsize=10, color=TERRA, weight="bold", loc="left")
    ax.legend(fontsize=7.6, loc="upper right", edgecolor=GRID)


def _fig_cumul(plan, prediction, race, ax, interval_label: str = "50") -> None:
    segs = plan.segments
    offs = [s.off1 for s in segs]
    cum = [s.cum_clock_h for s in segs]
    # lo_h/hi_h = FOURCHETTE DE COURSE des segments (bande de planification, défaut
    # interquartile) — le libellé doit venir des percentiles de pacing, pas de la prédiction.
    # MODE OBJECTIF (ADR 0002) : même géométrie, tout autre sens — tolérance d'exécution
    # autour d'une durée CHOISIE. La légende doit le dire, sinon la figure ment.
    on_target = getattr(plan, "anchor", "prediction") == "target"
    tol = getattr(plan, "window_tolerance_pct", None)
    lo = [s.lo_h for s in segs]
    hi = [s.hi_h for s in segs]
    band_label = (f"fenêtre de passage (±{tol:.1f} %)".replace(".", ",")
                  if on_target and tol is not None else
                  f"fourchette de course ({interval_label} %)")
    ax.fill_between(offs, lo, hi, color=SAGE, alpha=0.30, lw=0, label=band_label)
    ax.plot(offs, cum, "-o", color=TERRA, lw=1.6, ms=3.5,
            label="plan sur objectif" if on_target else "temps cumulé (médian)")
    # En mode objectif, on RAPPELLE la prédiction sur la même figure : l'athlète doit voir
    # d'un coup d'œil l'écart entre ce qu'il vise et ce que ses données disent.
    if on_target and prediction is not None:
        ax.axhline(prediction.finish_hours, color=DEEPGRID, lw=1.2, ls=(0, (5, 3)),
                   label="prédiction du moteur")
    ax.set_xlabel("distance officielle (km)")
    ax.set_ylabel("temps depuis le départ (h)")
    ax.legend(fontsize=8, loc="upper left", edgecolor=GRID)
    ax.set_title(
        "Temps de passage cumulé sur ton objectif" if on_target
        else "Temps de passage cumulé et incertitude",
        fontsize=10, color=TERRA, weight="bold", loc="left",
    )


def _fig_validation(prediction, ax, band_pct: float = 5.0) -> bool:
    cv = prediction.cross_validation
    if cv is None or not cv.points:
        return False
    actual = np.array([p[0] for p in cv.points])
    pred = np.array([p[1] for p in cv.points])
    lo, hi = float(min(actual.min(), pred.min())) - 1, float(max(actual.max(), pred.max())) + 1
    ax.plot([lo, hi], [lo, hi], color=DEEPGRID, lw=1.0, ls=(0, (4, 3)))
    # bande = seuil 🟢 de la validation croisée (cfg.sufficiency.cv_error_green_pct) : la même
    # valeur que la légende — plus de « ±5 % » en dur qui mentirait si la config change
    b = band_pct / 100.0
    ax.fill_between([lo, hi], [lo * (1 - b), hi * (1 - b)], [lo * (1 + b), hi * (1 + b)],
                    color=SAGE, alpha=0.18, lw=0)
    ax.scatter(actual, pred, s=42, color=TERRA, zorder=4)
    ax.set_xlabel("temps réel (h)")
    ax.set_ylabel("temps prédit, hors-échantillon (h)")
    ax.set_xlim(lo, hi)
    ax.set_ylim(lo, hi)
    ax.set_aspect("equal")
    ax.set_title(f"Validation croisée (leave-one-out, n={cv.n})", fontsize=10,
                 color=TERRA, weight="bold", loc="left")
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
        fig.tight_layout()
        fig.savefig(out_dir / f"{name}.png", dpi=170)
        figures[name] = f"{name}.png"

    with _RENDER_LOCK:
        fig = _new((7.4, 3.3))
        _fig_profil(course, fig.subplots())
        _save(fig, "profil")

        fig = _new((7.4, 3.5))
        _fig_record(twin, calibration, fig.subplots())
        _save(fig, "record")

        fig = _new((7.4, 4.0))
        ax1, ax2 = fig.subplots(2, 1, sharex=True)
        _fig_demande(course, ax1, ax2)
        _save(fig, "demande")

        fig = _new((7.4, 3.4))
        _fig_pacing(plan, twin, fig.subplots())
        _save(fig, "pacing")

        fig = _new((7.4, 3.4))
        _fig_cumul(plan, prediction, race, fig.subplots(), interval_label=interval_label)
        _save(fig, "cumul")

        fig = _new((4.6, 4.2))
        if _fig_validation(prediction, fig.subplots(), band_pct=band_pct):
            _save(fig, "validation")

    return figures


__all__ = ["generate_figures"]
