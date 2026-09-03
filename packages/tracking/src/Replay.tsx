// packages/tracking/src/Replay.tsx
//
// PRÉSENTATION du REPLAY post-course (carte maplibre + profil altimétrique).
// Porté de apps/site/components/PostLiveTracking.jsx. Lit UN fichier statique
// (public/replays/*) via useTrackingData(mode:"replay") — aucun token, pas de
// polling. Le lazy-load de maplibre reste à la charge du consommateur.
//
// Le profil altimétrique est le bandeau du labo (ElevationProfile), collé sous
// la carte dans le même cadre — plus de volet replié dans la carte. Son survol
// pose le point jumeau sur la trace, comme sur le direct.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SatelliteDish, Crosshair, Download } from "lucide-react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as toGeoJSON from "@tmcw/togeojson";

import type {
  GeoLineFeature,
  GpxGeoJson,
  LngLat,
  MutableMap,
  ReplayProps,
} from "./types";
import { mapStyles, resolveMapStyle, ensureTraceLayers, type MapStyleName } from "./mapStyles";
import MapStylePills from "./MapStylePills";
import ElevationProfile, { type ProfileGraphPoint } from "./ElevationProfile";
import {
  asMapData,
  createHoverPointElement,
  createRunnerElement,
  formatDuration,
} from "./utils";
import { useTrackingData } from "./useTrackingData";

