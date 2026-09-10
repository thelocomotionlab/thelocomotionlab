// packages/planche/src/exif.ts
//
// CE QUE LA PHOTO SAIT D'ELLE-MÊME : quand, et où.
//
// Deux renseignements, et deux usages précis. La DATE range la bibliothèque
// dans l'ordre où les choses se sont passées, ce qui est le seul ordre utile
// quand on raconte une aventure. La POSITION permettra de poser un moment photo
// au bon kilomètre d'un survol, sans avoir à le chercher à la main.
//
// UN LECTEUR MINIMAL, à dessein. Une bibliothèque EXIF complète pèse plus que
// tout le reste du studio et lit deux cents champs dont aucun ne sert ici. On
// lit les octets qu'on veut et on s'arrête.
//
// UNE PHOTO SANS EXIF N'EST PAS UNE ERREUR : une capture d'écran, une image
// recompressée par une messagerie, un PNG n'en portent pas. On rend `null` et
// la bibliothèque s'en passe.

/** Les marqueurs et types du format, nommés une fois. */
const APP1 = 0xffe1;
const TAILLES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_ORIGINE = 0x9003;
const TAG_DATE_NUMERISATION = 0x9004;
const TAG_DATE = 0x0132;
const TAG_LAT_REF = 0x0001;
const TAG_LAT = 0x0002;
const TAG_LON_REF = 0x0003;
const TAG_LON = 0x0004;

export type Exif = {
  /** Millisecondes epoch, ou `null`. */
  priseLe: number | null;
  gps: { lat: number; lon: number } | null;
};

const VIDE: Exif = { priseLe: null, gps: null };

type Champ = { type: number; nombre: number; position: number };

/** Trouve le segment APP1 et rend la position de son en-tête TIFF. */
function trouverTiff(v: DataView): number | null {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null; // pas un JPEG
  let i = 2;
  while (i + 4 <= v.byteLength) {
    const marqueur = v.getUint16(i);
    if ((marqueur & 0xff00) !== 0xff00) return null;
    const longueur = v.getUint16(i + 2);
    if (longueur < 2) return null;
    if (marqueur === APP1) {
      // « Exif\0\0 » précède l'en-tête TIFF.
      const debut = i + 4;
      if (debut + 6 > v.byteLength) return null;
      const signature = String.fromCharCode(
        v.getUint8(debut),
        v.getUint8(debut + 1),
        v.getUint8(debut + 2),
        v.getUint8(debut + 3),
      );
      return signature === "Exif" ? debut + 6 : null;
    }
    i += 2 + longueur;
  }
  return null;
}

/** Les champs d'un IFD, par tag. */
function lireIfd(
  v: DataView,
  tiff: number,
  offset: number,
  petitBoutiste: boolean,
): Map<number, Champ> {
  const out = new Map<number, Champ>();
  const debut = tiff + offset;
  if (debut + 2 > v.byteLength) return out;
  const nombre = v.getUint16(debut, petitBoutiste);
  for (let k = 0; k < nombre; k += 1) {
    const e = debut + 2 + k * 12;
    if (e + 12 > v.byteLength) break;
    const tag = v.getUint16(e, petitBoutiste);
    const type = v.getUint16(e + 2, petitBoutiste);
    const compte = v.getUint32(e + 4, petitBoutiste);
    const octets = (TAILLES[type] ?? 0) * compte;
    // Une valeur de quatre octets ou moins tient DANS l'entrée ; au-delà,
    // l'entrée porte un décalage depuis le début du TIFF.
    const position = octets <= 4 ? e + 8 : tiff + v.getUint32(e + 8, petitBoutiste);
    out.set(tag, { type, nombre: compte, position });
  }
  return out;
}

