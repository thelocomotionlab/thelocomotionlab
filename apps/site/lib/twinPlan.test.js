// lib/twinPlan.test.js
//
// Ce que ces tests gardent : les heures de la page se lisent dans le fuseau de la
// course, la nuit tombe au bon kilomètre, et un athlète qui ouvre sa page puis la
// renvoie sans rien toucher n'a rien amendé.

import { describe, expect, it } from "vitest";

import { amendementsDuFormulaire, heureApres, nuitsEnKm, placeDuReel } from "./twinPlan.mjs";

const DEPART = "2026-09-25T13:00:00+02:00";

describe("une heure de passage", () => {
  it("se compte depuis le départ, dans le fuseau de la course", () => {
    expect(heureApres(DEPART, 0)).toBe("ven. 13h00");
    expect(heureApres(DEPART, 31.47)).toBe("sam. 20h28");
    expect(heureApres(DEPART, 35.85)).toBe("dim. 00h51");
  });

  it("ne devine rien sans départ", () => {
    expect(heureApres("", 3)).toBe("");
    expect(heureApres(DEPART, null)).toBe("");
  });
});

describe("la nuit sur le profil", () => {
  const segments = [
    { off1: 30, cum_clock_h: 6 },
    { off1: 90, cum_clock_h: 18 },
    { off1: 160, cum_clock_h: 30 },
    { off1: 170, cum_clock_h: 32 },
  ];

  it("va du coucher au lever, ramenée en kilomètres", () => {
    const nuits = nuitsEnKm({ depart: DEPART, sun: { sunset: "19h00", sunrise: "07h00" }, segments });
    expect(nuits).toHaveLength(2);
    // coucher à 19h00 = 6 h après le départ : km 30 ; lever à 07h00 = 18 h après : km 90
    expect(nuits[0].du_km).toBeCloseTo(30, 6);
    expect(nuits[0].au_km).toBeCloseTo(90, 6);
    // la seconde nuit commence 30 h après le départ (km 160) et finit à l'arrivée
    expect(nuits[1].du_km).toBeCloseTo(160, 6);
    expect(nuits[1].au_km).toBeCloseTo(170, 6);
  });

  it("ne pose rien sans heures de soleil", () => {
    expect(nuitsEnKm({ depart: DEPART, sun: {}, segments })).toEqual([]);
  });
});

describe("les amendements", () => {
  const affiche = { arrets: { 4: "15", 6: "5" }, notes: { 4: "bidons" } };

  it("rien de touché, rien d'amendé", () => {
    expect(amendementsDuFormulaire(affiche, affiche)).toEqual({
      arrets: {},
      notes: {},
      nutrition: { eau_l_h: null, glucides_g_h: null },
    });
  });

  it("seul ce qui change devient un amendement", () => {
    const saisi = { arrets: { 4: "20", 6: "5" }, notes: { 4: "bidons + soupe" }, nutrition: { eau_l_h: "0,6", glucides_g_h: "" } };
    expect(amendementsDuFormulaire(affiche, saisi)).toEqual({
      arrets: { 4: 20 },
      notes: { 4: "bidons + soupe" },
      nutrition: { eau_l_h: 0.6, glucides_g_h: null },
    });
  });

  it("un amendement déjà posé reste posé, et un champ vidé le retire", () => {
    const precedents = { arrets: { 6: 5, 4: 15 } };
    const saisi = { arrets: { 4: "15", 6: "" }, notes: { 4: "bidons" } };
    expect(amendementsDuFormulaire(affiche, saisi, precedents).arrets).toEqual({ 4: 15 });
  });
});

describe("la place du réel", () => {
  it("se dit par rapport aux deux bandes", () => {
    expect(placeDuReel(33, [31.5, 35.8], [29.6, 38.1])).toBe("dans la fourchette de course");
    expect(placeDuReel(30, [31.5, 35.8], [29.6, 38.1])).toBe("plus rapide que la fourchette, dans les bornes");
    expect(placeDuReel(40, [31.5, 35.8], [29.6, 38.1])).toBe("au-delà des bornes de sécurité");
    expect(placeDuReel(null, [1, 2], [0, 3])).toBe("");
  });
});
