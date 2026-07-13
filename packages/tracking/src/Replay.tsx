// packages/tracking/src/Replay.tsx
//
// PRÉSENTATION du REPLAY post-course (carte maplibre + profil altimétrique).
// Porté de apps/site/components/PostLiveTracking.jsx. Lit UN fichier statique
// (public/replays/*) via useTrackingData(mode:"replay") — aucun token, pas de
// polling. Le lazy-load de maplibre reste à la charge du consommateur.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  SatelliteDish,
  Crosshair,
  ChevronDown,
  ChevronUp,
  Map as MapIcon,
  Mountain,
  Globe2,
  Download,
} from "lucide-react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as toGeoJSON from "@tmcw/togeojson";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
  Label,
} from "recharts";

import type {
  GeoLineFeature,
  GpxGeoJson,
  LngLat,
  MapStyleId,
  MutableMap,
  ReplayProps,
} from "./types";
import { styles } from "./mapStyles";
import { asMapData, createRunnerElement, formatDuration } from "./utils";
import { useTrackingData } from "./useTrackingData";

// Tooltip du profil altimétrique (référence stable au niveau module).
type TooltipPayload = {
  active?: boolean;
  payload?: Array<{ payload: { km: number; alt: number; dPlus: number; dMinus: number } }>;
};
function CustomTooltip({ active, payload }: TooltipPayload) {
  if (active && payload && payload.length) {
    const { km, alt, dPlus, dMinus } = payload[0].payload;
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.8)",
          border: "1px solid rgba(150,150,150,0.3)",
          borderRadius: "6px",
          padding: "4px 8px",
          fontSize: "11px",
        }}
      >
        <div>
          {km.toFixed(1)} km, {Math.round(alt)} m
        </div>
        <div className="text-gray-600">
          D+ {dPlus} m D− {dMinus} m
        </div>
      </div>
    );
  }
  return null;
}

