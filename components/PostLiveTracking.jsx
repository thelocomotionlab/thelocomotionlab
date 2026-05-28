// components/PostLiveTracking.jsx
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

/**
 * Logique alignée sur le serveur :
 * - segments bruts
 * - correction locale des virages
 * - intégration brute distance / D+ / D-
 *
 * Les coefficients globaux sont appliqués ensuite
 * dans le composant via distanceFactor / ascentFactor / descentFactor.
 */
function computeStatsFromPoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return {
      distanceMeters: 0,
      dplus: 0,
      dminus: 0,
      profile: [],
      rawDistanceMeters: 0,
      rawDplus: 0,
      rawDminus: 0,
    };
  }

  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const haversine = (a, b) => {
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  // phase 1 : segments bruts
  const segs = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = haversine(a, b);
    const dz = (b.altitude || 0) - (a.altitude || 0);
    segs.push({ d, dz, a, b });
  }

  // phase 2 : correction locale (virages)
  const correctedSegs = [];
  for (let i = 0; i < segs.length; i++) {
    const prev = segs[i - 1];
    const curr = segs[i];
    if (!prev) {
      correctedSegs.push(curr);
      continue;
    }

    const v1 = [
      curr.a.latitude - prev.a.latitude,
      curr.a.longitude - prev.a.longitude,
    ];
    const v2 = [
      curr.b.latitude - curr.a.latitude,
      curr.b.longitude - curr.a.longitude,
    ];

    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const norm1 = Math.hypot(...v1);
    const norm2 = Math.hypot(...v2);

    const angle =
      norm1 && norm2
        ? Math.acos(Math.min(1, Math.max(-1, dot / (norm1 * norm2))))
        : 0;

    const curvatureFactor = 1 + 0.25 * (angle / Math.PI);
    correctedSegs.push({ ...curr, d: curr.d * curvatureFactor });
  }

  // phase 3 : intégration brute
  let totalDist = 0;
  let totalDplus = 0;
  let totalDminus = 0;

  let cumDist = 0;
  let cumDplus = 0;
  let cumDminus = 0;
  const profile = [];

  for (const s of correctedSegs) {
    totalDist += s.d;
    cumDist += s.d;

    if (s.dz > 0) {
      totalDplus += s.dz;
      cumDplus += s.dz;
    } else {
      totalDminus += -s.dz;
      cumDminus += -s.dz;
    }

    profile.push({
      distMeters: cumDist,
      alt: s.b.altitude || 0,
      dPlus: cumDplus,
      dMinus: cumDminus,
      latitude: s.b.latitude ?? null,
      longitude: s.b.longitude ?? null,
      fixTime: s.b.fixTime || null,
    });
  }

  return {
    distanceMeters: totalDist,
    dplus: totalDplus,
    dminus: totalDminus,
    profile,
    rawDistanceMeters: totalDist,
    rawDplus: totalDplus,
    rawDminus: totalDminus,
  };
}

function isNewLivePositionsFormat(data) {
  return !!data && !Array.isArray(data) && Array.isArray(data.profile);
}

function normalizeReplayData(data) {
  if (isNewLivePositionsFormat(data)) {
    const profile = Array.isArray(data.profile) ? data.profile : [];
    const stats = data.stats || {};
    const lastPoint = profile.at(-1) || null;

    const coords = profile
      .map((p) =>
        Number.isFinite(p?.longitude) && Number.isFinite(p?.latitude)
          ? [p.longitude, p.latitude]
          : null
      )
      .filter(Boolean);

    const normalizedProfile = profile.map((p) => ({
      distMeters:
        typeof p?.distMeters === "number"
          ? p.distMeters
          : Number(p?.distKm || 0) * 1000,
      alt: p?.alt || 0,
      dPlus: p?.dPlus || 0,
      dMinus: p?.dMinus || 0,
      latitude: p?.latitude ?? null,
      longitude: p?.longitude ?? null,
      fixTime: p?.fixTime || null,
    }));

    const rawDistanceMeters =
      typeof stats?.distance === "number"
        ? stats.distance
        : lastPoint?.distMeters || 0;

    const rawDplus =
      typeof stats?.dplus === "number"
        ? stats.dplus
        : lastPoint?.dPlus || 0;

    const rawDminus =
      typeof stats?.dminus === "number"
        ? stats.dminus
        : lastPoint?.dMinus || 0;

    return {
      coords,
      profile: normalizedProfile,
      rawDistanceMeters,
      rawDplus,
      rawDminus,
      lastFixTime: stats?.lastFixTime || lastPoint?.fixTime || null,
      durationSeconds:
        typeof stats?.durationSeconds === "number"
          ? stats.durationSeconds
          : null,
      firstFixTime: profile[0]?.fixTime || null,
      lastProfilePoint: lastPoint,
    };
  }

  if (Array.isArray(data)) {
    const positions = data;
    const computed = computeStatsFromPoints(positions);
    const coords = positions.map((p) => [p.longitude, p.latitude]);

    return {
      coords,
      profile: computed.profile,
      rawDistanceMeters: computed.rawDistanceMeters,
      rawDplus: computed.rawDplus,
      rawDminus: computed.rawDminus,
      lastFixTime: positions.at(-1)?.fixTime || null,
      durationSeconds: null,
      firstFixTime: positions[0]?.fixTime || null,
      lastProfilePoint: computed.profile.at(-1) || null,
    };
  }

  return {
    coords: [],
    profile: [],
    rawDistanceMeters: 0,
    rawDplus: 0,
    rawDminus: 0,
    lastFixTime: null,
    durationSeconds: null,
    firstFixTime: null,
    lastProfilePoint: null,
  };
}

