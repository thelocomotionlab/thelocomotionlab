// lib/medias.ts
//
// FAIRE ENTRER UNE PHOTO DANS LE STUDIO.
//
// Trois choses à en tirer : une image décodée pour le canvas, ses dimensions, et
// ce qu'elle sait d'elle-même (date, position).
//
// LE HEIC EST ACCEPTÉ, parce que c'est ce que sortent les iPhone et qu'un outil
// qui refuse la moitié des photos de son auteur ne sert à rien. Le décodeur
// n'est chargé QUE si un fichier en est un : c'est un gros paquet, et il n'a
// rien à faire dans le démarrage de tout le monde.
//
// LES BLOBS RESTENT DES BLOBS. On ne ré-encode jamais une photo à l'import :
// elle garde son poids et sa qualité d'origine, et c'est l'export qui décide de
// la compression.

import { lireExif, type Media } from "@locomotionlab/planche";

import { poserMedia } from "./depot";

let compteur = 0;

/**
 * Un HEIC ne s'annonce pas toujours par son type MIME (Safari le laisse vide au
 * glisser-déposer) : on regarde aussi la marque du conteneur, `ftyp…heic`, dans
 * les premiers octets.
 */
export async function estHeic(fichier: File): Promise<boolean> {
  if (/hei[cf]/i.test(fichier.type) || /\.hei[cf]$/i.test(fichier.name)) return true;
  try {
    const tete = new Uint8Array(await fichier.slice(0, 16).arrayBuffer());
    const marque = String.fromCharCode(...tete.slice(4, 12));
    return marque.startsWith("ftyp") && /hei[cx]|mif1|msf1/.test(marque.slice(4));
  } catch {
    return false;
  }
}

/** Le Blob à stocker : converti en JPEG s'il est en HEIC, tel quel sinon. */
async function lisible(fichier: File): Promise<Blob> {
  if (!(await estHeic(fichier))) return fichier;
  const { default: heic2any } = await import("heic2any");
  const sorti = await heic2any({ blob: fichier, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(sorti) ? sorti[0]! : (sorti as Blob);
}

/** Décode un Blob en image utilisable par le canvas. */
export async function decoder(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Certains navigateurs refusent un type qu'ils savent pourtant afficher :
      // on retombe sur l'élément image, qui accepte tout ce que le navigateur
      // sait décoder.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // L'image garde ses pixels une fois décodée : l'URL peut partir.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export type MediaImporte = { media: Media; image: ImageBitmap | HTMLImageElement };

/**
 * Importe un fichier : décode, lit l'EXIF, range le Blob, rend la fiche.
 *
 * `null` si le fichier n'est pas une image que ce navigateur sait lire — un
 * import raté ne doit pas interrompre les autres.
 */
export async function importer(fichier: File): Promise<MediaImporte | null> {
  try {
    const blob = await lisible(fichier);
    const image = await decoder(blob);
    // L'EXIF se lit sur le fichier D'ORIGINE : la conversion HEIC → JPEG le
    // perd, et c'est justement là qu'il est le plus utile.
    const exif = lireExif(await fichier.slice(0, 128 * 1024).arrayBuffer());
    compteur += 1;
    const media: Media = {
      id: `media-${compteur.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      nom: fichier.name || `Photo ${compteur}`,
      largeur: image.width,
      hauteur: image.height,
      priseLe: exif.priseLe,
      gps: exif.gps,
    };
    await poserMedia(media, blob);
    return { media, image };
  } catch {
    return null;
  }
}

/** « 4,2 Mo » — le poids d'un fichier, comme on le dit. */
export function poids(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}
