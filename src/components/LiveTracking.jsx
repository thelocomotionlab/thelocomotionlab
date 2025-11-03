import { useEffect, useRef, useState } from "react";
import { SatelliteDish, Crosshair, ChevronDown, ChevronUp, Map as MapIcon, Mountain, Globe2 } from "lucide-react";
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
  const TOTAL_DISTANCE_KM = 165;

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
      center: [55.5325, -21.1151],
      zoom: 10,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", async () => {
      try {
        const res = await fetch("/tracks/reunion-r2_temp.gpx");
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
            paint: { "line-color": "#ff5500", "line-width": 4, "line-opacity": 0.9 },
          });
        }

        const last = coords.at(-1);
        setRunnerPosition(last);

        // ✅ Centre une seule fois seulement
        if (!map._hasCentered && last) {
          map.flyTo({ center: last, zoom: 12, speed: 0.7 });
          map._hasCentered = true;
        }

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

        // --- Profil altimétrique continu ---
        setElevationData((prev) => {
          const newData = [...prev];
          let distAcc = prev.length > 0 ? prev.at(-1).km : 0;
          let dPlus = prev.length > 0 ? prev.at(-1).dPlus : 0;
          let dMinus = prev.length > 0 ? prev.at(-1).dMinus : 0;

          for (let i = Math.max(prev.length, 1); i < positions.length; i++) {
            const prevPt = positions[i - 1];
            const curr = positions[i];
            const dLat = ((curr.latitude - prevPt.latitude) * Math.PI) / 180;
            const dLon = ((curr.longitude - prevPt.longitude) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.cos((prevPt.latitude * Math.PI) / 180) *
                Math.cos((curr.latitude * Math.PI) / 180) *
                Math.sin(dLon / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const d = 6371 * c;
            distAcc += d;

            const deltaAlt = (curr.altitude || 0) - (prevPt.altitude || 0);
            if (deltaAlt > 0) dPlus += deltaAlt;
            else dMinus += Math.abs(deltaAlt);

            newData.push({
              km: distAcc,
              alt: curr.altitude || 0,
              dPlus: Math.round(dPlus),
              dMinus: Math.round(dMinus),
            });
          }
          return newData;
        });
      } catch (err) {
        console.error("Erreur récupération live data :", err);
      }
    }

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 10000);
    return () => clearInterval(interval);
  }, []);

  const recenterMap = () => {
    if (mapRef.current && runnerPosition)
      mapRef.current.flyTo({ center: runnerPosition, zoom: 13, speed: 0.7 });
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
          className="w-full h-[65vh] overflow-hidden shadow-lg border border-gray-200 rounded-2xl"
        ></div>

        {/* Bouton recentrer */}
        <button
          onClick={recenterMap}
          className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md text-sm px-3 py-1 hover:bg-[#EFB159]/80 hover:text-white text-gray-700 flex items-center gap-1 z-20"
        >
          <Crosshair size={16} />
          <span className="hidden sm:inline">Recentrer</span>
        </button>

        {/* Sélecteur de style compact, sous le contrôle de zoom */}
        {/* Sélecteur de style compact (superposé sur le bouton) */}
        <div className="absolute top-[100px] right-2.5 z-30">
          <div className="relative">
            {/* Bouton principal + menu superposé */}
            <div className="relative">
              {!showStyleMenu ? (
                // Bouton carte par défaut
                <button
                  onClick={() => setShowStyleMenu(true)}
                  className="bg-white/90 backdrop-blur-sm border border-gray-300 shadow rounded-md p-[6px] hover:bg-[#EFB159]/80 hover:text-white transition flex items-center justify-center"
                  style={{ width: "32px", height: "32px" }}
                >
                  <MapIcon size={16} className="text-gray-700" />
                </button>
              ) : (
                // Menu superposé (recouvre le bouton)
                <div className="bg-white/95 backdrop-blur-sm border border-gray-300 rounded-md shadow-md flex flex-col items-center p-[2px]" style={{ width: "32px" }}>
                  <button
                    onClick={() => {
                      setMapStyle("osm");
                      setShowStyleMenu(false);
                    }}
                    className={`w-full h-8 flex items-center justify-center rounded hover:bg-[#EFB159]/80 transition ${
                      mapStyle === "osm" ? "bg-[#EFB159]/90 text-white" : "text-gray-700"
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
                      mapStyle === "topo" ? "bg-[#EFB159]/90 text-white" : "text-gray-700"
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
                      mapStyle === "satellite" ? "bg-[#EFB159]/90 text-white" : "text-gray-700"
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
              } overflow-hidden rounded-t-2xl`}
              style={{ zIndex: 20 }}
            >
              {showElevation && (
                <div className="h-32 mt-3 px-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={elevationData}
                      margin={{ top: 10, right: 20, bottom: 0, left: 30 }}
                    >
                      <XAxis
                        dataKey="km"
                        type="number"
                        domain={[0, TOTAL_DISTANCE_KM]}
                        tickFormatter={(v) => `${v.toFixed(0)} km`}
                        tick={{ fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <YAxis
                        domain={[0, 3100]}
                        tick={false}
                        axisLine={false}
                        width={0}
                      />

                      <Tooltip content={<CustomTooltip />} />

                      {/* Lignes iso-altitude visibles */}
                      {[1000, 2000, 3000].map((alt) => (
                        <ReferenceLine
                          key={alt}
                          y={alt}
                          stroke="#999"
                          strokeDasharray="4 4"
                          ifOverflow="extendDomain"
                        >
                          {/* Label interne, aligné à gauche du graphe */}
                          <Label
                            value={`${alt} m`}
                            position="insideTopLeft"
                            dy={-15}          // légèrement au-dessus de la ligne
                            dx={-4}           // petit décalage depuis le bord gauche
                            fill="#555"
                            fontSize={10}
                            fontWeight={400}
                            background={{ fill: "rgba(255,255,255,0.4)" }} // léger fond pour la lisibilité
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
