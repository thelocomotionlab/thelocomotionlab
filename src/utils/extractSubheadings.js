// src/utils/extractSubheadings.js

/**
 * Extrait les sous-titres ### d'un markdown, avec leur date (ligne suivante en italique)
 * Supporte formats : 12/10/2025, 12-10-2025, 12 octobre 2025
 * Trie automatiquement par date décroissante
 */
export async function extractSubheadings(slug) {
  try {
    const res = await fetch(`/projets/${slug}.md`);
    if (!res.ok) throw new Error();
    const text = await res.text();

    // Supprime le frontmatter YAML
    const clean = text.replace(/^---[\s\S]*?---\n/, "");

    const lines = clean.split(/\r?\n/);
    const notes = [];

    // Expression régulière tolérante sur les dates
    const dateRegex =
      /^\*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+[a-zA-Zéû]+\s+\d{4})\*/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = /^###\s+(.+)/.exec(line);
      if (match) {
        const title = match[1].trim();
        const next = (lines[i + 1] || "").trim();
        let dateStr = "";

        const dateMatch = dateRegex.exec(next);
        if (dateMatch) dateStr = dateMatch[1];

        // On essaie de parser la date proprement
        let timestamp = 0;
        if (dateStr) {
          const normalized = dateStr
            .replace(/-/g, "/")
            .replace(/\s+/g, " ")
            .replace(/[a-zA-Zéû]+/gi, (m) => {
              const months = {
                janvier: "01",
                février: "02",
                fevrier: "02",
                mars: "03",
                avril: "04",
                mai: "05",
                juin: "06",
                juillet: "07",
                aout: "08",
                août: "08",
                septembre: "09",
                octobre: "10",
                novembre: "11",
                décembre: "12",
                decembre: "12",
              };
              return months[m.toLowerCase()] || m;
            });
          const [d, m, y] = normalized.split(/[\/\s]/);
          if (d && m && y) {
            const dateObj = new Date(`${y}-${m}-${d}`);
            if (!isNaN(dateObj)) timestamp = dateObj.getTime();
          }
        }

        notes.push({ title, date: dateStr, timestamp });
      }
    }

    // Tri décroissant par date (les plus récentes d'abord)
    notes.sort((a, b) => b.timestamp - a.timestamp);

    return notes;
  } catch {
    return [];
  }
}
