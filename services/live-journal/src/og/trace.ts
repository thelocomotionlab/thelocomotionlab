// Les deux traits posés sur le fond de carte, dans la grammaire EXACTE de la
// carte de /live (LiveMap.jsx) : itinéraire de référence en POINTILLÉS FINS,
// trace vécue en PLEIN ÉPAIS, même fuchsia cartographique sur liseré blanc.
// Le fuchsia est la seule teinte absente des fonds topo (routes orange, forêts
// vertes, ombrages bruns) — voir apps/site/lib/liveTraceColors.js.
//
// Sortie : un SVG TRANSPARENT en data URI, superposé au fond par satori. Deux
// images plutôt qu'une seule composite : le fond (JPEG) ne serait sinon encodé
// en base64 qu'à l'intérieur d'un autre base64 — 33 % de poids pour rien.

import { decimatePixels, type LonLat, type MapView } from "./geo";

export const TRACE_LINE = "#D6246E";
export const TRACE_CASING = "#FFFFFF";

export interface TraceOptions {
  /** Itinéraire prévu, en entier. */
  reference?: LonLat[];
  /** Trace réellement vécue. */
  done?: LonLat[];
  /** Position à marquer (dernier point vécu, ou le départ avant l'aventure). */
  marker?: LonLat | null;
  markerColor?: string;
  markerRing?: string;
}

function polyline(view: MapView, coords: LonLat[] | undefined): string | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const projected = decimatePixels(
    coords
      .filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      .map((c) => view.project(c)),
  );
  if (projected.length < 2) return null;
  return projected.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ");
}

/**
 * Épaisseurs relatives à la largeur du canevas : la même carte se rend en
 * 1080 (story, carrousel) et en 1200 (OG), et un trait fixé en pixels
 * paraîtrait deux fois plus fin sur l'un que sur l'autre.
 */
function echelle(view: MapView): number {
  return view.width / 1080;
}

export function traceSvgDataUri(view: MapView, options: TraceOptions): string | null {
  const k = echelle(view);
  const ref = polyline(view, options.reference);
  const done = polyline(view, options.done);
  if (!ref && !done && !options.marker) return null;

  const parts: string[] = [];

  if (ref) {
    // Liseré d'abord, puis les points : sur un fond satellite ou une forêt
    // sombre, le fuchsia seul se perd.
    parts.push(
      `<path d="M ${ref}" fill="none" stroke="${TRACE_CASING}" stroke-opacity="0.5" stroke-width="${(9 * k).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`,
      `<path d="M ${ref}" fill="none" stroke="${TRACE_LINE}" stroke-width="${(5 * k).toFixed(1)}" stroke-linecap="round" stroke-dasharray="0.1 ${(14 * k).toFixed(1)}"/>`,
    );
  }
  if (done) {
    parts.push(
      `<path d="M ${done}" fill="none" stroke="${TRACE_CASING}" stroke-width="${(14 * k).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`,
      `<path d="M ${done}" fill="none" stroke="${TRACE_LINE}" stroke-width="${(7.5 * k).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  }
  if (options.marker) {
    const [x, y] = view.project(options.marker);
    parts.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(15 * k).toFixed(1)}" fill="${options.markerColor ?? "#B67352"}" stroke="${options.markerRing ?? "#FEFBF6"}" stroke-width="${(5 * k).toFixed(1)}"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" viewBox="0 0 ${view.width} ${view.height}">${parts.join("")}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
