// Géométrie du fond de carte : projection Web Mercator, cadrage d'un itinéraire
// dans une fenêtre, fenêtre de tuiles, décimation. Tout est déterministe et
// hors ligne — les erreurs de cette couche se voient en pixels, pas en logs.

import { describe, expect, it } from "vitest";

import { decimatePixels, fitView, normX, normY, TILE_SIZE, tileWindow } from "../src/og/geo";
import type { LonLat } from "../src/og/geo";

const CANEVAS = { width: 1080, height: 1920 };
const FENETRE = { x: 96, y: 200, width: 888, height: 800 };

/** Boucle grossière autour de la Chartreuse (~10 km de côté). */
const ITINERAIRE: LonLat[] = [
  [5.80, 45.30],
  [5.90, 45.30],
  [5.90, 45.38],
  [5.80, 45.38],
  [5.80, 45.30],
];

describe("projection Web Mercator", () => {
  it("le méridien de Greenwich et l'équateur tombent au centre du planisphère", () => {
    expect(normX(0)).toBeCloseTo(0.5, 12);
    expect(normY(0)).toBeCloseTo(0.5, 12);
    expect(normX(-180)).toBeCloseTo(0, 12);
    expect(normX(180)).toBeCloseTo(1, 12);
  });

  it("l'ordonnée décroît vers le nord et reste bornée aux pôles", () => {
    expect(normY(45)).toBeLessThan(normY(0));
    expect(normY(89)).toBeGreaterThan(0);
    expect(normY(-89)).toBeLessThan(1);
  });
});

describe("fitView", () => {
  it("cadre l'itinéraire DANS la fenêtre demandée, centré dessus", () => {
    const view = fitView(ITINERAIRE, { ...CANEVAS, fit: FENETRE });
    expect(view).not.toBeNull();
    const pts = ITINERAIRE.map((c) => view!.project(c));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(FENETRE.x - 1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(FENETRE.x + FENETRE.width + 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(FENETRE.y - 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(FENETRE.y + FENETRE.height + 1);

    // Centré : les marges opposées sont égales à ~1 px près (l'origine de la
    // mosaïque est arrondie au pixel entier, ce qui coûte au plus 0,5 px).
    expect(Math.abs(Math.min(...xs) - FENETRE.x - (FENETRE.x + FENETRE.width - Math.max(...xs)))).toBeLessThan(1.5);
    expect(Math.abs(Math.min(...ys) - FENETRE.y - (FENETRE.y + FENETRE.height - Math.max(...ys)))).toBeLessThan(1.5);
  });

  it("LE CAS QUI A MOTIVÉ LE ZOOM FRACTIONNAIRE : l'itinéraire remplit sa fenêtre", () => {
    // Avec un zoom entier arrondi vers le bas, un itinéraire pouvait n'occuper
    // que 50 % de la fenêtre (carrousel de la Traversée de Chartreuse : trace
    // minuscule perdue dans le fond). On exige maintenant ≥ 70 % sur une
    // dimension, quelle que soit l'étendue — donc pour DIX tailles différentes.
    for (let i = 0; i < 10; i += 1) {
      const k = 1 + i * 0.13; // étend progressivement la boîte englobante
      const trace: LonLat[] = ITINERAIRE.map(([lon, lat]) => [5.85 + (lon - 5.85) * k, 45.34 + (lat - 45.34) * k]);
      const view = fitView(trace, { ...CANEVAS, fit: FENETRE })!;
      const pts = trace.map((c) => view.project(c));
      const largeur = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
      const hauteur = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
      const remplissage = Math.max(largeur / FENETRE.width, hauteur / FENETRE.height);
      expect(remplissage, `étendue ×${k.toFixed(2)} : remplissage ${(remplissage * 100).toFixed(0)} %`)
        .toBeGreaterThan(0.7);
    }
  });

  it("le facteur d'échelle reste dans ]0,707 ; 1,414] et le zoom est entier", () => {
    for (let i = 0; i < 20; i += 1) {
      const k = 0.2 + i * 0.37;
      const trace: LonLat[] = ITINERAIRE.map(([lon, lat]) => [5.85 + (lon - 5.85) * k, 45.34 + (lat - 45.34) * k]);
      const view = fitView(trace, { ...CANEVAS, fit: FENETRE })!;
      expect(Number.isInteger(view.zoom)).toBe(true);
      expect(view.scale).toBeGreaterThan(0.7);
      expect(view.scale).toBeLessThanOrEqual(1.4143);
    }
  });

  it("un itinéraire absent, vide ou aberrant ne produit pas de vue", () => {
    expect(fitView([], { ...CANEVAS, fit: FENETRE })).toBeNull();
    expect(fitView([[NaN, NaN]] as LonLat[], { ...CANEVAS, fit: FENETRE })).toBeNull();
  });

  it("un point unique donne une vue valide (zoom borné, pas d'infini)", () => {
    const view = fitView([[5.85, 45.34]], { ...CANEVAS, fit: FENETRE, maxZoom: 15 })!;
    expect(view.zoom).toBe(15);
    const [x, y] = view.project([5.85, 45.34]);
    expect(x).toBeCloseTo(FENETRE.x + FENETRE.width / 2, 0);
    expect(y).toBeCloseTo(FENETRE.y + FENETRE.height / 2, 0);
  });

  it("le zoom est plafonné (les tuiles n'existent pas au-delà)", () => {
    const view = fitView(ITINERAIRE, { ...CANEVAS, fit: FENETRE, maxZoom: 9 })!;
    expect(view.zoom).toBeLessThanOrEqual(9);
  });
});

describe("tileWindow", () => {
  it("la mosaïque couvre TOUT le canevas de tuiles, découpe comprise", () => {
    const view = fitView(ITINERAIRE, { ...CANEVAS, fit: FENETRE })!;
    const w = tileWindow(view);
    expect(w.cropX).toBeGreaterThanOrEqual(0);
    expect(w.cropY).toBeGreaterThanOrEqual(0);
    expect(w.cropX + view.tileCanvasWidth).toBeLessThanOrEqual(w.cols * TILE_SIZE);
    expect(w.cropY + view.tileCanvasHeight).toBeLessThanOrEqual(w.rows * TILE_SIZE);
  });

  it("le nombre de tuiles reste raisonnable pour une story", () => {
    // Garde-fou de politesse envers le fournisseur : on télécharge des dizaines
    // de tuiles, jamais des centaines.
    for (let i = 0; i < 20; i += 1) {
      const k = 0.2 + i * 0.37;
      const trace: LonLat[] = ITINERAIRE.map(([lon, lat]) => [5.85 + (lon - 5.85) * k, 45.34 + (lat - 45.34) * k]);
      const w = tileWindow(fitView(trace, { ...CANEVAS, fit: FENETRE })!);
      expect(w.cols * w.rows, `étendue ×${k.toFixed(2)}`).toBeLessThanOrEqual(120);
    }
  });
});

describe("decimatePixels", () => {
  it("supprime les points confondus mais garde les extrémités", () => {
    const points: Array<[number, number]> = Array.from({ length: 500 }, (_, i) => [100 + i * 0.05, 200]);
    const out = decimatePixels(points, 1.5);
    expect(out.length).toBeLessThan(30);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
  });

  it("ne touche pas à une polyligne déjà espacée", () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [50, 0],
      [50, 50],
    ];
    expect(decimatePixels(points, 1.5)).toEqual(points);
  });

  it("deux points ou moins passent tels quels", () => {
    expect(decimatePixels([[1, 1]])).toEqual([[1, 1]]);
    expect(decimatePixels([])).toEqual([]);
  });
});
