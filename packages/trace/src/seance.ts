// packages/trace/src/seance.ts
//
// LA SÉANCE : le fichier de montre rejoué seconde par seconde.
//
// C'est ce que Survol survole. Là où une `Trace` est un itinéraire lu en
// kilomètres, une `Seance` est un déroulé lu en SECONDES : on demande « où en
// était-on à 7 min 12 ? » et on obtient une position, une altitude, une allure,
// un cap et une fréquence cardiaque, sans rien avoir à recalculer.
//
// POURQUOI RÉÉCHANTILLONNER À PAS FIXE. Une montre n'écrit pas à intervalle
// régulier : elle saute des points en forêt, en rajoute en virage, et Coros
// change de cadence d'enregistrement selon la batterie. Une caméra qui lit ces
// points tels quels accélère et ralentit au rythme du capteur, pas à celui du
// coureur. Un pas fixe rend le survol régulier ET l'export reproductible : la
// même seconde donne la même image sur tout appareil, ce qui est la condition
// d'un rendu image par image.
//
// LE D+ N'EST PAS RECALCULÉ ICI. Il est repris de la chaîne de `stats.ts`
// — altitude brute, moyenne glissante, hystérésis à 3 m — puis reporté sur la
// timeline par la distance. Le recalculer sur la série rééchantillonnée aurait
// donné un autre nombre, et la même sortie aurait affiché deux D+ selon qu'on
// regarde une planche ou un survol.

import { deniveleCumule, LISSAGE_ALTITUDE, SEUIL_DENIVELE } from "./denivele.ts";
import { cap, haversine } from "./geo.ts";
import { distanceCumulee, parseGpx } from "./gpx.ts";
import { medianeGlissante, moyenneGlissante } from "./lissage.ts";
import type { Pause, PointBrut, PointSeance, ResumeSeance, Seance } from "./types.ts";

export type OptionsSeance = {
  /** Secondes entre deux points rééchantillonnés. */
  pas?: number;
  /** Médiane sur l'altitude affichée, en nombre de points. */
  lissageAltitude?: number;
  /** Fenêtre de lissage de l'allure, en SECONDES. */
  lissageAllure?: number;
  /** Fenêtre de lissage du cap, en SECONDES. */
  lissageCap?: number;
  /** Durée minimale d'un arrêt, en secondes. */
  seuilPause?: number;
  /** Déplacement en deçà duquel on considère qu'on ne bouge pas, en mètres. */
  rayonPause?: number;
  /** Hystérésis du dénivelé, en mètres. */
  seuil?: number;
  /** Lissage de l'altitude servant au dénivelé, en nombre de points. */
  lissage?: number;
  /** Vitesse prêtée à un itinéraire sans horaires, en m/s. */
  vitesseItineraire?: number;
};

const DEFAUTS = {
  pas: 1,
  lissageAltitude: 5,
  lissageAllure: 30,
  lissageCap: 4,
  seuilPause: 20,
  rayonPause: 6,
  seuil: SEUIL_DENIVELE,
  lissage: LISSAGE_ALTITUDE,
  vitesseItineraire: 1.8,
} as const;

/** En deçà, on ne marche pas : l'allure n'a plus de sens et on n'en affiche pas. */
const VITESSE_MINIMALE = 0.3;

/** Une pente au-delà n'existe pas sur un sentier : c'est un artefact de mesure. */
const PENTE_MAX = 60;

/**
 * Comble les trous d'une série mesurée.
 *
 * Un capteur décroche (la ceinture cardio perd le contact, l'altimètre saute) et
 * laisse des `null` au milieu de valeurs bonnes. On les interpole linéairement,
 * et on prolonge les bords par la valeur connue la plus proche. Une série
 * entièrement vide reste `null` : pas de ceinture, pas de fréquence cardiaque —
 * inventer un zéro l'afficherait comme une mesure.
 */
