// components/LiveTrackingLazy.jsx
//
// Wrapper client qui charge LiveTracking (et ses dépendances maplibre-gl
// ~165KB gz + recharts ~64KB gz) uniquement quand un bloc <livetracking>
// est présent dans le markdown d'un projet.

"use client";

import dynamic from "next/dynamic";

const LiveTracking = dynamic(() => import("./LiveTracking"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-96 bg-brand-grid/40 rounded-lg animate-pulse"
      aria-label="Chargement du live-tracking"
    />
  ),
});

export default LiveTracking;
