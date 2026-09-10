// packages/trace/src/trace.ts
//
// L'ITINÉRAIRE LU EN KILOMÈTRES, et son DÉCOUPAGE EN JOURNÉES.
//
// Deux entrées, parce que les deux existent dans le dépôt :
//   • un `.track.json` — le format produit par `pnpm -F site build:track` depuis
//     un GPX, déjà le format d'échange du direct ;
//   • un `.gpx` brut — pour une trace qui n'est pas encore passée par le build.
//
// LE DÉCOUPAGE EST KILOMÉTRIQUE, PAS HORAIRE. Avant le départ il n'existe aucune
// position datée : « J1 » ne peut donc pas se déduire d'un horodatage, seulement
// d'un point de coupure sur l'itinéraire — typiquement un bivouac. C'est aussi
// ce qui rend l'outil utilisable sur n'importe quelle trace, vécue ou prévue.

import { deniveleCumule } from "./denivele.ts";
import { cumulKm } from "./geo.ts";
import { statsDeGpx } from "./stats.ts";
import { parseGpx } from "./gpx.ts";
import type { Coord, PointProfil, Segment, Trace } from "./types.ts";

/**
 * Complète un profil qui n'apporte pas son dénivelé accumulé.
 *
 * Un `.track.json` ne porte que des couples km / altitude : le cumul se
 * reconstruit ici, par la même hystérésis que partout ailleurs, sur la seule
 * altitude dont on dispose. Un profil qui l'apporte déjà n'est pas retouché —
 * son cumul vient de la pleine résolution, celui-ci n'en serait qu'une
 * approximation.
 */
function avecCumul(profil: readonly PointProfil[]): PointProfil[] {
  if (profil.every((p) => Number.isFinite(p.dp) && Number.isFinite(p.dm))) return [...profil];
  const { cumul } = deniveleCumule(profil.map((p) => p.alt));
  return profil.map((p, i) => ({ ...p, dp: cumul[i]?.dp ?? 0, dm: cumul[i]?.dm ?? 0 }));
}

/** Lecture d'un `.track.json` (schemaVersion 1). `null` si inexploitable. */
export function traceDepuisTrackJson(raw: unknown): Trace | null {
  const t = (raw ?? null) as Record<string, unknown> | null;
  if (!t || t.schemaVersion !== 1) return null;
  const profil = t.profile as PointProfil[] | undefined;
  if (!Array.isArray(profil) || profil.length < 2) return null;

  const coords = (Array.isArray(t.coords) ? t.coords : []) as Coord[];
  const totalKm = Number.isFinite(t.totalKm)
    ? (t.totalKm as number)
    : profil[profil.length - 1]!.km;

  return {
    nom: (t.nom as string | null) ?? null,
    totalKm,
    dPlusM: Math.round((t.dPlusM as number) ?? 0),
    dMinusM: Math.round((t.dMinusM as number) ?? 0),
    profil: avecCumul(profil),
    coords,
    cumul: cumulKm(coords, totalKm),
    dureeSecondes: null,
    // Un `.track.json` est un itinéraire PRÉVU : `build:track` ne conserve aucun
    // horodatage. Il ne peut donc jamais servir de bilan.
    vecue: false,
    source: "track.json",
  };
}

/** Lecture d'un GPX brut. `null` si le fichier ne porte pas de trace. */
export function traceDepuisGpx(xml: unknown): Trace | null {
  const stats = statsDeGpx(xml);
  if (!stats) return null;
  const { points } = parseGpx(xml);
  const coords: Coord[] = points.map((p) => [p.lon, p.lat]);
  return {
    nom: stats.nom,
    totalKm: stats.distanceKm,
    dPlusM: stats.dPlusM,
    dMinusM: stats.dMinusM,
    profil: stats.profil,
    coords,
    cumul: cumulKm(coords, stats.distanceKm),
    dureeSecondes: stats.dureeSecondes,
    vecue: stats.dureeSecondes !== null,
    source: "gpx",
  };
}

