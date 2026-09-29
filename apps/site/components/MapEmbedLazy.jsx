// components/MapEmbedLazy.jsx
//
// Wrapper client qui charge MapEmbed (et sa dépendance maplibre-gl ~165KB gz)
// uniquement lorsqu'il est effectivement rendu. Tant qu'aucun lien .gpx ni
// bloc carte n'apparaît dans la page, maplibre-gl n'est pas inclus dans le
// bundle initial.
//
// La carte passe par CarteSure : sans WebGL, un repli remplace la carte (avec
// la trace GPX en téléchargement) au lieu de faire tomber toute la page.

"use client";

import dynamic from "next/dynamic";

import CarteSure from "./CarteSure";

const MapEmbedDynamique = dynamic(() => import("./MapEmbed"), {
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

export default function MapEmbed(props) {
  return (
    <CarteSure gpx={props.gpx}>
      <MapEmbedDynamique {...props} />
    </CarteSure>
  );
}
