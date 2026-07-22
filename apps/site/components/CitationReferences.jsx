// components/CitationReferences.jsx
//
// Section "Références" rendue en bas d'un article ou projet.
// Server component : reçoit la liste ordonnée des IDs utilisés
// (via getUsedCitations) et renvoie la bibliographie formatée.

import bibliography from "../content/bibliography.json";

export default function CitationReferences({ ids = [] }) {
  if (ids.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold text-brand-accent-ink mb-4">Références</h2>
      <ol className="list-decimal list-inside space-y-2 text-gray-700 font-lora">
        {ids.map((id) => {
          const entry = bibliography[id];
          if (!entry) return null;

          const link = entry.link || entry.url;
          const source = entry.journal
            ? `${entry.journal}${entry.volume ? `, ${entry.volume}` : ""}${
                entry.pages ? `, ${entry.pages}` : ""
              }.`
            : entry.publisher
            ? `${entry.publisher}.`
            : "";

          return (
            <li key={id} id={`ref-${id}`} className="scroll-mt-24">
              <span className="text-gray-700">
                {entry.author} ({entry.year}). <em>{entry.title}</em>.{" "}
                {source}
              </span>
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-primary hover:underline ml-1"
                >
                  Lire
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
