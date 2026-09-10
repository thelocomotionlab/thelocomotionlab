// packages/planche/src/zip.ts
//
// UN ZIP, SANS DÉPENDANCE.
//
// Deux méthodes seulement, et le choix se fait par entrée : STORED (0) pour ce
// qui est déjà compressé — une photo JPEG ne se dégonfle pas —, DEFLATE (8)
// pour le JSON, dont une séance à 1 Hz représente l'essentiel du poids. Ce
// module ne compresse RIEN lui-même : il écrit et relit des octets, et
// l'appelant lui dit ce qu'il lui donne. C'est ce qui le garde synchrone,
// testable sans navigateur, et sans dépendance.
//
// Un `.llstudio` reste donc une archive ordinaire : elle s'ouvre dans
// n'importe quel gestionnaire, et dans dix ans, même sans le studio, rien
// n'est perdu.

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_FIN = 0x06054b50;

/**
 * Une entrée d'archive.
 *
 * Quand `methode` vaut 8, `donnees` est DÉJÀ dégonflé : `brut` en donne alors
 * la taille d'origine et le CRC, qu'un ZIP calcule sur les octets d'avant
 * compression.
 */
export type Entree = {
  nom: string;
  donnees: Uint8Array;
  methode?: 0 | 8;
  brut?: { taille: number; crc: number };
};

const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

/* -------------------------------------------------------------------- CRC */

/** La table du CRC-32, calculée une fois : 256 entrées, polynôme 0xEDB88320. */
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i += 1) c = TABLE_CRC[(c ^ octets[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ écrire */

export function ecrireZip(entrees: readonly Entree[]): Uint8Array {
  const preparees = entrees.map((e) => ({
    nom: encodeur.encode(e.nom),
    donnees: e.donnees,
    methode: e.methode ?? 0,
    taille: e.brut?.taille ?? e.donnees.length,
    crc: e.brut?.crc ?? crc32(e.donnees),
  }));

  const tailleLocale = preparees.reduce((n, e) => n + 30 + e.nom.length + e.donnees.length, 0);
  const tailleCentrale = preparees.reduce((n, e) => n + 46 + e.nom.length, 0);
  const sortie = new Uint8Array(tailleLocale + tailleCentrale + 22);
  const vue = new DataView(sortie.buffer);
  let pos = 0;
  const decalages: number[] = [];

  for (const e of preparees) {
    decalages.push(pos);
    vue.setUint32(pos, SIG_LOCAL, true);
    vue.setUint16(pos + 4, 20, true); // version minimale
    // Bit 11 : le nom est en UTF-8. Les accents des noms de photos en dépendent.
    vue.setUint16(pos + 6, 0x0800, true);
    vue.setUint16(pos + 8, e.methode, true);
    vue.setUint16(pos + 10, 0, true); // heure — non renseignée
    vue.setUint16(pos + 12, 0, true); // date — non renseignée
    vue.setUint32(pos + 14, e.crc, true);
    vue.setUint32(pos + 18, e.donnees.length, true);
    vue.setUint32(pos + 22, e.taille, true);
    vue.setUint16(pos + 26, e.nom.length, true);
    vue.setUint16(pos + 28, 0, true); // pas de champ « extra »
    sortie.set(e.nom, pos + 30);
    sortie.set(e.donnees, pos + 30 + e.nom.length);
    pos += 30 + e.nom.length + e.donnees.length;
  }

  const debutCentral = pos;
  for (const [i, e] of preparees.entries()) {
    vue.setUint32(pos, SIG_CENTRAL, true);
    vue.setUint16(pos + 4, 20, true);
    vue.setUint16(pos + 6, 20, true);
    vue.setUint16(pos + 8, 0x0800, true);
    vue.setUint16(pos + 10, e.methode, true);
    vue.setUint16(pos + 12, 0, true);
    vue.setUint16(pos + 14, 0, true);
    vue.setUint32(pos + 16, e.crc, true);
    vue.setUint32(pos + 20, e.donnees.length, true);
    vue.setUint32(pos + 24, e.taille, true);
    vue.setUint16(pos + 28, e.nom.length, true);
    vue.setUint16(pos + 30, 0, true);
    vue.setUint16(pos + 32, 0, true); // commentaire
    vue.setUint16(pos + 34, 0, true); // disque
    vue.setUint16(pos + 36, 0, true); // attributs internes
    vue.setUint32(pos + 38, 0, true); // attributs externes
    vue.setUint32(pos + 42, decalages[i]!, true);
    sortie.set(e.nom, pos + 46);
    pos += 46 + e.nom.length;
  }

  vue.setUint32(pos, SIG_FIN, true);
  vue.setUint16(pos + 4, 0, true);
  vue.setUint16(pos + 6, 0, true);
  vue.setUint16(pos + 8, preparees.length, true);
  vue.setUint16(pos + 10, preparees.length, true);
  vue.setUint32(pos + 12, pos - debutCentral, true);
  vue.setUint32(pos + 16, debutCentral, true);
  vue.setUint16(pos + 20, 0, true);
  return sortie;
}

/* -------------------------------------------------------------------- lire */

/**
 * Relit une archive : pour chaque entrée, ses octets TELS QU'ILS SONT RANGÉS.
 *
 * On part de la FIN — le répertoire central est la seule table de vérité d'un
 * ZIP, et c'est ce qui permet à un fichier concaténé ou signé de s'ouvrir
 * quand même. Une entrée compressée revient compressée, avec sa méthode : la
 * dégonfler demande une API asynchrone, qui n'a pas sa place ici.
 */
export function lireZip(octets: Uint8Array): Map<string, Entree> {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let fin = -1;
  for (let i = octets.length - 22; i >= 0; i -= 1) {
    if (vue.getUint32(i, true) === SIG_FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("Ce fichier n'est pas une archive.");

  const nombre = vue.getUint16(fin + 8, true);
  let pos = vue.getUint32(fin + 16, true);
  const entrees = new Map<string, Entree>();

  for (let i = 0; i < nombre; i += 1) {
    if (vue.getUint32(pos, true) !== SIG_CENTRAL) break;
    const methode = vue.getUint16(pos + 10, true);
    const crc = vue.getUint32(pos + 16, true);
    const range = vue.getUint32(pos + 20, true);
    const taille = vue.getUint32(pos + 24, true);
    const tailleNom = vue.getUint16(pos + 28, true);
    const tailleExtra = vue.getUint16(pos + 30, true);
    const tailleCommentaire = vue.getUint16(pos + 32, true);
    const debut = vue.getUint32(pos + 42, true);
    const nom = decodeur.decode(octets.subarray(pos + 46, pos + 46 + tailleNom));
    if (methode !== 0 && methode !== 8) {
      throw new Error(`« ${nom} » est compressé autrement : archive non prise en charge.`);
    }

    // L'en-tête local répète le nom et l'extra, avec des longueurs qui peuvent
    // DIFFÉRER de celles du répertoire : les données commencent après les
    // siennes, pas après celles qu'on vient de lire.
    const nomLocal = vue.getUint16(debut + 26, true);
    const extraLocal = vue.getUint16(debut + 28, true);
    const depart = debut + 30 + nomLocal + extraLocal;
    entrees.set(nom, {
      nom,
      donnees: octets.subarray(depart, depart + range),
      methode: methode as 0 | 8,
      brut: { taille, crc },
    });
    pos += 46 + tailleNom + tailleExtra + tailleCommentaire;
  }
  return entrees;
}