function lireAscii(v: DataView, champ: Champ): string {
  let s = "";
  for (let i = 0; i < champ.nombre; i += 1) {
    const position = champ.position + i;
    if (position >= v.byteLength) break;
    const c = v.getUint8(position);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** Un RATIONAL : deux entiers longs, numérateur puis dénominateur. */
function lireRationnel(v: DataView, position: number, petitBoutiste: boolean): number {
  if (position + 8 > v.byteLength) return Number.NaN;
  const haut = v.getUint32(position, petitBoutiste);
  const bas = v.getUint32(position + 4, petitBoutiste);
  return bas === 0 ? Number.NaN : haut / bas;
}

/**
 * « 2026:06:14 05:30:00 » → millisecondes.
 *
 * L'EXIF N'A PAS DE FUSEAU : cette heure est celle de l'appareil, donc l'heure
 * LOCALE de la prise de vue. On la lit comme telle plutôt que de la déclarer
 * UTC, ce qui décalerait une photo de midi de deux heures en été.
 */
function dateExif(brut: string): number | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(brut.trim());
  if (!m) return null;
  const [, a, mo, j, h, mi, s] = m.map(Number) as unknown as number[];
  const t = new Date(a!, mo! - 1, j!, h!, mi!, s!).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Degrés, minutes, secondes → degrés décimaux, signés par la référence. */
function enDegres(
  v: DataView,
  champ: Champ | undefined,
  ref: string,
  petitBoutiste: boolean,
): number | null {
  if (!champ || champ.nombre < 3) return null;
  const d = lireRationnel(v, champ.position, petitBoutiste);
  const m = lireRationnel(v, champ.position + 8, petitBoutiste);
  const s = lireRationnel(v, champ.position + 16, petitBoutiste);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  const valeur = d + m / 60 + s / 3600;
  const negatif = ref === "S" || ref === "W";
  return negatif ? -valeur : valeur;
}

/** Lit ce qu'une photo dit d'elle-même. Jamais d'exception : au pire, du vide. */
export function lireExif(donnees: ArrayBuffer): Exif {
  try {
    const v = new DataView(donnees);
    const tiff = trouverTiff(v);
    if (tiff === null || tiff + 8 > v.byteLength) return VIDE;

    const ordre = v.getUint16(tiff);
    if (ordre !== 0x4949 && ordre !== 0x4d4d) return VIDE;
    const petitBoutiste = ordre === 0x4949;
    const ifd0 = lireIfd(v, tiff, v.getUint32(tiff + 4, petitBoutiste), petitBoutiste);

    let priseLe: number | null = null;
    const exif = ifd0.get(TAG_EXIF_IFD);
    if (exif) {
      const champs = lireIfd(v, tiff, v.getUint32(exif.position, petitBoutiste), petitBoutiste);
      // L'ORIGINE d'abord : c'est l'instant du déclenchement. La numérisation et
      // la date de fichier viennent après, et bougent à chaque recompression.
      for (const tag of [TAG_DATE_ORIGINE, TAG_DATE_NUMERISATION]) {
        const champ = champs.get(tag);
        if (champ) {
          priseLe = dateExif(lireAscii(v, champ));
          if (priseLe !== null) break;
        }
      }
    }
    if (priseLe === null) {
      const champ = ifd0.get(TAG_DATE);
      if (champ) priseLe = dateExif(lireAscii(v, champ));
    }

    let gps: { lat: number; lon: number } | null = null;
    const pointeurGps = ifd0.get(TAG_GPS_IFD);
    if (pointeurGps) {
      const champs = lireIfd(
        v,
        tiff,
        v.getUint32(pointeurGps.position, petitBoutiste),
        petitBoutiste,
      );
      const latRef = champs.get(TAG_LAT_REF);
      const lonRef = champs.get(TAG_LON_REF);
      const lat = enDegres(
        v,
        champs.get(TAG_LAT),
        latRef ? lireAscii(v, latRef) : "N",
        petitBoutiste,
      );
      const lon = enDegres(
        v,
        champs.get(TAG_LON),
        lonRef ? lireAscii(v, lonRef) : "E",
        petitBoutiste,
      );
      if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        gps = { lat, lon };
      }
    }

    return { priseLe, gps };
  } catch {
    // Un fichier tronqué ou farfelu ne doit pas empêcher d'importer la photo.
    return VIDE;
  }
}
