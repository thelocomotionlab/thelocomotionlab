// components/PlotLazy.jsx
//
// Wrapper client qui charge Plot (et plotly.js-dist-min, ~1MB gz)
// uniquement quand un bloc <plot> est présent dans un article ou un projet.

"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("./Plot"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-[420px] bg-brand-grid/40 rounded-lg animate-pulse"
      aria-label="Chargement du graphique"
    />
  ),
});

export default Plot;