export default function Replay({
  positionsUrl,
  totalDistanceKm,
  elevationMin = 0,
  elevationMax = 3100,
  referenceGpx,
  title = "Replay GPS",
  distanceFactor = 1,
  ascentFactor = 1,
  descentFactor = 1,
  mapHeight = 400,
}: ReplayProps) {
  const mapRef = useRef<MutableMap | null>(null);
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const appliedStyleRef = useRef<MapStyleId>("osm");

  const [mapStyle, setMapStyle] = useState<MapStyleId>("osm");
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showElevation, setShowElevation] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // si pas de prop → fallback (identique à l'historique)
  const gpxPath = referenceGpx || "/tracks/reunion-r2_temp.gpx";

  const MAP_HEIGHT =
    typeof mapHeight === "number" ? `${mapHeight}px` : mapHeight || "400px";

  const parsedElevationMin = Number(elevationMin);
  const parsedElevationMax = Number(elevationMax);
  const ELEVATION_MIN = Number.isFinite(parsedElevationMin) ? parsedElevationMin : 0;
  const ELEVATION_MAX = Number.isFinite(parsedElevationMax) ? parsedElevationMax : 3100;

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

  useEffect(() => {
    const syncScreen = () => setIsSmallScreen(window.innerWidth < 640);
    syncScreen();
    window.addEventListener("resize", syncScreen);
    return () => window.removeEventListener("resize", syncScreen);
  }, []);

  /* ---------- 1) Initialisation de la carte + GPX de référence ---------- */
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const container = mapContainer.current;

    const initMap = () => {
      const map = new maplibregl.Map({
        container,
        style: styles.osm,
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

          if (!map.getSource("reference-track")) {
            map.addSource("reference-track", {
              type: "geojson",
              data: asMapData(geojson),
            });
          }

          if (!map.getLayer("reference-line")) {
            map.addLayer({
              id: "reference-line",
              type: "line",
              source: "reference-track",
              paint: {
                "line-color": "#007bff",
                "line-width": 3,
                "line-dasharray": [2, 2],
              },
            });
          }
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
      }
    };
  }, [gpxPath]);

  /* ---------- 2) Changement de style ---------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedStyleRef.current === mapStyle) return;
    appliedStyleRef.current = mapStyle;

    map.setStyle(styles[mapStyle]);

    map.once("styledata", () => {
      if (!map.style) return;
      // réinjecter la trace de référence si on a déjà chargé le GPX
      if (map._referenceGeoJSON && !map.getSource("reference-track")) {
        map.addSource("reference-track", {
          type: "geojson",
          data: asMapData(map._referenceGeoJSON),
        });
        if (!map.getLayer("reference-line")) {
          map.addLayer({
            id: "reference-line",
            type: "line",
            source: "reference-track",
            paint: {
              "line-color": mapStyle === "satellite" ? "#4CAF50" : "#007bff",
              "line-width": 3,
              "line-dasharray": [2, 2],
            },
          });
        }
      }

      // réinjecter la trace replay
      if (map._replayGeoJSON && !map.getSource("replay-track")) {
        map.addSource("replay-track", {
          type: "geojson",
          data: asMapData(map._replayGeoJSON),
        });
        if (!map.getLayer("replay-track-line")) {
          map.addLayer({
            id: "replay-track-line",
            type: "line",
            source: "replay-track",
            paint: {
              "line-color": "#ff5500",
              "line-width": 4,
              "line-opacity": 0.9,
            },
          });
        }
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
      const existing = map.getSource("replay-track") as GeoJSONSource | undefined;
      if (existing) {
        existing.setData(asMapData(geojson));
      } else {
        map.addSource("replay-track", { type: "geojson", data: asMapData(geojson) });
        map.addLayer({
          id: "replay-track-line",
          type: "line",
          source: "replay-track",
          paint: {
            "line-color": "#ff5500",
            "line-width": 4,
            "line-opacity": 0.9,
          },
        });
      }
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
      map._runnerMarker = new maplibregl.Marker(createRunnerElement())
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

      {/* Carte + profil altimétrique */}
      <div className="relative w-full max-w-6xl">
        <div
          ref={mapContainer}
          role="application"
          aria-label="Carte du replay du parcours"
          className="w-full overflow-hidden shadow-lg border border-gray-200"
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

        {/* Sélecteur de style */}
        <div className="absolute top-[100px] right-2.5 z-30">
          <div className="relative">
            {!showStyleMenu ? (
              <button
                type="button"
                onClick={() => setShowStyleMenu(true)}
                aria-label="Choisir le style de carte"
                aria-haspopup="menu"
                aria-expanded={showStyleMenu}
                className="bg-white/90 backdrop-blur-sm border border-gray-300 shadow rounded-md p-[6px] hover:bg-brand-accent/80 hover:text-white transition flex items-center justify-center"
                style={{ width: "32px", height: "32px" }}
              >
                <MapIcon size={16} className="text-gray-700" aria-hidden="true" />
              </button>
            ) : (
              <div
                role="menu"
                aria-label="Styles de carte"
                className="bg-white/95 backdrop-blur-sm border border-gray-300 rounded-md shadow-md flex flex-col items-center p-[2px]"
                style={{ width: "32px" }}
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={mapStyle === "osm"}
                  aria-label="Carte OpenStreetMap"
                  onClick={() => {
                    setMapStyle("osm");
                    setShowStyleMenu(false);
                  }}
                  className={`w-full h-8 flex items-center justify-center rounded hover:bg-brand-accent/80 transition ${
                    mapStyle === "osm" ? "bg-brand-accent/90 text-white" : "text-gray-700"
                  }`}
                >
                  <MapIcon size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={mapStyle === "topo"}
                  aria-label="Carte topographique"
                  onClick={() => {
                    setMapStyle("topo");
                    setShowStyleMenu(false);
                  }}
                  className={`w-full h-8 flex items-center justify-center rounded hover:bg-brand-accent/80 transition ${
                    mapStyle === "topo" ? "bg-brand-accent/90 text-white" : "text-gray-700"
                  }`}
                >
                  <Mountain size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={mapStyle === "satellite"}
                  aria-label="Vue satellite"
                  onClick={() => {
                    setMapStyle("satellite");
                    setShowStyleMenu(false);
                  }}
                  className={`w-full h-8 flex items-center justify-center rounded hover:bg-brand-accent/80 transition ${
                    mapStyle === "satellite" ? "bg-brand-accent/90 text-white" : "text-gray-700"
                  }`}
                >
                  <Globe2 size={14} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bandeau altimétrique */}
        {elevationData.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowElevation(!showElevation)}
              aria-label={
                showElevation
                  ? "Masquer le profil altimétrique"
                  : "Afficher le profil altimétrique"
              }
              aria-expanded={showElevation}
              className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white shadow-md rounded-lg p-1.5 border border-gray-300 hover:bg-brand-accent/90 hover:text-white transition z-30"
            >
              {showElevation ? (
                <ChevronDown size={24} className="text-gray-700" />
              ) : (
                <ChevronUp size={24} className="text-gray-700" />
              )}
            </button>

            <div
              className={`absolute bottom-0 left-0 w-full bg-white/60 backdrop-blur-md border-t border-gray-200 shadow-lg transition-all duration-500 ${
                showElevation ? "max-h-36" : "max-h-0"
              } overflow-hidden`}
              style={{ zIndex: 20 }}
            >
              {showElevation && (
                <div className="mt-3 px-3">
                  <ResponsiveContainer width="100%" height={128}>
                    <LineChart
                      data={elevationData}
                      margin={
                        isSmallScreen
                          ? { top: 5, right: 10, bottom: 5, left: 15 }
                          : { top: 10, right: 20, bottom: 0, left: 30 }
                      }
                    >
                      <XAxis
                        dataKey="km"
                        type="number"
                        domain={[0, TOTAL_DISTANCE_KM]}
                        ticks={
                          isSmallScreen
                            ? [0, Math.round(TOTAL_DISTANCE_KM)]
                            : [
                                0,
                                TOTAL_DISTANCE_KM * 0.25,
                                TOTAL_DISTANCE_KM * 0.5,
                                TOTAL_DISTANCE_KM * 0.75,
                                TOTAL_DISTANCE_KM,
                              ]
                        }
                        tickFormatter={(v: number) => `${v.toFixed(0)}km`}
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <YAxis
                        domain={[ELEVATION_MIN, ELEVATION_MAX]}
                        tick={false}
                        axisLine={false}
                        width={0}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      {[ELEVATION_MIN, ELEVATION_MAX]
                        .filter(
                          (alt, index, arr) =>
                            Number.isFinite(alt) &&
                            alt >= 0 &&
                            alt <= ELEVATION_MAX &&
                            arr.indexOf(alt) === index
                        )
                        .map((alt) => (
                          <ReferenceLine
                            key={alt}
                            y={alt}
                            stroke="#999"
                            strokeDasharray="4 4"
                            ifOverflow="extendDomain"
                          >
                            <Label
                              value={`${alt}m`}
                              position={isSmallScreen ? "insideTopRight" : "insideTopLeft"}
                              dy={isSmallScreen ? -11 : -15}
                              dx={-4}
                              fill="#555"
                              fontSize={isSmallScreen ? 6 : 10}
                              fontWeight={400}
                              // `background` est honoré au runtime par recharts mais absent de
                              // ses types v3 → spread casté (comportement identique à l'historique).
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              {...({ background: { fill: "rgba(255,255,255,0.4)" } } as any)}
                            />
                          </ReferenceLine>
                        ))}
                      <Line
                        type="monotone"
                        dataKey="alt"
                        stroke="#B67352"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
