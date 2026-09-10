// packages/trace/src/geo.ts
//
// La géométrie du terrain : distance entre deux points, kilomètre cumulé le
// long d'une polyligne, et cap de marche. Rien de cartographique ici — la
// projection et le cadrage appartiennent au rendu, pas à la donnée.

import type { Coord } from "./types.ts";

const R = 6_371_000;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Distance orthodromique en MÈTRES entre deux points en degrés décimaux. */
export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Cap en degrés (0 = nord, 90 = est) de `a` vers `b`.
 *
 * L'azimut initial de l'orthodromie, pas l'angle du plan : sur quelques mètres
 * les deux se confondent, mais la formule plane dérive dès qu'on monte en
 * latitude — et le labo court dans les Alpes.
 */
export function cap(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLon = rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Kilomètre cumulé le long d'une polyligne.
 *
 * `totalKm` RECALE le résultat : les coordonnées d'un `.track.json` sont
 * simplifiées (Douglas-Peucker), leur longueur géométrique est donc plus courte
 * que la distance réelle. Sans recalage, une coupure à 42 km tomberait ailleurs
 * sur la carte que sur le profil, qui lui porte les vrais kilomètres.
 */
export function cumulKm(coords: readonly Coord[], totalKm: number | null = null): number[] {
  const n = Array.isArray(coords) ? coords.length : 0;
  const out = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const [lon1, lat1] = coords[i - 1]!;
    const [lon2, lat2] = coords[i]!;
    const pas =
      Number.isFinite(lon1) && Number.isFinite(lat1) && Number.isFinite(lon2) && Number.isFinite(lat2)
        ? haversine(lon1, lat1, lon2, lat2) / 1000
        : 0;
    out[i] = out[i - 1]! + pas;
  }
  const brut = out[n - 1] ?? 0;
  if (Number.isFinite(totalKm) && (totalKm as number) > 0 && brut > 0) {
    const k = (totalKm as number) / brut;
    for (let i = 0; i < n; i += 1) out[i] = out[i]! * k;
  }
  return out;
}

/**
 * Moyenne d'une suite de CAPS, en passant par les vecteurs unitaires.
 *
 * Moyenner des degrés donnerait 180° pour un cap qui oscille entre 350° et 10°,
 * c'est-à-dire l'exact opposé de la direction suivie. La caméra de Survol part
 * de là : une erreur de ce genre lui fait faire un demi-tour à chaque passage
 * au nord.
 */
export function capMoyen(caps: readonly number[]): number {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const c of caps) {
    if (!Number.isFinite(c)) continue;
    x += Math.cos(rad(c));
    y += Math.sin(rad(c));
    n += 1;
  }
  if (n === 0 || (x === 0 && y === 0)) return 0;
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Le plus court chemin angulaire de `a` vers `b`, dans [-180, 180]. */
export function ecartAngulaire(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}
