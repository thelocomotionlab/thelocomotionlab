// lib/getUsedCitations.js
//
// Scanne un markdown pour récupérer la liste ordonnée des IDs de citations
// effectivement utilisées (présents dans bibliography.json), dans leur ordre
// d'apparition. Côté serveur : calculé une seule fois au build, plus besoin
// de useState/useEffect côté client.

import bibliography from "../content/bibliography.json";

export function getUsedCitations(markdown = "") {
  if (!markdown) return [];

  const regex = /\{\{cite:([\w-]+)\}\}/g;
  const ids = [];
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    const id = match[1];
    if (!ids.includes(id) && bibliography[id]) ids.push(id);
  }

  return ids;
}
