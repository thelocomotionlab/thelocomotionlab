"use client";

// lib/useEcran.ts
//
// GRAND ÉCRAN OU TÉLÉPHONE — une seule question, posée une fois.
//
// Le seuil est celui de la charte du studio : au-dessus de 1024 px il y a la
// place pour le rail, un tiroir, la planche et l'inspecteur côte à côte ; en
// dessous, la planche prend tout et les réglages viennent en feuilles.
//
// ON EN CHOISIT UN, on ne rend pas les deux. Deux arbres, ce serait deux
// canvas de 1080 × 1350 et deux moteurs de rendu qui tournent pour rien. Le
// serveur ne connaît pas la taille de l'écran : il rend le grand, et la
// première mesure côté client corrige — dans le même tic que l'hydratation.

import { useSyncExternalStore } from "react";

const SEUIL = "(min-width: 1024px)";

function abonner(rappel: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(SEUIL);
  mq.addEventListener("change", rappel);
  return () => mq.removeEventListener("change", rappel);
}

/** Vrai quand on a la place des quatre colonnes. */
export function useGrandEcran(): boolean {
  return useSyncExternalStore(
    abonner,
    () => (window.matchMedia ? window.matchMedia(SEUIL).matches : true),
    // Au rendu serveur, on suppose le grand écran : c'est le cas le plus
    // fréquent, et se tromper ne coûte qu'une bascule à l'hydratation.
    () => true,
  );
}
