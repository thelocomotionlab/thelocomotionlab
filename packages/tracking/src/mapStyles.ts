// packages/tracking/src/mapStyles.ts
//
// Styles de fond de carte (raster) — référence stable au niveau module : pas de
// réinit de la carte à chaque render (règle react-hooks/exhaustive-deps).
// Identiques à l'historique (OpenTopoMap / OpenStreetMap / Esri World Imagery).

import type { StyleSpecification } from "maplibre-gl";
import type { MapStyleId } from "./types";

export const styles: Record<MapStyleId, StyleSpecification> = {
  topo: {
    version: 8,
    sources: {
      opentopo: {
        type: "raster",
        tiles: [
          "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: "© OpenTopoMap contributors",
      },
    },
    layers: [{ id: "opentopo", type: "raster", source: "opentopo" }],
  },
  osm: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  },
  satellite: {
    version: 8,
    sources: {
      esri: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Tiles © Esri",
      },
    },
    layers: [{ id: "esri", type: "raster", source: "esri" }],
  },
};
