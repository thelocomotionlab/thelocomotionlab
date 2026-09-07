// lib/carouselItems.js
//
// Items du carrousel de contenus terrain (page /live) : les campagnes et leurs
// récits, pré-formatés en chaînes pour les composants client —
// « Récit · 09/12/2025 », « Aventure · Terminé le 30/11/2025 ».
//
// La source est le modèle de contenu : ce qui n'est pas publié n'y entre pas,
// et les liens sont ceux du routage.

import { aventures, parSorte, urlDe, dateDeCampagne } from "@/lib/contenu";
import { ETATS } from "@/lib/aventure";
import { dateLisible } from "@/lib/lisible";

export function getExplorerCarouselItems({ limit = 8 } = {}) {
  const campagnes = aventures().map((page) => ({
    key: `aventure-${page.frontmatter.slug}`,
    href: urlDe(page),
    cover: page.frontmatter.cover !== "TODO" ? page.frontmatter.cover : null,
    title: page.frontmatter.titre,
    kindLabel: "Aventure",
    detail:
      page.frontmatter.etat === "termine" && page.frontmatter.campagne.fin
        ? `Terminé le ${dateLisible(page.frontmatter.campagne.fin)}`
        : ETATS[page.frontmatter.etat],
    tri: dateDeCampagne(page.frontmatter),
  }));

  const recits = parSorte("recit").map((page) => ({
    key: `recit-${page.frontmatter.slug}`,
    href: urlDe(page),
    cover: page.frontmatter.cover,
    title: page.frontmatter.titre,
    kindLabel: "Récit",
    detail: dateLisible(page.frontmatter.date),
    tri: page.frontmatter.date,
  }));

  return [...campagnes, ...recits]
    .sort((a, b) => b.tri.localeCompare(a.tri))
    .slice(0, limit)
    .map(({ tri, ...item }) => item);
}
