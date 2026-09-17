import { describe, expect, it } from "vitest";

import { depart, duree, heure, nombre, recalcule } from "@/lib/twinTableauMarche.js";

// Le scénario doré du moteur (services/twin-engine, tests/test_report_v3.py), tel que
// l'annexe le sert : sept segments, 830,1 min de mouvement et 50 min d'arrêts pour une
// horloge de 14,6681 h.
const SEGMENTS = [
  { index: 1, to: "Col", t_move_min: 114.8, stop_min: 5, cum_clock_h: 1.91 },
  { index: 2, to: "Refuge", t_move_min: 150.6, stop_min: 5, cum_clock_h: 4.51 },
  { index: 3, to: "Base 1", t_move_min: 148.5, stop_min: 15, cum_clock_h: 7.06 },
  { index: 4, to: "Lac", t_move_min: 129.9, stop_min: 5, cum_clock_h: 9.48 },
  { index: 5, to: "Base 2", t_move_min: 92.1, stop_min: 15, cum_clock_h: 11.1 },
  { index: 6, to: "Crête", t_move_min: 88.9, stop_min: 5, cum_clock_h: 12.83 },
  { index: 7, to: "Arrivée", t_move_min: 105.3, stop_min: 0, cum_clock_h: 14.67 },
];
const HORLOGE = 14.6681 * 60;
const sans = (n) => Array.from({ length: n }, () => false);

describe("recalcule", () => {
  it("sans rien changer, redonne les heures de passage du rapport", () => {
    for (const modele of ["carved", "personal", "spec"]) {
      const { lignes, arrivee } = recalcule({
        segments: SEGMENTS,
        arrets: SEGMENTS.map((s) => String(s.stop_min)),
        figes: sans(SEGMENTS.length),
        modele,
        horlogeMin: HORLOGE,
      });
      for (const l of lignes) {
        expect(Math.abs(l.cumul - l.cum_clock_h * 60)).toBeLessThan(0.5);
      }
      expect(Math.abs(arrivee - HORLOGE)).toBeLessThan(0.5);
    }
  });

  it("modèle « spec » : un arrêt plus long recule l'arrivée d'autant", () => {
    const arrets = SEGMENTS.map((s, i) => String(i === 5 ? 25 : s.stop_min));
    const figes = SEGMENTS.map((_, i) => i === 5);
    const { arrivee, ecart } = recalcule({ segments: SEGMENTS, arrets, figes, modele: "spec", horlogeMin: HORLOGE });
    expect(ecart).toBeCloseTo(20, 6);
    expect(arrivee - HORLOGE).toBeCloseTo(20, 1);
  });

  it("modèle « carved » : l'horloge ne bouge pas, le mouvement se resserre", () => {
    const arrets = SEGMENTS.map((s, i) => String(i === 5 ? 25 : s.stop_min));
    const figes = SEGMENTS.map((_, i) => i === 5);
    const r = recalcule({ segments: SEGMENTS, arrets, figes, modele: "carved", horlogeMin: HORLOGE });
    expect(r.arrivee).toBeCloseTo(HORLOGE, 1);
    expect(r.arretsTotal).toBeCloseTo(70, 6);
    expect(r.mouvementTotal).toBeCloseTo(HORLOGE - 70, 1);
    // le profil du mouvement garde ses proportions : c'est la vitesse qui monte, pas la forme
    const avant = SEGMENTS.map((s) => s.t_move_min);
    const facteur = r.lignes[0].mouvement / avant[0];
    for (const [i, l] of r.lignes.entries()) expect(l.mouvement / avant[i]).toBeCloseTo(facteur, 9);
  });

  it("modèle « personal » : l'arrêt écrit est retenu, le reste du budget se répartit", () => {
    const arrets = SEGMENTS.map((s, i) => String(i === 5 ? 25 : s.stop_min));
    const figes = SEGMENTS.map((_, i) => i === 5);
    const r = recalcule({ segments: SEGMENTS, arrets, figes, modele: "personal", horlogeMin: HORLOGE });
    const budget = HORLOGE - SEGMENTS.reduce((t, s) => t + s.t_move_min, 0);
    expect(r.arretsTotal).toBeCloseTo(budget, 6);
    expect(r.lignes[5].arret).toBe(25);
    expect(r.arrivee).toBeCloseTo(HORLOGE, 6);
    // les points non écrits gardent leurs proportions entre eux
    expect(r.lignes[2].arret / r.lignes[0].arret).toBeCloseTo(3, 9);
  });

  it("modèle « personal » : des arrêts écrits au-delà du budget reculent l'arrivée", () => {
    const arrets = SEGMENTS.map((s, i) => String(i === 5 ? 120 : s.stop_min));
    const figes = SEGMENTS.map((_, i) => i === 5);
    const r = recalcule({ segments: SEGMENTS, arrets, figes, modele: "personal", horlogeMin: HORLOGE });
    expect(r.arretsTotal).toBe(120);
    expect(r.lignes.slice(0, 5).every((l) => l.arret === 0)).toBe(true);
    expect(r.arrivee).toBeGreaterThan(HORLOGE);
  });

  it("un champ vide garde l'arrêt du rapport, un négatif est ramené à zéro", () => {
    const arrets = SEGMENTS.map((s, i) => (i === 0 ? "" : i === 1 ? "-4" : String(s.stop_min)));
    const r = recalcule({ segments: SEGMENTS, arrets, figes: sans(7), modele: "spec", horlogeMin: HORLOGE });
    expect(r.lignes[0].arret).toBe(5);
    expect(r.lignes[1].arret).toBe(0);
  });
});

describe("heures de la course", () => {
  it("lit l'heure de la COURSE, pas celle du navigateur", () => {
    const dep = depart("2026-09-25T13:00:00+02:00");
    expect(heure(dep, 0)).toBe("ven. 13h00");
    expect(heure(dep, 14.6681 * 60)).toBe("sam. 03h40");
  });

  it("sans décalage déclaré, l'heure écrite est l'heure lue", () => {
    expect(heure(depart("2026-09-25T13:00:00"), 0)).toBe("ven. 13h00");
    expect(heure(depart("2026-09-25T11:00:00Z"), 0)).toBe("ven. 11h00");
  });

  it("sans départ connu, rien n'est inventé", () => {
    expect(heure(depart(null), 120)).toBe("—");
    expect(heure(depart("pas une date"), 0)).toBe("—");
  });

  it("durées et nombres à la française", () => {
    expect(duree(187)).toBe("3 h 07");
    expect(duree(-5)).toBe("0 h 00");
    expect(nombre("12,5")).toBe(12.5);
    expect(nombre("")).toBe(null);
  });
});
