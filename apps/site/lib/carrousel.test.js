// lib/carrousel.test.js
//
// Ce qui se teste sans canvas : la géométrie et le DÉCOUPAGE EN JOURNÉES. Le
// reste (le dessin) se juge à l'œil dans l'atelier — mais le découpage, lui,
// porte des règles qu'on ne veut pas casser sans s'en apercevoir : le recalage
// des kilomètres, le raccord entre segments, l'ancrage des étiquettes.

import { describe, expect, it } from "vitest";

import { fitView, decimerPixels, normX, normY } from "./carrouselGeo";
import {
  ancreDuSegment,
  coupuresDepuisWaypoints,
  coupuresRegulieres,
  cumulKm,
  decouperTrace,
  traceDepuisTrackJson,
} from "./carrouselTrace";

/** Une trace synthétique : une ligne droite plein est, altitude en toit. */
function traceDroite(nPoints = 101, totalKm = 100) {
  const coords = [];
  const profile = [];
  for (let i = 0; i < nPoints; i += 1) {
    const t = i / (nPoints - 1);
    coords.push([6 + t * 1.2, 44.9]);
    profile.push({ km: t * totalKm, alt: 1000 + (t < 0.5 ? t : 1 - t) * 2000 });
  }
  return { schemaVersion: 1, totalKm, dPlusM: 1000, dMinusM: 1000, coords, profile };
}

describe("cumulKm", () => {
  it("recale la longueur géométrique sur la distance annoncée", () => {
    const { coords } = traceDroite();
    const brut = cumulKm(coords);
    const recale = cumulKm(coords, 100);
    expect(brut[brut.length - 1]).not.toBeCloseTo(100, 1);
    expect(recale[recale.length - 1]).toBeCloseTo(100, 6);
  });

  it("est monotone croissant", () => {
    const c = cumulKm(traceDroite().coords, 100);
    for (let i = 1; i < c.length; i += 1) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
  });

  it("ne casse pas sur une polyligne vide", () => {
    expect(cumulKm([])).toEqual([]);
  });
});

describe("traceDepuisTrackJson", () => {
  it("lit un .track.json valide", () => {
    const t = traceDepuisTrackJson(traceDroite());
    expect(t.totalKm).toBe(100);
    expect(t.coords).toHaveLength(101);
    expect(t.cumul[t.cumul.length - 1]).toBeCloseTo(100, 6);
  });

  it("refuse poliment un schéma inconnu", () => {
    expect(traceDepuisTrackJson({ schemaVersion: 2, profile: [] })).toBeNull();
    expect(traceDepuisTrackJson(null)).toBeNull();
  });
});

describe("coupures", () => {
  it("découpe régulièrement", () => {
    expect(coupuresRegulieres(120, 4)).toEqual([30, 60, 90]);
    expect(coupuresRegulieres(120, 1)).toEqual([]);
  });

  it("tire les coupures des waypoints, triées et dédoublonnées", () => {
    const wp = [
      { nom: "Valgaudémar", km: 130.6 },
      { nom: "Arsine", km: 42 },
      { nom: "Vallouise", km: 84 },
      { nom: "doublon", km: 42.04 },
      { nom: "hors trace", km: 999 },
    ];
    expect(coupuresDepuisWaypoints(wp, 170)).toEqual([42, 84, 130.6]);
  });

  it("écarte un waypoint collé au départ ou à l'arrivée", () => {
    expect(coupuresDepuisWaypoints([{ km: 0.2 }, { km: 99.9 }], 100)).toEqual([]);
  });
});

describe("decouperTrace", () => {
  const trace = traceDepuisTrackJson(traceDroite());

  it("produit une journée de plus que de coupures", () => {
    expect(decouperTrace(trace, [25, 50, 75])).toHaveLength(4);
    expect(decouperTrace(trace, [])).toHaveLength(1);
  });

  it("couvre l'itinéraire sans trou ni recouvrement de kilomètres", () => {
    const segs = decouperTrace(trace, [25, 50, 75]);
    expect(segs[0].kmDebut).toBe(0);
    expect(segs[segs.length - 1].kmFin).toBe(100);
    for (let i = 1; i < segs.length; i += 1) {
      expect(segs[i].kmDebut).toBeCloseTo(segs[i - 1].kmFin, 6);
    }
    expect(segs.reduce((s, x) => s + x.distanceKm, 0)).toBeCloseTo(100, 6);
  });

  it("soude les segments : chaque journée reprend au point de la précédente", () => {
    const segs = decouperTrace(trace, [50]);
    const finJ1 = segs[0].coords[segs[0].coords.length - 1];
    // Le premier point de J2 est AVANT ou ÉGAL à la fin de J1 — c'est ce
    // recouvrement d'un point qui empêche le trait de se briser au bivouac.
    expect(segs[1].coords[0][0]).toBeLessThanOrEqual(finJ1[0] + 1e-9);
  });

  it("calcule le D+ de chaque journée séparément", () => {
    const segs = decouperTrace(trace, [50]);
    // Toit à mi-parcours : tout le D+ est dans la première journée.
    expect(segs[0].dPlusM).toBeGreaterThan(900);
    expect(segs[1].dPlusM).toBe(0);
  });

  it("ignore une coupure hors de l'itinéraire", () => {
    expect(decouperTrace(trace, [-5, 250])).toHaveLength(1);
  });

  it("rend une liste vide sans trace", () => {
    expect(decouperTrace(null, [10])).toEqual([]);
  });
});

describe("ancreDuSegment", () => {
  it("choisit le point le plus HAUT du segment à l'écran", () => {
    const segment = {
      coords: [
        [6.0, 44.9],
        [6.1, 45.4], // le plus au nord → l'ordonnée écran la plus petite
        [6.2, 44.8],
      ],
    };
    const project = ([lon, lat]) => [normX(lon) * 1000, normY(lat) * 1000];
    const ancre = ancreDuSegment(segment, project);
    expect(ancre).toEqual(project([6.1, 45.4]));
  });

  it("rend null sur un segment vide", () => {
    expect(ancreDuSegment({ coords: [] }, (c) => c)).toBeNull();
  });
});

describe("fitView", () => {
  const coords = traceDroite().coords;
  const opts = { width: 1080, height: 1350, fit: { x: 72, y: 200, width: 936, height: 600 } };

  it("cadre l'itinéraire dans la fenêtre demandée", () => {
    const view = fitView(coords, opts);
    const xs = coords.map((c) => view.project(c)[0]);
    const ys = coords.map((c) => view.project(c)[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(opts.fit.x - 2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(opts.fit.x + opts.fit.width + 2);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(opts.fit.y - 2);
    expect(Math.max(...ys)).toBeLessThanOrEqual(opts.fit.y + opts.fit.height + 2);
  });

  it("garde un zoom fini sur un itinéraire dégénéré", () => {
    const view = fitView([[6, 44.9]], opts);
    expect(Number.isFinite(view.zoom)).toBe(true);
    expect(view.zoom).toBeLessThanOrEqual(16);
  });

  it("rend null sans coordonnée exploitable", () => {
    expect(fitView([], opts)).toBeNull();
    expect(fitView([[NaN, NaN]], opts)).toBeNull();
  });
});

describe("decimerPixels", () => {
  it("garde toujours le premier et le dernier point", () => {
    const points = Array.from({ length: 500 }, (_, i) => [i * 0.01, 0]);
    const out = decimerPixels(points);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
    expect(out.length).toBeLessThan(points.length);
  });
});
