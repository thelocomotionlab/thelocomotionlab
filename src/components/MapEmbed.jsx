// src/components/MapEmbed.jsx
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, ScaleControl, useMap } from "react-leaflet";
import L from "leaflet";
import * as toGeoJSON from "@tmcw/togeojson";
import "leaflet/dist/leaflet.css";

function FitBounds({ data }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    const layer = L.geoJSON(data);
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
  }, [data, map]);
  return null;
}

export default function MapEmbed({
  gpx,
  geojson,
  height = 420,
  center = [-21.115, 55.53],
  zoom = 10,
  lineColor = "#EFB159",
  lineWeight = 4,
  showEndpoints = true,
}) {
  const [data, setData] = useState(geojson || null);
  const [error, setError] = useState(null);
  const [mapType, setMapType] = useState("satellite");

  const style = useMemo(
    () => ({ color: lineColor, weight: lineWeight, opacity: 0.95 }),
    [lineColor, lineWeight]
  );

  // Chargement et conversion du GPX
  useEffect(() => {
    let cancelled = false;

    async function loadGPX() {
      if (!gpx || data) return;
      try {
        const res = await fetch(gpx);
        if (!res.ok) throw new Error(`Impossible de charger ${gpx}`);
        console.log("GPX chargé depuis", gpx, "status:", res.status);
        const xml = await res.text();
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        let gj = toGeoJSON.gpx(doc);

        // Correction automatique des coordonnées
        gj = fixCoordinates(gj);

        if (!cancelled) setData(gj);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }

    loadGPX();
    return () => {
      cancelled = true;
    };
  }, [gpx, data]);

  // Fonds de carte
  const tileOptions = {
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "© Esri, Maxar, Earthstar Geographics, etc.",
      labelOverlay: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    },
    topo: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: "© OpenTopoMap, SRTM, OpenStreetMap",
    },
    osm: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "© OpenStreetMap contributors",
    },
  };

  const currentTile = tileOptions[mapType];

  return (
    <div
      className="relative"
      style={{
        height,
        background: "transparent",
        border: "none",
        boxShadow: "none",
        overflow: "hidden",
      }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        preferCanvas
        style={{
          height: "100%",
          width: "100%",
          border: "none",
          background: "transparent",
          boxShadow: "none",
        }}
        className="map-embed"
      >
        {/* Fond principal */}
        <TileLayer url={currentTile.url} attribution={currentTile.attribution} />

        {/* Surcouche labels semi-transparente */}
        {mapType === "satellite" && (
          <TileLayer
            url={currentTile.labelOverlay}
            opacity={0.4}
            attribution="© OpenStreetMap contributors"
          />
        )}

        {/* Trace GPX */}
        {data && <GeoJSON data={data} style={style} />}

        {/* Points de départ/arrivée */}
        {data && showEndpoints && (
          <>
            <Endpoint data={data} which="start" />
            <Endpoint data={data} which="end" />
          </>
        )}

        <ScaleControl position="bottomleft" />
        {data && <FitBounds data={data} />}
      </MapContainer>

      {/* Bouton GPX */}
      {gpx && (
        <a
          href={gpx}
          download
          className="absolute top-3 right-3 z-[1000] px-4 py-2 text-sm font-semibold text-white bg-[#EFB159] hover:bg-[#d18e35] rounded-xl shadow-md transition-all duration-200 backdrop-blur-sm font-lab"
          style={{ border: "none", textDecoration: "none" }}
        >
          Télécharger le GPX
        </a>
      )}

      {/* Sélecteur de fond */}
      <div className="absolute bottom-6 right-3 z-[1000] flex gap-2">
        {Object.keys(tileOptions).map((type) => (
          <button
            key={type}
            onClick={() => setMapType(type)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all duration-200 backdrop-blur-sm ${
              mapType === type
                ? "bg-[#EFB159] text-white"
                : "bg-white/80 text-gray-800 hover:bg-white"
            }`}
          >
            {type === "satellite"
              ? "Satellite"
              : type === "topo"
              ? "Topo"
              : "Classique"}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 text-sm bg-red-50 text-red-700">
          Erreur carte : {error}
        </div>
      )}
    </div>
  );
}

// Ajout des marqueurs de départ/arrivée
function Endpoint({ data, which = "start" }) {
  const map = useMap();
  useEffect(() => {
    const coords = extractEndpointLatLng(data, which);
    if (!coords) return;
    const circle = L.circleMarker(coords, {
      radius: 6,
      weight: 3,
      color: which === "start" ? "#22c55e" : "#ef4444",
      fillColor: "#fff",
      fillOpacity: 1,
    }).addTo(map);
    circle.bindTooltip(which === "start" ? "Départ" : "Arrivée", { direction: "top" });
    return () => map.removeLayer(circle);
  }, [data, map, which]);
  return null;
}

// Extraction d'un point de départ/arrivée
function extractEndpointLatLng(gj, which = "start") {
  const line = gj?.features?.find((f) => f.geometry?.type === "LineString");
  if (!line) return null;
  const coords = line.geometry.coordinates;
  if (!coords?.length) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const chosen = which === "start" ? first : last;
  return [chosen[1], chosen[0]];
}

// Correction des coordonnées (lat/lon inversées)
function fixCoordinates(gj) {
  if (!gj?.features) return gj;

  const corrected = {
    ...gj,
    features: gj.features.map((f) => {
      if (!f.geometry?.coordinates) return f;

      // Corrige LineString
      if (f.geometry.type === "LineString") {
        f.geometry.coordinates = f.geometry.coordinates.map(([a, b]) => {
          // Si les valeurs semblent inversées (lat > 40 et lon ~55, typique Réunion)
          if (Math.abs(a) < 10 && Math.abs(b) > 10) {
            return [b, a];
          }
          return [a, b];
        });
      }

      // Corrige MultiLineString
      if (f.geometry.type === "MultiLineString") {
        f.geometry.coordinates = f.geometry.coordinates.map((line) =>
          line.map(([a, b]) => {
            if (Math.abs(a) < 10 && Math.abs(b) > 10) {
              return [b, a];
            }
            return [a, b];
          })
        );
      }

      return f;
    }),
  };

  console.log("Projection GPX vérifiée et corrigée si nécessaire.");
  return corrected;
}
