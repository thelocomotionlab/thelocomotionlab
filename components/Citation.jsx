// components/Citation.jsx
//
// Server Component : se contente de formater l'entrée de bibliographie
// et d'envelopper l'enfant dans un Tooltip (qui reste client component).
// Plus de hack window.__usedRefs, plus de "use client" inutile.

import bibliography from "../content/bibliography.json";
import Tooltip from "./Tooltip";

export default function Citation({ id, children }) {
  const ref = bibliography[id];

  if (!ref) {
    if (process.env.NODE_ENV !== "production") {
      // Visible côté dev : indique qu'une citation pointe sur un ID absent.
      console.warn(`Référence ${id} non trouvée dans bibliography.json`);
    }
    return <span>{children || id}</span>;
  }

  const formatted = [
    `${ref.author} (${ref.year})`,
    ref.title ? `${ref.title}` : "",
    ref.journal
      ? `${ref.journal}${ref.volume ? `, ${ref.volume}` : ""}${
          ref.pages ? `, ${ref.pages}` : ""
        }.`
      : ref.publisher
      ? `${ref.publisher}.`
      : "",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <Tooltip text={formatted} link={ref.link}>
      {children || `${ref.author.split(" ").slice(-1)[0]}, ${ref.year}`}
    </Tooltip>
  );
}
