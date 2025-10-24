import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as toGeoJSON from "@tmcw/togeojson";

export default function LiveTracking() {
  const mapRef = useRef(null);
  const mapContainer = useRef(null);
  const [stats, setStats] = useState({ distance: 0, ascent: 0, descent: 0 });
  const [lastUpdate, setLastUpdate] = useState(null);

  const API_BASE = "https://tracking.thelocomotionlab.com";

  // Styles identiques à MapEmbed.jsx
  const styles = {
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
      layers: [
        { id: "osm", type: "raster", source: "osm", minzoom: 0, maxzoom: 19 },
      ],
    },
  };

  // --- Initialisation de la carte ---
  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styles.osm,
      center: [5.3641, 44.4196],
      zoom: 13,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-left");

    // --- Trace GPX bleue (référence) ---
    map.on("load", async () => {
      try {
        const res = await fetch("/tracks/utmc.gpx");
        const xml = await res.text();
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const geojson = toGeoJSON.gpx(doc);

        map.addSource("reference-track", { type: "geojson", data: geojson });
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
      } catch (err) {
        console.warn("GPX non chargé :", err);
      }
    });

    // --- Rafraîchissement des données live ---
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
          distance: (stats.distance_km || 0).toFixed(2),
          ascent: stats.ascent_m || 0,
          descent: stats.descent_m || 0,
        });
        setLastUpdate(positions[positions.length - 1].time);

        const coords = positions.map((p) => [p.lon, p.lat]);
        const geojson = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
        };

        // --- Trace live (rouge) ---
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

        // --- Marqueur coureur ---
        const last = coords[coords.length - 1];
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

        map.flyTo({ center: last, speed: 0.5, essential: true });
      } catch (err) {
        console.error("Erreur récupération live data :", err);
      }
    }

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center w-full py-6 px-3 sm:px-6 gap-3">
      {/* --- Bloc stats --- */}
      <div className="bg-white/80 backdrop-blur-md shadow-md rounded-2xl p-4 w-full max-w-3xl text-center border border-gray-200">
        <div className="flex justify-center items-center gap-2 font-semibold text-lg text-[#b66b47] mb-1">
          🛰️ Suivi en direct
        </div>
        <div className="flex justify-around text-sm sm:text-base font-medium text-gray-800">
          <div>
            <span className="font-semibold">{stats.distance}</span> km
            <div className="text-xs text-gray-500">Distance</div>
          </div>
          <div>
            <span className="font-semibold text-green-600">+{stats.ascent}</span> m
            <div className="text-xs text-gray-500">D+</div>
          </div>
          <div>
            <span className="font-semibold text-red-500">−{stats.descent}</span> m
            <div className="text-xs text-gray-500">D−</div>
          </div>
        </div>
        <div className="text-xs mt-2 text-gray-500">
          Dernière maj :{" "}
          {lastUpdate ? new Date(lastUpdate).toLocaleTimeString("fr-FR") : "—"}
        </div>
      </div>

      {/* --- Carte --- */}
      <div
        ref={mapContainer}
        className="w-full max-w-6xl h-[70vh] sm:h-[75vh] rounded-2xl overflow-hidden shadow-lg border border-gray-200"
      ></div>
    </div>
  );
}
