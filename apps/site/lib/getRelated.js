// lib/getRelated.js
//
// Retourne jusqu'a N entrees recentes (articles ou projets), en excluant
// la fiche courante. Utilise pour la section "Derniers articles" / "Derniers
// projets" en bas de chaque page de detail.

import {
  getRecentArticles,
  getRecentProjects,
} from "./getRecentActivity";

function shape(item) {
  if (!item) return null;
  return {
    slug: item.slug,
    title: item.title,
    href: item.href,
    cover: item.cover || "",
  };
}

function pickRelated(list, slug, limit) {
  return list.filter((item) => item.slug !== slug).slice(0, limit).map(shape);
}

export function getRelatedArticles(slug, limit = 3) {
  const all = getRecentArticles({ limit: Number.POSITIVE_INFINITY });
  return pickRelated(all, slug, limit);
}

export function getRelatedProjects(slug, limit = 3) {
  const all = getRecentProjects({ limit: Number.POSITIVE_INFINITY });
  return pickRelated(all, slug, limit);
}