export default function PostLiveTracking({
  positionsUrl,
  statsUrl,
  totalDistanceKm,
  elevationMin = 0,
  elevationMax = 3100,
  referenceGpx, // <postlivetracking referenceGpx="...">
  title = "Replay GPS",
  distanceFactor = 1,
  ascentFactor = 1,
  descentFactor = 1,
  mapHeight = 400,
}) {
  const mapRef = useRef(null);
  const mapContainer = useRef(null);
  // Suit le style applique pour eviter le no-op au montage (qui declenche un
  // warning "Style is not done loading" cote maplibre).
  const appliedStyleRef = useRef("osm");

  const [stats, setStats] = useState({ distance: 0, ascent: 0, descent: 0 });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [elevationData, setElevationData] = useState([]);
  const [mapStyle, setMapStyle] = useState("osm");
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [runnerPosition, setRunnerPosition] = useState(null);
  const [showElevation, setShowElevation] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [computedTotalDistance, setComputedTotalDistance] = useState(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // si pas de prop → fallback
  const gpxPath = referenceGpx || "/tracks/reunion-r2_temp.gpx";

  const MAP_HEIGHT =
    typeof mapHeight === "number"
      ? `${mapHeight}px`
      : mapHeight || "400px";

  const parsedElevationMin = Number(elevationMin);
  const parsedElevationMax = Number(elevationMax);

  const ELEVATION_MIN = Number.isFinite(parsedElevationMin)
    ? parsedElevationMin
    : 0;

  const ELEVATION_MAX = Number.isFinite(parsedElevationMax)
    ? parsedElevationMax
    : 3100;

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
        style: styles.osm,
        center: [0, 0],
        zoom: 2,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }));

      map.on("load", async () => {
        map.resize();

        if (!gpxPath) return;

        try {
          const res = await fetch(gpxPath);
          // La carte peut avoir ete detruite (StrictMode, navigation) pendant l'await.
          if (!map.style) return;
          if (!res.ok) {
            console.warn("Référence GPX non chargée :", gpxPath, res.status);
            return;
          }

          const xml = await res.text();
          if (!map.style) return;
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

      // réinjecter la trace replay
      if (map._replayGeoJSON && !map.getSource("replay-track")) {
        map.addSource("replay-track", {
          type: "geojson",
          data: map._replayGeoJSON,
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

  /* ---------- 3) Chargement du JSON de replay ---------- */
  useEffect(() => {
    if (!mapRef.current || !positionsUrl) return;

    async function loadData() {
      try {
        const posRes = await fetch(positionsUrl);
        const rawData = await posRes.json();

        const normalized = normalizeReplayData(rawData);
        const {
          coords,
          profile,
          rawDistanceMeters,
          rawDplus,
          rawDminus,
          lastFixTime,
          durationSeconds,
        } = normalized;

        if (!coords.length) return;

        const map = mapRef.current;
        if (!map || !map.style) return;

        const geojson = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
        };

        map._replayGeoJSON = geojson;

        const applyReplayLayer = () => {
          if (!mapRef.current || !mapRef.current.style) return;
          if (map.getSource("replay-track")) {
            map.getSource("replay-track").setData(geojson);
          } else {
            map.addSource("replay-track", {
              type: "geojson",
              data: geojson,
            });
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

        const last = coords.at(-1);
        setRunnerPosition(last);
        setLastUpdate(lastFixTime || null);

        if (!map._hasAutoFramed && coords.length > 1) {
          try {
            const bounds = [
              [
                Math.min(...coords.map((c) => c[0])),
                Math.min(...coords.map((c) => c[1])),
              ],
              [
                Math.max(...coords.map((c) => c[0])),
                Math.max(...coords.map((c) => c[1])),
              ],
            ];

            map.fitBounds(bounds, { padding: 40, duration: 0 });
            map._hasAutoFramed = true;
          } catch (e) {
            console.warn("fitBounds échoué :", e);
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

        const distCorrection = Number(distanceFactor) || 1;
        const dplusCorrection = Number(ascentFactor) || 1;
        const dminusCorrection = Number(descentFactor) || 1;

        const distanceKmFinal =
          (rawDistanceMeters * distCorrection) / 1000;
        const dplusFinal = rawDplus * dplusCorrection;
        const dminusFinal = rawDminus * dminusCorrection;

        setComputedTotalDistance(distanceKmFinal);

        const elev = profile.map((p) => ({
          km: (p.distMeters * distCorrection) / 1000,
          alt: p.alt,
          dPlus: Math.round(p.dPlus * dplusCorrection),
          dMinus: Math.round(p.dMinus * dminusCorrection),
        }));
        setElevationData(elev);

        setStats({
          distance: distanceKmFinal.toFixed(2),
          ascent: Math.round(dplusFinal),
          descent: Math.round(dminusFinal),
        });

        if (typeof durationSeconds === "number" && durationSeconds >= 0) {
          setElapsed(Math.floor(durationSeconds));
        } else {
          const firstFixTime = profile[0]?.fixTime || null;
          const lastProfileFixTime = profile.at(-1)?.fixTime || null;

          if (firstFixTime && lastProfileFixTime) {
            const start = new Date(firstFixTime);
            const end = new Date(lastProfileFixTime);
            const diff = Math.max(0, (end - start) / 1000);
            setElapsed(Math.floor(diff));
          } else {
            setElapsed(0);
          }
        }
      } catch (err) {
        console.error("Erreur chargement replay live tracking :", err);
      }
    }

    loadData();
  }, [positionsUrl, distanceFactor, ascentFactor, descentFactor]);

  /* ---------- 4) Formatage & interactions ---------- */

  const formatDuration = (s) => {
    if (!s || s <= 0) return "—";
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
            {km.toFixed(1)} km, {Math.round(alt)} m
          </div>
          <div className="text-gray-600">
            D+ {dPlus} m D− {dMinus} m
          </div>
        </div>
      );
    }
    return null;
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
        <div className="flex justify-center items-center gap-2 font-semibold text-lg text-[#b66b47] sm:mb-1">
          <SatelliteDish size={18} /> {title}
        </div>

        <div className="text-gray-700 mb-2 text-sm sm:flex sm:flex-row sm:items-center sm:justify-center sm:gap-1">
          <div className="flex flex-col items-center sm:hidden">
            <span className="text-xxs">Durée de locomotion :</span>
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
            <span className="font-semibold">
              {Number(stats.distance).toFixed(2)} km
            </span>
            <div className="sm:text-xs text-xxs text-gray-500">
              Distance
            </div>
          </div>
          <div>
            <span className="font-semibold">{stats.ascent} m</span>
            <div className="sm:text-xs text-xxs text-gray-500">D+</div>
          </div>
          <div>
            <span className="font-semibold">{stats.descent} m</span>
            <div className="sm:text-xs text-xxs text-gray-500 sm:mb-2">
              D−
            </div>
          </div>
        </div>
        <div className="sm:text-xs text-xxs mt-0 text-gray-500">
          Dernière position :{" "}
          {lastUpdate
            ? new Date(lastUpdate).toLocaleString("fr-FR")
            : "—"}
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
          className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md text-sm px-3 py-1 hover:bg-[#EFB159]/80 hover:text-white text-gray-700 flex items-center gap-1 z-20"
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
            className="absolute top-[43px] left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md px-3 py-1 hover:bg-[#EFB159]/80 hover:text-white text-gray-700 z-20 flex items-center gap-1 transition no-underline"
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
                className="bg-white/90 backdrop-blur-sm border border-gray-300 shadow rounded-md p-[6px] hover:bg-[#EFB159]/80 hover:text-white transition flex items-center justify-center"
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
                  className={`w-full h-8 flex items-center justify-center rounded hover:bg-[#EFB159]/80 transition ${
                    mapStyle === "osm"
                      ? "bg-[#EFB159]/90 text-white"
                      : "text-gray-700"
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
                  className={`w-full h-8 flex items-center justify-center rounded hover:bg-[#EFB159]/80 transition ${
                    mapStyle === "topo"
                      ? "bg-[#EFB159]/90 text-white"
                      : "text-gray-700"
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
                  className={`w-full h-8 flex items-center justify-center rounded hover:bg-[#EFB159]/80 transition ${
                    mapStyle === "satellite"
                      ? "bg-[#EFB159]/90 text-white"
                      : "text-gray-700"
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
              aria-label={showElevation ? "Masquer le profil altimétrique" : "Afficher le profil altimétrique"}
              aria-expanded={showElevation}
              className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white shadow-md rounded-lg p-1.5 border border-gray-300 hover:bg-[#EFB159]/90 hover:text-white transition z-30"
            >
              {showElevation ? (
                <ChevronDown
                  size={24}
                  className="text-gray-700"
                />
              ) : (
                <ChevronUp
                  size={24}
                  className="text-gray-700"
                />
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
                        tickFormatter={(v) => `${v.toFixed(0)}km`}
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