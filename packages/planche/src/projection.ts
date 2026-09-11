// packages/planche/src/projection.ts
//
// PROJECTION WEB MERCATOR ET CADRAGE D'UN ITINÉRAIRE.
//
// LE CADRAGE SE FAIT SUR L'ITINÉRAIRE COMPLET, jamais sur un segment de journée :
// toutes les cartes d'un même carrousel doivent montrer le même terrain, sinon
// la série glisse d'une image à l'autre et ne se lit plus comme un tout. C'est
// aussi pourquoi le document garde une « trace de cadrage » figée : changer la
// tranche de journées ne doit pas recadrer la carte.

import type { Coord } from "@locomotionlab/trace";

export const TILE_SIZE = 256;

/** Abscisse normalisée [0,1] — linéaire en longitude. */
export function normX(lon: number): number {
  return (lon + 180) / 360;
}

/** Ordonnée normalisée [0,1] — Mercator, 0 au nord. */
export function normY(lat: number): number {
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

export type Fenetre = { x: number; y: number; l: number; h: number };

export type Vue = {
  zoom: number;
  /** Rattrapage entre le zoom entier des tuiles et le zoom exact du cadrage. */
  echelle: number;
  originX: number;
  originY: number;
  mosaiqueL: number;
  mosaiqueH: number;
  project(c: Coord): [number, number];
};

export type OptionsVue = {
  zoomMin?: number;
  zoomMax?: number;
  /**
   * LA TOILE, quand elle est plus grande que la fenêtre de cadrage.
   *
   * Une carte plein cadre porte ses tuiles d'un bord à l'autre de la planche,
   * mais n'y CADRE la trace que dans une fenêtre insérée — celle qui laisse la
   * place au bloc de titre posé dessus. Sans cette distinction la mosaïque
   * s'arrêtait au bord de la fenêtre et laissait le reste vide.
   */
  canevas?: { l: number; h: number };
};

/**
 * Cadre `coords` dans la fenêtre et rend de quoi projeter n'importe quel point.
 *
 * Le zoom EXACT qui cadre l'itinéraire est fractionnaire ; les tuiles n'existent
 * qu'à des zooms entiers. On télécharge donc le zoom entier le plus proche et on
 * rattrape l'écart avec `echelle` — sans ça un itinéraire peut n'occuper que la
 * moitié de la fenêtre prévue.
 */
export function cadrer(
  coords: readonly Coord[],
  fenetre: Fenetre,
  options: OptionsVue = {},
): Vue | null {
  const valides = (Array.isArray(coords) ? coords : []).filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
  );
  if (valides.length === 0) return null;

  const zoomMin = options.zoomMin ?? 2;
  const zoomMax = options.zoomMax ?? 16;

  let nx0 = Infinity;
  let nx1 = -Infinity;
  let ny0 = Infinity;
  let ny1 = -Infinity;
  for (const [lon, lat] of valides) {
    const x = normX(lon);
    const y = normY(lat);
    if (x < nx0) nx0 = x;
    if (x > nx1) nx1 = x;
    if (y < ny0) ny0 = y;
    if (y > ny1) ny1 = y;
  }
  // Un itinéraire dégénéré (un point) n'a pas d'étendue : on lui en donne une
  // arbitraire (~1 km) pour que le zoom reste fini.
  const span = 1 / (TILE_SIZE * 2 ** zoomMax);
  const dx = Math.max(nx1 - nx0, span);
  const dy = Math.max(ny1 - ny0, span);

  const exact = Math.max(
    zoomMin,
    Math.min(
      zoomMax,
      Math.log2(Math.min(fenetre.l / (dx * TILE_SIZE), fenetre.h / (dy * TILE_SIZE))),
    ),
  );
  const zoom = Math.max(zoomMin, Math.min(zoomMax, Math.round(exact)));
  const echelle = 2 ** (exact - zoom);

  const monde = TILE_SIZE * 2 ** zoom;
  const centreX = ((nx0 + nx1) / 2) * monde;
  const centreY = ((ny0 + ny1) / 2) * monde;
  // Origine ARRONDIE au pixel : la mosaïque se découpe en pixels entiers et la
  // trace se projette dans le même repère — un demi-pixel d'écart désaligne
  // visiblement un sentier fin de son fond.
  const originX = Math.round(centreX - (fenetre.x + fenetre.l / 2) / echelle);
  const originY = Math.round(centreY - (fenetre.y + fenetre.h / 2) / echelle);

  return {
    zoom,
    echelle,
    originX,
    originY,
    mosaiqueL: Math.ceil((options.canevas?.l ?? fenetre.x + fenetre.l) / echelle),
    mosaiqueH: Math.ceil((options.canevas?.h ?? fenetre.y + fenetre.h) / echelle),
    project: ([lon, lat]: Coord) => [
      (normX(lon) * monde - originX) * echelle,
      (normY(lat) * monde - originY) * echelle,
    ],
  };
}

export type Mosaique = {
  zoom: number;
  tx0: number;
  ty0: number;
  colonnes: number;
  rangs: number;
  coupeX: number;
  coupeY: number;
};

/** Tuiles nécessaires pour couvrir la vue, et découpe associée. */
export function tuilesDeLaVue(vue: Vue): Mosaique {
  const max = 2 ** vue.zoom;
  const tx0 = Math.floor(vue.originX / TILE_SIZE);
  const ty0 = Math.max(0, Math.min(max - 1, Math.floor(vue.originY / TILE_SIZE)));
  const tx1 = Math.floor((vue.originX + vue.mosaiqueL - 1) / TILE_SIZE);
  const ty1 = Math.max(
    0,
    Math.min(max - 1, Math.floor((vue.originY + vue.mosaiqueH - 1) / TILE_SIZE)),
  );
  return {
    zoom: vue.zoom,
    tx0,
    ty0,
    colonnes: tx1 - tx0 + 1,
    rangs: ty1 - ty0 + 1,
    coupeX: vue.originX - tx0 * TILE_SIZE,
    coupeY: vue.originY - ty0 * TILE_SIZE,
  };
}

/**
 * Réduit une polyligne PROJETÉE : on jette les points à moins de `minPx` du
 * dernier retenu.
 *
 * Une trace de plusieurs jours compte des dizaines de milliers de points dont la
 * plupart tombent dans le même pixel. Le DERNIER point est toujours conservé —
 * c'est lui qui porte un éventuel marqueur d'arrivée.
 */
export function decimerPixels(
  points: readonly [number, number][],
  minPx = 1.2,
): [number, number][] {
  if (points.length <= 2) return points.slice();
  const seuil2 = minPx * minPx;
  const out: [number, number][] = [points[0]!];
  for (let i = 1; i < points.length - 1; i += 1) {
    const dernier = out[out.length - 1]!;
    const dx = points[i]![0] - dernier[0];
    const dy = points[i]![1] - dernier[1];
    if (dx * dx + dy * dy >= seuil2) out.push(points[i]!);
  }
  out.push(points[points.length - 1]!);
  return out;
}