export function remplirTrous(valeurs: readonly (number | null)[], x: readonly number[]): number[] | null {
  const connus: number[] = [];
  for (let i = 0; i < valeurs.length; i += 1) if (valeurs[i] !== null) connus.push(i);
  if (connus.length === 0) return null;

  const out = new Array<number>(valeurs.length);
  for (let i = 0; i < connus[0]!; i += 1) out[i] = valeurs[connus[0]!] as number;
  const dernier = connus[connus.length - 1]!;
  for (let i = dernier + 1; i < valeurs.length; i += 1) out[i] = valeurs[dernier] as number;

  for (let k = 0; k < connus.length; k += 1) {
    const i = connus[k]!;
    out[i] = valeurs[i] as number;
    const j = connus[k + 1];
    if (j === undefined || j === i + 1) continue;
    const x0 = x[i]!;
    const x1 = x[j]!;
    const y0 = valeurs[i] as number;
    const y1 = valeurs[j] as number;
    for (let m = i + 1; m < j; m += 1) {
      const r = x1 === x0 ? 0 : (x[m]! - x0) / (x1 - x0);
      out[m] = y0 + (y1 - y0) * r;
    }
  }
  return out;
}

type Echantillon = {
  t: number;
  lat: number;
  lon: number;
  dist: number;
  alt: number | null;
  fc: number | null;
  cadence: number | null;
};

/**
 * L'axe des temps.
 *
 * Une montre horodate chaque point : on prend ses secondes telles quelles. Un
 * itinéraire tracé à la main n'a pas d'heure — on lui en fabrique une à vitesse
 * constante, ce qui suffit à le survoler mais rend les chiffres de temps
 * dépourvus de sens (`horodatee: false` le dit à l'habillage).
 *
 * Un horodatage qui RECULE est écarté : deux fichiers concaténés à la main, ou
 * un point corrompu, feraient repartir la timeline en arrière et le
 * rééchantillonnage bouclerait sur lui-même.
 */
function axeDesTemps(
  points: readonly PointBrut[],
  cumul: readonly number[],
  vitesseItineraire: number,
): { echantillons: Echantillon[]; horodatee: boolean; debutMs: number | null } {
  const dates = points.filter((p) => p.tMs !== null);
  const t0 = dates[0]?.tMs ?? null;
  const t1 = dates[dates.length - 1]?.tMs ?? null;
  const horodatee = t0 !== null && t1 !== null && t1 > t0;

  const echantillons: Echantillon[] = [];
  let precedent = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const t = horodatee
      ? p.tMs === null
        ? null
        : (p.tMs - (t0 as number)) / 1000
      : cumul[i]! / vitesseItineraire;
    if (t === null || t <= precedent) continue;
    precedent = t;
    echantillons.push({
      t,
      lat: p.lat,
      lon: p.lon,
      dist: cumul[i]!,
      alt: p.alt,
      fc: p.fc,
      cadence: p.cadence,
    });
  }
  return { echantillons, horodatee, debutMs: horodatee ? t0 : null };
}

/** Interpolation linéaire d'une série alignée sur `echantillons` à l'instant `t`. */
function interpoler(y: readonly number[], i: number, r: number): number {
  const a = y[i]!;
  const b = y[i + 1] ?? a;
  return a + (b - a) * r;
}

/**
 * Le D+ accumulé, repris de la chaîne des statistiques et reporté sur la
 * distance.
 *
 * On calcule l'hystérésis sur les altitudes BRUTES filtrées, exactement comme
 * `statsDeGpx`, puis on lit le cumul par distance. Le total tombe donc au mètre
 * près sur celui qu'affiche une planche.
 */
function cumulDeniveleParDistance(
  points: readonly PointBrut[],
  cumul: readonly number[],
  lissage: number,
  seuil: number,
): { distances: number[]; dp: number[]; dm: number[]; dPlus: number; dMinus: number } {
  const distances: number[] = [];
  const altitudes: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const alt = points[i]!.alt;
    if (alt === null) continue;
    distances.push(cumul[i]!);
    altitudes.push(alt);
  }
  if (altitudes.length < 2) {
    return { distances: [0], dp: [0], dm: [0], dPlus: 0, dMinus: 0 };
  }
  const { dPlus, dMinus, cumul: c } = deniveleCumule(
    moyenneGlissante(altitudes, lissage),
    seuil,
  );
  return {
    distances,
    dp: c.map((x) => x.dp),
    dm: c.map((x) => x.dm),
    dPlus,
    dMinus,
  };
}

