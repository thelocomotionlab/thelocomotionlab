// components/Citation.jsx
//
// Composant unifié pour les deux syntaxes de citation :
//   - {{cite:ID}}                          → superscript numéroté [N]
//   - <Citation id="ID">texte</Citation>   → texte custom + superscript [N]
//
// Les deux passent par le même Tooltip et pointent vers la même ancre
// #ref-ID dans la section Références. La numérotation suit l'ordre
// d'apparition dans le markdown (via getUsedCitations).
//
// Usage côté Body :
//   const used = getUsedCitations(content);
//   const Citation = createCitation(used);
//   <ReactMarkdown components={{ citation: Citation }} />

import bibliography from "../content/bibliography.json";
import Tooltip from "./Tooltip";

export function createCitation(usedCitations = []) {
  return function Citation({ id, children }) {
    const entry = id ? bibliography[id] : null;

    if (!entry) {
      if (process.env.NODE_ENV !== "production" && id) {
        console.warn(`Référence ${id} non trouvée dans bibliography.json`);
      }
      return children ? <span>{children}</span> : <sup>[?]</sup>;
    }

    const index = usedCitations.indexOf(id) + 1;
    const sup = (
      <sup className="citation-ref">{index > 0 ? `${index}` : "?"}</sup>
    );

    return (
      <Tooltip entry={entry}>
        <a
          href={`#ref-${id}`}
          className="font-semibold text-brand-deep-dark underline underline-offset-2 decoration-brand-accent-dark/60 hover:decoration-brand-accent-dark"
        >
          {children ? (
            <>
              {children}
              {sup}
            </>
          ) : (
            sup
          )}
        </a>
      </Tooltip>
    );
  };
}
