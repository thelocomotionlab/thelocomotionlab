// packages/tracking/src/mapStyles.ts
//
// LE LOOK CARTOGRAPHIQUE DU LABO — source unique pour TOUTES les cartes :
// le direct (apps/site/components/live/LiveMap), les replays de page projet
// (<postlivetracking>, <livetracking>) et les cartes GPX posées dans un
// récit (apps/site/components/MapEmbed). Modèle : la nouvelle mouture du
// live, étendue à tout le site.
//
// Trois fonds, mêmes noms partout :
//   • relief — Esri World Topo, relief ombré très lisible (DÉFAUT) ;
//   • topo   — OpenTopoMap ;
//   • sat    — Esri World Imagery.
// Les anciens identifiants (« osm », « satellite ») restent acceptés : les
// balises déjà écrites dans les markdown (initialMapStyle="osm") ne cassent
// pas, elles atterrissent sur le relief.
//
// Une seule teinte de trace, le fuchsia cartographique (hors charte, assumé :
// c'est la seule couleur absente de tous les fonds — routes orange, forêts
// vertes, ombrages bruns), sur liseré blanc pour rester lisible en satellite.
// L'itinéraire PRÉVU est en tirets fins, la trace VÉCUE en plein épais.

import type { Map as MaplibreMap, StyleSpecification } from "maplibre-gl";

/** Identifiants canoniques des fonds. */
export type MapStyleName = "relief" | "topo" | "sat";

/** Les anciens noms, tolérés en entrée (markdown, props) et normalisés. */
const LEGACY: Record<string, MapStyleName> = {
  osm: "relief",
  plan: "relief",
  satellite: "sat",
};

export const DEFAULT_MAP_STYLE: MapStyleName = "relief";

/** « osm » → « relief », « satellite » → « sat », inconnu → relief. */
export function resolveMapStyle(id: string | null | undefined): MapStyleName {
  if (id === "relief" || id === "topo" || id === "sat") return id;
  return LEGACY[String(id ?? "").toLowerCase()] ?? DEFAULT_MAP_STYLE;
}

function raster(tiles: string[], attribution: string, maxzoom: number): StyleSpecification {
  return {
    version: 8,
    sources: {
      raster: { type: "raster", tiles, tileSize: 256, maxzoom, attribution },
    },
    layers: [{ id: "raster", type: "raster", source: "raster" }],
  };
}

export const mapStyles: Record<MapStyleName, StyleSpecification> = {
  relief: raster(
    ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
    "Tiles © Esri — Esri, HERE, Garmin, FAO, NOAA, USGS",
    19,
  ),
  topo: raster(
    [
      "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
      "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
      "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
    ],
    "© OpenTopoMap",
    17,
  ),
  sat: raster(
    ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    "Tiles © Esri",
    19,
  ),
};

/** Les trois entrées du sélecteur, dans l'ordre d'affichage. */
export const MAP_STYLE_OPTIONS: ReadonlyArray<{ id: MapStyleName; label: string }> = [
  { id: "relief", label: "Relief" },
  { id: "topo", label: "Topo" },
  { id: "sat", label: "Satellite" },
];

/** Couleurs des traces (couches maplibre, marqueurs DOM, point de survol). */
export const traceColors = {
  line: "#D6246E",
  casing: "#FFFFFF",
} as const;

/**
 * Pose, sur une carte dont le style est chargé, les quatre couches du design
 * pour deux sources GeoJSON : `reference` (itinéraire prévu, tirets fins) et
 * `done` (trace vécue, plein épais), chacune sur son liseré blanc. Les
 * sources sont créées vides si elles n'existent pas ; on les nourrit ensuite
 * avec `setData`. Idempotent : ne repose pas une couche déjà là.
 */
export function ensureTraceLayers(
  map: MaplibreMap,
  ids: { reference: string; done: string } = { reference: "reference", done: "done" },
) {
  // Une ligne vide, typée comme maplibre l'attend (coordonnées mutables).
  const vide: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [] },
    properties: {},
  };
  for (const source of [ids.reference, ids.done]) {
    if (!map.getSource(source)) map.addSource(source, { type: "geojson", data: vide });
  }
  const couches = [
    {
      id: `${ids.reference}-casing`,
      source: ids.reference,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": traceColors.casing, "line-width": 4.5, "line-opacity": 0.9 },
    },
    {
      id: `${ids.reference}-line`,
      source: ids.reference,
      layout: { "line-join": "round" },
      paint: {
        "line-color": traceColors.line,
        "line-width": 1.8,
        "line-dasharray": [1.5, 2.2],
        "line-opacity": 0.95,
      },
    },
    {
      id: `${ids.done}-casing`,
      source: ids.done,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": traceColors.casing, "line-width": 8, "line-opacity": 0.95 },
    },
    {
      id: `${ids.done}-line`,
      source: ids.done,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": traceColors.line, "line-width": 4.5 },
    },
  ] as const;
  for (const c of couches) {
    if (!map.getLayer(c.id)) map.addLayer({ type: "line", ...c } as never);
  }
}

/** Rétro-compatibilité : l'ancien export `styles`, indexé par les noms canoniques. */
export const styles = mapStyles;
