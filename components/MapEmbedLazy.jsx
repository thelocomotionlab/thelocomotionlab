// components/MapEmbedLazy.jsx
//
// Wrapper client qui charge MapEmbed (et sa dépendance maplibre-gl ~165KB gz)
// uniquement lorsqu'il est effectivement rendu. Tant qu'aucun lien .gpx ni
// bloc carte n'apparaît dans la page, maplibre-gl n'est pas inclus dans le
// bundle initial.

"use client";

import dynamic from "next/dynamic";

const MapEmbed = dynamic(() => import("./MapEmbed"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-64 bg-brand-grid/40 rounded-lg animate-pulse"
      role="status"
      aria-live="polite"
      aria-label="Chargement de la carte"
    />
  ),
});

export default MapEmbed;
