// lib/iconesMaison.js
//
// LES ICÔNES QUE LUCIDE N'A PAS.
//
// Le vocabulaire des repères (lib/liveWaypointIcons.js) vient de lucide, et
// c'est très bien : un jeu cohérent, un seul trait, aucune décision de style à
// prendre. Mais il manque des choses que ce labo dit tous les jours — la
// SANDALE, par exemple, n'existe nulle part dans lucide.
//
// Plutôt que de coller un SVG à part (qui aurait son propre poids de trait, son
// propre cadre, et jurerait à côté des autres), on fabrique l'icône AVEC l'outil
// de lucide : `createLucideIcon` prend un nom et une liste de primitives, et rend
// un composant identique aux autres — même boîte 24×24, même trait de 2, mêmes
// bouts arrondis. Elle est donc utilisable partout où les autres le sont :
// la carte du live, la palette de l'atelier, et le canvas des planches (qui lit
// la géométrie via `iconNode`, cf. lib/carrouselIcones.js).
//
// RÈGLE DE DESSIN : boîte 24×24, tout en TRAIT (aucun remplissage), et rien
// au-delà de 1,5 px des bords — une icône qui touche son cadre paraît plus
// grosse que ses voisines à corps égal.

import { createLucideIcon } from "lucide-react";

/**
 * La sandale, vue de dessus : la semelle, la lanière en V et la bride.
 *
 * C'est une huarache, pas une tong : la bride qui traverse le pied est ce qui
 * la distingue d'un claquette à 24 px, et c'est elle qu'on garde.
 */
export const Sandale = createLucideIcon("sandale", [
  // La semelle, un peu plus large que haute au niveau de l'avant-pied.
  [
    "path",
    {
      d: "M12 2.4c3.4 0 5.8 2.1 5.8 5 0 1.9-.8 3-.8 4.6 0 1.6.8 2.7.8 4.4 0 3.1-2.5 5.9-5.8 5.9s-5.8-2.8-5.8-5.9c0-1.7.8-2.8.8-4.4 0-1.6-.8-2.7-.8-4.6 0-2.9 2.4-5 5.8-5Z",
      key: "semelle",
    },
  ],
  // L'entre-doigts, puis la lanière en V : deux traits, pas trois. À 24 px, une
  // bride de plus ne se lit plus comme une sandale mais comme un gribouillis.
  ["path", { d: "M12 8.2V5.2", key: "entredoigts" }],
  ["path", { d: "m7.7 12.6 4.3-4.4 4.3 4.4", key: "laniere" }],
]);
