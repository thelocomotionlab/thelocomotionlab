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

/** Ce que le registre affiche sous un titre, quand rien n'est écrit à la main. */
const LONGUEUR_DE_LAMORCE = 180;

/**
 * L'amorce d'un billet : ses premiers mots, coupés à la fin d'un mot.
 *
 * Le registre du Blog a besoin d'une ligne sous chaque titre. Quand le
 * frontmatter porte un chapeau — c'est le cas des récits — on l'affiche tel
 * quel. Sinon on prend le début du texte : mieux vaut les premiers mots de
 * Valentin qu'un champ vide ou un « TODO » exposé aux lecteurs.
 *
 * @param {string} corps
 * @param {number} [longueur] la coupe se règle : le registre s'accommode d'une
 *   ligne longue, une méta-description est tronquée au-delà d'environ 155
 *   caractères dans les résultats de recherche.
 */
export function amorce(corps, longueur = LONGUEUR_DE_LAMORCE) {
  const nu = corps
    // les balises de bloc, de replay et de figure ne sont pas de la prose
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s*[-*]\s+/gm, "")
    // images, liens, emphase, titres et formules
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\$\$?[^$]*\$\$?/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (nu.length <= longueur) return nu;
  const coupe = nu.slice(0, longueur);
  const espace = coupe.lastIndexOf(" ");
  return `${(espace > 0 ? coupe.slice(0, espace) : coupe).replace(/[,;:.…]$/, "")}…`;
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
      chapeau:
        frontmatter.chapeau && frontmatter.chapeau !== "TODO"
          ? frontmatter.chapeau
          : amorce(page.corps),
      date: frontmatter.date,
      dateLisible: dateLisible(frontmatter.date),
      url: urlDe(page),
      note: contenus.includes("note"),
      protocole: contenus.includes("protocole"),
    };
  });
}