/** Borne altimétrique donnée par la balise, si elle en donne une. */
function borne(v: number | string | undefined): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default function Replay({
  positionsUrl,
  totalDistanceKm,
  elevationMin,
  elevationMax,
  referenceGpx,
  title = "Replay GPS",
  distanceFactor = 1,
  ascentFactor = 1,
  descentFactor = 1,
  mapHeight = 400,
  initialMapStyle,
}: ReplayProps) {
  const mapRef = useRef<MutableMap | null>(null);
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const hoverMarkerRef = useRef<Marker | null>(null);
  // Fond demandé par la balise (« osm » des anciens markdown compris),
  // normalisé une fois pour toutes vers relief | topo | sat.
  const appliedStyleRef = useRef<MapStyleName>(resolveMapStyle(initialMapStyle));

  const [mapStyle, setMapStyle] = useState<MapStyleName>(resolveMapStyle(initialMapStyle));
  const [mapReady, setMapReady] = useState(false);

  // si pas de prop → fallback (identique à l'historique)
  const gpxPath = referenceGpx || "/tracks/reunion-r2_temp.gpx";

  const MAP_HEIGHT =
    typeof mapHeight === "number" ? `${mapHeight}px` : mapHeight || "400px";

  // ---- COUCHE DONNÉES (replay : fichier statique, aucun token) ----
  const {
    coords,
    stats,
    elevationData,
    computedTotalDistance,
    lastUpdate,
    elapsed,
    revision,
  } = useTrackingData({
    mode: "replay",
    positionsUrl,
    distanceFactor: Number(distanceFactor) || 1,
    ascentFactor: Number(ascentFactor) || 1,
    descentFactor: Number(descentFactor) || 1,
  });

  const runnerPosition: LngLat | null =
    coords.length > 0 ? coords[coords.length - 1] : null;

  /* ---------- 1) Initialisation de la carte + GPX de référence ---------- */
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const container = mapContainer.current;

    const initMap = () => {
      const map = new maplibregl.Map({
        container,
        style: mapStyles[appliedStyleRef.current],
        center: [0, 0],
        zoom: 2,
        attributionControl: false,
      }) as MutableMap;
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }));

      map.on("load", async () => {
        map.resize();
        setMapReady(true);

        if (!gpxPath) return;

        try {
          const res = await fetch(gpxPath);
          if (!map.style) return;
          if (!res.ok) {
            console.warn("Référence GPX non chargée :", gpxPath, res.status);
            return;
          }

          const xml = await res.text();
          if (!map.style) return;
          const doc = new DOMParser().parseFromString(xml, "application/xml");
          const geojson = toGeoJSON.gpx(doc) as unknown as GpxGeoJson;

          map._referenceGeoJSON = geojson;

          // Les quatre couches du design : itinéraire en tirets fins,
          // trace vécue en plein épais, même teinte, liseré blanc.
          ensureTraceLayers(map, { reference: "reference-track", done: "replay-track" });
          (map.getSource("reference-track") as GeoJSONSource).setData(asMapData(geojson));
        } catch (err) {
          console.warn("Erreur chargement GPX référence :", err);
        }
      });
    };

    if (container.clientWidth === 0 || container.clientHeight === 0) {
      requestAnimationFrame(initMap);
    } else {
      initMap();
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        hoverMarkerRef.current = null;
      }
    };
  }, [gpxPath]);

  /* ---------- 2) Changement de style ---------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedStyleRef.current === mapStyle) return;
    appliedStyleRef.current = mapStyle;

    map.setStyle(mapStyles[mapStyle]);
    map.once("styledata", () => {
      if (!map.style) return;
      // setStyle efface sources et couches : on repose le design, puis on
      // renourrit ce qu'on avait déjà chargé.
      ensureTraceLayers(map, { reference: "reference-track", done: "replay-track" });
      if (map._referenceGeoJSON) {
        (map.getSource("reference-track") as GeoJSONSource).setData(asMapData(map._referenceGeoJSON));
      }
      if (map._replayGeoJSON) {
        (map.getSource("replay-track") as GeoJSONSource).setData(asMapData(map._replayGeoJSON));
      }

      if (map._runnerMarker && map._runnerMarker.getLngLat()) {
        map._runnerMarker.addTo(map);
      }

      map.resize();
    });
  }, [mapStyle]);

  /* ---------- 3) Application des données de replay sur la carte ---------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.style) return;
    if (!coords.length) return;

    const geojson: GeoLineFeature = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
    };

    map._replayGeoJSON = geojson;

    const applyReplayLayer = () => {
      if (!mapRef.current || !mapRef.current.style) return;
      ensureTraceLayers(map, { reference: "reference-track", done: "replay-track" });
      (map.getSource("replay-track") as GeoJSONSource).setData(asMapData(geojson));
    };

    if (map.isStyleLoaded()) {
      applyReplayLayer();
    } else {
      map.once("load", applyReplayLayer);
    }

    const last = coords[coords.length - 1];

    if (!map._hasAutoFramed && coords.length > 1) {
      try {
        const bounds: [LngLat, LngLat] = [
          [Math.min(...coords.map((c) => c[0])), Math.min(...coords.map((c) => c[1]))],
          [Math.max(...coords.map((c) => c[0])), Math.max(...coords.map((c) => c[1]))],
        ];
        map.fitBounds(bounds, { padding: 40, duration: 0 });
        map._hasAutoFramed = true;
      } catch (e) {
        console.warn("fitBounds échoué :", e);
      }
    }

    if (!map._runnerMarker && last) {
      map._runnerMarker = new maplibregl.Marker({ element: createRunnerElement() })
        .setLngLat(last)
        .addTo(map);
    } else if (map._runnerMarker && last) {
      map._runnerMarker.setLngLat(last);
    }
  }, [revision, mapReady, coords]);

  const recenterMap = () => {
    if (mapRef.current && runnerPosition) {
      mapRef.current.flyTo({ center: runnerPosition, zoom: 13, speed: 0.7 });
    }
  };

  const TOTAL_DISTANCE_KM =
    typeof totalDistanceKm === "number" && totalDistanceKm
      ? totalDistanceKm
      : computedTotalDistance || 100;

  /* ---------- 4) Profil altimétrique : la trace vécue, sous la carte ---------- */
  // Les échantillons du replay, au format du profil du labo : km cumulés,
  // altitude, D+/D− accumulés, et le point géographique de chacun — c'est lui
  // que le survol renvoie pour poser le point jumeau sur la carte.
  const graphPoints = useMemo<ProfileGraphPoint[]>(
    () =>
      elevationData.map((p) => ({
        km: p.km,
        alt: Math.round(p.alt),
        dp: p.dPlus,
        dm: p.dMinus,
        lat: p.lat,
        lng: p.lng,
      })),
    [elevationData]
  );

  // Bornes de l'axe des altitudes : celles de la balise (elevationMin/Max),
  // élargies au besoin par la trace elle-même — le profil ne sort jamais de
  // son cadre. Sans balise, le profil décide seul.
  const bornes = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of graphPoints) {
      if (p.alt < min) min = p.alt;
      if (p.alt > max) max = p.alt;
    }
    const balMin = borne(elevationMin);
    const balMax = borne(elevationMax);
    return {
      min: Number.isFinite(min) ? (balMin !== undefined ? Math.min(balMin, min) : min) : undefined,
      max: Number.isFinite(max) ? (balMax !== undefined ? Math.max(balMax, max) : max) : undefined,
    };
  }, [graphPoints, elevationMin, elevationMax]);

  // Tout le profil est « couvert » : le marqueur se pose au bout de la trace,
  // là où la carte pose le coureur.
  const doneKm = Number(stats.distance) || 0;

  // Survol du profil → point jumeau sur la carte (posé / déplacé / retiré).
  const poserSurvol = (lngLat: [number, number] | null) => {
    const map = mapRef.current;
    if (!map) return;
    if (!lngLat) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }
    if (!hoverMarkerRef.current) {
      hoverMarkerRef.current = new maplibregl.Marker({ element: createHoverPointElement() })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      hoverMarkerRef.current.setLngLat(lngLat);
    }
  };

  /* ---------- 5) Rendu ---------- */
  return (
    <div className="flex flex-col items-center w-full py-6 px-3 sm:px-6 gap-3">
      {/* Bloc stats */}
      <div className="bg-white/80 backdrop-blur-md shadow-md rounded-2xl p-4 w-full max-w-3xl text-center border border-gray-200">
        <div className="flex justify-center items-center gap-2 font-semibold text-lg text-brand-deep sm:mb-1">
          <SatelliteDish size={18} /> {title}
        </div>

        <div className="text-gray-700 mb-2 text-sm sm:flex sm:flex-row sm:items-center sm:justify-center sm:gap-1">
          <div className="flex flex-col items-center sm:hidden">
            <span className="text-xxs">Durée de locomotion :</span>
            <span className="text-xs font-bold mb-1">{formatDuration(elapsed)}</span>
            <div className="w-16 h-[2px] bg-brand-accent mt-1 mb-4 rounded-full mx-auto"></div>
          </div>

          <div className="hidden sm:inline">
            <span className="text-sm">Durée de locomotion : </span>
            <span className="text-sm font-semibold mb-1">{formatDuration(elapsed)}</span>
          </div>
        </div>

        <div className="hidden sm:block w-24 h-[2px] bg-brand-accent mt-1 mb-1 rounded-full mx-auto"></div>

        <div className="flex justify-around text-sm sm:text-base font-medium text-gray-800">
          <div>
            <span className="font-semibold">{stats.distance} km</span>
            <div className="sm:text-xs text-xxs text-gray-500">Distance</div>
          </div>
          <div>
            <span className="font-semibold">{stats.ascent} m</span>
            <div className="sm:text-xs text-xxs text-gray-500">D+</div>
          </div>
          <div>
            <span className="font-semibold">{stats.descent} m</span>
            <div className="sm:text-xs text-xxs text-gray-500 sm:mb-2">D−</div>
          </div>
        </div>
        <div className="sm:text-xs text-xxs mt-0 text-gray-500">
          Dernière position :{" "}
          {lastUpdate ? new Date(lastUpdate).toLocaleString("fr-FR") : "—"}
        </div>
      </div>

      {/* Carte + profil altimétrique collé dessous : un seul cadre, une seule
          ombre. Les commandes sont posées sur la carte, en haut du cadre. */}
      <div className="relative w-full max-w-6xl shadow-lg">
        <div
          ref={mapContainer}
          role="application"
          aria-label="Carte du replay du parcours"
          className="ll-map w-full overflow-hidden border border-gray-200"
          style={{ height: MAP_HEIGHT }}
        />

        {/* Bouton recentrer */}
        <button
          type="button"
          onClick={recenterMap}
          aria-label="Recentrer la carte sur le parcours"
          className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md text-sm px-3 py-1 hover:bg-brand-accent/80 hover:text-white text-gray-700 flex items-center gap-1 z-20"
        >
          <Crosshair size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Recentrer</span>
        </button>

        {/* Bouton télécharger */}
        {referenceGpx && (
          <a
            href={referenceGpx}
            download
            aria-label="Télécharger la trace GPX de référence"
            className="absolute top-[43px] left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md px-3 py-1 hover:bg-brand-accent/80 hover:text-white text-gray-700 z-20 flex items-center gap-1 transition no-underline"
            title="Télécharger la trace GPX"
          >
            <Download size={16} aria-hidden="true" />
            <span className="hidden sm:inline text-sm font-medium">Télécharger</span>
          </a>
        )}

        {/* Fond de carte : Relief / Topo / Satellite, comme sur le direct —
            au-dessus du zoom, que la classe ll-map fait descendre. */}
        <div className="absolute right-3 top-3 z-30">
          <MapStylePills value={mapStyle} onChange={setMapStyle} />
        </div>

        {/* Bandeau altimétrique, collé sous la carte */}
        {graphPoints.length > 1 && (
          <div className="ll-map-profil border border-t-0 border-gray-200 bg-white px-3 pb-1.5 sm:px-4">
            <ElevationProfile
              profile={graphPoints}
              totalKm={TOTAL_DISTANCE_KM}
              doneKm={doneKm}
              elevationMin={bornes.min}
              elevationMax={bornes.max}
              onHoverPoint={poserSurvol}
            />
          </div>
        )}
      </div>
    </div>
  );
}
