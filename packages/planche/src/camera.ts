// packages/planche/src/camera.ts
//
// LA CAMÉRA QUI SUIT LE POINT.
//
// C'est le geste de Coros et de Strava Flyover, et tout tient dans une seule
// exigence : NE JAMAIS SECOUER. Une caméra qui copie le cap instantané d'un
// coureur tremble à chaque lacet ; une caméra qui tourne trop vite dans une
// épingle donne la nausée. D'où deux filtres, et pas un de plus :
//
//   • le cap vient déjà lissé de la séance (`cap`), mais on le lisse ENCORE
//     entre deux images, avec une constante de temps en secondes ;
//   • et quoi qu'il arrive, la rotation est plafonnée en degrés par seconde.
//
// TOUT EST PUR, et calculé image par image à pas de temps fixe : la même vidéo
// sort de n'importe quelle machine. Rien ici ne connaît WebGL — la scène ne
// fait qu'appliquer ce que ce module dit.

import { ecartAngulaire, type PointSeance, type Seance } from "@locomotionlab/trace";
import type { Camera } from "./types.ts";

/** Ce qu'une image demande à la scène : où regarder, d'où, et de quel côté. */
export type Prise = {
  lng: number;
  lat: number;
  /** Degrés, 0 = nord en haut. */
  cap: number;
  /** Degrés depuis la verticale ; 0 = à plat, 60 = très incliné. */
  pitch: number;
  zoom: number;
};

/** Vitesses de référence du zoom automatique, en mètres par seconde. */
const LENT = 1.0;
const RAPIDE = 4.0;

/**
 * Le zoom qu'appelle la vitesse.
 *
 * Serré quand ça monte lentement — c'est là qu'on veut voir la pente et le
 * terrain ; large quand ça descend vite, sinon le paysage défile trop près et
 * on ne comprend plus où l'on est.
 */
export function zoomSelonVitesse(vitesse: number, base: number): number {
  const u = Math.max(0, Math.min(1, (vitesse - LENT) / (RAPIDE - LENT)));
  return base + 0.9 - 1.8 * u;
}

/**
 * Rapproche un cap d'un autre sans jamais dépasser le plafond.
 *
 * On passe par l'écart SIGNÉ le plus court : de 350° à 10°, il y a vingt
 * degrés par le nord, pas trois cent quarante par le sud.
 */
export function capLisse(
  actuel: number,
  vise: number,
  dt: number,
  douceur: number,
  rotationMax: number,
): number {
  const ecart = ecartAngulaire(actuel, vise);
  // Lissage exponentiel : la constante de temps est en secondes, donc le
  // résultat ne dépend pas du nombre d'images par seconde.
  const part = douceur > 0 ? 1 - Math.exp(-dt / douceur) : 1;
  const voulu = ecart * part;
  const plafond = Math.max(0, rotationMax) * dt;
  const borne = Math.max(-plafond, Math.min(plafond, voulu));
  return (((actuel + borne) % 360) + 360) % 360;
}

/** Le cadre d'ensemble : le milieu de la trace, vu de haut et de loin. */
export function priseDEnsemble(seance: Seance, camera: Camera): Prise {
  const pts = seance.points;
  const milieu = pts[Math.floor(pts.length / 2)];
  if (!milieu) return { lng: 0, lat: 0, cap: 0, pitch: 45, zoom: 10 };
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  // Un zoom qui tient l'emprise : chaque niveau divise l'étendue par deux.
  const etendue = Math.max(maxLat - minLat, (maxLon - minLon) * 0.7, 1e-4);
  const zoom = Math.max(3, Math.min(14, Math.log2(180 / etendue) - 1));
  return {
    lng: (minLon + maxLon) / 2,
    lat: (minLat + maxLat) / 2,
    cap: 0,
    pitch: Math.min(camera.pitch, 45),
    zoom,
  };
}

/**
 * La prise d'une image, à partir de la précédente.
 *
 * `precedente` est ce qui rend la caméra douce : sans elle, chaque image
 * repartirait du cap brut du point et la scène tremblerait.
 */
export function priseDe(
  seance: Seance,
  index: number,
  camera: Camera,
  precedente: Prise | null,
  dt: number,
): Prise {
  const p: PointSeance | undefined = seance.points[index];
  if (!p) return precedente ?? { lng: 0, lat: 0, cap: 0, pitch: camera.pitch, zoom: camera.zoom };

  if (camera.mode === "ensemble") {
    const vue = priseDEnsemble(seance, camera);
    // Une dérive lente, pour que le plan ne soit pas mort.
    const derive = precedente ? capLisse(precedente.cap, precedente.cap + 30, dt, 8, 3) : 0;
    return { ...vue, cap: derive };
  }

  const zoom = camera.zoomAuto ? zoomSelonVitesse(p.vitesse, camera.zoom) : camera.zoom;

  if (camera.mode === "orbite") {
    // Le point ne bouge plus, la caméra tourne autour : on ne plafonne pas ici,
    // la vitesse d'orbite EST le réglage.
    const cap = precedente ? (precedente.cap + 18 * dt) % 360 : p.cap;
    return { lng: p.lon, lat: p.lat, cap, pitch: camera.pitch, zoom };
  }

  // « Suivre » et « trajet » partagent le même corps : derrière le point, dans
  // le sens de la marche.
  const cap = precedente
    ? capLisse(precedente.cap, p.cap, dt, camera.douceur, camera.rotationMax)
    : p.cap;
  const zoomDoux = precedente ? precedente.zoom + (zoom - precedente.zoom) * Math.min(1, dt / 1.5) : zoom;
  return { lng: p.lon, lat: p.lat, cap, pitch: camera.pitch, zoom: zoomDoux };
}

/**
 * Toutes les prises d'un plan, d'un coup.
 *
 * Les calculer d'avance a deux vertus : l'export n'a plus rien à décider image
 * par image, et l'aperçu peut sauter n'importe où sans perdre le lissage —
 * la prise 400 est la même qu'on y soit arrivé en lisant ou en cliquant.
 */
export function prisesDuPlan(
  seance: Seance | null,
  images: readonly number[],
  camera: Camera,
  imagesParSeconde: number,
): Prise[] {
  if (!seance || images.length === 0) return [];
  const dt = 1 / Math.max(1, imagesParSeconde);
  const out: Prise[] = [];
  let precedente: Prise | null = null;
  for (const index of images) {
    precedente = priseDe(seance, index, camera, precedente, dt);
    out.push(precedente);
  }
  return out;
}
