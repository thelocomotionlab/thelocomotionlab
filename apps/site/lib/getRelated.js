// lib/getRelated.js
//
// Les contenus liés en bas d'une page de détail : les atomes RÉCENTS du même
// pilier, la page courante exclue. Relier par récence est un pis-aller — les
// vraies relations sont déclarées (concepts:, fiches:, parent:, lie:) et
// rendues en blocs générés. Ce module tient la place en attendant.

import { getRecentByPilier } from "./getRecentActivity";

export function getRelated(pilier, slug, limit = 3) {
  return getRecentByPilier(pilier)
    .filter((item) => item.slug !== slug)
    .slice(0, limit)
    .map((item) => ({
      slug: item.slug,
      title: item.title,
      href: item.href,
      cover: item.cover || "",
    }));
}
