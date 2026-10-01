"""Le banc depuis le tableau de bord : rejouer les vrais ultras d'un athlète sur son archive
conservée.

L'écran Athlète liste les vrais ultras que la calibration a retenus (:func:`ultras`) ; on
saisit le temps officiel d'une course, et « Rejouer au banc » (:func:`rejouer`) fabrique
son entrée : l'activité du jour est retrouvée dans l'archive (jour ± 1, durée la plus proche
du temps officiel), sa trace sert de parcours (mode GPX seul), et le jumeau est celui que
l'archive donnait la veille (``registre.walkforward``). Un seul décodage pour toutes les
courses demandées.

La trace est rangée avec l'athlète (``athletes/<id>/banc/``) : elle part avec lui. Les
entrées vont au livre banc du tableau de bord (``registre-banc/banc/``), un run par passage,
sous le pseudo de l'athlète et son identifiant ; elles deviennent anonymes quand il est
effacé, et l'export du registre les sort sans l'identifiant.
"""

from __future__ import annotations

import shutil
import tempfile
from datetime import date, timedelta, timezone
from pathlib import Path

import numpy as np

from ..config import Config
from ..registre import Depot as Registre
from ..registre import LIVRE_BANC, entete_de_run, lire_entrees
from ..registre.walkforward import ArchiveCache, backtest_race, parse_time_h
from .depot import Depot
from .jumeau import JumeauIllisible, lire_la_calibration
from .magasin import Magasin


class BancImpossible(RuntimeError):
    """Le banc ne peut pas tourner pour cet athlète (archive purgée, course introuvable)."""


def registre_du_tableau_de_bord(cfg: Config) -> Registre:
    """Le livre banc du tableau de bord, sur le volume du moteur."""
    return Registre(Path(cfg.data_dir) / "registre-banc")


def ultras(magasin: Magasin, cfg: Config, athlete_id: str) -> list[dict]:
    """Les vrais ultras de la calibration (date, durée, distance, D+), avec le dernier résultat
    rejoué au banc pour chacun."""
    try:
        calibration = lire_la_calibration(magasin.athletes.repertoire(athlete_id))
    except JumeauIllisible:
        return []
    rejoues = {e["date"]: e for e in entrees_de(cfg, athlete_id)}
    out = []
    for g in calibration.genuine:
        jour = g.date.isoformat() if hasattr(g.date, "isoformat") else str(g.date or "")
        e = rejoues.get(jour)
        p = (e or {}).get("prediction") or {}
        out.append({"date": jour, "heures": round(float(g.hours), 2),
                    "distance_km": round(float(g.dist_km), 1), "dplus_m": round(float(g.dplus_m)),
                    "rejoue": None if e is None else {
                        "officiel_h": e.get("official_time_h"), "central_h": p.get("central_h"),
                        "err_pct": p.get("err_pct"), "in_plan": p.get("in_plan"),
                        "in_safety": p.get("in_safety"),
                        "verdict": (e.get("model") or {}).get("verdict")}})
    return sorted(out, key=lambda u: u["date"], reverse=True)


def entrees_de(cfg: Config, athlete_id: str) -> list[dict]:
    """Les entrées du livre banc du tableau de bord pour cet athlète ; pour une course
    rejouée plusieurs fois, celle du run le plus récent."""
    if not athlete_id:
        return []
    registre = registre_du_tableau_de_bord(cfg)
    out: dict[str, dict] = {}
    for run in sorted(registre.banc.glob("*.json")):
        _, entrees = lire_entrees(run)
        for e in entrees:
            if e.get("athlete_id") == athlete_id:
                out[e.get("date")] = e
    return list(out.values())


def _trace_gpx(lat: np.ndarray, lon: np.ndarray, alt: np.ndarray, pas_s: int = 5) -> bytes:
    """La trace d'une activité en GPX de parcours (positions et altitude, un point toutes les
    ``pas_s`` secondes, sans heure)."""
    ok = np.isfinite(lat) & np.isfinite(lon)
    idx = np.flatnonzero(ok)[::pas_s]
    alt = np.where(np.isfinite(alt), alt, np.nan)
    med = float(np.nanmedian(alt)) if np.isfinite(alt).any() else 0.0
    pts = "".join(f'<trkpt lat="{lat[i]:.6f}" lon="{lon[i]:.6f}">'
                  f'<ele>{(alt[i] if np.isfinite(alt[i]) else med):.1f}</ele></trkpt>' for i in idx)
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<gpx version="1.1" creator="twin-engine" xmlns="http://www.topografix.com/GPX/1/1">'
            f'<trk><trkseg>{pts}</trkseg></trk></gpx>').encode()


def _calendrier(act) -> dict | None:
    """Départ en heure locale (fuseau solaire de la longitude) et position médiane."""
    from datetime import timedelta as _td

    if act.start_time is None:
        return None
    ok = np.isfinite(act.lat) & np.isfinite(act.lon)
    if not ok.any():
        return None
    la, lo = float(np.median(act.lat[ok])), float(np.median(act.lon[ok]))
    tz = float(round(lo / 15.0))
    return {"start_local": act.start_time.astimezone(timezone(_td(hours=tz))),
            "lat": la, "lon": lo, "tz": tz}


