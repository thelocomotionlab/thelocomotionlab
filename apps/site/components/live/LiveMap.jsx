// components/live/LiveMap.jsx
//
// La carte des états du live (design 2a/2d) — composant du SITE :
// packages/tracking (replays des projets) n'est pas touché. maplibre-gl en
// import direct, chargé dynamiquement (ssr:false).
// Style (recette 2026-07-24) : itinéraire prévisionnel en TIRETS FINS et
// trace vécue en trait PLEIN ÉPAIS, même teinte fuchsia (lib/liveTraceColors)
// sur liseré blanc — lisible sur les trois fonds. Fonds : « Relief » = Esri
// World Topo (défaut), « Topo » = OpenTopoMap, « Satellite » = Esri Imagery.
// Marqueur coureur à halo pulsant ; `hoverPoint` pose le
// point synchronisé avec le survol du profil altimétrique. Les deux traces
// sont SIMPLIFIÉES (Douglas-Peucker) avant affichage.

"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Locate } from "lucide-react";
import { brandColors } from "@locomotionlab/ui";

import { simplifyTrack } from "@/lib/simplify";
import { traceColors } from "@/lib/liveTraceColors";

const RASTER_STYLES = {
  // Fond « Relief » PAR DÉFAUT : Esri World Topo — relief ombré très lisible
  // (recette 2026-07-24 : remplace le « Plan » OSM ; OpenTopoMap conservé).
  relief: {
    version: 8,
    sources: {
      raster: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Tiles © Esri — Esri, HERE, Garmin, FAO, NOAA, USGS",
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

/** Les 4 couches du design : itinéraire en TIRETS FINS, vécu en PLEIN ÉPAIS,
 *  même teinte (traceColors.line), chacun sur son liseré blanc — la paire
 *  reste discernable et contrastée sur les trois fonds. */
function addTrackLayers(map) {
  map.addSource("reference", { type: "geojson", data: lineFeature([]) });
  map.addSource("done", { type: "geojson", data: lineFeature([]) });
  map.addLayer({
    id: "rfc",
    type: "line",
    source: "reference",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": traceColors.casing, "line-width": 4.5, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "rfl",
    type: "line",
    source: "reference",
    layout: { "line-join": "round" },
    paint: {
      "line-color": traceColors.line,
      "line-width": 1.8,
      "line-dasharray": [1.5, 2.2],
      "line-opacity": 0.95,
    },
  });
  map.addLayer({
    id: "rdc",
    type: "line",
    source: "done",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": traceColors.casing, "line-width": 8, "line-opacity": 0.95 },
  });
  map.addLayer({
    id: "rdl",
    type: "line",
    source: "done",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": traceColors.line, "line-width": 4.5 },
  });
}

function pushData(map, data) {
  map.getSource("reference")?.setData(lineFeature(data.reference));
  map.getSource("done")?.setData(lineFeature(data.done));
}

// Marqueur des trois modes du design : halo pulsant + cœur.
// live = accent/deep · depart (Avant) = primary · arrivee (Terminé) = primary-dark.
const MARKER_COLORS = {
  live: { halo: brandColors.accent, core: brandColors.deep },
  depart: { halo: brandColors.primary, core: brandColors.primary },
  arrivee: { halo: brandColors.primaryDark, core: brandColors.primaryDark },
};

function runnerElement(mode) {
  const colors = MARKER_COLORS[mode] ?? MARKER_COLORS.live;
  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:18px;height:18px;";
  const halo = document.createElement("div");
  halo.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${colors.halo};animation:ll-pulse 2.4s ease-out infinite;`;
  const core = document.createElement("div");
  core.style.cssText = `position:absolute;inset:3px;border-radius:50%;background:${colors.core};box-shadow:0 0 0 3px ${brandColors.bg},0 4px 12px rgba(0,0,0,0.35);`;
  el.append(halo, core);
  return el;
}

export default function LiveMap({
  referenceCoords,
  doneCoords,
  mapStyle,
  markerMode = "live",
  hoverPoint = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const hoverRef = useRef(null);
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
      style: RASTER_STYLES[styleId] ?? RASTER_STYLES.relief,
      center: [6.27, 44.93],
      zoom: 8.6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => {
      addTrackLayers(map);
      pushData(map, dataRef.current);
    });
    return () => {
      markerRef.current?.remove();
      hoverRef.current?.remove();
      hoverRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Changement de fond : setStyle efface les couches → on les repose.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return; // le premier fond est posé par "load"
    map.setStyle(RASTER_STYLES[mapStyle] ?? RASTER_STYLES.relief);
    map.once("styledata", () => {
      if (!map.getSource("reference")) addTrackLayers(map);
      pushData(map, dataRef.current);
    });
  }, [mapStyle]);

  // Point de survol du profil altimétrique : petit disque fuchsia à liseré
  // blanc, posé/déplacé au fil du survol, retiré quand la souris sort.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!hoverPoint) {
      hoverRef.current?.remove();
      hoverRef.current = null;
      return;
    }
    if (!hoverRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `width:13px;height:13px;border-radius:50%;background:${traceColors.line};border:2.5px solid ${traceColors.casing};box-shadow:0 1px 6px rgba(0,0,0,0.35);pointer-events:none;`;
      hoverRef.current = new maplibregl.Marker({ element: el }).setLngLat(hoverPoint).addTo(map);
    } else {
      hoverRef.current.setLngLat(hoverPoint);
    }
  }, [hoverPoint]);

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

  // Recentre sur l'itinéraire complet (ou, à défaut, la trace vécue).
  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const { reference, done } = dataRef.current;
    const coords = reference.length > 1 ? reference : done;
    if (coords.length > 0) map.fitBounds(boundsOf(coords), { padding: 34, duration: 500 });
  };

  // Style INLINE impératif : la CSS de maplibre pose `.maplibregl-map
  // { position: relative }` qui, selon l'ordre des feuilles, écrase la classe
  // Tailwind `absolute` — et un conteneur non dimensionné donne un canvas
  // fantôme de 300 px. L'inline gagne toujours.
  return (
    <div className="live-map" style={{ position: "absolute", inset: 0 }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <button
        type="button"
        onClick={recenter}
        aria-label="Recentrer la carte"
        title="Recentrer"
        className="absolute right-3 top-14 z-[5] flex h-9 w-9 items-center justify-center rounded-lg border border-brand-text/10 bg-brand-bg/95 text-brand-text/70 shadow-[0_4px_14px_rgba(51,51,51,0.18)] transition hover:text-brand-text lg:right-3.5 lg:top-3.5"
      >
        <Locate size={17} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
