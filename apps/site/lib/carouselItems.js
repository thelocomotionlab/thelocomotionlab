// lib/carouselItems.js
//
// Items du carrousel de contenus terrain (accueil, /live) : le feed Explorer
// de getRecentActivity, pré-formaté en chaînes pour les composants client —
// « Expédition · 09/12/2025 », « Protocole · Éprouvé », « Carnet · 03/09/2026 ».

import { getRecentExplorer } from "./getRecentActivity";

function shapeCarouselItem(item) {
  // Le détail (après le « · ») est rendu en ocre par CardMeta : l'état de
  // l'atome quand il en a un, sa dernière activité sinon.
  const detail =
    item.etat ?? item.activite?.toLocaleDateString("fr-FR") ?? null;

  return {
    key: `${item.kind}-${item.slug}`,
    href: item.href,
    cover: item.cover,
    title: item.title,
    kindLabel: item.kindLabel,
    detail,
  };
}

export function getExplorerCarouselItems({ limit = 8 } = {}) {
  return getRecentExplorer({ limit }).map(shapeCarouselItem);
}
