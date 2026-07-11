// lib/carouselItems.js
//
// Items du carrousel de contenus terrain (accueil, /live) : le feed
// récits + projets de getRecentExplorer, pré-formaté en chaînes pour les
// composants client — « Récit · 09/12/2025 », « Projet · En cours »,
// « Projet · Terminé le 30/11/2025 ».

import { getRecentExplorer } from "./getRecentActivity";

function shapeCarouselItem(item) {
  const isProjet = item.type === "Projet";

  // Le détail (après le « · ») est rendu en ocre par CardMeta.
  let detail = null;
  if (isProjet) {
    if (item.status === "Terminé" && item.completedAt) {
      detail = `Terminé le ${item.completedAt.toLocaleDateString("fr-FR")}`;
    } else {
      detail = item.status || null;
    }
  } else if (item.date) {
    detail = item.date.toLocaleDateString("fr-FR");
  }

  return {
    key: `${item.type}-${item.slug}`,
    href: item.href,
    cover: item.cover,
    title: item.title,
    kindLabel: isProjet ? "Projet" : "Récit",
    detail,
  };
}

export function getExplorerCarouselItems({ limit = 8 } = {}) {
  return getRecentExplorer({ limit }).map(shapeCarouselItem);
}
