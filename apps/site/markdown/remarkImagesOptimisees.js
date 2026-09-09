// markdown/remarkImagesOptimisees.js
//
// Fait passer les images du markdown par les variantes fabriquées au build.
//
// Une image écrite `![Alt](/images/…)` devient un `<img>` ordinaire : elle
// échappe à `next/image`, donc au chargeur, et partait à sa taille d'origine —
// 500 Ko pour une photo lue dans une colonne de 700 px. Ce greffon lui pose le
// `srcset` des variantes et laisse le navigateur choisir.
//
// Il ne touche qu'aux chemins de /images : une adresse externe ou un format
// sans variante (SVG) reste tel quel.

import { visit } from "unist-util-visit";

/** Les barreaux utiles en pleine colonne de lecture. */
const LARGEURS = [640, 1080, 1600];

const MATIERES = /\.(webp|jpe?g|png)$/i;

/** La colonne de lecture ne dépasse pas ~720 px ; en dessous, la page entière. */
const PLACE = "(min-width: 768px) 720px, 100vw";

export default function remarkImagesOptimisees() {
  return function transformer(tree) {
    visit(tree, "image", (node) => {
      if (!node.url?.startsWith("/images/") || !MATIERES.test(node.url)) return;

      const sansExt = node.url.slice("/images".length, node.url.lastIndexOf("."));
      const variante = (largeur) => `/images-opt${sansExt}-${largeur}.webp`;

      node.data = node.data || {};
      node.data.hProperties = node.data.hProperties || {};
      Object.assign(node.data.hProperties, {
        src: variante(1080),
        srcSet: LARGEURS.map((l) => `${variante(l)} ${l}w`).join(", "),
        sizes: PLACE,
        // Une photo de corps de texte est presque toujours sous la ligne de
        // flottaison : rien ne justifie de la charger avant d'y arriver.
        loading: "lazy",
        decoding: "async",
      });
    });
  };
}
