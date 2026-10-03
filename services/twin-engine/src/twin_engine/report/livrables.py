"""Les livrables qui accompagnent le rapport v2 : points d'assistance (fiche détachable et
bracelet), calendrier ICS, GPX avec points de passage, annexe en ligne.

Tout part du plan servi (``PacingPlan``) : les heures centrales et les bornes de la fourchette
de course de chaque segment, le départ et la position de la spec. Rien n'est recalculé ici —
ce module met en forme, il ne prédit pas.
"""

from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from ..course.montees import descentes, montees, pentes
from ..pacing.plan import fmt_clock
from ._format import detex, fr, hm
from .feuille import contact_points, exact_hours, safety_ratios


@dataclass(frozen=True)
class CrewPoint:
    """Un point de passage tel que l'assistance le vit : au plus tôt, central, au plus tard."""
    index: int
    name: str
    km: float
    is_major: bool
    is_finish: bool
    night: bool
    stop_min: float
    central_h: float
    lo_h: float
    hi_h: float
    central: datetime | None
    earliest: datetime | None
    latest: datetime | None

    @property
    def central_clock(self) -> str:
        return _clock(self.central, self.central_h)

    @property
    def earliest_clock(self) -> str:
        return _clock(self.earliest, self.lo_h)

    @property
    def latest_clock(self) -> str:
        return _clock(self.latest, self.hi_h)

    def to_dict(self) -> dict:
        return {
            "index": self.index, "name": self.name, "km": round(self.km, 1),
            "is_major": self.is_major, "is_finish": self.is_finish, "night": self.night,
            "stop_min": round(self.stop_min, 0),
            "central_h": round(self.central_h, 2), "lo_h": round(self.lo_h, 2),
            "hi_h": round(self.hi_h, 2),
            "central": None if self.central is None else self.central.isoformat(),
            "earliest": None if self.earliest is None else self.earliest.isoformat(),
            "latest": None if self.latest is None else self.latest.isoformat(),
            "central_clock": self.central_clock, "earliest_clock": self.earliest_clock,
            "latest_clock": self.latest_clock,
        }


def _clock(when: datetime | None, hours: float) -> str:
    if when is None:
        return f"{fr(hours, 1)} h"
    return fmt_clock(when)


def crew_indices(race, n_segments: int) -> tuple[int, ...]:
    """Segments dont la fin est un point d'assistance (cf. :func:`feuille.contact_points`,
    qui dit en plus si ces points sont déclarés ou seulement supposés)."""
    return contact_points(race, n_segments)[0]


def _point(seg, start, *, is_major: bool, is_finish: bool, lo_h: float, hi_h: float) -> CrewPoint:
    central_h = exact_hours(seg, "cum_clock")
    central = start + timedelta(hours=central_h) if start else None
    earliest = start + timedelta(hours=lo_h) if start else None
    latest = start + timedelta(hours=hi_h) if start else None
    return CrewPoint(
        index=seg.index, name=seg.to, km=float(seg.off1), is_major=is_major,
        is_finish=is_finish, night=bool(seg.night), stop_min=float(seg.stop_min),
        central_h=central_h, lo_h=float(lo_h), hi_h=float(hi_h),
        central=central, earliest=earliest, latest=latest,
    )


def crew_follows_plan(plan) -> bool:
    """Un plan calé sur l'objectif de l'athlète : son assistance lit la fenêtre de ce plan
    (les colonnes au plus tôt / au plus tard du tableau de marche), pas l'intervalle de la
    prédiction, qui ne dit rien de l'allure qu'il s'est choisie."""
    return getattr(plan, "anchor", "prediction") == "target"


def crew_window_label(plan) -> str:
    """Le nom de la fenêtre que l'assistance lit, pour le calendrier et le GPX."""
    return "fenêtre du plan" if crew_follows_plan(plan) else "bornes de sécurité"


