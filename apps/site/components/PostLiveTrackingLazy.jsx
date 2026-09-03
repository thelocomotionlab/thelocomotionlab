// components/PostLiveTrackingLazy.jsx
//
// Adaptateur fin du site vers @locomotionlab/tracking (composant Replay).
//
// Le replay post-course lit UN fichier statique (public/replays/*) : pas de
// proxy, pas de token. Ce fichier ne fait que préserver le lazy-load de
// maplibre-gl via next/dynamic({ ssr:false }), chargé seulement quand
// un bloc <postlivetracking> est présent dans le markdown d'un projet.
//
// ProjetBody continue d'importer ce composant et de lui passer les props de la
// directive (positionsUrl, totalDistanceKm, distanceFactor, …) → la même
// directive rend le composant du package, inline natif.

"use client";

import dynamic from "next/dynamic";

const Replay = dynamic(
  () => import("@locomotionlab/tracking").then((m) => m.Replay),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full h-96 bg-brand-grid/40 rounded-lg animate-pulse"
        role="status"
        aria-live="polite"
        aria-label="Chargement du replay"
      />
    ),
  }
);

export default Replay;
