// lib/blog.js
//
// LES ENTRÉES DU REGISTRE DU BLOG, lues sur disque.
//
// Le Blog accueille les billets ET les récits d'aventure : ce sont les deux
// sortes datées et narratives du modèle. Les récits gardent leur URL sous leur
// aventure ; seule leur entrée figure ici.

import { registreDuBlog, urlDe, blocsDe } from "@/lib/contenu";
import { TYPES } from "@/lib/blogRegistre";
import { dateLisible } from "@/lib/lisible";

/** Le type d'une entrée : celui du billet, ou la sorte récit. */
function typeDe(frontmatter) {
  return frontmatter.sorte === "recit" ? "recit" : frontmatter.type;
}

/** Une entrée du registre, telle que l'index l'affiche. */
export function entrees() {
  return registreDuBlog().map((page) => {
    const { frontmatter } = page;
    const contenus = blocsDe(page).map((bloc) => bloc.type);

    return {
      slug: frontmatter.slug,
      sorte: frontmatter.sorte,
      type: typeDe(frontmatter),
      typeLabel: TYPES[typeDe(frontmatter)],
      titre: frontmatter.titre,
      chapeau: frontmatter.chapeau,
      date: frontmatter.date,
      dateLisible: dateLisible(frontmatter.date),
      url: urlDe(page),
      note: contenus.includes("note"),
      protocole: contenus.includes("protocole"),
    };
  });
}
