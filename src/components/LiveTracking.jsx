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

// --- Fonction utilitaire : calcul de distance haversine (en km)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // rayon Terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Mouvement fluide de la carte
function MapAutoPan({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo(position, { animate: true, duration: 0.5 });
  }, [position]);
  return null;
}

export default function LiveTracking() {
  const [positions, setPositions] = useState([]);
  const [latest, setLatest] = useState(null);
  const [stats, setStats] = useState({ distance: 0, ascent: 0, descent: 0 });
  const [lastUpdate, setLastUpdate] = useState(null);
  const mapRef = useRef();

  // --- Config Traccar
  const API_BASE = "https://tracking.thelocomotionlab.com/api/public";
  const DEVICE_ID = 6; // ⚙️ adapte ton ID ici

  async function fetchPositions() {
    try {
      const res = await fetch(`${API_BASE}/positions?deviceId=${DEVICE_ID}`);
      if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const points = data
          .filter((p) => p.latitude && p.longitude)
          .map((p) => ({
            lat: p.latitude,
            lon: p.longitude,
            alt: p.altitude || 0,
            time: p.deviceTime,
          }));

        setPositions(points);
        const last = points[points.length - 1];
        setLatest([last.lat, last.lon]);
        setLastUpdate(last.time);

        // --- Calcul distance + D+/D-
        let distance = 0,
          ascent = 0,
          descent = 0;
        for (let i = 1; i < points.length; i++) {
          distance += haversine(
            points[i - 1].lat,
            points[i - 1].lon,
            points[i].lat,
            points[i].lon
          );
          const diff = points[i].alt - points[i - 1].alt;
          if (diff > 0) ascent += diff;
          else descent += Math.abs(diff);
        }

        setStats({
          distance: distance.toFixed(2),
          ascent: Math.round(ascent),
          descent: Math.round(descent),
        });
      }
    } catch (err) {
      console.error("Erreur récupération positions :", err);
    }
  }

  // 🔁 Refresh toutes les 10 s
  useEffect(() => {
    fetchPositions();
    const i = setInterval(fetchPositions, 10000);
    return () => clearInterval(i);
  }, []);

  if (!latest)
    return (
      <div className="text-center text-gray-500 py-10">
        Chargement du suivi en direct…
      </div>
    );

  return (
    <div className="w-full flex flex-col items-center gap-4 py-8">
      <h2 className="text-2xl font-semibold text-[#b66b47]">
        Suivi en direct (Live tracking)
      </h2>

      <div className="bg-white/90 shadow-md rounded-xl p-4 w-[90%] max-w-3xl text-center">
        <div className="flex justify-around text-sm sm:text-base font-medium">
          <div>🏃 Distance : {stats.distance} km</div>
          <div>⬆️ D+ : {stats.ascent} m</div>
          <div>⬇️ D− : {stats.descent} m</div>
        </div>
        <div className="text-xs mt-2 text-gray-500">
          Dernière maj : {new Date(lastUpdate).toLocaleTimeString("fr-FR")}
        </div>
      </div>

      <div className="w-[90%] h-[500px] rounded-xl overflow-hidden shadow-lg">
        <MapContainer
          center={latest}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(map) => (mapRef.current = map)}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {positions.length > 1 && (
            <Polyline
              positions={positions.map((p) => [p.lat, p.lon])}
              pathOptions={{
                color: "#ff6600",
                weight: 4,
                opacity: 0.8,
              }}
            />
          )}
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
