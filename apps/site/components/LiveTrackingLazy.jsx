// components/LiveTrackingLazy.jsx
//
// Adaptateur fin du site vers @locomotionlab/tracking.
//
// La logique + l'UI du live-tracking vivent maintenant dans le package partagé
// (consommé À LA FOIS par le site et par apps/tracking). Ce fichier ne fait plus
// que deux choses :
//   1) préserver le lazy-load de maplibre-gl (~165KB gz) + recharts (~64KB gz)
//      via next/dynamic({ ssr:false }) — chargé seulement quand un bloc
//      <livetracking> est présent dans le markdown d'un projet ;
//   2) résoudre l'URL du proxy live depuis NEXT_PUBLIC_TRACKING_PROXY (jamais de
//      token côté client — uniquement une URL publique). Fallback : l'apiBase de
//      la directive, puis le domaine historique → comportement inchangé.
//
// ProjetBody continue d'importer ce composant et de lui passer les props de la
// directive : la même directive rend donc le composant du package, inline natif.

"use client";

import dynamic from "next/dynamic";

const LiveTrackingMap = dynamic(
  () => import("@locomotionlab/tracking").then((m) => m.LiveTrackingMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full h-96 bg-brand-grid/40 rounded-lg animate-pulse"
        role="status"
        aria-live="polite"
        aria-label="Chargement du live-tracking"
      />
    ),
  }
);

// Inlined au build par Next (préfixe NEXT_PUBLIC_). Non défini → fallback.
const TRACKING_PROXY = process.env.NEXT_PUBLIC_TRACKING_PROXY;

export default function LiveTracking(props) {
  const apiBase =
    TRACKING_PROXY || props.apiBase || "https://tracking.thelocomotionlab.com";

  return <LiveTrackingMap {...props} apiBase={apiBase} />;
}
