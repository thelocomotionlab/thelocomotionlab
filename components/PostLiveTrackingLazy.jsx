// components/PostLiveTrackingLazy.jsx
//
// Wrapper client qui charge PostLiveTracking (et ses dépendances maplibre-gl
// ~165KB gz + recharts ~64KB gz) uniquement quand un bloc <postlivetracking>
// est présent dans le markdown d'un projet.

"use client";

import dynamic from "next/dynamic";

const PostLiveTracking = dynamic(() => import("./PostLiveTracking"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-96 bg-brand-grid/40 rounded-lg animate-pulse"
      role="status"
      aria-live="polite"
      aria-label="Chargement du replay"
    />
  ),
});

export default PostLiveTracking;