/**
 * BOUT À BOUT plusieurs traces, dans l'ordre donné.
 *
 * Le cas qui l'exige : une aventure de plusieurs jours enregistrée en une sortie
 * par jour — la montre s'arrête au bivouac.
 *
 * CE QUI SE RECOLLE ET CE QUI NE SE RECOLLE PAS :
 *   • les kilomètres du profil sont DÉCALÉS du cumul des traces précédentes,
 *     sinon chaque jour repartirait de 0 et le profil se replierait sur lui-même ;
 *   • les distances et dénivelés s'additionnent ;
 *   • la durée n'est SOMMÉE que si toutes les traces en portent une — sinon on
 *     annoncerait un temps amputé des jours sans horodatage, ce qui est pire que
 *     pas de temps du tout ;
 *   • les nuits entre deux traces ne comptent nulle part : c'est du temps en
 *     mouvement qu'on additionne, pas un temps écoulé.
 *
 * L'ordre est celui des fichiers : c'est à l'appelant de les trier avant.
 */
export function fusionnerTraces(traces: readonly (Trace | null)[]): Trace | null {
  const valides = (Array.isArray(traces) ? traces : []).filter(
    (t): t is Trace => t !== null && t.totalKm > 0,
  );
  if (valides.length === 0) return null;
  if (valides.length === 1) return valides[0]!;

  const coords: Coord[] = [];
  const profil: PointProfil[] = [];
  let totalKm = 0;
  let dPlusM = 0;
  let dMinusM = 0;

  for (const t of valides) {
    coords.push(...t.coords);
    // Les cumuls de dénivelé se décalent comme les kilomètres : chaque trace
    // repart de zéro, la fusion les met bout à bout.
    for (const p of t.profil) {
      profil.push({ km: totalKm + p.km, alt: p.alt, dp: dPlusM + p.dp, dm: dMinusM + p.dm });
    }
    totalKm += t.totalKm;
    dPlusM += t.dPlusM;
    dMinusM += t.dMinusM;
  }

  const toutesHorodatees = valides.every((t) => (t.dureeSecondes ?? 0) > 0);
  return {
    nom: valides[0]!.nom,
    totalKm,
    dPlusM,
    dMinusM,
    profil,
    coords,
    cumul: cumulKm(coords, totalKm),
    dureeSecondes: toutesHorodatees
      ? valides.reduce((s, t) => s + (t.dureeSecondes ?? 0), 0)
      : null,
    vecue: toutesHorodatees,
    source: "fusion",
    jonctions: valides
      .slice(0, -1)
      .map((_, i) => valides.slice(0, i + 1).reduce((s, t) => s + t.totalKm, 0)),
  };
}

/** Coupures régulières : `n` journées de longueur égale. */
export function coupuresRegulieres(totalKm: number, n: number): number[] {
  const jours = Math.max(1, Math.min(12, Math.round(n) || 1));
  const out: number[] = [];
  for (let i = 1; i < jours; i += 1) out.push((totalKm * i) / jours);
  return out;
}

/**
 * Coupures déduites des waypoints : chaque waypoint ferme une journée.
 *
 * Les kilomètres hors de l'itinéraire sont écartés, les doublons aussi — un
 * waypoint mal saisi ne doit pas produire une étape de longueur nulle.
 */
