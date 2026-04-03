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

function getBoundsFromCoords(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null;

  const lngs = coords.map((c) => c[0]).filter((v) => Number.isFinite(v));
  const lats = coords.map((c) => c[1]).filter((v) => Number.isFinite(v));

  if (!lngs.length || !lats.length) return null;

  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function getCoordsFromGeoJSON(geojson) {
  if (!geojson || !Array.isArray(geojson.features)) return [];

  const coords = [];

  const collect = (geometry) => {
    if (!geometry || !geometry.type || !geometry.coordinates) return;

    if (geometry.type === "LineString") {
      geometry.coordinates.forEach((c) => {
        if (Array.isArray(c) && c.length >= 2) coords.push([c[0], c[1]]);
      });
      return;
    }

    if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach((line) => {
        if (!Array.isArray(line)) return;
        line.forEach((c) => {
          if (Array.isArray(c) && c.length >= 2) coords.push([c[0], c[1]]);
        });
      });
      return;
    }

    if (geometry.type === "Point") {
      const c = geometry.coordinates;
      if (Array.isArray(c) && c.length >= 2) coords.push([c[0], c[1]]);
    }
  };

  geojson.features.forEach((feature) => collect(feature.geometry));
  return coords;
}

function buildUrl(base, endpoint) {
  if (!endpoint) return null;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;

  const safeBase = (base || "").replace(/\/+$/, "");
  const safeEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  return `${safeBase}${safeEndpoint}`;
}

