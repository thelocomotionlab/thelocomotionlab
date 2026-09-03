// packages/tracking/src/types.ts
//
// CONTRAT DE DONNÉES du live-tracking — préservé À L'IDENTIQUE pour ne rien
// casser. Ces formes décrivent les JSON produits par le back (sur le VPS) et
// consommés par le front, ainsi que les structures dérivées utilisées par la
// présentation (carte + profil altimétrique).
//
// AUCUN secret, AUCUN token : ce package est bundlé dans le site (Cloudflare
// Pages). Les composants ne reçoivent que des URL.

import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";

/** Couple [longitude, latitude] (ordre maplibre/GeoJSON). */
export type LngLat = [number, number];

/**
 * Feature GeoJSON « LineString » minimale (tracé). On évite volontairement de
 * dépendre du namespace global `GeoJSON` (@types/geojson) : la résolution des
 * types ambiants varie selon le consommateur. On passe ces objets à maplibre
 * via un cast `unknown`.
 */
export type GeoLineFeature = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: LngLat[] };
};

/** Forme souple d'un GeoJSON parsé depuis un GPX (toGeoJSON.gpx). */
export type GpxGeoJson = {
  type?: string;
  features?: Array<{ geometry?: { type?: string; coordinates?: unknown } | null }>;
  [k: string]: unknown;
};

/**
 * Fond de carte demandé par une balise ou une prop. Les noms canoniques sont
 * ceux de mapStyles.ts (relief | topo | sat) ; « osm » et « satellite » sont
 * les anciens noms, encore acceptés et normalisés par resolveMapStyle().
 */
export type MapStyleId = "relief" | "topo" | "sat" | "osm" | "satellite";

/**
 * Un point enrichi du tableau `profile[]` de /live-positions.json
 * (produit par le back : distances cumulées, D+/D-, altitude…).
 */
export type ProfilePoint = {
  idx?: number;
  fixTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  alt?: number;
  distMeters?: number;
  distKm?: number;
  dPlus?: number;
  dMinus?: number;
};

/** Bloc `stats` de /live-positions.json. */
export type LiveStats = {
  /** Distance totale en MÈTRES. */
  distance?: number;
  dplus?: number;
  dminus?: number;
  durationSeconds?: number;
  lastFixTime?: string | null;
};

/** /live-positions.json — format courant { meta, stats, profile, debug }. */
export type LivePositions = {
  meta?: unknown;
  stats?: LiveStats;
  profile?: ProfilePoint[];
  debug?: unknown;
};

/** /live-timer.json — état du chrono. */
export type LiveTimer = {
  running: boolean;
  startTime: string | null;
  stopTime: string | null;
};

/**
 * Position brute Traccar — ANCIEN format de replay (tableau de positions),
 * encore présent dans certains public/replays/*. Géré par normalizeReplayData.
 */
export type RawTraccarPosition = {
  latitude: number;
  longitude: number;
  altitude?: number;
  fixTime?: string | null;
};

/** Statistiques formatées pour l'affichage (bloc en-tête). */
export type DisplayStats = {
  /** Distance en km, déjà formatée (toFixed(2)) comme l'historique. */
  distance: string;
  /** D+ en mètres (arrondi). */
  ascent: number;
  /** D- en mètres (arrondi). */
  descent: number;
};

/** Un point du profil altimétrique (axe recharts). */
export type ElevationPoint = {
  km: number;
  alt: number;
  dPlus: number;
  dMinus: number;
};

/**
 * Carte maplibre dont on « stashe » des objets sur l'instance, comme le faisait
 * le composant historique (références GeoJSON, marqueur coureur, drapeau de
 * cadrage auto). Typé ici pour garder la sécurité de type sur le reste de l'API.
 */
export type MutableMap = MlMap & {
  _referenceGeoJSON?: GpxGeoJson;
  _liveTrackGeoJSON?: GeoLineFeature;
  _replayGeoJSON?: GeoLineFeature;
  _runnerMarker?: MlMarker;
  _hasAutoFramed?: boolean;
};

/** Données dérivées exposées par useTrackingData (présentation = consommateur). */
export type TrackingData = {
  /** Tracé (coordonnées valides), dans l'ordre. */
  coords: LngLat[];
  /** Points du profil normalisés (distMeters/alt/dPlus/dMinus/lat/lng/fixTime). */
  profile: ProfilePoint[];
  /** Stats formatées pour l'en-tête. */
  stats: DisplayStats;
  /** Série du profil altimétrique pour recharts. */
  elevationData: ElevationPoint[];
  /** Distance totale calculée (km), pour borner l'axe X. */
  computedTotalDistance: number | null;
  /** Horodatage de la dernière position connue (ISO). */
  lastUpdate: string | null;
  /** Durée de locomotion en secondes. */
  elapsed: number;
  /** État du chrono (mode live ; en replay : valeurs neutres). */
  timer: LiveTimer;
  /** Perte de connexion au serveur live (mode live uniquement). */
  connectionError: boolean;
  /**
   * Compteur incrémenté à chaque NOUVELLE donnée appliquée. La présentation
   * l'écoute pour pousser le tracé sur la carte au bon moment.
   */
  revision: number;
};

/** Props de <LiveTrackingMap> (carte live + profil). */
export type LiveTrackingMapProps = {
  /** Base URL du proxy live (JAMAIS de token). Défaut : domaine de prod. */
  apiBase?: string;
  positionsEndpoint?: string;
  timerEndpoint?: string;
  totalDistanceKm?: number | string;
  elevationMin?: number | string;
  elevationMax?: number | string;
  referenceGpx?: string;
  title?: string;
  pollIntervalMs?: number | string;
  initialMapStyle?: MapStyleId;
  mapHeight?: number | string;
};

/** Props de <Replay> (post-course, fichier statique). */
export type ReplayProps = {
  /** URL d'un JSON statique (public/replays/*). Nouveau OU ancien format. */
  positionsUrl?: string;
  totalDistanceKm?: number | string;
  elevationMin?: number | string;
  elevationMax?: number | string;
  referenceGpx?: string;
  title?: string;
  distanceFactor?: number | string;
  ascentFactor?: number | string;
  descentFactor?: number | string;
  mapHeight?: number | string;
  initialMapStyle?: MapStyleId;
};
