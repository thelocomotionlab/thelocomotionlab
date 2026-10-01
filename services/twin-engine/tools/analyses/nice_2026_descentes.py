"""Analyse de référence — Nice Côte d'Azur by UTMB 100M, 25-26/09/2026, athlète Val.

Reproduit les chiffres du diagnostic « terrain » à partir du fichier de course brut
(GPX COROS à la seconde : position, altitude barométrique, FC, cadence, distance).

    python nice_2026_descentes.py <course.gpx>

Chaque définition utilisée est une constante nommée en tête de fichier : ce sont elles
qui font foi pour le moteur. Aucune donnée n'est écrite ailleurs qu'en sortie standard.
"""
from __future__ import annotations

import datetime as dt
import sys
import xml.etree.ElementTree as ET

import numpy as np

# --- définitions ---------------------------------------------------------------
KM_OFFICIEL = 167.2            # distance officielle ; la distance montre est ramenée à celle-ci au prorata
V_MOUVEMENT = 0.3              # m/s : en dessous, arrêt
ARRET_MIN_S = 60.0             # un arrêt compte à partir de 60 s continues
SAUT_HORLOGE_S = 3600.0        # un pas d'horloge au-delà est un saut de la montre, pas un arrêt
PENTE_DEMI_BASE_M = 25.0       # pente mesurée sur ±25 m de distance, altitude lissée
PENTE_DESCENTE = -0.08         # descente = pente <= -8 %
CADENCE_COURSE = 74.0          # cadence PAR PIED (148 pas/min) : au-dessus, course ; lissée sur 10 s
FENETRE_M = 250.0              # fenêtres de descente
HACHE_BASCULES_MIN = 1.0       # fenêtre « hachée » : >= 1 bascule course<->marche par minute ...
HACHE_MARCHE = 0.15            # ... ou >= 15 % du temps marché
KM_BASCULE = 100.0             # frontière avant / après analysée
PENTES = [-0.25, -0.18, -0.13, -0.08]   # classes de pente des comparaisons à pente égale

# plan servi (rapport du 20/09, arrivée centrale 33 h 38) : heures de passage centrales, départ 13:00
RAVITOS_KM = [8.1, 16.5, 28.9, 37.6, 50.1, 63.7, 68.4, 83.5, 93.8, 109.8,
              121.8, 128.3, 140.4, 147.4, 156.5, 167.2]
RAVITOS = ["St-Étienne de Tinée", "Cabane des chasseurs", "Collefongue", "Isola",
           "Pont de Paule", "St-Sauveur sur Tinée", "Rimplas", "Venanson",
           "Granges de la Brasque", "Utelle", "Levens", "Chapelle St-Michel",
           "Tourrette-Levens", "Drap", "Villefranche-sur-Mer", "Nice"]
PLAN_CENTRAL = ["14:04", "16:44", "19:03", "20:16", "22:39", "25:13", "26:34", "29:43",
                "32:23", "34:50", "36:57", "39:19", "41:04", "42:27", "44:41", "46:37"]
PLAN_ARRET_S = 300.0           # politique d'arrêt du plan servi : 5 min par poste
KAPPA_AVANT_COURSE = (0.55, 0.50)   # κ montée / descente mesurés sur l'archive avant la course (DIAGNOSTIC §10.15)
FADE_DELTA = 0.15              # dérive uniforme du plan servi


# --- lecture -------------------------------------------------------------------
def lire_gpx(chemin: str) -> dict[str, np.ndarray]:
    ns = {"g": "http://www.topografix.com/GPX/1/1", "x": "http://www.cluetrust.com/XML/GPXDATA/1/0"}
    cols: dict[str, list[float]] = {k: [] for k in ("lat", "lon", "ele", "t", "hr", "cad", "dist")}
    for _, el in ET.iterparse(chemin, events=("end",)):
        if not el.tag.endswith("trkpt"):
            continue
        cols["lat"].append(float(el.get("lat")))
        cols["lon"].append(float(el.get("lon")))
        e = el.find("g:ele", ns)
        cols["ele"].append(float(e.text) if e is not None else np.nan)
        tt = el.find("g:time", ns).text
        cols["t"].append(dt.datetime.fromisoformat(tt.replace("Z", "+00:00")).timestamp())
        ex = el.find("g:extensions", ns)
        for nom, cle in (("hr", "hr"), ("cadence", "cad"), ("distance", "dist")):
            v = ex.find("x:" + nom, ns) if ex is not None else None
            cols[cle].append(float(v.text) if v is not None else np.nan)
        el.clear()
    return {k: np.asarray(v, dtype=float) for k, v in cols.items()}