export default function LiveTracking({
  apiBase = "https://tracking.thelocomotionlab.com",
  positionsEndpoint = "/live-positions.json",
  timerEndpoint = "/live-timer.json",
  totalDistanceKm = 65,
  elevationMin = 400,
  elevationMax = 860,
  referenceGpx = "/tracks/reunion-r2_temp.gpx",
  title = "Suivi en direct",
  pollIntervalMs = 10000,
  initialMapStyle = "osm",
  mapHeight = 400,
}) {
  const mapRef = useRef(null);
  const mapContainer = useRef(null);

  const [stats, setStats] = useState({ distance: 0, ascent: 0, descent: 0 });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [elevationData, setElevationData] = useState([]);
  const [mapStyle, setMapStyle] = useState(initialMapStyle || "osm");
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [runnerPosition, setRunnerPosition] = useState(null);
  const [showElevation, setShowElevation] = useState(true);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [timer, setTimer] = useState({
    running: false,
    startTime: null,
    stopTime: null,
  });
  const [elapsed, setElapsed] = useState(0);
  const [computedTotalDistance, setComputedTotalDistance] = useState(null);

  const TOTAL_DISTANCE_KM =
    typeof totalDistanceKm === "number"
      ? totalDistanceKm
      : Number(totalDistanceKm) || computedTotalDistance || 65;

  const parsedElevationMin = Number(elevationMin);
  const parsedElevationMax = Number(elevationMax);

  const ELEVATION_MIN = Number.isFinite(parsedElevationMin)
    ? parsedElevationMin
    : 400;

  const ELEVATION_MAX = Number.isFinite(parsedElevationMax)
    ? parsedElevationMax
    : 860;

  const POLL_INTERVAL_MS =
    typeof pollIntervalMs === "number"
      ? pollIntervalMs
      : Number(pollIntervalMs) || 10000;

  const MAP_HEIGHT =
    typeof mapHeight === "number"
      ? `${mapHeight}px`
      : mapHeight || "400px";

  // --- Styles de cartes ---
  const styles = {
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

  useEffect(() => {
    const syncScreen = () => {
      setIsSmallScreen(window.innerWidth < 640);
    };

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
        style: styles[initialMapStyle] || styles.osm,
        center: [0, 0],
        zoom: 2,
        attributionControl: false,
      });

      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }));

      map.on("load", async () => {
        map.resize();

        if (!referenceGpx) return;

        try {
          const res = await fetch(referenceGpx);
          if (!res.ok) {
            console.warn(
              "Référence GPX non chargée :",
              referenceGpx,
              res.status
            );
            return;
          }

          const xml = await res.text();
          const doc = new DOMParser().parseFromString(
            xml,
            "application/xml"
          );
          const geojson = toGeoJSON.gpx(doc);

          map._referenceGeoJSON = geojson;

          if (!map.getSource("reference-track")) {
            map.addSource("reference-track", {
              type: "geojson",
              data: geojson,
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

/*          if (!map._hasAutoFramed) {
            const referenceCoords = getCoordsFromGeoJSON(geojson);
            const bounds = getBoundsFromCoords(referenceCoords);

            if (bounds) {
              try {
                map.fitBounds(bounds, {
                  padding: 20,
                  maxZoom: 16,
                  duration: 2000,
                });
                map._hasAutoFramed = true;
              } catch (e) {
                console.warn("fitBounds référence échoué :", e);
              }
            }
          }*/
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
  }, [referenceGpx, initialMapStyle]);

  /* ---------- 2) Changement de style ---------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styles[mapStyle]) return;

    map.setStyle(styles[mapStyle]);

    map.once("styledata", () => {
      if (map._referenceGeoJSON && !map.getSource("reference-track")) {
        map.addSource("reference-track", {
          type: "geojson",
          data: map._referenceGeoJSON,
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

      if (map._liveTrackGeoJSON && !map.getSource("live-track")) {
        map.addSource("live-track", {
          type: "geojson",
          data: map._liveTrackGeoJSON,
        });

        if (!map.getLayer("live-track-line")) {
          map.addLayer({
            id: "live-track-line",
            type: "line",
            source: "live-track",
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

  /* ---------- 3) Récupération live ---------- */
  useEffect(() => {
    if (!mapRef.current) return;

    async function fetchLiveData() {
      try {
        const positionsUrl = buildUrl(apiBase, positionsEndpoint);
        if (!positionsUrl) return;

        const res = await fetch(
          `${positionsUrl}${positionsUrl.includes("?") ? "&" : "?"}cacheBust=${Date.now()}`
        );

        const data = await res.json();
        const profile = Array.isArray(data?.profile) ? data.profile : [];
        const serverStats = data?.stats || null;

        if (!profile.length) return;

        const map = mapRef.current;
        if (!map) return;

        const coords = profile
          .map((p) =>
            Number.isFinite(p?.longitude) && Number.isFinite(p?.latitude)
              ? [p.longitude, p.latitude]
              : null
          )
          .filter(Boolean);

        if (!coords.length) return;

        const geojson = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
        };

        map._liveTrackGeoJSON = geojson;

        if (map.getSource("live-track")) {
          map.getSource("live-track").setData(geojson);
        } else {
          map.addSource("live-track", { type: "geojson", data: geojson });
          map.addLayer({
            id: "live-track-line",
            type: "line",
            source: "live-track",
            paint: {
              "line-color": "#ff5500",
              "line-width": 4,
              "line-opacity": 0.9,
            },
          });
        }

        const lastPoint = profile.at(-1);
        const last = coords.at(-1);

        setRunnerPosition(last);
        setLastUpdate(serverStats?.lastFixTime || lastPoint?.fixTime || null);

        setStats({
          distance:
            serverStats?.distance != null
              ? (serverStats.distance / 1000).toFixed(2)
              : ((lastPoint?.distMeters || 0) / 1000).toFixed(2),
          ascent:
            serverStats?.dplus != null
              ? serverStats.dplus
              : Math.round(lastPoint?.dPlus || 0),
          descent:
            serverStats?.dminus != null
              ? serverStats.dminus
              : Math.round(lastPoint?.dMinus || 0),
        });

        const nextElevationData = profile.map((p) => ({
          km:
            p?.distKm != null
              ? Number(p.distKm)
              : Number((p?.distMeters || 0) / 1000),
          alt: p?.alt || 0,
          dPlus: Math.round(p?.dPlus || 0),
          dMinus: Math.round(p?.dMinus || 0),
        }));
        setElevationData(nextElevationData);

        const lastKm =
          lastPoint?.distKm != null
            ? Number(lastPoint.distKm)
            : Number((lastPoint?.distMeters || 0) / 1000);
        setComputedTotalDistance(lastKm || 0);

        if (!map._hasAutoFramed) {
          const bounds = getBoundsFromCoords(coords);

          if (bounds) {
            try {
              map.fitBounds(bounds, {
                padding: 20,
                maxZoom: 18,
                duration: 2000,
              });
              map._hasAutoFramed = true;
            } catch (e) {
              console.warn("fitBounds live échoué :", e);
            }
          } else if (last) {
            map.flyTo({ center: last, zoom: 12, speed: 0.5 });
            map._hasAutoFramed = true;
          }
        }

        if (!map._runnerMarker && last) {
          const el = document.createElement("div");
          el.style.width = "28px";
          el.style.height = "28px";
          el.style.backgroundImage =
            "url('https://cdn-icons-png.flaticon.com/512/847/847969.png')";
          el.style.backgroundSize = "contain";
          el.style.backgroundRepeat = "no-repeat";
          map._runnerMarker = new maplibregl.Marker(el)
            .setLngLat(last)
            .addTo(map);
        } else if (map._runnerMarker && last) {
          map._runnerMarker.setLngLat(last);
        }
      } catch (err) {
        console.error("Erreur récupération live data :", err);
      }
    }

    fetchLiveData();
    const interval = setInterval(fetchLiveData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [apiBase, positionsEndpoint, POLL_INTERVAL_MS]);

  /* ---------- 4) Récupération du timer ---------- */
  useEffect(() => {
    async function fetchTimer() {
      try {
        const timerUrl = buildUrl(apiBase, timerEndpoint);
        if (!timerUrl) return;

        const res = await fetch(
          `${timerUrl}${timerUrl.includes("?") ? "&" : "?"}cacheBust=${Date.now()}`
        );
        const data = await res.json();
        setTimer({
          running: Boolean(data?.running),
          startTime: data?.startTime || null,
          stopTime: data?.stopTime || null,
        });
      } catch (err) {
        console.error("Erreur timer :", err);
      }
    }

    fetchTimer();
    const interval = setInterval(fetchTimer, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [apiBase, timerEndpoint, POLL_INTERVAL_MS]);

  /* ---------- 5) Calcul chrono en continu ---------- */
  useEffect(() => {
    let interval;

    const computeElapsed = () => {
      if (!timer.startTime) {
        setElapsed(0);
        return;
      }

      const now = new Date();
      const start = new Date(timer.startTime);
      const stop = timer.stopTime ? new Date(timer.stopTime) : null;
      const diff = timer.running ? now - start : stop ? stop - start : 0;
      setElapsed(Math.max(0, Math.floor(diff / 1000)));
    };

    computeElapsed();

    if (timer.startTime && timer.running) {
      interval = setInterval(computeElapsed, 1000);
    }

    return () => clearInterval(interval);
  }, [timer]);

  const formatDuration = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h${String(m).padStart(2, "0")}min${String(sec).padStart(
      2,
      "0"
    )}s`;
  };

  const recenterMap = () => {
    if (mapRef.current && runnerPosition) {
      mapRef.current._hasAutoFramed = true;
      mapRef.current.flyTo({
        center: runnerPosition,
        zoom: 13,
        speed: 0.7,
      });
    }
  };

  const CustomTooltip = ({ active, payload }) => {
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
            {km.toFixed(1)} km, alt {Math.round(alt)} m
          </div>
          <div className="text-gray-600">
            D+ {dPlus} m D− {dMinus} m
          </div>
        </div>
      );
    }
    return null;
  };

  /* ---------- 6) Rendu principal ---------- */
  return (
    <div className="flex flex-col items-center w-full py-6 px-3 sm:px-6 gap-3">
      {/* Bloc stats */}
      <div className="bg-white/80 backdrop-blur-md shadow-md rounded-2xl p-4 w-full max-w-3xl text-center border border-gray-200">
        <div className="flex justify-center items-center gap-2 font-semibold text-lg text-[#b66b47] sm:mb-1">
          <SatelliteDish size={18} /> {title}
        </div>

        {/* 🔹 Durée de locomotion */}
        <div className="text-gray-700 mb-2 text-sm sm:flex sm:flex-row sm:items-center sm:justify-center sm:gap-1">
          <div className="flex flex-col items-center sm:hidden">
            <span className="text-xxs">Durée de locomotion : </span>
            <span className="text-xs font-bold mb-1">
              {formatDuration(elapsed)}
            </span>
            <div className="w-16 h-[2px] bg-[#EFB159] mt-1 mb-4 rounded-full mx-auto"></div>
          </div>

          <div className="hidden sm:inline">
            <span className="text-sm">Durée de locomotion : </span>
            <span className="text-sm font-semibold mb-1">
              {formatDuration(elapsed)}
            </span>
          </div>
        </div>

        <div className="hidden sm:block w-24 h-[2px] bg-[#EFB159] mt-1 mb-1 rounded-full mx-auto"></div>

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
          Dernière màj :{" "}
          {lastUpdate ? new Date(lastUpdate).toLocaleTimeString("fr-FR") : "—"}
        </div>
      </div>

      {/* Carte + profil intégré */}
      <div className="relative w-full max-w-6xl">
        <div
          ref={mapContainer}
          className="w-full overflow-hidden shadow-lg border border-gray-200"
          style={{ height: MAP_HEIGHT }}
        ></div>

        {/* Bouton recentrer */}
        <button
          onClick={recenterMap}
          className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md text-sm px-3 py-1 hover:bg-[#EFB159]/80 hover:text-white text-gray-700 flex items-center gap-1 z-20"
        >
          <Crosshair size={16} />
          <span className="hidden sm:inline">Recentrer</span>
        </button>

        {/* Bouton télécharger */}
        {referenceGpx && (
          <a
            href={referenceGpx}
            download
            className="absolute top-[43px] left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md px-3 py-1 hover:bg-[#EFB159]/80 hover:text-white text-gray-700 z-20 flex items-center gap-1 transition no-underline"
            title="Télécharger la trace GPX"
          >
            <Download size={16} />
            <span className="hidden sm:inline text-sm font-medium">
              Télécharger
            </span>
          </a>
        )}

        {/* Sélecteur de style compact */}
        <div className="absolute top-[100px] right-2.5 z-30">
          <div className="relative">
            <div className="relative">
              {!showStyleMenu ? (
                <button
                  onClick={() => setShowStyleMenu(true)}
                  className="bg-white/90 backdrop-blur-sm border border-gray-300 shadow rounded-md p-[6px] hover:bg-[#EFB159]/80 hover:text-white transition flex items-center justify-center"
                  style={{ width: "32px", height: "32px" }}
                >
                  <MapIcon size={16} className="text-gray-700" />
                </button>
              ) : (
                <div
                  className="bg-white/95 backdrop-blur-sm border border-gray-300 rounded-md shadow-md flex flex-col items-center p-[2px]"
                  style={{ width: "32px" }}
                >
                  <button
                    onClick={() => {
                      setMapStyle("osm");
                      setShowStyleMenu(false);
                    }}
                    className={`w-full h-8 flex items-center justify-center rounded hover:bg-[#EFB159]/80 transition ${
                      mapStyle === "osm"
                        ? "bg-[#EFB159]/90 text-white"
                        : "text-gray-700"
                    }`}
                  >
                    <MapIcon size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setMapStyle("topo");
                      setShowStyleMenu(false);
                    }}
                    className={`w-full h-8 flex items-center justify-center rounded hover:bg-[#EFB159]/80 transition ${
                      mapStyle === "topo"
                        ? "bg-[#EFB159]/90 text-white"
                        : "text-gray-700"
                    }`}
                  >
                    <Mountain size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setMapStyle("satellite");
                      setShowStyleMenu(false);
                    }}
                    className={`w-full h-8 flex items-center justify-center rounded hover:bg-[#EFB159]/80 transition ${
                      mapStyle === "satellite"
                        ? "bg-[#EFB159]/90 text-white"
                        : "text-gray-700"
                    }`}
                  >
                    <Globe2 size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Profil altimétrique intégré */}
        {elevationData.length > 0 && (
          <>
            <button
              onClick={() => setShowElevation(!showElevation)}
              className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white shadow-md rounded-lg p-1.5 border border-gray-300 hover:bg-[#EFB159]/90 hover:text-white transition z-30"
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
                <div className="h-32 mt-3 px-3">
                  <ResponsiveContainer width="100%" height="100%">
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
                        tickFormatter={(v) => `${v.toFixed(0)}km`}
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <YAxis
                        domain={[0, ELEVATION_MAX]}
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
                              position={
                                isSmallScreen
                                  ? "insideTopRight"
                                  : "insideTopLeft"
                              }
                              dy={isSmallScreen ? -11 : -15}
                              dx={-4}
                              fill="#555"
                              fontSize={isSmallScreen ? 6 : 10}
                              fontWeight={400}
                              background={{
                                fill: "rgba(255,255,255,0.4)",
                              }}
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