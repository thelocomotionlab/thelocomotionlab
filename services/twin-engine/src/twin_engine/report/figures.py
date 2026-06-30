"""Figures matplotlib aux couleurs de la marque (twin-theory §7).

Porte figs.py, paramétré : prend les objets en mémoire (parcours, jumeau, calibration,
prédiction, plan) au lieu de relire des fichiers, et écrit les PNG dans un dossier de
sortie. Police Ubuntu depuis le template embarqué ; palette Locomotion Lab.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.font_manager as fm  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
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


def _setup_style() -> None:
    try:
        for f in ("Ubuntu-R.ttf", "Ubuntu-M.ttf", "Ubuntu-B.ttf"):
            fp = _FONTS_DIR / f
            if fp.exists():
                fm.fontManager.addfont(str(fp))
        plt.rcParams["font.family"] = "Ubuntu"
    except Exception:  # noqa: BLE001 — police = cosmétique, on dégrade
        pass
    plt.rcParams.update({
        "font.size": 10, "text.color": TEXT, "axes.labelcolor": TEXT,
        "xtick.color": TEXT, "ytick.color": TEXT, "axes.edgecolor": "#B9B2A4",
        "figure.facecolor": BG, "axes.facecolor": BG, "savefig.facecolor": BG,
        "axes.linewidth": 0.8, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.7,
    })


def _fig_profil(course, ax) -> None:
    off = course.off_km_grid
    es = course.alt_smooth_m
    aid = course.aid_km
    ax.fill_between(off, es, es.min() - 50, color=SAGE, alpha=0.30, lw=0)
    ax.plot(off, es, color=TERRA, lw=1.3)
    for a in aid[1:-1]:
        ax.axvline(a, color=DEEPGRID, lw=0.7, ls=(0, (3, 3)), zorder=0)
    ax.scatter(aid[1:-1], np.interp(aid[1:-1], off, es), s=14, color=GOLDINK, zorder=5, clip_on=False)
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


def _fig_cumul(plan, prediction, race, ax) -> None:
    segs = plan.segments
    offs = [s.off1 for s in segs]
    cum = [s.cum_clock_h for s in segs]
    lo = [s.lo_h for s in segs]
    hi = [s.hi_h for s in segs]
    ax.fill_between(offs, lo, hi, color=SAGE, alpha=0.30, lw=0, label="intervalle 80 %")
    ax.plot(offs, cum, "-o", color=TERRA, lw=1.6, ms=3.5, label="temps cumulé (médian)")
    ax.set_xlabel("distance officielle (km)")
    ax.set_ylabel("temps depuis le départ (h)")
    ax.legend(fontsize=8, loc="upper left", edgecolor=GRID)
    ax.set_title("Temps de passage cumulé et incertitude", fontsize=10, color=TERRA,
                 weight="bold", loc="left")


def _fig_validation(prediction, ax) -> bool:
    cv = prediction.cross_validation
    if cv is None or not cv.points:
        return False
    actual = np.array([p[0] for p in cv.points])
    pred = np.array([p[1] for p in cv.points])
    lo, hi = float(min(actual.min(), pred.min())) - 1, float(max(actual.max(), pred.max())) + 1
    ax.plot([lo, hi], [lo, hi], color=DEEPGRID, lw=1.0, ls=(0, (4, 3)))
    ax.fill_between([lo, hi], [lo * 0.95, hi * 0.95], [lo * 1.05, hi * 1.05],
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


def generate_figures(course, twin, calibration, prediction, plan, race, out_dir: Path) -> dict[str, str]:
    """Écrit les figures dans ``out_dir`` ; renvoie {nom: chemin relatif}."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    _setup_style()
    figures: dict[str, str] = {}

    def _save(name: str) -> None:
        plt.savefig(out_dir / f"{name}.png", dpi=170)
        plt.close()
        figures[name] = f"{name}.png"

    fig, ax = plt.subplots(figsize=(7.4, 3.3))
    _fig_profil(course, ax)
    fig.tight_layout()
    _save("profil")

    fig, ax = plt.subplots(figsize=(7.4, 3.5))
    _fig_record(twin, calibration, ax)
    fig.tight_layout()
    _save("record")

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(7.4, 4.0), sharex=True)
    _fig_demande(course, ax1, ax2)
    fig.tight_layout()
    _save("demande")

    fig, ax = plt.subplots(figsize=(7.4, 3.4))
    _fig_pacing(plan, twin, ax)
    fig.tight_layout()
    _save("pacing")

    fig, ax = plt.subplots(figsize=(7.4, 3.4))
    _fig_cumul(plan, prediction, race, ax)
    fig.tight_layout()
    _save("cumul")

    fig, ax = plt.subplots(figsize=(4.6, 4.2))
    if _fig_validation(prediction, ax):
        fig.tight_layout()
        _save("validation")
    else:
        plt.close()

    return figures


__all__ = ["generate_figures"]
