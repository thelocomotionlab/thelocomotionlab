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

export { useTrackingData } from "./useTrackingData";
export type { UseTrackingDataOptions } from "./useTrackingData";

export { normalizeReplayData, computeStatsFromPoints } from "./replayData";
export type { NormalizedReplay } from "./replayData";

export * from "./types";
