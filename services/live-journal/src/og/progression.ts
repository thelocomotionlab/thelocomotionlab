// AVANCEMENT LE LONG DE LA TRACE — port TypeScript de apps/site/lib/progression.js.
//
// ⚠ DUPLICATION VOLONTAIRE, comme `jourParis` dans data.ts. Le site est en JS
// (ESM, compilé par Next), ce service en TS (CommonJS, compilé par tsc avec
// rootDir=src) : rien ne peut être importé de l'un à l'autre sans changer la
// chaîne de build des deux. Le test `test/progression-parite.test.ts` exécute
// LES DEUX implémentations sur les traces réelles du dépôt et exige le même
// résultat au millimètre — une divergence casse la suite, elle ne se découvre
// pas sur une carte publiée.
//
// Pourquoi la carte en a besoin : le pourcentage affiché et le curseur du
// profil altimétrique désignent la position SUR L'ITINÉRAIRE, pas la distance
// parcourue. À la Croix de Belledonne (6 août 2026), 24,26 km avaient été
// courus sur un parcours de 22,02 km — le rapport brut aurait planté le curseur
// à l'arrivée alors qu'il restait un col à passer. Le commentaire d'origine
// détaille les quatre garde-fous : voir apps/site/lib/progression.js.

const R = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const M_PAR_DEGRE = 111_320;

export type LonLat = [number, number];
export type PointVecu =
  | LonLat
  | { longitude?: number | null; latitude?: number | null; fixTime?: string | null };

export interface Avancement {
  metresParcourus: number;
  metresTotal: number;
  pourcent: number;
}

function haversine([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Écart approché au carré, en degrés² — sert à COMPARER, pas à mesurer. */
function ecart2(a: LonLat, b: LonLat): number {
  const dLon = (a[0] - b[0]) * Math.cos(toRad(b[1]));
  const dLat = a[1] - b[1];
  return dLon * dLon + dLat * dLat;
}

function normaliser(p: PointVecu | undefined): { lonlat: LonLat; tMs: number } | null {
  if (Array.isArray(p)) {
    return Number.isFinite(p[0]) && Number.isFinite(p[1]) ? { lonlat: p, tMs: NaN } : null;
  }
  if (!p || !Number.isFinite(p.longitude) || !Number.isFinite(p.latitude)) return null;
  return { lonlat: [p.longitude as number, p.latitude as number], tMs: Date.parse(p.fixTime ?? "") };
}

export function cumulDistances(coords: LonLat[]): Float64Array {
  const cum = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i += 1) {
    cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i]);
  }
  return cum;
}

export interface ProjectionOptions {
  toleranceM?: number;
  lookahead?: number;
  maxPoints?: number;
  vitesseMaxKmH?: number;
  plancherAvanceM?: number;
}

export function avancementSurTrace(
  referenceCoords: LonLat[] | undefined,
  vecu: PointVecu[] | undefined,
  options: ProjectionOptions = {},
): Avancement | null {
  if (!Array.isArray(referenceCoords) || referenceCoords.length < 2) return null;
  if (!Array.isArray(vecu) || vecu.length === 0) return null;
  const sens = sensDeParcours(referenceCoords, vecu);
  return projeter(sens < 0 ? [...referenceCoords].reverse() : referenceCoords, vecu, options);
}

/** +1 dans le sens du fichier GPX, −1 à contresens (tendance des indices). */
function sensDeParcours(referenceCoords: LonLat[], vecu: PointVecu[], echantillons = 60): number {
  const pas = Math.max(1, Math.ceil(vecu.length / echantillons));
  const indices: number[] = [];
  for (let i = 0; i < vecu.length; i += pas) {
    const p = normaliser(vecu[i]);
    if (!p) continue;
    let meilleur = 0;
    let meilleurEcart = Infinity;
    for (let j = 0; j < referenceCoords.length; j += 1) {
      const e = ecart2(p.lonlat, referenceCoords[j]);
      if (e < meilleurEcart) {
        meilleurEcart = e;
        meilleur = j;
      }
    }
    indices.push(meilleur);
  }

  let montees = 0;
  let descentes = 0;
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] > indices[i - 1]) montees += 1;
    else if (indices[i] < indices[i - 1]) descentes += 1;
  }
  return descentes > montees ? -1 : 1;
}

function projeter(
  referenceCoords: LonLat[],
  vecu: PointVecu[],
  options: ProjectionOptions,
): Avancement | null {
  const {
    toleranceM = 150,
    lookahead = 250,
    maxPoints = 3000,
    vitesseMaxKmH = 20,
    plancherAvanceM = 100,
  } = options;

  if (!Array.isArray(referenceCoords) || referenceCoords.length < 2) return null;
  if (!Array.isArray(vecu) || vecu.length === 0) return null;

  const cum = cumulDistances(referenceCoords);
  const metresTotal = cum[cum.length - 1];
  if (!(metresTotal > 0)) return null;

  const tolerance2 = (toleranceM / M_PAR_DEGRE) ** 2;
  const vitesseMaxMS = (vitesseMaxKmH * 1000) / 3600;
  const pas = Math.max(1, Math.ceil(vecu.length / maxPoints));

  let refIdx = 0;
  let metresParcourus = 0;
  let tMsDerniereAvance = NaN;
  let premier = true;

  const examiner = ({ lonlat, tMs }: { lonlat: LonLat; tMs: number }) => {
    let avanceMax = Infinity;
    if (!premier && Number.isFinite(tMs) && Number.isFinite(tMsDerniereAvance)) {
      const dtSec = Math.max(0, (tMs - tMsDerniereAvance) / 1000);
      avanceMax = cum[refIdx] + dtSec * vitesseMaxMS + plancherAvanceM;
    }
    if (premier || !Number.isFinite(tMsDerniereAvance)) tMsDerniereAvance = tMs;
    premier = false;

    let meilleurIdx = refIdx;
    let meilleurEcart = ecart2(lonlat, referenceCoords[refIdx]);
    const limite = Math.min(referenceCoords.length - 1, refIdx + lookahead);
    for (let j = refIdx + 1; j <= limite; j += 1) {
      if (j > refIdx + 1 && cum[j] > avanceMax) break;
      const e = ecart2(lonlat, referenceCoords[j]);
      if (e < meilleurEcart) {
        meilleurEcart = e;
        meilleurIdx = j;
      }
    }
    if (meilleurEcart > tolerance2) return;
    if (meilleurIdx !== refIdx && Number.isFinite(tMs)) tMsDerniereAvance = tMs;
    refIdx = meilleurIdx;
    if (cum[meilleurIdx] > metresParcourus) metresParcourus = cum[meilleurIdx];
  };

  const dernierIdx = vecu.length - 1;
  for (let i = 0; i <= dernierIdx; i += 1) {
    if (i % pas !== 0 && i !== dernierIdx) continue;
    const p = normaliser(vecu[i]);
    if (p) examiner(p);
  }

  return {
    metresParcourus,
    metresTotal,
    pourcent: Math.min(100, Math.max(0, (metresParcourus / metresTotal) * 100)),
  };
}