/** Lit une série indexée par distance croissante, à la distance `d`. */
function lireParDistance(distances: readonly number[], y: readonly number[], d: number): number {
  if (distances.length === 0) return 0;
  if (d <= distances[0]!) return y[0]!;
  const fin = distances.length - 1;
  if (d >= distances[fin]!) return y[fin]!;
  let bas = 0;
  let haut = fin;
  while (haut - bas > 1) {
    const milieu = (bas + haut) >> 1;
    if (distances[milieu]! <= d) bas = milieu;
    else haut = milieu;
  }
  const x0 = distances[bas]!;
  const x1 = distances[haut]!;
  const r = x1 === x0 ? 0 : (d - x0) / (x1 - x0);
  return y[bas]! + (y[haut]! - y[bas]!) * r;
}

/**
 * Les arrêts : une fenêtre de `seuilPause` secondes pendant laquelle on n'a pas
 * quitté un cercle de `rayonPause` mètres.
 *
 * Mesurer un déplacement plutôt qu'une vitesse instantanée évite de compter
 * comme arrêt le pas d'un marcheur lent, et compte comme arrêt le piétinement
 * d'un ravitaillement — où le GPS continue de bouger sans qu'on avance.
 */
function detecterPauses(
  points: readonly { lat: number; lon: number; t: number }[],
  pas: number,
  seuilPause: number,
  rayonPause: number,
): boolean[] {
  const n = points.length;
  const arret = new Array<boolean>(n).fill(false);
  const fenetre = Math.max(1, Math.round(seuilPause / pas));
  if (n <= fenetre) return arret;

  for (let i = 0; i + fenetre < n; i += 1) {
    const a = points[i]!;
    const b = points[i + fenetre]!;
    if (haversine(a.lon, a.lat, b.lon, b.lat) < rayonPause) {
      for (let k = i; k <= i + fenetre; k += 1) arret[k] = true;
    }
  }
  return arret;
}

/**
 * Moyenne glissante de CAPS, en somme courante de vecteurs unitaires.
 *
 * Deux raisons de ne pas réutiliser `moyenneGlissante` : un cap se moyenne en
 * vecteurs (350° et 10° donnent 0°, pas 180°), et une fenêtre recalculée point
 * par point sur une sortie de plusieurs heures allouerait un tableau par seconde.
 */
function lisserCap(caps: readonly number[], fenetre: number): number[] {
  const n = caps.length;
  const out = new Array<number>(n);
  if (n === 0) return out;
  const demi = Math.floor(fenetre / 2);
  const rad = (d: number) => (d * Math.PI) / 180;

  let x = 0;
  let y = 0;
  let bas = 0;
  let haut = -1;
  for (let k = 0; k < n; k += 1) {
    const cible0 = Math.max(0, k - demi);
    const cible1 = Math.min(n - 1, k + demi);
    while (haut < cible1) {
      haut += 1;
      x += Math.cos(rad(caps[haut]!));
      y += Math.sin(rad(caps[haut]!));
    }
    while (bas < cible0) {
      x -= Math.cos(rad(caps[bas]!));
      y -= Math.sin(rad(caps[bas]!));
      bas += 1;
    }
    out[k] = x === 0 && y === 0 ? 0 : ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }
  return out;
}

/** Le nombre d'intervalles passés en mouvement entre deux points consécutifs. */
function intervallesEnMouvement(points: readonly PointSeance[]): number {
  let n = 0;
  for (let k = 1; k < points.length; k += 1) if (!points[k]!.enPause) n += 1;
  return n;
}

/** Le plus petit et le plus grand d'une série, sans étaler le tableau sur la pile. */
function extremes(v: readonly number[]): { min: number; max: number } | null {
  if (v.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const x of v) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return { min, max };
}

/** Regroupe les points arrêtés en intervalles, pour la timeline et le rognage. */
function intervallesDePause(points: readonly PointSeance[]): Pause[] {
  const out: Pause[] = [];
  let debut: number | null = null;
  for (const p of points) {
    if (p.enPause && debut === null) debut = p.t;
    if (!p.enPause && debut !== null) {
      out.push({ debut, fin: p.t });
      debut = null;
    }
  }
  if (debut !== null) out.push({ debut, fin: points[points.length - 1]!.t });
  return out;
}

/**
 * Construit une séance rejouable depuis un GPX.
 *
 * `null` si le fichier ne porte pas au moins deux points exploitables.
 */
