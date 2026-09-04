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

    // Le corps de la note : de la ligne de date jusqu'au titre suivant.
    let k = date ? j + 1 : i + 1;
    const debut = k;
    while (k < lines.length && !/^#{2,3}\s/.test(lines[k])) k++;
    const corps = lines.slice(debut, k).join("\n");

    notes.push({ ...(date ? { date } : {}), title, corps });
  }

  return notes;
}

const LIEN_INTERNE = /\[([^\]]+)\]\((\/(?:comprendre|explorer)\/[a-z0-9-]+)\)/g;

/**
 * Le résumé d'une note pour le registre : ses premiers mots en texte nu, sans
 * les images, les balises, les pointeurs « → » ni le retour au sommaire.
 */
export function resumeDeNote(corps = "", longueur = 170) {
  const texte = corps
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[a-z][^>]*>[\s\S]*?<\/[a-z]+>/gi, " ")
    .replace(/<[a-z][^>]*\/?>/gi, " ")
    .replace(/^\s*→.*$/gm, " ")
    .replace(/^\s*#{1,6}\s.*$/gm, " ")
    .replace(/\[Retour au sommaire\]\(#sommaire\)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/:::\s*\w*/g, " ")
    .replace(/[*_`#>]+/g, "")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (texte.length <= longueur) return texte;
  const coupe = texte.slice(0, longueur);
  return coupe.slice(0, coupe.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
}

/**
 * Les atomes qu'une note pointe, dans l'ordre : au plus `max` liens uniques.
 * Les pointeurs « → … » sont les atomes que la note a fait naître : ils passent
 * d'abord ; les autres liens internes ne servent qu'à défaut.
 */
export function liensDeNote(corps = "", max = 3) {
  const pointeurs = corps
    .split("\n")
    .filter((l) => l.trim().startsWith("→"))
    .join("\n");
  const source = LIEN_INTERNE.test(pointeurs) ? pointeurs : corps;
  LIEN_INTERNE.lastIndex = 0;

  const vus = new Set();
  const liens = [];
  for (const [, label, href] of source.matchAll(LIEN_INTERNE)) {
    if (vus.has(href)) continue;
    vus.add(href);
    liens.push({ label, href });
    if (liens.length >= max) break;
  }
  return liens;
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
