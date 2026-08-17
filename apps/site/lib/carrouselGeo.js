// lib/carrouselGeo.js
//
// Projection Web Mercator et cadrage d'un itinéraire — la géométrie des cartes
// de l'atelier carrousel, côté NAVIGATEUR.
//
// ⚠️ DUPLICATION ASSUMÉE, ET DESTINÉE À DISPARAÎTRE.
// Ce fichier est le portage en JS de `services/live-journal/src/og/geo.ts` : le
// site est en JS, le service en TS, et il n'existe pas encore de package commun.
// Toute correction se fait DES DEUX CÔTÉS, exactement comme `jourParis` l'est
// déjà entre `liveTime.js` et `og/data.ts`. C'est la dette qu'un futur
// `packages/cartes` doit éteindre (tokens + formateurs + géométrie + profil).
//
// Le cadrage se fait sur l'itinéraire COMPLET, jamais sur un segment de journée :
// toutes les cartes d'un même carrousel doivent montrer le même terrain, sinon
// la série glisse d'une image à l'autre et ne se lit plus comme un tout.

export const TILE_SIZE = 256;

/** Abscisse normalisée [0,1] — linéaire en longitude. */
export function normX(lon) {
  return (lon + 180) / 360;
}

/** Ordonnée normalisée [0,1] — Mercator, 0 au nord. */
export function normY(lat) {
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

/**
 * Cadre `coords` dans la fenêtre `fit` et renvoie de quoi projeter n'importe
 * quel point sur le canevas entier.
 *
 * Le zoom EXACT qui cadre l'itinéraire est fractionnaire ; les tuiles n'existent
 * qu'à des zooms entiers. On télécharge donc le zoom entier le plus proche et on
 * rattrape l'écart avec `scale` — sans ça un itinéraire peut n'occuper que la
 * moitié de la fenêtre prévue.
 *
 * @returns {null | {width:number,height:number,zoom:number,scale:number,
 *   tileCanvasWidth:number,tileCanvasHeight:number,originX:number,originY:number,
 *   project:(p:[number,number]) => [number,number]}}
 */
export function fitView(coords, options) {
  const valid = (Array.isArray(coords) ? coords : []).filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
  );
  if (valid.length === 0) return null;

  const { width, height, fit } = options;
  const minZoom = options.minZoom ?? 2;
  const maxZoom = options.maxZoom ?? 16;

  let nx0 = Infinity;
  let nx1 = -Infinity;
  let ny0 = Infinity;
  let ny1 = -Infinity;
  for (const [lon, lat] of valid) {
    const x = normX(lon);
    const y = normY(lat);
    if (x < nx0) nx0 = x;
    if (x > nx1) nx1 = x;
    if (y < ny0) ny0 = y;
    if (y > ny1) ny1 = y;
  }
  // Un itinéraire dégénéré (un point) n'a pas d'étendue : on lui en donne une
  // arbitraire (~1 km) pour que le zoom reste fini.
  const span = 1 / (TILE_SIZE * 2 ** maxZoom);
  const dx = Math.max(nx1 - nx0, span);
  const dy = Math.max(ny1 - ny0, span);

  const zoomExact = Math.max(
    minZoom,
    Math.min(maxZoom, Math.log2(Math.min(fit.width / (dx * TILE_SIZE), fit.height / (dy * TILE_SIZE)))),
  );
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.round(zoomExact)));
  const scale = 2 ** (zoomExact - zoom);

  const world = TILE_SIZE * 2 ** zoom;
  const centerX = ((nx0 + nx1) / 2) * world;
  const centerY = ((ny0 + ny1) / 2) * world;
  // Origine ARRONDIE au pixel : la mosaïque se découpe en pixels entiers et la
  // trace se projette dans le même repère — un demi-pixel d'écart désaligne
  // visiblement un sentier fin de son fond.
  const originX = Math.round(centerX - (fit.x + fit.width / 2) / scale);
  const originY = Math.round(centerY - (fit.y + fit.height / 2) / scale);

  return {
    width,
    height,
    zoom,
    scale,
    tileCanvasWidth: Math.ceil(width / scale),
    tileCanvasHeight: Math.ceil(height / scale),
    originX,
    originY,
    project: ([lon, lat]) => [
      (normX(lon) * world - originX) * scale,
      (normY(lat) * world - originY) * scale,
    ],
  };
}

/** Tuiles nécessaires pour couvrir la mosaïque de la vue, et découpe associée. */
export function tileWindow(view) {
  const max = 2 ** view.zoom;
  const tx0 = Math.floor(view.originX / TILE_SIZE);
  const ty0 = Math.max(0, Math.min(max - 1, Math.floor(view.originY / TILE_SIZE)));
  const tx1 = Math.floor((view.originX + view.tileCanvasWidth - 1) / TILE_SIZE);
  const ty1 = Math.max(
    0,
    Math.min(max - 1, Math.floor((view.originY + view.tileCanvasHeight - 1) / TILE_SIZE)),
  );
  return {
    zoom: view.zoom,
    tx0,
    ty0,
    cols: tx1 - tx0 + 1,
    rows: ty1 - ty0 + 1,
    cropX: view.originX - tx0 * TILE_SIZE,
    cropY: view.originY - ty0 * TILE_SIZE,
  };
}

/**
 * Réduit une polyligne PROJETÉE : on jette les points à moins de `minPx` du
 * dernier retenu. Une trace de plusieurs jours compte des dizaines de milliers
 * de points dont la plupart tombent dans le même pixel. Le DERNIER point est
 * toujours conservé — c'est lui qui porte un éventuel marqueur.
 */
export function decimerPixels(points, minPx = 1.2) {
  if (points.length <= 2) return points;
  const seuil2 = minPx * minPx;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const last = out[out.length - 1];
    const dx = points[i][0] - last[0];
    const dy = points[i][1] - last[1];
    if (dx * dx + dy * dy >= seuil2) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}
