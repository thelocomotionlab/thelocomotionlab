// packages/tracking/src/index.ts
//
// API publique de @locomotionlab/tracking : la logique + l'UI du live-tracking.
// Consommateur actuel : apps/site (Cloudflare Pages, via next/dynamic).
// AUCUN secret, AUCUN code server-only.
//
// Le lazy-load de maplibre/recharts reste à la charge du CONSOMMATEUR
// (next/dynamic ssr:false), comme avant — pas dans ce package.

export { default as LiveTrackingMap } from "./LiveTrackingMap";
export { default as Replay } from "./Replay";
export { default as MapStylePills } from "./MapStylePills";

// Le profil altimétrique du labo, nu : le direct l'habille en carte, les
// replays et les cartes GPX le collent sous leur carte.
export { default as ElevationProfile } from "./ElevationProfile";
export type {
  ElevationProfileProps,
  ProfileGraphPoint,
  ProfileWaypoint,
} from "./ElevationProfile";
export { createHoverPointElement } from "./utils";

// Le look cartographique du labo, partagé avec les cartes du site.
export {
  mapStyles,
  resolveMapStyle,
  ensureTraceLayers,
  traceColors,
  MAP_STYLE_OPTIONS,
  DEFAULT_MAP_STYLE,
} from "./mapStyles";
export type { MapStyleName } from "./mapStyles";

export { useTrackingData } from "./useTrackingData";
export type { UseTrackingDataOptions } from "./useTrackingData";

export { normalizeReplayData, computeStatsFromPoints } from "./replayData";
export type { NormalizedReplay } from "./replayData";

export * from "./types";