def crew_points(plan, race, prediction=None) -> list[CrewPoint]:
    """Les points d'assistance du plan, dans la fenêtre que l'assistance lit.

    Avec la prédiction, les bornes de sécurité de l'arrivée sont étalées sur le temps cumulé
    de chaque passage : l'assistance lit partout la même fenêtre que la première page, et la
    dernière ligne redonne exactement l'arrivée « au plus tôt / au plus tard ». Sur un plan
    calé sur l'objectif, ou sans prédiction, c'est la fenêtre de chaque segment du plan.
    """
    segs = plan.segments
    start = plan.start_time
    majors = set(race.major_base_indices)
    lo_r, hi_r = ((None, None) if prediction is None or crew_follows_plan(plan)
                  else safety_ratios(plan, prediction))

    def bornes(seg) -> tuple[float, float]:
        if lo_r is None:
            return exact_hours(seg, "lo"), exact_hours(seg, "hi")
        cumul = exact_hours(seg, "cum_clock")
        return cumul * lo_r, cumul * hi_r

    points = []
    for i in crew_indices(race, len(segs)):
        lo_h, hi_h = bornes(segs[i])
        points.append(_point(segs[i], start, is_major=(i in majors), is_finish=False,
                             lo_h=lo_h, hi_h=hi_h))
    return points


def finish_point(plan, prediction) -> CrewPoint | None:
    """L'arrivée, encadrée par les BORNES DE SÉCURITÉ de la prédiction (logistique, pas
    pilotage) — ou, sur un plan calé sur l'objectif, par la fenêtre de ce plan."""
    if not plan.segments:
        return None
    last = plan.segments[-1]
    if crew_follows_plan(plan):
        lo_h, hi_h = exact_hours(last, "lo"), exact_hours(last, "hi")
    else:
        lo_h, hi_h = float(prediction.interval_low_h), float(prediction.interval_high_h)
    return _point(last, plan.start_time, is_major=False, is_finish=True, lo_h=lo_h, hi_h=hi_h)


# --------------------------------------------------------------------------- ICS
def _ics_escape(s: str) -> str:
    return (str(s).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            .replace("\r\n", "\\n").replace("\n", "\\n"))


