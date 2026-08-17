// lib/carrouselTrace.js
//
// LA TRACE DE L'ATELIER CARROUSEL : la charger, et la DÉCOUPER EN JOURNÉES.
//
// Deux entrées possibles, parce que les deux existent déjà dans le dépôt :
//   • un .track.json  — le format produit par `pnpm -F site build:track` depuis
//                       un GPX. C'est déjà le format d'échange du live (le
//                       service ET la commande carrousel le lisent) ;
//   • un .gpx brut    — pour une trace qui n'est pas encore passée par le build.
//
// LE DÉCOUPAGE EST KILOMÉTRIQUE, pas horaire. Avant le départ il n'existe aucune
// position datée : « J1 » ne peut donc pas se déduire d'un horodatage, seulement
// d'un point de coupure sur l'itinéraire — typiquement un bivouac. C'est aussi
// ce qui rend l'outil utilisable sur n'importe quelle trace, vécue ou prévue.
//
// Les coupures par défaut viennent des WAYPOINTS de liveConfig quand ils
// existent (Arsine 42 km, Vallouise 84 km, Valgaudémar 130,6 km pour les Écrins :
// les bivouacs SONT les fins d'étape), et d'un découpage régulier sinon.

import { parseGpx, statsDeGpx } from "./gpxStats";

const R = 6_371_000;
const toRad = (deg) => (deg * Math.PI) / 180;

function haversine(lon1, lat1, lon2, lat2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Kilomètre cumulé le long d'une polyligne [lon, lat].
 *
 * `totalKm` RECALE le résultat : les `coords` d'un .track.json sont simplifiées
 * (Douglas-Peucker), leur longueur géométrique est donc plus courte que la
 * distance réelle de la trace. Sans recalage, une coupure à 42 km tomberait
 * ailleurs sur la carte que sur le profil, qui lui porte les vrais kilomètres.
 */
export function cumulKm(coords, totalKm = null) {
  const n = Array.isArray(coords) ? coords.length : 0;
  const out = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const pas =
      Number.isFinite(lon1) && Number.isFinite(lat1) && Number.isFinite(lon2) && Number.isFinite(lat2)
        ? haversine(lon1, lat1, lon2, lat2) / 1000
        : 0;
    out[i] = out[i - 1] + pas;
  }
  const brut = out[n - 1] ?? 0;
  if (Number.isFinite(totalKm) && totalKm > 0 && brut > 0) {
    const k = totalKm / brut;
    for (let i = 0; i < n; i += 1) out[i] *= k;
  }
  return out;
}

/** Lecture d'un .track.json (schemaVersion 1). `null` si inexploitable. */
export function traceDepuisTrackJson(raw) {
  const t = raw ?? null;
  if (t?.schemaVersion !== 1 || !Array.isArray(t.profile) || t.profile.length < 2) return null;
  const coords = Array.isArray(t.coords) ? t.coords : [];
  const totalKm = Number.isFinite(t.totalKm) ? t.totalKm : t.profile[t.profile.length - 1].km;
  return {
    nom: t.nom ?? null,
    totalKm,
    dPlusM: Math.round(t.dPlusM ?? 0),
    dMinusM: Math.round(t.dMinusM ?? 0),
    profil: t.profile,
    coords,
    cumul: cumulKm(coords, totalKm),
    source: "track.json",
  };
}

/** Lecture d'un GPX brut. `null` si le fichier ne porte pas de trace. */
export function traceDepuisGpx(xml) {
  const stats = statsDeGpx(xml);
  if (!stats) return null;
  const { points } = parseGpx(xml);
  const coords = points
    .filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat))
    .map((p) => [p.lon, p.lat]);
  return {
    nom: stats.nom,
    totalKm: stats.distanceKm,
    dPlusM: stats.dPlusM,
    dMinusM: stats.dMinusM,
    profil: stats.profil,
    coords,
    cumul: cumulKm(coords, stats.distanceKm),
    source: "gpx",
  };
}

