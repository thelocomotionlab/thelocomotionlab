import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as toGeoJSON from "@tmcw/togeojson";

export default function MapEmbed({
  gpx,
  lineWeight = 3,
  defaultMinHeight = 350,
}) {
  const mapRef = useRef(null);
  const mapContainer = useRef(null);
  const [mapStyle, setMapStyle] = useState("osm"); // ✅ OSM par défaut
  const [dynamicHeight, setDynamicHeight] = useState(defaultMinHeight);

  const defaultCenter = [55.5364, -21.1151];
  const defaultZoom = 9;

  // 🔹 Ajustement automatique de la hauteur (inchangé)
  useEffect(() => {
    function syncHeight() {
      const mapEl = mapContainer.current;
      if (!mapEl) return;

      const parentSplit = mapEl.closest(".md-split");
      if (!parentSplit) {
        setDynamicHeight(defaultMinHeight);
        return;
      }

      const siblingCol = Array.from(parentSplit.children).find(
        (col) => col !== mapEl.parentElement
      );
      if (!siblingCol) {
        setDynamicHeight(defaultMinHeight);
        return;
      }

      const siblingImg = siblingCol.querySelector("img");
      if (siblingImg) {
        const setHeight = () => {
          const h = siblingImg.getBoundingClientRect().height;
          if (h > 0) setDynamicHeight(h);
        };
        setHeight();
        siblingImg.addEventListener("load", setHeight);
        return () => siblingImg.removeEventListener("load", setHeight);
      } else {
        const h = siblingCol.getBoundingClientRect().height;
        setDynamicHeight(h > 0 ? h : defaultMinHeight);
      }
    }

    syncHeight();
    window.addEventListener("resize", syncHeight);
    return () => window.removeEventListener("resize", syncHeight);
  }, [defaultMinHeight]);

  // 🔹 Création de la carte
  useEffect(() => {
    if (!mapContainer.current) return;

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
            maxzoom: 17,
          },
        },
        layers: [
          { id: "opentopo", type: "raster", source: "opentopo", minzoom: 0, maxzoom: 17 },
        ],
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
            maxzoom: 19,
          },
        },
        layers: [
          { id: "esri", type: "raster", source: "esri", minzoom: 0, maxzoom: 19 },
        ],
      },
    };

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styles[mapStyle],
      center: defaultCenter,
      zoom: defaultZoom,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    async function loadGPX() {
      try {
        const res = await fetch(gpx);
        if (!res.ok) throw new Error("Erreur de chargement GPX");
        const xml = await res.text();
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const geojson = toGeoJSON.gpx(doc);

        map.on("load", () => {
          if (map.getSource("track")) map.removeSource("track");
          if (map.getLayer("track-line")) map.removeLayer("track-line");

          const color = "#FF3B3B"; // ✅ toujours rouge

          map.addSource("track", { type: "geojson", data: geojson });
          map.addLayer({
            id: "track-line",
            type: "line",
            source: "track",
            paint: { "line-color": color, "line-width": lineWeight },
          });

          const coords = geojson.features[0].geometry.coordinates;
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, { padding: 40, duration: 1000 });
        });
      } catch (err) {
        console.error("Erreur GPX:", err);
      }
    }

    loadGPX();
    return () => map.remove();
  }, [gpx, mapStyle, lineWeight]);

  const resetView = () => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: defaultCenter, zoom: defaultZoom, speed: 0.8 });
    }
  };

  // 🔹 Rendu responsive sans coins arrondis
  return (
    <div
      className="w-full shadow overflow-hidden relative"
      style={{
        height: dynamicHeight,
        transition: "height 0.3s ease",
        borderRadius: 0, // ✅ enlève les coins arrondis
      }}
    >
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

      {/* Sélecteur d’arrière-plan */}
      <div
        className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md text-sm flex flex-wrap"
        style={{ zIndex: 10 }}
      >
        {[
          { key: "osm", label: "OSM" },
          { key: "topo", label: "Topo" },
          { key: "satellite", label: "Satellite" },
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => setMapStyle(opt.key)}
            className={`px-3 py-1 m-[2px] rounded transition ${
              mapStyle === opt.key
                ? "bg-[#EFB159] text-white"
                : "text-gray-700 hover:bg-[#EFB159]/80 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Bouton Recentrer */}
      <button
        onClick={resetView}
        className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md text-sm px-3 py-1 hover:bg-[#EFB159]/80 hover:text-white text-gray-700"
        style={{ zIndex: 10 }}
      >
        Recentrer
      </button>
    </div>
  );
}
