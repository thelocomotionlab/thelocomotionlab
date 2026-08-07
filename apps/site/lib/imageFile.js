// lib/imageFile.js
//
// Ouvrir la photo choisie par l'utilisateur, HEIC COMPRIS.
//
// Le HEIC est le format par défaut de l'iPhone, et sa prise en charge est
// inégale : Safari le décode nativement (le codec est celui du système), aucun
// autre navigateur ne le fait. iOS convertit d'ailleurs souvent en JPEG à la
// volée quand on pioche dans la photothèque — mais pas quand on passe par
// l'app Fichiers, et pas du tout sur un ordinateur sous Chrome ou Firefox.
//
// D'où l'ordre : on tente TOUJOURS le décodage natif d'abord (gratuit,
// instantané, et suffisant sur iPhone), et on ne charge le décodeur de secours
// que si ça échoue sur un fichier reconnu comme HEIC. Il pèse 1,3 Mo — le
// mettre dans le lot commun ferait payer ce poids à tout le site, pour un cas
// qui ne se produit presque jamais.

/**
 * Signature ISO-BMFF d'un fichier HEIF/HEIC : « ftyp » à l'octet 4, puis une
 * marque de type. On lit les OCTETS plutôt que l'extension ou le type MIME :
 * iOS renvoie régulièrement un `File.type` vide, et le nom peut mentir.
 */
const MARQUES_HEIC = ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"];

export async function estHeic(file) {
  try {
    const tete = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (tete.length < 12) return false;
    const texte = String.fromCharCode(...tete.subarray(4, 12));
    if (!texte.startsWith("ftyp")) return false;
    return MARQUES_HEIC.includes(texte.slice(4, 8).toLowerCase());
  } catch {
    return false;
  }
}

/**
 * `File` → `ImageBitmap` prêt à dessiner.
 *
 * `imageOrientation: "from-image"` applique l'EXIF : sans lui, une photo prise
 * en portrait ressort couchée sur le canvas.
 *
 * @throws {Error} message destiné à l'utilisateur si rien n'y fait.
 */
export async function chargerImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (natif) {
    if (!(await estHeic(file))) throw natif;

    let converti;
    try {
      const { default: heic2any } = await import("heic2any");
      converti = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    } catch {
      throw new Error(
        "Ce HEIC n'a pas pu être décodé. Réessaie depuis la photothèque plutôt que depuis Fichiers, ou exporte-la en JPEG.",
      );
    }
    // heic2any rend un tableau quand le fichier contient plusieurs images
    // (rafale, Live Photo) : on garde la première.
    const blob = Array.isArray(converti) ? converti[0] : converti;
    return createImageBitmap(blob, { imageOrientation: "from-image" });
  }
}
