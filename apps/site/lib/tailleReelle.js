// lib/tailleReelle.js
//
// L'ADRESSE D'UNE IMAGE EN TAILLE RÉELLE. Une image d'article est servie par
// next/image : son `src` est une variante moyenne (1080 px), et les autres
// largeurs fabriquées au build sont listées dans son `srcset`. La visionneuse
// veut la plus large — c'est la source elle-même quand la photo est plus
// petite que le dernier barreau, puisqu'une variante ne l'agrandit jamais.

/**
 * La candidate la plus large d'un `srcset`, ou `src` à défaut.
 *
 * @param {string|null} srcset   « /a-640.webp 640w, /a-1080.webp 1080w, … »
 * @param {string|null} src      l'adresse de repli
 */
export function adresseEnTailleReelle(srcset, src) {
  let meilleure = null;
  let largeurMax = 0;
  for (const candidate of (srcset ?? "").split(/,\s+/)) {
    const [adresse, descripteur = ""] = candidate.trim().split(/\s+/);
    if (!adresse) continue;
    // « 1080w » est une largeur ; « 2x » une densité, rangée au même ordre.
    const mesure = Number.parseFloat(descripteur) || 1;
    if (mesure > largeurMax) {
      largeurMax = mesure;
      meilleure = adresse;
    }
  }
  return meilleure ?? src ?? "";
}