def reparer_horloge(t: np.ndarray) -> tuple[np.ndarray, list[str]]:
    """Points isolés à l'horodatage aberrant → interpolés ; reculs d'horloge → dérive
    rattrapée en recalant linéairement tout ce qui précède. Départ et arrivée conservés."""
    t = t.astype(float).copy()
    notes: list[str] = []
    for k in range(1, len(t) - 1):
        if (abs(t[k] - t[k - 1]) > SAUT_HORLOGE_S and abs(t[k + 1] - t[k]) > SAUT_HORLOGE_S
                and abs(t[k + 1] - t[k - 1]) < SAUT_HORLOGE_S):
            notes.append(f"point {k} : horodatage aberrant ({t[k] - t[k - 1]:+.0f} s), interpolé")
            t[k] = (t[k - 1] + t[k + 1]) / 2
    for _ in range(50):
        recul = np.where(np.diff(t) < 0)[0]
        if not len(recul):
            break
        k = int(recul[0])
        cible = t[k + 1] - 1.0
        if cible <= t[0]:
            t[: k + 1] = np.minimum(t[: k + 1], cible)
            continue
        echelle = (cible - t[0]) / (t[k] - t[0])
        notes.append(f"point {k} : l'horloge recule de {t[k] - t[k + 1]:.0f} s, dérive rattrapée (×{echelle:.5f})")
        t[: k + 1] = t[0] + (t[: k + 1] - t[0]) * echelle
    return t, notes