export function seanceDepuisGpx(xml: unknown, options: OptionsSeance = {}): Seance | null {
  const o = { ...DEFAUTS, ...options };
  const { points, nom } = parseGpx(xml);
  if (points.length < 2) return null;

  const { cumul, source } = distanceCumulee(points);
  const { echantillons, horodatee, debutMs } = axeDesTemps(points, cumul, o.vitesseItineraire);
  if (echantillons.length < 2) return null;

  const axe = echantillons.map((e) => e.t);
  const altSource = remplirTrous(echantillons.map((e) => e.alt), axe);
  const fcSource = remplirTrous(echantillons.map((e) => e.fc), axe);
  const cadSource = remplirTrous(echantillons.map((e) => e.cadence), axe);

  // ---------------------------------------------------------- rééchantillonnage
  const duree = echantillons[echantillons.length - 1]!.t;
  // Le dernier point tombe EXACTEMENT sur l'arrivée, même quand la durée n'est
  // pas un multiple du pas. Sans lui, le survol s'arrête quelques mètres avant
  // la fin — visible sur la carte de bilan, où la trace n'est pas bouclée.
  const pleins = Math.floor(duree / o.pas) + 1;
  const finPartielle = duree - (pleins - 1) * o.pas > 1e-9;
  const n = pleins + (finPartielle ? 1 : 0);
  const lat = new Array<number>(n);
  const lon = new Array<number>(n);
  const dist = new Array<number>(n);
  const alt = new Array<number>(n);
  const fc = new Array<number>(n);
  const cadence = new Array<number>(n);
  const temps = new Array<number>(n);

  const lats = echantillons.map((e) => e.lat);
  const lons = echantillons.map((e) => e.lon);
  const dists = echantillons.map((e) => e.dist);

  let curseur = 0;
  for (let k = 0; k < n; k += 1) {
    const t = finPartielle && k === n - 1 ? duree : k * o.pas;
    while (curseur < echantillons.length - 2 && echantillons[curseur + 1]!.t <= t) curseur += 1;
    const t0 = echantillons[curseur]!.t;
    const t1 = echantillons[curseur + 1]?.t ?? t0;
    const r = t1 === t0 ? 0 : Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    temps[k] = t;
    lat[k] = interpoler(lats, curseur, r);
    lon[k] = interpoler(lons, curseur, r);
    dist[k] = interpoler(dists, curseur, r);
    alt[k] = altSource ? interpoler(altSource, curseur, r) : 0;
    fc[k] = fcSource ? interpoler(fcSource, curseur, r) : 0;
    cadence[k] = cadSource ? interpoler(cadSource, curseur, r) : 0;
  }

  // ------------------------------------------------------------------ lissages
  // Médiane sur l'altitude AFFICHÉE : elle efface le pic isolé d'un capteur sans
  // arrondir le relief autour, là où une moyenne étalerait le pic sur la pente.
  const altLisse = medianeGlissante(alt, o.lissageAltitude);

  const fenetreAllure = Math.max(1, Math.round(o.lissageAllure / o.pas));
  const brute = new Array<number>(n);
  for (let k = 0; k < n; k += 1) {
    const a = Math.max(0, k - 1);
    const b = Math.min(n - 1, k + 1);
    brute[k] = b === a ? 0 : (dist[b]! - dist[a]!) / ((b - a) * o.pas);
  }
  const vitesse = moyenneGlissante(brute, fenetreAllure);

  const fenetreCap = Math.max(1, Math.round(o.lissageCap / o.pas));
  const capBrut = new Array<number>(n);
  for (let k = 0; k < n; k += 1) {
    const a = Math.max(0, k - 1);
    const b = Math.min(n - 1, k + 1);
    capBrut[k] = b === a ? 0 : cap(lon[a]!, lat[a]!, lon[b]!, lat[b]!);
  }
  const capLisse = lisserCap(capBrut, fenetreCap);

  const denivele = cumulDeniveleParDistance(points, cumul, o.lissage, o.seuil);
  const arret = detecterPauses(
    temps.map((t, k) => ({ t, lat: lat[k]!, lon: lon[k]! })),
    o.pas,
    o.seuilPause,
    o.rayonPause,
  );

  // ------------------------------------------------------------------- montage
  const serie: PointSeance[] = new Array(n);
  for (let k = 0; k < n; k += 1) {
    const a = Math.max(0, k - 1);
    const b = Math.min(n - 1, k + 1);
    const dd = dist[b]! - dist[a]!;
    const pente = dd > 0.5 ? ((altLisse[b]! - altLisse[a]!) / dd) * 100 : 0;
    const v = vitesse[k]!;
    serie[k] = {
      t: temps[k]!,
      lat: lat[k]!,
      lon: lon[k]!,
      alt: altLisse[k]!,
      dist: dist[k]!,
      vitesse: v,
      // Pas d'allure sur un arrêt, même si la moyenne glissante traîne encore
      // la vitesse d'avant : le lissage déborde sur les vingt secondes qui
      // précèdent, et l'habillage afficherait une allure pendant une pause.
      allure: !arret[k] && v >= VITESSE_MINIMALE ? 1000 / v : null,
      pente: Math.max(-PENTE_MAX, Math.min(PENTE_MAX, pente)),
      cap: capLisse[k]!,
      fc: fcSource ? Math.round(fc[k]!) : null,
      cadence: cadSource ? Math.round(cadence[k]!) : null,
      dPlus: lireParDistance(denivele.distances, denivele.dp, dist[k]!),
      enPause: arret[k]!,
    };
  }

  const pauses = intervallesDePause(serie);
  // En INTERVALLES, pas en points : 301 points à 1 s couvrent 300 s. Les
  // compter comme 301 s rallonge la sortie d'une seconde et fausse l'allure
  // moyenne, qui est justement le chiffre qu'on publie.
  const dureeMouvement = intervallesEnMouvement(serie) * o.pas;
  const distanceM = dist[n - 1]!;

  const mesures = <T,>(f: (p: PointSeance) => T | null): T[] =>
    serie.map(f).filter((v): v is T => v !== null);
  const fcs = mesures((p) => p.fc);
  const cadences = mesures((p) => p.cadence);
  const moyenne = (v: readonly number[]) =>
    v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  const bornes = extremes(altLisse);
  const bornesFc = extremes(fcs);

  const vitesseMoyenne = dureeMouvement > 0 ? distanceM / dureeMouvement : null;

  const resume: ResumeSeance = {
    nom,
    debutMs,
    distanceKm: distanceM / 1000,
    dPlusM: Math.round(denivele.dPlus),
    dMinusM: Math.round(denivele.dMinus),
    dureeSecondes: horodatee ? Math.round(duree) : null,
    dureeMouvementSecondes: horodatee ? dureeMouvement : null,
    allureMoyenne: horodatee && vitesseMoyenne ? 1000 / vitesseMoyenne : null,
    vitesseMoyenne: horodatee ? vitesseMoyenne : null,
    fcMoyenne: fcs.length ? Math.round(moyenne(fcs) as number) : null,
    fcMax: bornesFc ? bornesFc.max : null,
    cadenceMoyenne: cadences.length ? Math.round(moyenne(cadences) as number) : null,
    altMinM: bornes ? Math.round(bornes.min) : null,
    altMaxM: bornes ? Math.round(bornes.max) : null,
    distanceSource: source,
  };

  return { nom, points: serie, pauses, horodatee, pas: o.pas, resume };
}

/**
 * Retire les arrêts de la timeline et resserre les secondes restantes.
 *
 * Un survol fidèle passe six minutes sur un ravitaillement ; c'est du temps
 * mort à l'image. Les points arrêtés sont écartés et les instants renumérotés,
 * ce qui donne une séance plus courte sans toucher aux distances.
 */
export function sansPauses(seance: Seance): Seance {
  const gardes = seance.points.filter((p) => !p.enPause);
  if (gardes.length === seance.points.length) return seance;
  const points = gardes.map((p, k) => ({ ...p, t: k * seance.pas }));
  return {
    ...seance,
    points,
    pauses: [],
    resume: {
      ...seance.resume,
      dureeSecondes:
        seance.resume.dureeSecondes === null ? null : (points.length - 1) * seance.pas,
      dureeMouvementSecondes:
        seance.resume.dureeMouvementSecondes === null
          ? null
          : (points.length - 1) * seance.pas,
    },
  };
}

/** Le point de la séance à l'instant `t`, bornes comprises. */
export function pointA(seance: Seance, t: number): PointSeance | null {
  const n = seance.points.length;
  if (n === 0) return null;
  const k = Math.round(t / seance.pas);
  return seance.points[Math.max(0, Math.min(n - 1, k))]!;
}
