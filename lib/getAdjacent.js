// lib/getAdjacent.js
//
// Trouve les entrées précédente/suivante (chronologiquement) pour une fiche
// article ou projet donnée. Utilisé pour la navigation prev/next en bas de page.

import {
  getRecentArticles,
  getRecentProjects,
} from "./getRecentActivity";

function pickAdjacent(list, slug) {
  const index = list.findIndex((item) => item.slug === slug);
  if (index === -1) return { prev: null, next: null };
  // Liste triée du plus récent au plus ancien.
  // → "next" (le plus récent) est à l'index précédent ; "prev" à l'index suivant.
  return {
    prev: index < list.length - 1 ? list[index + 1] : null,
    next: index > 0 ? list[index - 1] : null,
  };
}

function shape(item) {
  if (!item) return null;
  return {
    slug: item.slug,
    title: item.title,
    href: item.href,
    cover: item.cover || "",
  };
}

export function getAdjacentArticles(slug) {
  const all = getRecentArticles({ limit: Number.POSITIVE_INFINITY });
  const { prev, next } = pickAdjacent(all, slug);
  return { prev: shape(prev), next: shape(next) };
}

export function getAdjacentProjects(slug) {
  const all = getRecentProjects({ limit: Number.POSITIVE_INFINITY });
  const { prev, next } = pickAdjacent(all, slug);
  return { prev: shape(prev), next: shape(next) };
}