/** Coupures régulières : `n` journées de longueur égale. */
export function coupuresRegulieres(totalKm, n) {
  const jours = Math.max(1, Math.min(12, Math.round(n) || 1));
  const out = [];
  for (let i = 1; i < jours; i += 1) out.push((totalKm * i) / jours);
  return out;
}

/**
 * Coupures déduites des waypoints : chaque waypoint ferme une journée. Les km
 * hors de l'itinéraire sont écartés, les doublons aussi — un waypoint mal saisi
 * ne doit pas produire une étape de longueur nulle.
 */
export function coupuresDepuisWaypoints(waypoints, totalKm) {
  const vus = new Set();
  return (Array.isArray(waypoints) ? waypoints : [])
    .map((w) => Number(w?.km))
    .filter((km) => Number.isFinite(km) && km > 0.5 && km < totalKm - 0.5)
    .sort((a, b) => a - b)
    .filter((km) => {
      const cle = km.toFixed(1);
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    });
}

/** « J1 », « J2 »… — l'étiquette qu'on écrase ensuite à la main. */
export function etiquetteParDefaut(index) {
  return `J${index + 1}`;
}

/**
 * Découpe la trace aux kilomètres donnés.
 *
 * Chaque segment porte SA polyligne et SA part de profil. Les segments se
 * CHEVAUCHENT d'un point : sans ça, un trou d'un pixel apparaît entre deux
 * journées là où la coupure tombe, et la ligne semble brisée au bivouac.
 *
 * @returns {Array<{index:number, kmDebut:number, kmFin:number, distanceKm:number,
 *   coords:Array<[number,number]>, profil:Array<{km:number,alt:number}>,
 *   dPlusM:number, altMax:number|null}>}
 */
export function decouperTrace(trace, coupures) {
  if (!trace) return [];
  const total = trace.totalKm;
  const bornes = [0, ...(Array.isArray(coupures) ? coupures : []).filter((k) => k > 0 && k < total), total]
    .sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < bornes.length - 1; i += 1) {
    const kmDebut = bornes[i];
    const kmFin = bornes[i + 1];
    if (kmFin - kmDebut <= 0) continue;

    const coords = [];
    for (let j = 0; j < trace.coords.length; j += 1) {
      const km = trace.cumul[j];
      if (km >= kmDebut && km <= kmFin) coords.push(trace.coords[j]);
    }
    // Raccord : on prolonge d'un point de chaque côté pour souder les segments.
    const premier = trace.cumul.findIndex((km) => km >= kmDebut);
    if (premier > 0 && coords.length > 0 && trace.cumul[premier] > kmDebut) {
      coords.unshift(trace.coords[premier - 1]);
    }

    const profil = trace.profil.filter((p) => p.km >= kmDebut && p.km <= kmFin);
    let dPlus = 0;
    for (let k = 1; k < profil.length; k += 1) {
      const d = profil[k].alt - profil[k - 1].alt;
      if (d > 0) dPlus += d;
    }

    segments.push({
      index: segments.length,
      kmDebut,
      kmFin,
      distanceKm: kmFin - kmDebut,
      coords,
      profil,
      dPlusM: Math.round(dPlus),
      altMax: profil.length ? Math.max(...profil.map((p) => p.alt)) : null,
    });
  }
  return segments;
}

/**
 * Point d'ancrage d'une étiquette : le point le PLUS HAUT du segment sur la
 * carte (ordonnée écran minimale), pas son milieu.
 *
 * Le milieu tombe au hasard — souvent sur le trait lui-même, parfois dans une
 * boucle où deux journées se croisent. Le sommet du segment, lui, a par
 * construction du vide au-dessus de lui : l'étiquette s'y pose sans recouvrir
 * la portion qu'elle nomme. C'est ce que « bien placé au-dessus » veut dire
 * quand on ne veut pas déplacer chaque étiquette à la main.
 *
 * L'utilisateur garde le dernier mot : `dx`/`dy` du modèle déplacent ensuite
 * l'étiquette où il veut.
 */
export function ancreDuSegment(segment, project) {
  let meilleur = null;
  for (const c of segment.coords) {
    const [x, y] = project(c);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (meilleur === null || y < meilleur[1]) meilleur = [x, y];
  }
  return meilleur;
}
