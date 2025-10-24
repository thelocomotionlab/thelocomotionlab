import { useEffect, useState, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// --- Icône personnalisée pour ton coureur
const runnerIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/847/847969.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -28],
});

// --- Mouvement fluide de la carte
function MapAutoPan({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo(position, { animate: true, duration: 0.5 });
  }, [position, map]);
  return null;
}

export default function LiveTracking() {
  const [positions, setPositions] = useState([]);
  const [latest, setLatest] = useState(null);
  const [stats, setStats] = useState({ distance: 0, ascent: 0, descent: 0 });
  const [lastUpdate, setLastUpdate] = useState(null);
  const mapRef = useRef();

  // --- Ton domaine
  const API_BASE = "https://tracking.thelocomotionlab.com";

  // --- Récupère les positions stockées sur le serveur
  async function fetchPositions() {
    try {
      const res = await fetch(`${API_BASE}/live-positions.json?cacheBust=${Date.now()}`);
      if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return;

      setPositions(data);
      const last = data[data.length - 1];
      setLatest([last.lat, last.lon]);
      setLastUpdate(last.time);
    } catch (err) {
      console.error("Erreur récupération positions :", err);
    }
  }

  // --- Récupère les stats calculées serveur
  async function fetchStats() {
    try {
      const res = await fetch(`${API_BASE}/live-stats.json?cacheBust=${Date.now()}`);
      if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
      const data = await res.json();
      if (!data) return;

      setStats({
        distance: (data.distance_km || 0).toFixed(2),
        ascent: data.ascent_m || 0,
        descent: data.descent_m || 0,
      });
    } catch (err) {
      console.error("Erreur récupération stats :", err);
    }
  }

  // --- Rafraîchissement automatique toutes les 10 s
  useEffect(() => {
    fetchPositions();
    fetchStats();
    const interval = setInterval(() => {
      fetchPositions();
      fetchStats();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // --- Chargement initial
  if (!latest)
    return (
      <div className="text-center text-gray-500 py-10">
        Chargement du suivi en direct…
      </div>
    );

  // --- Rendu principal
  return (
    <div className="w-full flex flex-col items-center gap-4 py-8">
      <h2 className="text-2xl font-semibold text-[#b66b47]">
        Suivi en direct (Live tracking)
      </h2>

      {/* Bloc stats */}
      <div className="bg-white/90 shadow-md rounded-xl p-4 w-[90%] max-w-3xl text-center">
        <div className="flex justify-around text-sm sm:text-base font-medium">
          <div>🏃 Distance : {stats.distance} km</div>
          <div>⬆️ D+ : {stats.ascent} m</div>
          <div>⬇️ D− : {stats.descent} m</div>
        </div>
        <div className="text-xs mt-2 text-gray-500">
          Dernière maj :{" "}
          {lastUpdate ? new Date(lastUpdate).toLocaleTimeString("fr-FR") : "—"}
        </div>
      </div>

      {/* Carte */}
      <div className="w-[90%] h-[500px] rounded-xl overflow-hidden shadow-lg">
        <MapContainer
          center={latest}
          zoom={14}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(map) => (mapRef.current = map)}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Trace progressive */}
          {positions.length > 1 && (
            <Polyline
              positions={positions.map((p) => [p.lat, p.lon])}
              pathOptions={{
                color: "#ff6600",
                weight: 4,
                opacity: 0.9,
              }}
            />
          )}

          {/* Dernière position */}
          <Marker position={latest} icon={runnerIcon}>
            <Popup>
              <strong>Dernière position</strong>
              <br />
              {new Date(lastUpdate).toLocaleTimeString("fr-FR")}
            </Popup>
          </Marker>

          <MapAutoPan position={latest} />
        </MapContainer>
      </div>
    </div>
  );
}