def _ics_fold(line: str) -> str:
    """Repli RFC 5545 : lignes de 75 octets au plus, continuation par un espace."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    out, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > (75 if not out else 74):
            out.append(cur.decode("utf-8"))
            cur = b""
        cur += b
    out.append(cur.decode("utf-8"))
    return "\r\n ".join(out)


def _ics_dt(when: datetime) -> str:
    return when.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def ics_text(points: list[CrewPoint], finish: CrewPoint | None, *, race_name: str,
             athlete: str, ref: str, now: datetime | None = None,
             window: str = "bornes de sécurité") -> str | None:
    """Un événement par point d'assistance : du plus tôt au plus tard, le central dans le
    titre. ``window`` nomme la fenêtre (:func:`crew_window_label`). None sans heure de
    départ (rien à mettre au calendrier)."""
    items = [p for p in points if p.earliest and p.latest] + (
        [finish] if finish and finish.earliest and finish.latest else [])
    if not items:
        return None
    stamp = _ics_dt(now or datetime.now(timezone.utc))
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0",
             "PRODID:-//The Locomotion Lab//Locomotion Twin//FR", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", f"X-WR-CALNAME:{_ics_escape(race_name)} · {_ics_escape(athlete)}"]
    for p in items:
        what = "Arrivée" if p.is_finish else f"km {fr(p.km, 1)} · {p.name}"
        desc = (f"{athlete} · {race_name}\n"
                f"Passage prévu {p.central_clock} ({window} : {p.earliest_clock} – {p.latest_clock})"
                + ("" if p.is_finish else f"\nArrêt prévu par le plan : {fr(p.stop_min, 0)} min")
                + ("\nSection de nuit : frontale" if p.night else "")
                + f"\nRéférence {ref}")
        lines += [
            "BEGIN:VEVENT",
            f"UID:{ref}-{p.index}@thelocomotionlab.com",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{_ics_dt(p.earliest)}",
            f"DTEND:{_ics_dt(p.latest)}",
            f"SUMMARY:{_ics_escape(what)} · {_ics_escape(athlete)} vers {_ics_escape(p.central_clock)}",
            f"DESCRIPTION:{_ics_escape(desc)}",
            f"LOCATION:{_ics_escape(p.name)}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_ics_fold(line) for line in lines) + "\r\n"


# --------------------------------------------------------------------------- GPX
def _xml(s: str) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def gpx_text(course, points: list[CrewPoint], finish: CrewPoint | None, *, race_name: str,
             athlete: str, ref: str, max_track_points: int = 2000,
             window: str = "bornes de sécurité") -> str | None:
    """La trace du parcours et un point de passage par point d'assistance (heure prévue dans la
    description, et sa fenêtre sous le nom ``window``). None si la trace n'a pas de
    coordonnées."""
    lat = getattr(course, "lat_grid", None)
    lon = getattr(course, "lon_grid", None)
    if lat is None or lon is None or len(lat) == 0:
        return None
    lat = np.asarray(lat, float)
    lon = np.asarray(lon, float)
    alt = np.asarray(course.alt_smooth_m, float)
    off = np.asarray(course.off_km_grid, float)
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<gpx version="1.1" creator="Locomotion Twin" xmlns="http://www.topografix.com/GPX/1/1">',
           f"  <metadata><name>{_xml(race_name)} · {_xml(athlete)}</name>"
           f"<desc>Plan Locomotion Twin, référence {_xml(ref)} : heures de passage prévues "
           "aux points d'assistance.</desc></metadata>"]
    for p in points + ([finish] if finish else []):
        la = float(np.interp(p.km, off, lat))
        lo = float(np.interp(p.km, off, lon))
        el = float(np.interp(p.km, off, alt))
        desc = (f"passage prévu {p.central_clock} ({window} {p.earliest_clock} – {p.latest_clock})"
                + ("" if p.is_finish else f" · arrêt {fr(p.stop_min, 0)} min")
                + (" · nuit" if p.night else ""))
        name = "Arrivée" if p.is_finish else f"{p.name} km {fr(p.km, 1)}"
        time = f"<time>{p.central.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}</time>" if p.central else ""
        out.append(f'  <wpt lat="{la:.6f}" lon="{lo:.6f}"><ele>{el:.1f}</ele>{time}'
                   f"<name>{_xml(name)}</name><desc>{_xml(desc)}</desc>"
                   f"<sym>{'Flag, Red' if p.is_finish else 'Flag, Blue'}</sym></wpt>")
    step = max(1, int(np.ceil(len(lat) / max_track_points)))
    out.append(f"  <trk><name>{_xml(race_name)}</name><trkseg>")
    for i in range(0, len(lat), step):
        out.append(f'    <trkpt lat="{lat[i]:.6f}" lon="{lon[i]:.6f}"><ele>{alt[i]:.1f}</ele></trkpt>')
    if (len(lat) - 1) % step:
        out.append(f'    <trkpt lat="{lat[-1]:.6f}" lon="{lon[-1]:.6f}"><ele>{alt[-1]:.1f}</ele></trkpt>')
    out += ["  </trkseg></trk>", "</gpx>"]
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- annexe
_BIB_FIELD = re.compile(r"^\s*(\w+)\s*=\s*[{\"](.*?)[}\"],?\s*$", re.S)


def bibliography(bib_path: Path) -> list[dict]:
    """Les références du gabarit, lues une à une (clé, auteurs, titre, année, support, DOI)."""
    text = Path(bib_path).read_text(encoding="utf-8")
    refs: list[dict] = []
    for m in re.finditer(r"@(\w+)\s*\{\s*([^,\s]+)\s*,(.*?)\n\}", text, re.S):
        body = m.group(3)
        fields: dict[str, str] = {}
        for line in re.split(r",\n", body):
            fm = _BIB_FIELD.match(line.strip() + ("," if not line.strip().endswith(",") else ""))
            if fm:
                fields[fm.group(1).lower()] = re.sub(r"[{}]", "", fm.group(2)).strip()
        refs.append({
            "key": m.group(2), "type": m.group(1).lower(),
            "author": fields.get("author", ""), "title": fields.get("title", ""),
            "year": fields.get("year", ""),
            "where": fields.get("journal") or fields.get("booktitle") or fields.get("publisher") or fields.get("howpublished", ""),
            "doi": fields.get("doi", ""), "url": fields.get("url", ""),
        })
    return refs


def _data_uri(path: Path) -> str | None:
    if not path.exists():
        return None
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def annex_payload(*, ctx: dict, course, twin, calibration, prediction, plan, race, sufficiency,
                  cfg, points: list[CrewPoint], finish: CrewPoint | None, figures_dir: Path | None,
                  bib_path: Path | None, generated_at: datetime | None = None) -> dict:
    """Tout ce que le PDF ne montre plus et que l'annexe en ligne détaille : la méthode, la
    calibration, la validation croisée course par course, la pente au-delà de six heures, le
    plan complet, les points d'assistance, le glossaire et les références. Aucune donnée brute
    d'activité : des agrégats et des phrases."""
    cv = prediction.cross_validation
    cs = twin.critical_speed
    vc_ok = cs is not None and cs.plausible
    genuine = list(calibration.genuine)
    notes_crew = {c.aid_index: c.note for c in race.crew}
    cv_points = []
    if cv is not None and cv.points:
        for k, (actual, pred) in enumerate(cv.points):
            cv_points.append({"reel_h": round(float(actual), 2), "predit_h": round(float(pred), 2),
                              "erreur_pct": round(100.0 * (float(pred) - float(actual)) / float(actual), 1),
                              "date": genuine[k].date if k < len(genuine) else None})
    figs = {}
    if figures_dir is not None:
        for name in ("profil", "record", "validation", "cumul", "pacing", "demande"):
            uri = _data_uri(Path(figures_dir) / f"{name}.png")
            if uri:
                figs[name] = uri
    domain = getattr(sufficiency, "domain", None)
    return {
        "ref": ctx["annex_ref"],
        "version": cfg.report.version,
        "genere_le": (generated_at or datetime.now()).isoformat(timespec="minutes"),
        "athlete": ctx["athlete_plain"],
        "course": {
            "name": course.name, "length_km": round(course.length_km, 1),
            "dplus_m": round(course.dplus_m), "dminus_m": round(course.dminus_m),
            "deq_km": round(course.deq_km, 1), "dplus_per_km": round(course.dplus_per_km, 1),
            "technicity_pct": float(getattr(course, "technicity_pct", 0.0) or 0.0),
            "start_time": race.start_time.isoformat() if race.start_time else None,
            "n_segments": len(course.segments),
            # ce que demande le parcours, mesuré sur le profil : pentes et montées classées
            "pentes": {k: round(v, 2) for k, v in
                       pentes(course, plat_pct=cfg.course.flat_grade_pct).items()},
            "montees": [{k: (round(v, 2) if isinstance(v, float) else v)
                         for k, v in m.to_dict().items()} for m in montees(course)],
            "descentes": [{k: (round(v, 2) if isinstance(v, float) else v)
                           for k, v in d.to_dict().items()} for d in descentes(course)],
            "segments": [{"index": s.index, "to": s.to, "km": round(s.off1, 1),
                          "dist_km": round(s.off_len, 1), "dplus_m": round(s.dplus_m),
                          "dminus_m": round(s.dminus_m), "deq_km": round(s.deq_km, 1),
                          "alt_end_m": round(s.alt_end_m)} for s in course.segments],
            # le profil, allégé pour un écran : la page de l'athlète le dessine sans rien
            # recalculer, avec la nuit par-dessus
            "profil": profil_allege(course),
        },
        # Les heures gardent quatre décimales : la page de l'athlète les écrit à la minute,
        # et deux décimales (36 s) suffisent à la décaler d'une minute sur le PDF.
        "prediction": {
            "central_h": round(prediction.finish_hours, 4), "central": detex(hm(prediction.finish_hours)),
            "plan_low_h": None if prediction.plan_low_h is None else round(prediction.plan_low_h, 4),
            "plan_high_h": None if prediction.plan_high_h is None else round(prediction.plan_high_h, 4),
            "interval_low_h": round(prediction.interval_low_h, 4),
            "interval_high_h": round(prediction.interval_high_h, 4),
            "interval_pct": cfg.prediction.interval_high_pct - cfg.prediction.interval_low_pct,
            "plan_band_pct": cfg.pacing.plan_window_high_pct - cfg.pacing.plan_window_low_pct,
            "interval_source": prediction.interval_source,
            "regime": prediction.regime, "regime_label": detex(ctx["regime_label"]),
            "v_kmh": round(prediction.v_kmh, 2),
            "vc_fraction": None if prediction.vc_fraction is None else round(prediction.vc_fraction, 3),
            "sigma_kmh": round(prediction.sigma_kmh, 3),
            "sd_rel": None if prediction.sd_rel is None else round(prediction.sd_rel, 4),
            "scale_kappa": None if prediction.scale_kappa is None else round(prediction.scale_kappa, 3),
            "scale_dof": None if prediction.scale_dof is None else round(prediction.scale_dof, 2),
            "moving_hours": None if prediction.moving_hours is None else round(prediction.moving_hours, 2),
            "stops_hours": None if prediction.stops_hours is None else round(prediction.stops_hours, 2),
            "night_share_target": None if prediction.night_share_target is None else round(prediction.night_share_target, 3),
            "env_factor": None if prediction.env_factor is None else round(prediction.env_factor, 4),
        },
        "verdict": {
            "verdict": sufficiency.verdict, "confiance": ctx["confidence_plain"],
            "sellable": sufficiency.sellable,
            "reasons": [_plain_verdict(r) for r in sufficiency.reasons],
            "criteria": [c.to_dict() for c in sufficiency.criteria],
            "domain": None if domain is None else domain.to_dict(),
        },
        "jumeau": {
            "vc_kmh": round(cs.vc_kmh, 2) if vc_ok else None,
            "vc_sd_kmh": round(cs.vc_sd * 3.6, 2) if vc_ok else None,
            "dprime_m": round(cs.dprime_m) if vc_ok else None,
            "vc_from_flat": bool(cs.from_flat_efforts) if cs else False,
            "alpha": None if twin.alpha is None else round(twin.alpha, 3),
            "endurance_E": None if twin.endurance_E is None else round(twin.endurance_E, 3),
            "durability_pct": None if twin.durability_pct is None else round(twin.durability_pct, 1),
            "alpha_eff": None if getattr(twin, "alpha_eff", None) is None else round(twin.alpha_eff, 3),
            "alpha_eff_detail": getattr(twin, "alpha_eff_detail", None),
            "alpha_tail": None if getattr(twin, "alpha_tail", None) is None else round(twin.alpha_tail, 3),
            "slope_kappa": getattr(course, "slope_kappa", None),
            "n_activities": len(twin.summaries), "n_ultras": calibration.n_genuine,
            "n_ultras_hr": sum(1 for g in genuine if g.avg_hr is not None),
        },
        "calibration": {
            "regime": calibration.regime, "link": calibration.link,
            "n_genuine": calibration.n_genuine, "n_eff": round(calibration.n_eff, 2),
            "beta": None if calibration.beta is None else [round(b, 5) for b in calibration.beta],
            "sigma_kmh": round(calibration.sigma_kmh, 3),
            "duration_prior": None if calibration.duration_prior is None else {
                "b": round(calibration.duration_prior[0], 4), "lambda": calibration.duration_prior[1],
                "origin": calibration.duration_prior_origin},
            "tail_alpha": None if calibration.tail_alpha is None else round(calibration.tail_alpha, 3),
            "tail_from_h": None if calibration.tail_from_s is None else round(calibration.tail_from_s / 3600, 1),
            "tail_source": calibration.tail_source,
            "level_n_anchored": calibration.level_n_anchored,
            "stops_model": calibration.stops_model,
            "stops_rate_min_per_h": None if calibration.stops_rate is None else round(calibration.stops_rate * 60, 1),
            "stops_rate_origin": calibration.stops_rate_origin,
            "night_coef": None if calibration.night_coef is None else round(calibration.night_coef, 4),
            "notes": list(calibration.notes),
            "ultras": [{
                "date": g.date, "hours": round(g.hours, 2),
                "elapsed_hours": None if g.elapsed_hours is None else round(g.elapsed_hours, 2),
                "vga_kmh": round(g.vga_kmh, 2), "dist_km": round(g.dist_km, 1),
                "dplus_per_km": round(g.dplus_per_km, 1), "avg_hr": g.avg_hr,
                "stops_h": None if g.stops_h is None else round(g.stops_h, 2),
                "night_share": None if g.night_share is None else round(g.night_share, 2),
                "split_ratio": None if g.split_ratio is None else round(g.split_ratio, 3),
            } for g in genuine],
        },
        "validation": None if cv is None else {
            "mae_pct": round(cv.mae_pct, 1), "rmse_pct": round(cv.rmse_pct, 1), "n": cv.n,
            "mae_interpolation_pct": None if cv.mae_interpolation_pct is None else round(cv.mae_interpolation_pct, 1),
            "mae_extrapolation_pct": None if cv.mae_extrapolation_pct is None else round(cv.mae_extrapolation_pct, 1),
            "n_interpolation": cv.n_interpolation, "n_extrapolation": cv.n_extrapolation,
            "points": cv_points,
        },
        "pente": {"servie": detex(ctx.get("pente_servie")) or None,
                  "cout_personnel": detex(ctx.get("cout_de_pente")) or None},
        # où passe le temps prévu : les chiffres de la page « faits » du rapport, en clair
        "ventilation": _ventilation_en_clair(ctx.get("faits", {}).get("ventilation")),
        "plan": {
            **{k: v for k, v in plan.to_dict().items() if k != "segments"},
            "fade_pct": ctx["fade_pct_plain"], "fade_evidence": cfg.report.fade_evidence,
            "stops_policy": ctx["stops_policy_plain"],
            "stops": ctx["stops_plain"],
            "nuit": {
                "sections": [{k: detex(v) if isinstance(v, str) else v for k, v in n.items()}
                             for n in ctx["night_sections"]],
                "heures": detex(ctx["night_hours_hm"]), "part_pct": ctx["night_share_pct"]},
            "parties": [{k: detex(v) if isinstance(v, str) else v for k, v in p.items()}
                        for p in ctx["feuille_parts"]],
            # ce que le formulaire de l'annexe peut reprendre et renvoyer à la spec
            "reglages": [{"aid_index": r.aid_index, "stop_min": r.stop_min,
                          "consigne": r.consigne} for r in race.reglages],
            "nutrition": ({"water_l_per_h": race.nutrition.water_l_per_h,
                           "carbs_g_per_h": race.nutrition.carbs_g_per_h}
                          if race.nutrition.declared else None),
            "crew": [{"aid_index": c.aid_index, "note": c.note} for c in race.crew],
            "segments": [{**s.to_dict(), "consigne": detex(c), "consigne_auto": detex(a)}
                         for s, c, a in zip(plan.segments, ctx["consignes_plain"],
                                            ctx.get("consignes_auto_plain")
                                            or ctx["consignes_plain"])],
        },
        # la note d'assistance voyage avec le point : c'est elle que le formulaire de
        # l'annexe repropose à l'édition
        "assistance": [{**p.to_dict(), "note": notes_crew.get(p.index, "")} for p in points],
        "arrivee": None if finish is None else finish.to_dict(),
        "target": None if ctx.get("target_requested") is False or not ctx.get("target_requested") else {
            "hm": detex(ctx["target_hm"]), "regime": ctx["target_regime"],
            "label": detex(ctx["target_regime_label"]), "plan_ok": ctx["target_plan_ok"],
            "reasons": [detex(r) for r in ctx["target_reasons"]],
        },
        "textes": {
            "profil": detex(ctx.get("opening")),
            "vc": detex(ctx.get("vc_pourtoi")), "endurance": detex(ctx.get("endurance_pourtoi")),
            "durabilite": detex(ctx.get("durability_pourtoi")), "deq": detex(ctx.get("deq_pourtoi")),
            "minetti_exemple": detex(ctx.get("minetti_example")),
            "validation": detex(ctx.get("cv_pourtoi")), "largeur": detex(ctx.get("width_prescription")),
            "strategie": [{"titre": detex(i["title"]), "corps": detex(i["body"])} for i in ctx.get("strategy", [])],
            "limites": [detex(x) for x in ctx["limits"]],
            "honnetete": detex(ctx["honesty"]),
            "hypotheses": [detex(x) for x in ctx["assumptions"]],
        },
        "glossaire": [{"terme": detex(t), "definition": detex(d)} for t, d in ctx.get("glossary", [])],
        "references": bibliography(bib_path) if bib_path else [],
        "figures": figs,
    }