export function coupuresDepuisWaypoints(
  waypoints: readonly { km?: unknown }[],
  totalKm: number,
): number[] {
  const vus = new Set<string>();
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
export function etiquetteParDefaut(index: number): string {
  return `J${index + 1}`;
}

/**
 * Découpe la trace aux kilomètres donnés.
 *
 * Chaque segment porte SA polyligne et SA part de profil. Les segments se
 * CHEVAUCHENT d'un point : sans ça, un trou d'un pixel apparaît entre deux
 * journées là où la coupure tombe, et la ligne semble brisée au bivouac.
 */
export function decouperTrace(trace: Trace | null, coupures: readonly number[]): Segment[] {
  if (!trace) return [];
  const total = trace.totalKm;
  const bornes = [
    0,
    ...(Array.isArray(coupures) ? coupures : []).filter((k) => k > 0 && k < total),
    total,
  ].sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < bornes.length - 1; i += 1) {
    const kmDebut = bornes[i]!;
    const kmFin = bornes[i + 1]!;
    if (kmFin - kmDebut <= 0) continue;

    const coords: Coord[] = [];
    for (let j = 0; j < trace.coords.length; j += 1) {
      const km = trace.cumul[j]!;
      if (km >= kmDebut && km <= kmFin) coords.push(trace.coords[j]!);
    }
    // Raccord : on prolonge d'un point en amont pour souder les segments.
    const premier = trace.cumul.findIndex((km) => km >= kmDebut);
    if (premier > 0 && coords.length > 0 && trace.cumul[premier]! > kmDebut) {
      coords.unshift(trace.coords[premier - 1]!);
    }

    const profil = trace.profil.filter((p) => p.km >= kmDebut && p.km <= kmFin);
    // LE D+ D'UNE JOURNÉE EST UNE SOUSTRACTION.
    //
    // Le profil porte le dénivelé accumulé depuis le départ, mesuré une fois
    // par hystérésis sur l'altitude à pleine résolution. Le mesurer une seconde
    // fois ici — en additionnant les écarts d'un profil décimé — comptait le
    // tremblement de l'altimètre comme du relief : la somme des journées
    // dépassait le total de la trace, et la planche publiait un chiffre que
    // l'atelier ne reconnaissait pas. La DESCENTE suit le même chemin ; elle dit
    // ce que les jambes ont pris, et mérite la même mesure que la montée.
    const dPlus = cumulA(trace.profil, kmFin, "dp") - cumulA(trace.profil, kmDebut, "dp");
    const dMoins = cumulA(trace.profil, kmFin, "dm") - cumulA(trace.profil, kmDebut, "dm");

    segments.push({
      index: segments.length,
      kmDebut,
      kmFin,
      distanceKm: kmFin - kmDebut,
      coords,
      profil,
      dPlusM: Math.round(dPlus),
      dMinusM: Math.round(dMoins),
      altMax: profil.length ? Math.max(...profil.map((p) => p.alt)) : null,
    });
  }
  return segments;
}

/**
 * Le cumul de dénivelé au kilomètre `km`, interpolé entre deux points du profil.
 *
 * Sans interpolation, deux journées voisines liraient le même point de profil à
 * leur frontière commune et se partageraient mal les mètres qui tombent entre
 * deux échantillons.
 */
function cumulA(profil: readonly PointProfil[], km: number, cle: "dp" | "dm"): number {
  if (profil.length === 0) return 0;
  if (km <= profil[0]!.km) return profil[0]![cle];
  const dernier = profil[profil.length - 1]!;
  if (km >= dernier.km) return dernier[cle];
  let i = 1;
  while (i < profil.length && profil[i]!.km < km) i += 1;
  const a = profil[i - 1]!;
  const b = profil[i]!;
  const large = b.km - a.km;
  const part = large > 0 ? (km - a.km) / large : 0;
  return a[cle] + (b[cle] - a[cle]) * part;
}

/**
 * Point d'ancrage d'une étiquette : le point le PLUS HAUT du segment à l'écran
 * (ordonnée minimale), pas son milieu.
 *
 * Le milieu tombe au hasard — souvent sur le trait lui-même, parfois dans une
 * boucle où deux journées se croisent. Le sommet du segment, lui, a par
 * construction du vide au-dessus de lui : l'étiquette s'y pose sans recouvrir la
 * portion qu'elle nomme. L'auteur garde le dernier mot en la déplaçant.
 */
export function ancreDuSegment(
  segment: Pick<Segment, "coords">,
  project: (c: Coord) => [number, number],
): [number, number] | null {
  let meilleur: [number, number] | null = null;
  for (const c of segment.coords) {
    const [x, y] = project(c);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (meilleur === null || y < meilleur[1]) meilleur = [x, y];
  }
  return meilleur;
}
