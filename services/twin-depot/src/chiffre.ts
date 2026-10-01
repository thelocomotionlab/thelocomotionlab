// Chiffrement au repos des archives : AES-256-GCM, une clé de 32 octets qui vient de
// l'environnement (TWIN_DEPOT_ARCHIVE_KEY, 64 caractères hexadécimaux) et jamais du
// volume — une copie du volume seule ne se lit pas.
//
// Format d'un fichier chiffré : « LLTD1 » (5 octets) | IV (12) | données chiffrées | tag
// d'authentification (16). Le chiffrement se fait au fil de l'upload (l'archive ne passe
// jamais en clair sur le disque), le déchiffrement au fil du téléchargement admin ; le tag
// est relu en fin de fichier avant de commencer, et un fichier altéré ou une mauvaise clé
// font échouer le flux à sa fin (le moteur vérifie en plus le SHA-256 du clair).

import crypto from "node:crypto";
import fs from "node:fs";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const MAGIE = Buffer.from("LLTD1");
const IV_OCTETS = 12;
const TAG_OCTETS = 16;
const ENTETE_OCTETS = MAGIE.length + IV_OCTETS;

/** La clé d'archive lue dans l'environnement : null si absente, erreur si illisible. */
export function cleDArchive(hex: string | undefined): Buffer | null {
  const brut = (hex ?? "").trim();
  if (!brut) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(brut)) {
    throw new Error("TWIN_DEPOT_ARCHIVE_KEY : 64 caractères hexadécimaux attendus (32 octets)");
  }
  return Buffer.from(brut, "hex");
}

/** Un flux qui chiffre ce qui le traverse, entête en tête et tag en queue. */
export function chiffreur(cle: Buffer): Transform {
  const iv = crypto.randomBytes(IV_OCTETS);
  const chiffre = crypto.createCipheriv("aes-256-gcm", cle, iv);
  let entete = false;
  const poserEntete = (flux: Transform) => {
    if (!entete) {
      entete = true;
      flux.push(Buffer.concat([MAGIE, iv]));
    }
  };
  return new Transform({
    transform(morceau: Buffer, _enc, fini) {
      try {
        poserEntete(this);
        fini(null, chiffre.update(morceau));
      } catch (err) {
        fini(err as Error);
      }
    },
    flush(fini) {
      try {
        poserEntete(this);
        this.push(chiffre.final());
        this.push(chiffre.getAuthTag());
        fini();
      } catch (err) {
        fini(err as Error);
      }
    },
  });
}

/** Le fichier commence-t-il par l'entête d'une archive chiffrée ? */
export function estChiffre(chemin: string): boolean {
  const fd = fs.openSync(chemin, "r");
  try {
    const tete = Buffer.alloc(MAGIE.length);
    const lus = fs.readSync(fd, tete, 0, MAGIE.length, 0);
    return lus === MAGIE.length && tete.equals(MAGIE);
  } finally {
    fs.closeSync(fd);
  }
}

/** Le clair d'une archive chiffrée, en flux. */
export function fluxDechiffre(chemin: string, cle: Buffer): Readable {
  const taille = fs.statSync(chemin).size;
  if (taille < ENTETE_OCTETS + TAG_OCTETS) throw new Error("archive chiffrée tronquée");
  const fd = fs.openSync(chemin, "r");
  const entete = Buffer.alloc(ENTETE_OCTETS);
  const tag = Buffer.alloc(TAG_OCTETS);
  try {
    fs.readSync(fd, entete, 0, ENTETE_OCTETS, 0);
    fs.readSync(fd, tag, 0, TAG_OCTETS, taille - TAG_OCTETS);
  } finally {
    fs.closeSync(fd);
  }
  if (!entete.subarray(0, MAGIE.length).equals(MAGIE)) throw new Error("archive non chiffrée");
  const dechiffre = crypto.createDecipheriv("aes-256-gcm", cle, entete.subarray(MAGIE.length));
  dechiffre.setAuthTag(tag);
  const fin = taille - TAG_OCTETS - 1;
  const source =
    fin >= ENTETE_OCTETS
      ? fs.createReadStream(chemin, { start: ENTETE_OCTETS, end: fin })
      : Readable.from([]);
  const sortie = new PassThrough();
  pipeline(source, dechiffre, sortie).catch((err) => sortie.destroy(err as Error));
  return sortie;
}

/** Chiffre sur place une archive en clair (fichier temporaire puis rename atomique). */
export async function chiffrerSurPlace(chemin: string, cle: Buffer): Promise<void> {
  const tmp = `${chemin}.chiffrement`;
  try {
    await pipeline(fs.createReadStream(chemin), chiffreur(cle), fs.createWriteStream(tmp));
    fs.renameSync(tmp, chemin);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}
