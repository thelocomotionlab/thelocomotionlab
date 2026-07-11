// components/live/LiveMap.jsx
//
// La carte de l'état « En cours » (design 2a/2d) — composant du SITE :
// packages/tracking (replays des projets) n'est pas touché. maplibre-gl en
// import direct, chargé dynamiquement par LiveEnCours (ssr:false).
// Style : trace prévisionnelle pointillée brun sur liseré crème, trace vécue
// ambre sur liseré crème, marqueur coureur à halo pulsant. Les deux traces
// sont SIMPLIFIÉES (Douglas-Peucker) avant affichage.

"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { simplifyTrack } from "@/lib/simplify";

const RASTER_STYLES = {
  // Fond « Plan » (OSM standard) : le même que les cartes des projets
  // (packages/tracking) — fond par défaut.
  osm: {
    version: 8,
    sources: {
      raster: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "raster", type: "raster", source: "raster" }],
  },
  topo: {
    version: 8,
    sources: {
      raster: {
        type: "raster",
        tiles: [
          "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: "© OpenTopoMap",
      },
    },
    layers: [{ id: "raster", type: "raster", source: "raster" }],
  },
  sat: {
    version: 8,
    sources: {
      raster: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles © Esri",
      },
    },
    layers: [{ id: "raster", type: "raster", source: "raster" }],
  },
};

function lineFeature(coords) {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: {},
  };
}

function boundsOf(coords) {
  const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
  for (const c of coords) bounds.extend(c);
  return bounds;
}

// Couleurs des traces par fond : sur le Plan OSM (fond par défaut, coloré),
// on reprend la paire éprouvée des cartes de projets — itinéraire bleu,
// vécu orange ; sur Topo/Satellite, la palette du design live (brun/ambre).
const TRACE_COLORS = {
  osm: { reference: "#007bff", done: "#ff5500" },
  topo: { reference: "#9A6044", done: "#EFB159" },
  sat: { reference: "#9A6044", done: "#EFB159" },
};

/** Les 4 couches du design (2 halos crème + itinéraire pointillé + vécu). */
function addTrackLayers(map, styleId) {
  const colors = TRACE_COLORS[styleId] ?? TRACE_COLORS.osm;
  map.addSource("reference", { type: "geojson", data: lineFeature([]) });
  map.addSource("done", { type: "geojson", data: lineFeature([]) });
  map.addLayer({
    id: "rfc",
    type: "line",
    source: "reference",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#FEFBF6", "line-width": 6, "line-opacity": 0.6 },
  });
  map.addLayer({
    id: "rfl",
    type: "line",
    source: "reference",
    layout: { "line-join": "round" },
    paint: {
      "line-color": colors.reference,
      "line-width": 2.4,
      "line-dasharray": [2, 1.6],
      "line-opacity": 0.8,
    },
  });
  map.addLayer({
    id: "rdc",
    type: "line",
    source: "done",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#FEFBF6", "line-width": 8 },
  });
  map.addLayer({
    id: "rdl",
    type: "line",
    source: "done",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.done, "line-width": 4.5 },
  });
}

function pushData(map, data) {
  map.getSource("reference")?.setData(lineFeature(data.reference));
  map.getSource("done")?.setData(lineFeature(data.done));
}

// Marqueur des trois modes du design : halo pulsant + cœur.
// live = #EFB159/#B67352 · depart (Avant) = #8CB9BD · arrivee (Terminé) = #6E9CA0.
const MARKER_COLORS = {
  live: { halo: "#EFB159", core: "#B67352" },
  depart: { halo: "#8CB9BD", core: "#8CB9BD" },
  arrivee: { halo: "#6E9CA0", core: "#6E9CA0" },
};

function runnerElement(mode) {
  const colors = MARKER_COLORS[mode] ?? MARKER_COLORS.live;
  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:18px;height:18px;";
  const halo = document.createElement("div");
  halo.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${colors.halo};animation:ll-pulse 2.4s ease-out infinite;`;
  const core = document.createElement("div");
  core.style.cssText = `position:absolute;inset:3px;border-radius:50%;background:${colors.core};box-shadow:0 0 0 3px #FEFBF6,0 4px 12px rgba(0,0,0,0.35);`;
  el.append(halo, core);
  return el;
}

export default function LiveMap({ referenceCoords, doneCoords, mapStyle, markerMode = "live" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const fittedRef = useRef("none"); // "none" | "done" | "reference"
  const dataRef = useRef({ reference: [], done: [] });
  // Fond initial figé pour l'init (l'effet ne tourne qu'une fois).
  const initialStyleRef = useRef(mapStyle);

  // Données simplifiées ; la ref (synchronisée en effet) sert aux re-poses de
  // style, dont le callback vit plus longtemps qu'un rendu.
  const data = useMemo(
    () => ({
      reference: referenceCoords ? simplifyTrack(referenceCoords) : [],
      done: doneCoords && doneCoords.length > 1 ? simplifyTrack(doneCoords) : (doneCoords ?? []),
    }),
    [referenceCoords, doneCoords],
  );
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Initialisation (une fois).
  useEffect(() => {
    const styleId = initialStyleRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: RASTER_STYLES[styleId] ?? RASTER_STYLES.osm,
      center: [6.27, 44.93],
      zoom: 8.6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => {
      addTrackLayers(map, styleId);
      pushData(map, dataRef.current);
    });
    return () => {
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Changement de fond : setStyle efface les couches → on les repose.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return; // le premier fond est posé par "load"
    map.setStyle(RASTER_STYLES[mapStyle] ?? RASTER_STYLES.osm);
    map.once("styledata", () => {
      if (!map.getSource("reference")) addTrackLayers(map, mapStyle);
      pushData(map, dataRef.current);
    });
  }, [mapStyle]);

  // Mise à jour des traces + marqueur + cadrage initial.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      pushData(map, data);
      const { reference, done } = data;
      // Cadrage : l'ITINÉRAIRE complet fait référence. Les positions arrivent
      // souvent avant le track.json — on se recale une (seule) fois sur la
      // trace de référence quand elle est là, sinon on serait resté zoomé sur
      // les premiers mètres vécus.
      if (reference.length > 1 && fittedRef.current !== "reference") {
        fittedRef.current = "reference";
        map.fitBounds(boundsOf(reference), { padding: 34, duration: 0 });
      } else if (reference.length < 2 && done.length > 1 && fittedRef.current === "none") {
        fittedRef.current = "done";
        map.fitBounds(boundsOf(done), { padding: 34, duration: 0 });
      }
      // Position du marqueur selon le mode : le coureur (dernier point vécu),
      // le DÉPART (premier point de l'itinéraire, état Avant) ou l'ARRIVÉE
      // (dernier point vécu, état Terminé).
      const anchor =
        markerMode === "depart"
          ? (reference[0] ?? null)
          : done.length > 0
            ? done[done.length - 1]
            : null;
      if (anchor) {
        if (!markerRef.current) {
          markerRef.current = new maplibregl.Marker({ element: runnerElement(markerMode) })
            .setLngLat(anchor)
            .addTo(map);
        } else {
          markerRef.current.setLngLat(anchor);
        }
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [data, markerMode]);

  // Style INLINE impératif : la CSS de maplibre pose `.maplibregl-map
  // { position: relative }` qui, selon l'ordre des feuilles, écrase la classe
  // Tailwind `absolute` — et un conteneur non dimensionné donne un canvas
  // fantôme de 300 px. L'inline gagne toujours.
  return <div ref={containerRef} className="live-map" style={{ position: "absolute", inset: 0 }} />;
}
