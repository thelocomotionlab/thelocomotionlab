// lib/imageLoader.js
//
// OÙ `next/image` VA CHERCHER SES IMAGES.
//
// Sur Cloudflare Pages, l'optimiseur d'images de Next ne redimensionne pas :
// il renvoie le fichier source quelle que soit la largeur demandée. Les
// variantes sont donc fabriquées au build (scripts/build-images.mjs), et ce
// chargeur les adresse — c'est lui qui remplace `/_next/image?url=…&w=…`.
//
// Il tourne aussi dans le navigateur : pas de dépendance, pas de manifeste à
// lire, la règle tient dans le nom du fichier.

/** Les barreaux fabriqués par scripts/build-images.mjs. */
const LARGEURS = [96, 256, 360, 640, 1080, 1600];

/** Les extensions qui ont des variantes ; le reste (SVG…) part tel quel. */
const MATIERES = /\.(webp|jpe?g|png)$/i;

export default function imageLoader({ src, width }) {
  if (!src.startsWith("/images/") || !MATIERES.test(src)) return src;

  // Le premier barreau assez large, ou le dernier : une source plus petite que
  // le barreau n'a pas été agrandie, elle sera simplement servie telle quelle.
  const barreau = LARGEURS.find((l) => l >= width) ?? LARGEURS[LARGEURS.length - 1];
  const sansExt = src.slice("/images".length, src.lastIndexOf("."));

  return `/images-opt${sansExt}-${barreau}.webp`;
}