# Assez de points pour qu'un col se voie, assez peu pour que l'annexe reste légère.
POINTS_DE_PROFIL = 600


def profil_allege(course) -> list[list[float]]:
    """Le profil altimétrique en couples [km, altitude], sous-échantillonné pour un écran."""
    km = getattr(course, "off_km_grid", None)
    alt = getattr(course, "alt_smooth_m", None)
    if km is None or alt is None or len(km) == 0 or len(alt) != len(km):
        return []
    km, alt = np.asarray(km, dtype=float), np.asarray(alt, dtype=float)
    indices = np.unique(np.linspace(0, len(km) - 1, min(POINTS_DE_PROFIL, len(km))).astype(int))
    return [[round(float(km[i]), 3), round(float(alt[i]), 1)] for i in indices]


def _ventilation_en_clair(v: dict | None) -> dict | None:
    if not v:
        return None
    return {
        "parts": [{"cle": p["cle"], "quoi": p["quoi"], "hm": detex(p["hm"]),
                   "pct": detex(p["pct"]), "fraction": p["fraction"]} for p in v["parts"]],
        "legende": detex(v.get("legende")),
        "lecture": detex(v.get("lecture")),
    }


def _plain_verdict(reason: str) -> str:
    return (reason.replace("🟢", "confiance pleine").replace("🟠", "confiance réduite")
            .replace("🔴", "non vendu"))


