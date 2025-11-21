// utils/extractSubheadings.js

/**
 * Extrait les "notes" d'un projet à partir des titres ### dans le markdown.
 *
 * Format attendu (comme dans tes fichiers) :
 *
 * ## Semaine 1
 * ### Début du bloc d'entraînement spécifique
 * *29/09/2025*
 *
 * On prend :
 *   title = "Début du bloc d'entraînement spécifique"
 *   date  = "29/09/2025"
 */
export async function extractSubheadings(slug) {
  try {
    const res = await fetch(`/projets/${slug}.md`);
    if (!res.ok) {
      console.warn(`Impossible de charger /projets/${slug}.md`);
      return [];
    }

    const text = await res.text();
    const lines = text.split(/\r?\n/);

    const notes = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // On ne garde que les titres de niveau 3
      if (!line.trim().startsWith("### ")) continue;

      // Titre = contenu après "### "
      let title = line.replace(/^###\s+/, "").trim();
      // on enlève d'éventuels ** ... **
      title = title.replace(/^\*{1,2}(.*)\*{1,2}$/, "$1").trim();

      // Chercher la première ligne non vide après le titre
      let date = null;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") {
        j++;
      }

      if (j < lines.length) {
        let next = lines[j].trim();
        // on enlève les * autour : *29/09/2025*
        next = next.replace(/^\*{1,2}(.*)\*{1,2}$/, "$1").trim();

        // Date au format 29/09/2025 ou 29/09/25
        const dateMatch = next.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/);
        if (dateMatch) {
          date = dateMatch[0];
        }
      }

      notes.push(
        date
          ? { date, title }
          : { title } // au cas où pas de date
      );
    }

    return notes;
  } catch (err) {
    console.error("Erreur extractSubheadings:", err);
    return [];
  }
}
