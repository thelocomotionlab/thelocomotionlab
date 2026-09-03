// packages/tracking/src/utils.ts
//
// Helpers purs (géométrie, URL, formatage) partagés par la carte live et le
// replay. Portés à l'identique des composants historiques du site.

import { brandColors } from "@locomotionlab/ui";
import type { GeoJSONSource } from "maplibre-gl";
import type { GeoLineFeature, GpxGeoJson, LngLat } from "./types";

/**
 * Type de données accepté par maplibre pour une source GeoJSON, dérivé de la
 * signature de maplibre lui-même (donc sans nommer le namespace global GeoJSON).
 */
export type MapSourceData = Parameters<GeoJSONSource["setData"]>[0];

/**
 * Caste un objet GeoJSON « maison » (tracé ou GPX parsé) vers le type attendu
 * par maplibre. On passe par `unknown` pour ne pas dépendre de @types/geojson :
 * la forme est valide au runtime, maplibre la consomme telle quelle.
 */
export const asMapData = (d: GeoLineFeature | GpxGeoJson): MapSourceData =>
  d as unknown as MapSourceData;

/**
 * Concatène une base et un endpoint en URL. Si l'endpoint est déjà absolu
 * (http/https), il est renvoyé tel quel. Renvoie null si endpoint vide.
 */
export function buildUrl(base: string, endpoint: string): string | null {
  if (!endpoint) return null;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;

  const safeBase = (base || "").replace(/\/+$/, "");
  const safeEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  return `${safeBase}${safeEndpoint}`;
}

/** Ajoute un paramètre cacheBust horodaté à une URL (anti-cache des JSON live). */
export function withCacheBust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}cacheBust=${Date.now()}`;
}

/**
 * Boîte englobante [[minLng,minLat],[maxLng,maxLat]] d'une liste de coords.
 * Boucle classique (pas de spread) pour éviter un Stack Overflow sur de longs
 * tracés. Renvoie null si aucune coord finie.
 */
export function getBoundsFromCoords(
  coords: LngLat[]
): [LngLat, LngLat] | null {
  if (!Array.isArray(coords) || coords.length === 0) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (let i = 0; i < coords.length; i++) {
    const lng = coords[i][0];
    const lat = coords[i][1];

    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (minLng === Infinity) return null;

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/** Extrait toutes les coordonnées [lng,lat] d'un FeatureCollection GPX. */
export function getCoordsFromGeoJSON(geojson: GpxGeoJson | null | undefined): LngLat[] {
  if (!geojson || !Array.isArray(geojson.features)) return [];

  const coords: LngLat[] = [];
  const push = (c: unknown) => {
    if (Array.isArray(c) && c.length >= 2) {
      coords.push([c[0] as number, c[1] as number]);
    }
  };

  const collect = (geometry: { type?: string; coordinates?: unknown } | null | undefined) => {
    if (!geometry || !geometry.type) return;

    if (geometry.type === "LineString") {
      (geometry.coordinates as unknown[] | undefined)?.forEach(push);
      return;
    }

    if (geometry.type === "MultiLineString") {
      (geometry.coordinates as unknown[] | undefined)?.forEach((line) => {
        if (!Array.isArray(line)) return;
        line.forEach(push);
      });
      return;
    }

    if (geometry.type === "Point") {
      push(geometry.coordinates);
    }
  };

  geojson.features.forEach((feature) => collect(feature.geometry));
  return coords;
}

/** Formate une durée (secondes) en `HhMMminSSs`. */
export function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h${String(m).padStart(2, "0")}min${String(sec).padStart(2, "0")}s`;
}

/** Crée l'élément DOM du marqueur « coureur » (icône partagée historique). */
export function createRunnerElement(): HTMLDivElement {
  // Le marqueur du direct (apps/site/components/live/LiveMap) : halo pulsant
  // ambre, cœur terracotta cerclé de crème. Il remplace l'icône externe de
  // flaticon — une image tierce, hors charte, que rien ne garantissait.
  // L'animation `ll-pulse` vit dans la feuille globale du site.
  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:18px;height:18px;";
  const halo = document.createElement("div");
  halo.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${brandColors.accent};animation:ll-pulse 2.4s ease-out infinite;`;
  const core = document.createElement("div");
  core.style.cssText = `position:absolute;inset:3px;border-radius:50%;background:${brandColors.deep};box-shadow:0 0 0 3px ${brandColors.bg},0 4px 12px rgba(0,0,0,0.35);`;
  el.append(halo, core);
  return el;
}
