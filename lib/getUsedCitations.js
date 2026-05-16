// lib/getUsedCitations.js
//
// Scanne un markdown pour récupérer la liste ordonnée des IDs de citations
// effectivement utilisées (présents dans bibliography.json), dans leur ordre
// d'apparition.
//
// Détecte les deux syntaxes :
//   - {{cite:ID}}
//   - <Citation id="ID">…</Citation>
//
// Ignore tout ce qui est commenté en HTML (<!-- … -->).

import bibliography from "../content/bibliography.json";

export function getUsedCitations(markdown = "") {
  if (!markdown) return [];

  const cleaned = markdown.replace(/<!--[\s\S]*?-->/g, "");

  const found = [];
  const reShortcode = /\{\{cite:([\w-]+)\}\}/g;
  const reTag = /<Citation\s+[^>]*id=["']([\w-]+)["']/g;

  let m;
  while ((m = reShortcode.exec(cleaned)) !== null) {
    found.push({ pos: m.index, id: m[1] });
  }
  while ((m = reTag.exec(cleaned)) !== null) {
    found.push({ pos: m.index, id: m[1] });
  }

  found.sort((a, b) => a.pos - b.pos);

  const ids = [];
  for (const { id } of found) {
    if (!ids.includes(id) && bibliography[id]) ids.push(id);
  }
  return ids;
}
