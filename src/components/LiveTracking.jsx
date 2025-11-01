import { useEffect, useRef, useState } from "react";
import { SatelliteDish, Crosshair, Map as MapIcon, ChevronDown, ChevronUp } from "lucide-react";
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
} from "recharts";

export default function LiveTracking() {
  const mapRef = useRef(null);
  const mapContainer = useRef(null);
  const [stats, setStats] = useState({ distance: 0, ascent: 0, descent: 0 });
  const [lastUpdate, setLastUpdate] = useState(null);
  const [elevationData, setElevationData] = useState([]);
  const [mapStyle, setMapStyle] = useState("osm");
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [runnerPosition, setRunnerPosition] = useState(null);
  const [showElevation, setShowElevation] = useState(true);

  const API_BASE = "https://tracking.thelocomotionlab.com";
  const TOTAL_DISTANCE_KM = 90;

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

  // --- Initialisation carte ---
  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styles[mapStyle],
      center: [5.3641, 44.4196],
      zoom: 13,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", async () => {
      try {
        const res = await fetch("/tracks/utmc_off.gpx");
        const xml = await res.text();
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const geojson = toGeoJSON.gpx(doc);

        map.addSource("reference-track", { type: "geojson", data: geojson });
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
      } catch (err) {
        console.warn("GPX non chargé :", err);
      }
    });

    return () => map.remove();
  }, [mapStyle]);

  // --- Récupération live ---
  useEffect(() => {
    if (!mapRef.current) return;

    async function fetchLiveData() {
      try {
        const [posRes, statsRes] = await Promise.all([
          fetch(`${API_BASE}/live-positions.json?cacheBust=${Date.now()}`),
          fetch(`${API_BASE}/live-stats.json?cacheBust=${Date.now()}`),
        ]);

        const positions = await posRes.json();
        const stats = await statsRes.json();
        if (!Array.isArray(positions) || positions.length === 0) return;

        setStats({
          distance: (stats.distance / 1000 || 0).toFixed(2),
          ascent: stats.dplus || 0,
          descent: stats.dminus || 0,
        });
        setLastUpdate(positions.at(-1)?.fixTime);

        const coords = positions.map((p) => [p.longitude, p.latitude]);
        const geojson = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
        };

        const map = mapRef.current;
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

        const last = coords.at(-1);
        setRunnerPosition(last);

        if (!map._runnerMarker) {
          const el = document.createElement("div");
          el.style.width = "28px";
          el.style.height = "28px";
          el.style.backgroundImage =
            "url('https://cdn-icons-png.flaticon.com/512/847/847969.png')";
          el.style.backgroundSize = "contain";
          el.style.backgroundRepeat = "no-repeat";
          map._runnerMarker = new maplibregl.Marker(el).setLngLat(last).addTo(map);
        } else {
          map._runnerMarker.setLngLat(last);
        }

        // --- Profil altimétrique ---
        const elev = [];
        let distAcc = 0,
          dPlus = 0,
          dMinus = 0;
        for (let i = 1; i < positions.length; i++) {
          const prev = positions[i - 1];
          const curr = positions[i];
          const dLat = ((curr.latitude - prev.latitude) * Math.PI) / 180;
          const dLon = ((curr.longitude - prev.longitude) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((prev.latitude * Math.PI) / 180) *
              Math.cos((curr.latitude * Math.PI) / 180) *
              Math.sin(dLon / 2) ** 2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const d = 6371 * c;
          distAcc += d;

          const deltaAlt = (curr.altitude || 0) - (prev.altitude || 0);
          if (deltaAlt > 0) dPlus += deltaAlt;
          else dMinus += Math.abs(deltaAlt);

          elev.push({
            km: distAcc,
            alt: curr.altitude || 0,
            dPlus: Math.round(dPlus),
            dMinus: Math.round(dMinus),
          });
        }
        setElevationData(elev);
      } catch (err) {
        console.error("Erreur récupération live data :", err);
      }
    }

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 10000);
    return () => clearInterval(interval);
  }, []);

  // --- Recentrage quand on replie/déplie ---
  useEffect(() => {
    if (!mapRef.current || !runnerPosition) return;
    mapRef.current.flyTo({
      center: runnerPosition,
      zoom: showElevation ? 12.5 : 13.5,
      speed: 0.6,
    });
  }, [showElevation, runnerPosition]);

  const recenterMap = () => {
    if (mapRef.current && runnerPosition) {
      mapRef.current.flyTo({ center: runnerPosition, zoom: 13, speed: 0.7 });
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

  const isMobile = window.innerWidth < 640;
  const xTicks = isMobile ? [0, 45, TOTAL_DISTANCE_KM] : [0, 30, 60, TOTAL_DISTANCE_KM];

  // --- Rendu principal ---
  return (
    <div className="flex flex-col items-center w-full py-6 px-3 sm:px-6 gap-3">
      {/* Bloc stats */}
      <div className="bg-white/80 backdrop-blur-md shadow-md rounded-2xl p-4 w-full max-w-3xl text-center border border-gray-200">
        <div className="flex justify-center items-center gap-2 font-semibold text-lg text-[#b66b47] mb-1">
          <SatelliteDish size={18} /> Suivi en direct
        </div>
        <div className="flex justify-around text-sm sm:text-base font-medium text-gray-800">
          <div>
            <span className="font-semibold">{stats.distance} km</span>
            <div className="text-xs text-gray-500">Distance</div>
          </div>
          <div>
            <span className="font-semibold">{stats.ascent} m</span>
            <div className="text-xs text-gray-500">D+</div>
          </div>
          <div>
            <span className="font-semibold">{stats.descent} m</span>
            <div className="text-xs text-gray-500">D−</div>
          </div>
        </div>
        <div className="text-xs mt-2 text-gray-500">
          Dernière màj :{" "}
          {lastUpdate ? new Date(lastUpdate).toLocaleTimeString("fr-FR") : "—"}
        </div>
      </div>

      {/* Carte + profil intégré */}
      <div className="relative w-full max-w-6xl">
        <div
          ref={mapContainer}
          className="w-full h-[60vh] sm:h-[65vh] overflow-hidden shadow-lg border border-gray-200 rounded-2xl"
        ></div>

        {/* Sélecteur de style */}
        <div className="absolute top-3 left-3 z-20">
          <div className="hidden sm:flex bg-white/90 backdrop-blur-sm rounded-md shadow-md text-sm gap-1 p-1">
            {[
              { key: "osm", label: "OSM" },
              { key: "topo", label: "Topo" },
              { key: "satellite", label: "Satellite" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMapStyle(opt.key)}
                className={`px-3 py-1 rounded ${
                  mapStyle === opt.key
                    ? "bg-[#EFB159] text-white"
                    : "text-gray-700 hover:bg-[#EFB159]/80 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bouton recentrer */}
        <button
          onClick={recenterMap}
          className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md text-sm px-3 py-1 hover:bg-[#EFB159]/80 hover:text-white text-gray-700 flex items-center gap-1 z-20"
        >
          <Crosshair size={16} />
          <span className="hidden sm:inline">Recentrer</span>
        </button>

        {/* Profil altimétrique intégré */}
        {elevationData.length > 0 && (
          <>
            {/* Bouton pliant toujours visible */}
            <button
              onClick={() => setShowElevation(!showElevation)}
              className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white shadow-md rounded-full p-1.5 border border-gray-300 hover:bg-[#EFB159]/90 hover:text-white transition z-30"
            >
              {showElevation ? (
                <ChevronDown size={18} className="text-gray-700" />
              ) : (
                <ChevronUp size={18} className="text-gray-700" />
              )}
            </button>

            <div
              className={`absolute bottom-0 left-0 w-full bg-white/60 backdrop-blur-md border-t border-gray-200 shadow-lg transition-all duration-500 ${
                showElevation ? "max-h-48" : "max-h-0"
              } overflow-hidden rounded-t-2xl`}
              style={{ zIndex: 20 }}
            >
              {showElevation && (
                <div className="h-44 mt-3 px-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={elevationData} margin={{ top: 10, right: 20, bottom: 0, left: 20 }}>
                      <XAxis
                        dataKey="km"
                        type="number"
                        domain={[0, TOTAL_DISTANCE_KM]}
                        tickFormatter={(v) => `${v.toFixed(0)} km`}
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="alt"
                        stroke="#B67352"
                        strokeWidth={2}
                        dot={false}
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
