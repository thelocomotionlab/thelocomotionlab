"use client";

import bibliography from "../content/bibliography.json";
import Tooltip from "./Tooltip";

// Registre global des références citées (protégé pour SSR)
let usedRefs = null;

if (typeof window !== "undefined") {
  window.__usedRefs = window.__usedRefs || new Set();
  usedRefs = window.__usedRefs;
}

export default function Citation({ id, children }) {
  const ref = bibliography[id];

  if (!ref) {
    console.warn(`Référence ${id} non trouvée dans bibliography.json`);
    return <span>{children || id}</span>;
  }

  // Ajout au registre (si disponible dans le navigateur)
  if (usedRefs) {
    usedRefs.add(id);
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
