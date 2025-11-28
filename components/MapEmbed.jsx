"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as toGeoJSON from "@tmcw/togeojson";
import { Crosshair, Map as MapIcon, Mountain, Globe2, Download } from "lucide-react";

export default function MapEmbed({
  gpx,
  lineWeight = 3,
  defaultMinHeight = 350,
}) {
  const mapRef = useRef(null);
  const mapContainer = useRef(null);
  const [mapStyle, setMapStyle] = useState("osm");
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [dynamicHeight, setDynamicHeight] = useState(defaultMinHeight);

  const defaultCenter = [55.5364, -21.1151];
  const defaultZoom = 9;

  // 🔹 Ajustement automatique de la hauteur
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

  // --- Styles de carte identiques à LiveTracking
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
      layers: [{ id: "osm", type: "raster", source: "osm" }],
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
        },
      },
      layers: [{ id: "opentopo", type: "raster", source: "opentopo" }],
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

  // --- Création de la carte
  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styles[mapStyle],
      center: defaultCenter,
      zoom: defaultZoom,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }));

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

          const color = "#FF3B3B";
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

  // --- Rendu principal
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: dynamicHeight,
        transition: "height 0.3s ease",
      }}
    >
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

      {/* Bouton Recentrer */}
      <button
        onClick={resetView}
        className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md text-sm px-3 py-1 hover:bg-[#EFB159]/80 hover:text-white text-gray-700 flex items-center gap-1 z-20"
      >
        <Crosshair size={16} />
        <span className="hidden sm:inline">Recentrer</span>
      </button>

      {/* Sélecteur de style compact */}
      <div className="absolute top-[100px] right-2.5 z-30">
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

      {/* Bouton de téléchargement GPX */}
      <a
        href={gpx}
        download
        className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-md shadow-md px-3 py-1 hover:bg-[#EFB159]/80 hover:text-white text-gray-700 z-20 flex items-center gap-1 transition no-underline"
        title="Télécharger la trace GPX"
      >
        <Download size={16} />
        <span className="hidden sm:inline text-sm font-medium">Télécharger</span>
      </a>
    </div>
  );
}
