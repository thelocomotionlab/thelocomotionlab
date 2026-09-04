// lib/extractCarnetNotes.js
//
// Extrait les notes d'un carnet à partir des titres ### de son markdown.
// Exécuté au build : aucune requête réseau côté visiteur, et les notes sont
// présentes dans le HTML SSR. C'est aussi ce qui donne à un carnet sa date
// d'activité — la plus récente de ses notes — puisqu'il n'a pas de fin.
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

export function extractCarnetNotes(slug) {
  const filePath = path.join(process.cwd(), "content", "carnets", `${slug}.md`);
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

/**
 * Parse une date de note au format français "JJ/MM/AAAA".
 * Retourne un Date, ou null si la note n'est pas datée.
 */
export function parseNoteDate(str) {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const [jour, mois, annee] = parts.map(Number);
  if (!jour || !mois || !annee) return null;
  const d = new Date(annee < 100 ? annee + 2000 : annee, mois - 1, jour);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** La date de la note la plus récente d'un carnet, ou null s'il n'en a aucune. */
export function derniereNote(slug) {
  const dates = extractCarnetNotes(slug)
    .map((n) => parseNoteDate(n.date))
    .filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}
