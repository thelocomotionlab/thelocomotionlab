// lib/carouselItems.js
//
// Items du carrousel de contenus terrain (accueil, /live) : le feed
// récits + projets de getRecentExplorer, pré-formaté en chaînes pour les
// composants client — « Récit · 09/12/2025 », « Projet · En cours »,
// « Projet · Terminé le 30/11/2025 ».

import { getRecentExplorer } from "./getRecentActivity";

function shapeCarouselItem(item) {
  const isProjet = item.type === "Projet";

  let meta = null;
  if (isProjet) {
    if (item.status === "Terminé" && item.completedAt) {
      meta = `Terminé le ${item.completedAt.toLocaleDateString("fr-FR")}`;
    } else if (item.status !== "En cours") {
      meta = item.status;
    }
  } else if (item.date) {
    meta = item.date.toLocaleDateString("fr-FR");
  }

  return {
    key: `${item.type}-${item.slug}`,
    href: item.href,
    cover: item.cover,
    title: item.title,
    kindLabel: isProjet ? "Projet" : "Récit",
    enCours: isProjet && item.status === "En cours",
    meta,
  };
}

export function getExplorerCarouselItems({ limit = 8 } = {}) {
  return getRecentExplorer({ limit }).map(shapeCarouselItem);
}
