// lib/buildSearchIndex.js
//
// Construit, au build, un index plat des contenus publiés : titre, chapeau,
// thèmes et texte brut du corps. La page /recherche charge ce seul fichier
// statique (/search-index.json) au lieu d'aller chercher chaque page.
//
// La source est le modèle de contenu (lib/contenu.js) : ce qui n'est pas
// publié n'y entre pas, et les liens sont ceux du routage.

import { parSorte, aventures, urlDe } from "@/lib/contenu";

function stripMarkdown(md = "") {
  return md
    .replace(/<[a-z][^>]*>/gi, " ") // balises HTML inline
    .replace(/<\/[a-z]+>/gi, " ")
    .replace(/<[A-Z][^>]*>/g, " ") // blocs Note / Protocole / cartes
    .replace(/<\/[A-Z][a-zA-Z]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // liens : conserve le texte affiché
    .replace(/```[\s\S]*?```/g, " ") // blocs de code
    .replace(/`[^`]+`/g, " ") // code en ligne
    .replace(/:::[\s\S]*?:::/g, " ") // directives
    .replace(/\{\{(cite|fig):[\w-]+\}\}/g, " ")
    .replace(/^\s*#{1,6}\s+/gm, "") // marqueurs de titre
    .replace(/[*_~>]+/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Les mots-clés d'une page : ses thèmes pour un article, son type pour un billet. */
function motsCles(frontmatter) {
  if (frontmatter.sorte === "article") return frontmatter.themes;
  if (frontmatter.sorte === "billet") return [frontmatter.type];
  if (frontmatter.sorte === "aventure") return [frontmatter.etat];
  return [];
}

export function buildSearchIndex() {
  const pages = [
    ...parSorte("article"),
    ...aventures(),
    ...parSorte("recit"),
    ...parSorte("billet"),
  ];

  return pages.map((page) => ({
    type: page.frontmatter.sorte,
    slug: page.frontmatter.slug,
    href: urlDe(page),
    title: page.frontmatter.titre,
    description: page.frontmatter.chapeau,
    status: page.frontmatter.sorte === "aventure" ? page.frontmatter.etat : "",
    tags: motsCles(page.frontmatter),
    body: stripMarkdown(page.corps),
  }));
}
