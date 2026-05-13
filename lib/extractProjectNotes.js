// lib/extractProjectNotes.js
//
// Extrait les "notes" d'un projet à partir des titres ### dans le markdown.
// Équivalent serveur de l'ancien utils/extractSubheadings (qui fetchait
// chaque .md côté client). Désormais exécuté au build : aucune requête
// réseau côté visiteur, et les notes sont présentes dans le HTML SSR.
//
// Format attendu dans les .md :
//
//   ## Semaine 1
//   ### Début du bloc d'entraînement spécifique
//   *29/09/2025*
//
// → notes: [{ date: "29/09/2025", title: "Début du bloc…" }]

import fs from "fs";
import path from "path";

export function extractProjectNotes(slug) {
  const filePath = path.join(process.cwd(), "public", "projets", `${slug}.md`);
  if (!fs.existsSync(filePath)) return [];

  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const notes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("### ")) continue;

    let title = line.replace(/^###\s+/, "").trim();
    title = title.replace(/^\*{1,2}(.*)\*{1,2}$/, "$1").trim();

    let date = null;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;

    if (j < lines.length) {
      let next = lines[j].trim();
      next = next.replace(/^\*{1,2}(.*)\*{1,2}$/, "$1").trim();
      const m = next.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/);
      if (m) date = m[0];
    }

    notes.push(date ? { date, title } : { title });
  }

  return notes;
}
