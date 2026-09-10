// packages/planche/src/montage.ts
//
// LE TEMPS DE LA VIDÉO N'EST PAS LE TEMPS DE LA SORTIE.
//
// Une sortie de onze heures tient en trente secondes : entre les deux, il y a
// un montage. Ce module ne fait que ça — dire, pour chaque IMAGE de la vidéo,
// quel point de la séance montrer. Le rendu n'a plus qu'à suivre la liste.
//
// C'EST UNE LISTE, PAS UNE FONCTION DU TEMPS. L'export image par image et
// l'aperçu lisent la même table : ils ne peuvent donc pas diverger, et une
// vidéo exportée est exactement l'aperçu qu'on a validé. Une fonction
// rappelée à `performance.now()` aurait donné un résultat différent selon la
// machine, ce qui est précisément ce qu'on refuse.
//
// LES TENUES SONT DES IMAGES RÉPÉTÉES. Deux secondes d'arrêt sur le départ,
// c'est soixante fois le même point : rien de spécial à gérer en aval.

import type { Seance } from "@locomotionlab/trace";
import type { Montage } from "./types.ts";

/** Le plan de tournage : un index de point de séance par image. */
export type PlanDeSurvol = {
  /** `images[i]` est l'index du point à montrer à l'image `i`. */
  images: number[];
  imagesParSeconde: number;
  /** La part de séance parcourue à chaque image, dans [0, 1]. */
  avancement: number[];
};

/**
 * Les points que le montage retient, dans l'ordre.
 *
 * Le rognage coupe aux bornes, et « retirer les pauses » écarte les points où
 * la montre tournait sans que personne n'avance — c'est ce qui évite qu'un
 * quart de la vidéo se passe devant un refuge.
 */
export function pointsRetenus(seance: Seance, montage: Montage): number[] {
  const n = seance.points.length;
  const debut = montage.debut ?? -Infinity;
  const fin = montage.fin ?? Infinity;
  const gardes: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = seance.points[i]!;
    if (p.t < debut || p.t > fin) continue;
    if (montage.retirerPauses && p.enPause) continue;
    gardes.push(i);
  }
  // Une séance entièrement en pause — ou un rognage qui ne garde rien — ne doit
  // pas rendre une liste vide : on montre au moins le premier point.
  return gardes.length > 0 ? gardes : n > 0 ? [0] : [];
}

/** Trouve dans une suite croissante le rang de la première valeur ≥ cible. */
function rangDe(valeurs: readonly number[], cible: number): number {
  let bas = 0;
  let haut = valeurs.length - 1;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if (valeurs[milieu]! < cible) bas = milieu + 1;
    else haut = milieu;
  }
  return bas;
}

/**
 * Construit le plan.
 *
 * `vitesse` décide de ce qui avance régulièrement : la DISTANCE — le point
 * glisse d'un pas constant, et une longue montée passe vite — ou le TEMPS —
 * fidèle à la sortie, on voit le point ralentir dans la pente. `melange` va de
 * l'un vers l'autre, parce que les deux ont tort seuls : à la distance on perd
 * l'effort, au temps une pause de dix minutes mange la vidéo.
 */
export function planDeSurvol(seance: Seance | null, montage: Montage): PlanDeSurvol {
  const ips = Math.max(1, Math.round(montage.imagesParSeconde));
  const vide: PlanDeSurvol = { images: [], imagesParSeconde: ips, avancement: [] };
  if (!seance || seance.points.length === 0) return vide;

  const retenus = pointsRetenus(seance, montage);
  if (retenus.length === 0) return vide;

  const points = retenus.map((i) => seance.points[i]!);
  const d0 = points[0]!.dist;

  // Le temps CUMULÉ des points retenus : sans les pauses, il n'avance plus au
  // même rythme que l'horloge de la montre, et c'est lui qui fait foi.
  const temps: number[] = new Array(points.length);
  let cumul = 0;
  temps[0] = 0;
  for (let k = 1; k < points.length; k += 1) {
    cumul += Math.max(0, points[k]!.t - points[k - 1]!.t);
    temps[k] = cumul;
  }
  const distances = points.map((p) => p.dist - d0);

  const imagesTenueDebut = Math.round(Math.max(0, montage.tenueDepart) * ips);
  const imagesTenueFin = Math.round(Math.max(0, montage.tenueArrivee) * ips);
  const total = Math.max(1, Math.round(Math.max(1, montage.duree) * ips));
  const enMouvement = Math.max(1, total - imagesTenueDebut - imagesTenueFin);

  const partAutre = Math.max(0, Math.min(1, montage.melange));
  const versTemps = montage.vitesse === "temps" ? 1 - partAutre : partAutre;

  const images: number[] = [];
  const avancement: number[] = [];
  const poser = (rang: number) => {
    images.push(retenus[rang]!);
    avancement.push(points.length > 1 ? rang / (points.length - 1) : 0);
  };

  for (let i = 0; i < imagesTenueDebut; i += 1) poser(0);
  for (let i = 0; i < enMouvement; i += 1) {
    const u = enMouvement > 1 ? i / (enMouvement - 1) : 0;
    const parTemps = temps.length > 1 ? rangDe(temps, u * (temps[temps.length - 1] ?? 0)) : 0;
    const parDistance =
      distances.length > 1 ? rangDe(distances, u * (distances[distances.length - 1] ?? 0)) : 0;
    poser(Math.round(parDistance + (parTemps - parDistance) * versTemps));
  }
  for (let i = 0; i < imagesTenueFin; i += 1) poser(points.length - 1);

  return { images, imagesParSeconde: ips, avancement };
}

/** Le nombre d'images qu'un montage produira — ce qu'annonce le dialogue d'export. */
export function imagesDuMontage(montage: Montage): number {
  return Math.max(1, Math.round(Math.max(1, montage.duree) * Math.max(1, montage.imagesParSeconde)));
}