def rejouer(*, athlete_id: str, courses: list[dict], magasin: Magasin, cfg: Config,
            depot: Depot | None = None, avancer=None) -> dict:
    """Rejoue au banc les ``courses`` demandées (``[{date, officiel | abandon, nom?}]``) sur
    l'archive conservée de l'athlète ; écrit un run au livre banc du tableau de bord et rend
    son identifiant et ses entrées."""
    from ..ingest import iter_activities

    athlete = magasin.athletes.lire(athlete_id)
    if athlete is None:
        raise KeyError(athlete_id)
    if not athlete.get("depot_id") or (athlete.get("archive") or {}).get("purgee_le"):
        raise BancImpossible("l'archive n'est plus conservée : le banc ne peut plus la relire")
    demandes = []
    for c in courses:
        jour = date.fromisoformat(str(c["date"]))
        officiel = None if c.get("abandon") else parse_time_h(c.get("officiel"))
        if officiel is None and not c.get("abandon"):
            raise BancImpossible(f"{jour} : temps officiel manquant")
        demandes.append({"jour": jour, "officiel": officiel, "abandon": bool(c.get("abandon")),
                         "nom": str(c.get("nom") or f"Ultra du {jour.isoformat()}")})
    if not demandes:
        raise BancImpossible("aucune course demandée")

    temporaire = Path(tempfile.mkdtemp(dir=cfg.data_dir, prefix="banc-"))
    traces = magasin.athletes.repertoire(athlete_id) / "banc"
    try:
        if avancer:
            avancer("récupération de l'archive")
        nom = (athlete.get("archive") or {}).get("nom") or "archive.zip"
        archive = (depot or Depot()).telecharger(
            athlete["depot_id"], temporaire / Path(nom).name,
            sha256=(athlete.get("archive") or {}).get("sha256") or None)
        meilleures: dict[int, tuple] = {}

        def _tee(flux):
            for act in flux:
                if act.start_time is not None:
                    jour = act.start_time.date()
                    for k, d in enumerate(demandes):
                        if abs((jour - d["jour"]).days) > 1:
                            continue
                        cible = d["officiel"] or 0.0
                        score = (abs((jour - d["jour"]).days),
                                 abs(act.duration_s / 3600.0 - cible) if cible else -act.duration_s)
                        if k not in meilleures or score < meilleures[k][0]:
                            meilleures[k] = (score, act.lat.copy(), act.lon.copy(),
                                             act.alt_m.copy(), _calendrier(act))
                yield act

        if avancer:
            avancer("décodage de l'archive")
        cache = ArchiveCache(archive, cfg, stream=_tee(iter_activities(archive, running_only=True)),
                             bavard=False)
        traces.mkdir(parents=True, exist_ok=True)
        entrees = []
        for k, d in enumerate(demandes):
            if k not in meilleures:
                raise BancImpossible(f"{d['jour']} : aucune activité ce jour-là dans l'archive")
            _, lat, lon, alt, meta = meilleures[k]
            gpx = traces / f"{d['jour'].isoformat()}.gpx"
            gpx.write_bytes(_trace_gpx(lat, lon, alt))
            if avancer:
                avancer(f"coupure la veille du {d['jour'].isoformat()}")
            e = backtest_race(cache, {"name": d["nom"], "date": d["jour"].isoformat(),
                                      "until": (d["jour"] - timedelta(days=1)).isoformat(),
                                      "official_time": d["officiel"], "dnf": d["abandon"],
                                      "gpx": gpx.name}, cfg, base=traces, race_meta=meta)
            entrees.append({"athlete": athlete.get("pseudo") or athlete_id,
                            "athlete_id": athlete_id, "source": "tableau-de-bord", **e})
        entete = entete_de_run(cfg, livre=LIVRE_BANC, label="tableau-de-bord")
        chemin = registre_du_tableau_de_bord(cfg).ecrire_run(entete, entrees)
        return {"run": chemin.stem, "entrees": entrees}
    finally:
        shutil.rmtree(temporaire, ignore_errors=True)


def anonymiser(cfg: Config, athlete_id: str, opaque: str) -> int:
    """Les entrées de l'athlète au livre banc du tableau de bord passent sous ``opaque``,
    sans son identifiant ni le lieu de départ de ses courses (l'athlète est effacé : son
    droit l'emporte sur l'immuabilité d'un run de travail) ; rend leur nombre."""
    import json

    if not athlete_id:
        return 0
    n = 0
    for run in registre_du_tableau_de_bord(cfg).banc.glob("*.json"):
        brut = json.loads(run.read_text(encoding="utf-8"))
        touche = False
        for e in brut.get("entries") or []:
            if e.get("athlete_id") == athlete_id:
                e["athlete"] = opaque
                e.pop("athlete_id", None)
                e["race_meta"] = None
                touche = True
                n += 1
        if touche:
            run.write_text(json.dumps(brut, ensure_ascii=False, indent=2), encoding="utf-8")
    return n


__all__ = ["BancImpossible", "anonymiser", "entrees_de", "registre_du_tableau_de_bord",
           "rejouer", "ultras"]
