// lib/marque.js
//
// La marque du labo, RECOLORÉE, pour les canvas d'atelier.
//
// Le logo source est terracotta — sa couleur sur fond clair. Posé tel quel sur
// le voile sombre d'une story ou d'une carte, il vire au marron boueux et se
// perd. On le reteinte donc à l'encre du texte qu'il accompagne : on dessine la
// marque dans un canevas hors écran, puis `source-in` ne garde la couleur QUE
// là où il y a des pixels — les traits prennent la teinte, la transparence
// reste transparente.
//
// Partagé par l'habillage de photo et l'atelier carrousel : c'est le même
// geste, et il n'a pas à être écrit deux fois.

/** Le fichier produit depuis le logo source par `pnpm -F site build:icons`. */
export const LOGO_MARQUE = "/images/assets/logo-mark-512.png";

/**
 * @param {string} couleur - l'encre finale (par défaut le crème du labo).
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function chargerMarqueTeintee(couleur = "#FEFBF6") {
  const img = new Image();
  img.decoding = "async";
  img.src = LOGO_MARQUE;
  await img.decode();

  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = couleur;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}
