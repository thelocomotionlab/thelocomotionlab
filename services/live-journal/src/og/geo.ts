// Géométrie des cartes de partage : projection Web Mercator (celle des tuiles
// raster) et CADRAGE d'un itinéraire dans une fenêtre de la carte.
//
// Le cadrage se fait sur l'itinéraire de RÉFÉRENCE, jamais sur la trace vécue :
// le fond doit rester identique du départ à l'arrivée. Sinon la carte glisse
// d'un partage à l'autre, et le fond mis en cache devrait être refabriqué à
// chaque régénération.

export type LonLat = [number, number];

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

/** Fenêtre de cadrage, en pixels du canevas. */
export interface FitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapView {
  /** Dimensions du canevas FINAL (la carte est en pleine page). */
  width: number;
  height: number;
  /** Zoom ENTIER des tuiles téléchargées. */
  zoom: number;
  /**
   * Facteur appliqué à la mosaïque pour retomber sur le canevas final,
   * dans ]0,707 ; 1,414]. Les tuiles n'existent qu'à des zooms entiers, mais
   * l'échelle qui cadre exactement l'itinéraire, elle, est fractionnaire : sans
   * ce facteur, un itinéraire pouvait n'occuper que la MOITIÉ de la fenêtre
   * prévue (mesuré sur le carrousel de la Traversée de Chartreuse).
   */
  scale: number;
  /** Dimensions de la mosaïque AVANT mise à l'échelle, en pixels du zoom. */
  tileCanvasWidth: number;
  tileCanvasHeight: number;
  /** Coin haut-gauche de la mosaïque, en pixels-monde au zoom retenu. */
  originX: number;
  originY: number;
  /** Projection vers les pixels du canevas FINAL. */
  project(p: LonLat): [number, number];
}

export interface FitOptions {
  width: number;
  height: number;
  fit: FitBox;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Cadre `coords` dans `fit` et renvoie de quoi projeter n'importe quel point
 * sur le canevas entier. `null` si les coordonnées ne permettent aucun cadrage.
 */
export function fitView(coords: LonLat[], options: FitOptions): MapView | null {
  const valid = coords.filter(
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
  // Un point unique (ou un itinéraire dégénéré) n'a pas d'étendue : on lui en
  // donne une arbitraire (~1 km) pour que le zoom reste fini.
  const span = 1 / (TILE_SIZE * 2 ** maxZoom);
  const dx = Math.max(nx1 - nx0, span);
  const dy = Math.max(ny1 - ny0, span);

  const zoomFor = (boxW: number, boxH: number) =>
    Math.log2(Math.min(boxW / (dx * TILE_SIZE), boxH / (dy * TILE_SIZE)));

  // Le zoom EXACT qui cadre l'itinéraire est fractionnaire ; on télécharge les
  // tuiles du zoom entier le PLUS PROCHE et on rattrape l'écart en réduisant
  // (ou en agrandissant d'au plus 1,41×) la mosaïque. Arrondir vers le bas
  // coûterait jusqu'à un facteur 2 sur la taille du tracé ; arrondir vers le
  // haut multiplierait le nombre de tuiles par 4.
  const zoomExact = Math.max(minZoom, Math.min(maxZoom, zoomFor(fit.width, fit.height)));
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.round(zoomExact)));
  const scale = 2 ** (zoomExact - zoom);

  const tileCanvasWidth = Math.ceil(width / scale);
  const tileCanvasHeight = Math.ceil(height / scale);

  const world = TILE_SIZE * 2 ** zoom;
  const centerX = ((nx0 + nx1) / 2) * world;
  const centerY = ((ny0 + ny1) / 2) * world;
  // Origine ARRONDIE au pixel : la mosaïque de tuiles se découpe en pixels
  // entiers, et la trace se projette dans le même repère — un demi-pixel de
  // décalage entre les deux les désaligne visiblement sur un sentier fin.
  const originX = Math.round(centerX - (fit.x + fit.width / 2) / scale);
  const originY = Math.round(centerY - (fit.y + fit.height / 2) / scale);

  return {
    width,
    height,
    zoom,
    scale,
    tileCanvasWidth,
    tileCanvasHeight,
    originX,
    originY,
    project: ([lon, lat]) => [
      (normX(lon) * world - originX) * scale,
      (normY(lat) * world - originY) * scale,
    ],
  };
}

export interface TileWindow {
  zoom: number;
  /** Indices de la première tuile (coin haut-gauche). */
  tx0: number;
  ty0: number;
  cols: number;
  rows: number;
  /** Découpe à appliquer à la mosaïque pour retomber sur le canevas. */
  cropX: number;
  cropY: number;
}

/** Tuiles nécessaires pour couvrir la MOSAÏQUE de la vue, et découpe associée. */
export function tileWindow(view: MapView): TileWindow {
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
 * dernier retenu. Une trace vécue de plusieurs jours compte des dizaines de
 * milliers de points dont l'immense majorité tombe dans le même pixel — les
 * garder gonfle le SVG (et donc le PNG) sans rien ajouter à l'image.
 * Le DERNIER point est toujours conservé : c'est lui qui porte le marqueur.
 */
export function decimatePixels(points: Array<[number, number]>, minPx = 1.5): Array<[number, number]> {
  if (points.length <= 2) return points;
  const seuil2 = minPx * minPx;
  const out: Array<[number, number]> = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const last = out[out.length - 1];
    const dx = points[i][0] - last[0];
    const dy = points[i][1] - last[1];
    if (dx * dx + dy * dy >= seuil2) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}