def write_annex(payload: dict, path: Path) -> Path:
    path = Path(path)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


LIVRABLES = ("feuille.pdf", "fiches.pdf", "plan.ics", "plan.gpx", "annexe.json",
             "dossier.json")


def write_livrables(*, context: dict, course, twin, calibration, prediction, plan, race,
                    sufficiency, cfg, out_dir: Path, figures_dir: Path | None,
                    render_pdf: bool = True, generated_at: datetime | None = None) -> dict[str, Path]:
    """Écrit à côté du rapport ce qui l'accompagne : ``feuille.pdf`` (la feuille à emporter),
    ``fiches.pdf`` (une fiche par poste d'assistance, à découper), ``plan.ics``, ``plan.gpx``,
    ``annexe.json``. Renvoie {nom: chemin} pour ce qui a pu être produit (pas de calendrier
    sans heure de départ, pas de GPX sans coordonnées, pas de fiches sans poste)."""
    from .render import build_feuille, build_fiches

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    points = crew_points(plan, race, prediction)
    finish = finish_point(plan, prediction)
    ref = context["annex_ref"]
    athlete = context["athlete_plain"]
    written: dict[str, Path] = {}

    window = crew_window_label(plan)
    ics = ics_text(points, finish, race_name=course.name, athlete=athlete, ref=ref,
                   now=generated_at, window=window)
    if ics:
        (out_dir / "plan.ics").write_text(ics, encoding="utf-8")
        written["plan.ics"] = out_dir / "plan.ics"
    gpx = gpx_text(course, points, finish, race_name=course.name, athlete=athlete, ref=ref,
                   window=window)
    if gpx:
        (out_dir / "plan.gpx").write_text(gpx, encoding="utf-8")
        written["plan.gpx"] = out_dir / "plan.gpx"

    bib = Path(__file__).parent / "latex" / "template" / "references.bib"
    payload = annex_payload(ctx=context, course=course, twin=twin, calibration=calibration,
                            prediction=prediction, plan=plan, race=race, sufficiency=sufficiency,
                            cfg=cfg, points=points, finish=finish, figures_dir=figures_dir,
                            bib_path=bib if bib.exists() else None, generated_at=generated_at)
    written["annexe.json"] = write_annex(payload, out_dir / "annexe.json")

    if render_pdf:
        feuille = build_feuille(context, figures_dir, out_dir / "tex-feuille")
        shutil_copy(feuille, out_dir / "feuille.pdf")
        written["feuille.pdf"] = out_dir / "feuille.pdf"
        if context.get("fiches"):
            fiches = build_fiches(context, figures_dir, out_dir / "tex-fiches")
            shutil_copy(fiches, out_dir / "fiches.pdf")
            written["fiches.pdf"] = out_dir / "fiches.pdf"
    return written


def shutil_copy(src: Path, dst: Path) -> None:
    import shutil

    shutil.copy(src, dst)


__all__ = ["CrewPoint", "LIVRABLES", "crew_follows_plan", "crew_indices", "crew_points",
           "crew_window_label", "finish_point", "ics_text", "gpx_text", "bibliography",
           "annex_payload", "write_annex", "write_livrables"]