# --- mesures -------------------------------------------------------------------
def preparer(a: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    t = a["t"] - a["t"][0]
    d = np.maximum.accumulate(np.nan_to_num(a["dist"]))
    g5 = np.arange(0, d[-1], 5.0)
    zi = np.interp(g5, d, a["ele"])
    k = 11
    zs = np.convolve(np.pad(zi, (k // 2, k // 2), mode="edge"), np.ones(k) / k, mode="valid")
    h = int(PENTE_DEMI_BASE_M / 5.0)
    gr = np.zeros_like(g5)
    gr[h:-h] = (zs[2 * h:] - zs[:-2 * h]) / (2 * PENTE_DEMI_BASE_M)
    pente = np.interp(d, g5, gr)
    pas = np.concatenate([[1.0], np.diff(t)])
    v = np.concatenate([[0.0], np.diff(d)]) / np.maximum(pas, 1e-9)
    mouvement = (v >= V_MOUVEMENT) & (pas <= 10)
    c = a["cad"]
    k = 10
    cad_lisse = np.convolve(np.pad(c, (k // 2, k // 2 - 1), mode="edge"), np.ones(k) / k, mode="valid")
    zc = np.interp(d, g5, zs)
    dz = np.concatenate([[0.0], np.diff(zc)])
    return dict(t=t, d=d, km=d / 1000 * KM_OFFICIEL / (d[-1] / 1000), pente=pente, pas=pas, v=v,
                mouvement=mouvement, court=cad_lisse >= CADENCE_COURSE, hr=a["hr"], dz=dz)


def episodes_arret(p: dict[str, np.ndarray]) -> np.ndarray:
    arret = ~p["mouvement"]
    ep = np.zeros_like(arret)
    i, n = 0, len(arret)
    while i < n:
        if arret[i]:
            j = i
            while j < n and arret[j]:
                j += 1
            if p["pas"][i:j].sum() >= ARRET_MIN_S:
                ep[i:j] = True
            i = j
        else:
            i += 1
    return ep


def segments_contre_plan(p, ep):
    def hm(s):
        h, m = s.split(":")
        return (int(h) - 13) * 3600 + int(m) * 60
    plan = [hm(x) for x in PLAN_CENTRAL]
    t_arret = np.cumsum(np.where(ep, p["pas"], 0.0))
    lignes, pt, ps, pp = [], 0.0, 0.0, 0.0
    for k, km in enumerate(RAVITOS_KM):
        i = min(int(np.searchsorted(p["km"], km)), len(p["t"]) - 1)
        while i < len(p["t"]) - 1 and ep[i]:
            i += 1
        T, S = p["t"][i], t_arret[i]
        mvt_plan = (plan[k] - pp) - (0 if k == len(RAVITOS_KM) - 1 else PLAN_ARRET_S)
        lignes.append((RAVITOS[k], km, plan[k] - pp, T - pt, mvt_plan, (T - pt) - (S - ps), S - ps))
        pt, ps, pp = T, S, plan[k]
    return lignes


def fenetres_descente(p):
    idx = (p["d"] // FENETRE_M).astype(int)
    rows = []
    for w in np.unique(idx):
        s = (idx == w) & p["mouvement"]
        T = p["pas"][s].sum()
        if T < 30:
            continue
        gm = np.average(p["pente"][s], weights=p["pas"][s])
        if gm > PENTE_DESCENTE:
            continue
        marche = p["pas"][s & ~p["court"]].sum() / T
        bascules = np.sum(np.abs(np.diff(p["court"][s].astype(int)))) / (T / 60)
        dist = p["d"][s][-1] - p["d"][s][0] if s.sum() > 1 else FENETRE_M
        dist = FENETRE_M if dist < 0.5 * FENETRE_M else dist
        rows.append((np.mean(p["km"][s]), gm, T, dist / T * 3.6, marche, bascules,
                     np.average(p["hr"][s], weights=p["pas"][s])))
    return np.array(rows)


def repartition_plan(p, ep, ku, kd, fade):
    """Répartit le temps de mouvement RÉEL selon une loi de pente : juge la forme du plan seule."""
    b = np.arange(0, p["d"][-1], 50.0)
    z = np.interp(b, p["d"], np.cumsum(p["dz"]))
    tb = np.interp(b, p["d"], p["t"])
    tm = np.interp(b, p["d"], np.cumsum(np.where(p["mouvement"] & ~ep, p["pas"], 0.0)))
    g = np.clip(np.diff(z) / 50.0, -0.45, 0.45)
    f = (155.4 * g**5 - 30.4 * g**4 - 43.3 * g**3 + 46.3 * g**2 + 19.5 * g + 3.6) / 3.6
    fe = np.where(g > 0, 1 + ku * (f - 1), np.where(g < 0, 1 + kd * (f - 1), f))
    deq = 50.0 * fe
    x = np.cumsum(deq) / deq.sum()
    w = deq / ((1 + fade) - 2 * fade * x)
    kmb = (b[:-1] + b[1:]) / 2 / 1000 * KM_OFFICIEL / (p["d"][-1] / 1000)
    bornes = [0.0] + RAVITOS_KM
    seg = np.clip(np.searchsorted(bornes, kmb) - 1, 0, len(RAVITOS_KM) - 1)
    reel = np.array([np.diff(tm)[seg == s].sum() for s in range(len(RAVITOS_KM))])
    pred = np.array([w[seg == s].sum() for s in range(len(RAVITOS_KM))])
    pred = pred / pred.sum() * reel.sum()
    e = (pred - reel) / 60
    return np.mean(np.abs(e)), np.max(np.abs(e)), np.max(np.abs(np.cumsum(e)))


def vitesse_par_pente(R, sel):
    out = []
    for lo, hi in zip(PENTES[:-1], PENTES[1:]):
        m = sel & (R[:, 1] > lo) & (R[:, 1] <= hi)
        out.append(np.average(R[m, 3], weights=R[m, 2]) if m.sum() >= 2 else np.nan)
    return np.array(out)


def main(chemin: str) -> None:
    a = lire_gpx(chemin)
    a["t"], notes = reparer_horloge(a["t"])
    p = preparer(a)
    ep = episodes_arret(p)
    total = p["t"][-1]
    arret = p["pas"][ep].sum()
    print(f"points : {len(p['t'])} · durée : {total / 3600:.2f} h · distance montre : {p['d'][-1] / 1000:.1f} km")
    for n in notes:
        print("  horloge —", n)
    print(f"\n[1] arrêts : {arret / 3600:.2f} h · mouvement : {(total - arret) / 3600:.2f} h")

    lignes = segments_contre_plan(p, ep)
    mp = sum(l[4] for l in lignes)
    mr = sum(l[5] for l in lignes)
    print(f"[2] mouvement : plan {mp / 3600:.2f} h · réel {mr / 3600:.2f} h ({mr / mp - 1:+.1%})")
    for nom, km, _, _, mvp, mvr, s in lignes:
        print(f"     {nom:22} km {km:5.1f}  mouvement réel / plan {mvr / mvp:4.2f}  arrêt {s / 60:3.0f} min")

    desc = p["mouvement"] & (p["pente"] <= PENTE_DESCENTE)
    av, ap = desc & (p["km"] < KM_BASCULE), desc & (p["km"] >= KM_BASCULE)
    for nom, s in (("avant", av), ("après", ap)):
        print(f"[3] descente {nom} km {KM_BASCULE:.0f} : {p['pas'][s].sum() / 3600:.2f} h, "
              f"dont {100 * p['pas'][s & ~p['court']].sum() / p['pas'][s].sum():.0f} % marché")

    R = fenetres_descente(p)
    avant, apres = R[:, 0] < KM_BASCULE, R[:, 0] >= KM_BASCULE
    hache = (R[:, 5] >= HACHE_BASCULES_MIN) | (R[:, 4] >= HACHE_MARCHE)
    print(f"[4] fenêtres hachées : avant {100 * hache[avant].mean():.0f} % ({R[avant & hache, 2].sum() / 3600:.2f} h)"
          f" · après {100 * hache[apres].mean():.0f} % ({R[apres & hache, 2].sum() / 3600:.2f} h)")
    for nom, s in (("avant", avant), ("après", apres)):
        print(f"     bascules/min {nom} : {np.average(R[s, 5], weights=R[s, 2]):.2f}")
    print(f"     FC après km {KM_BASCULE:.0f} : courable {np.average(R[apres & ~hache, 6], weights=R[apres & ~hache, 2]):.0f}"
          f" · haché {np.average(R[apres & hache, 6], weights=R[apres & hache, 2]):.0f}")

    v_av = vitesse_par_pente(R, avant)
    v_c = vitesse_par_pente(R, apres & ~hache)
    v_h = vitesse_par_pente(R, apres & hache)
    v_h_av = vitesse_par_pente(R, avant & hache)
    print("[5] vitesse à pente égale (km/h) : avant · après courable · après haché · haché avant")
    for i in range(len(PENTES) - 1):
        print(f"     {PENTES[i] * 100:4.0f} à {PENTES[i + 1] * 100:4.0f} % : {v_av[i]:4.1f} · {v_c[i]:4.1f} · {v_h[i]:4.1f} · {v_h_av[i]:4.1f}")
    cls = np.clip(np.searchsorted(PENTES, R[:, 1]) - 1, 0, len(PENTES) - 2)
    L = apres & (R[:, 1] > PENTES[0])
    reel = R[L, 2].sum()
    frais = np.sum(FENETRE_M / 1000 / v_av[cls[L]] * 3600)
    cont = np.sum(FENETRE_M / 1000 / np.where(np.isnan(v_c), v_av, v_c)[cls[L]] * 3600)
    print(f"[6] descentes après km {KM_BASCULE:.0f} : {reel / 3600:.2f} h · perte {(reel - frais) / 60:.0f} min"
          f" = fatigue {(cont - frais) / 60:.0f} + terrain {(reel - cont) / 60:.0f}")
    pen_frais = np.nanmean(1 - v_h_av / v_av)
    pen_fatigue = np.nanmean(1 - v_h / v_c)
    print(f"[7] surcoût du terrain haché : frais {100 * pen_frais:.0f} % · fatigué {100 * pen_fatigue:.0f} %")

    print("[8] forme du plan (temps de mouvement réel imposé) : erreur moy. / pire segment / pire cumul (min)")
    for nom, ku, kd in (("Minetti", 1.0, 1.0), ("κ avant course", *KAPPA_AVANT_COURSE),
                        ("κ, descente sans borne", KAPPA_AVANT_COURSE[0], 0.0)):
        m, w, c = repartition_plan(p, ep, ku, kd, FADE_DELTA)
        print(f"     {nom:24} {m:4.0f} · {w:4.0f} · {c:4.0f}")


if __name__ == "__main__":
    main(sys.argv[1])
