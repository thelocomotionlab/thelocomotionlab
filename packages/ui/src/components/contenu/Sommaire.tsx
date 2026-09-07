// packages/ui/src/components/contenu/Sommaire.tsx
//
// LE SOMMAIRE LATÉRAL D'UNE PAGE AVENTURE.
//
// Dérivé du tableau `sections` : les mêmes ancres et les mêmes numéros que les
// sections elles-mêmes, calculés par le même module. Aucune entrée n'est écrite
// à la main, donc le sommaire ne peut pas diverger de la page.

import { numeroterSections } from "@locomotionlab/contenu/ancres";
import type { Section } from "@locomotionlab/contenu/sections";
import { libelleDeSection } from "./libelles.ts";

export type SommaireProps = {
  sections: readonly Section[];
  titre?: string;
};

export default function Sommaire({ sections, titre = "Sommaire" }: SommaireProps) {
  if (sections.length === 0) return null;
  const entrees = numeroterSections(sections);

  return (
    <nav aria-label={titre} className="sticky top-24 self-start">
      <div className="border-b border-brand-hairline pb-2.5 font-mono text-xxs font-semibold uppercase tracking-surtitre text-brand-muted">
        {titre}
      </div>
      <ol className="m-0 list-none p-0 font-heading text-sm">
        {entrees.map((entree, index) => (
          <li key={entree.ancre}>
            <a
              href={`#${entree.ancre}`}
              className={`flex items-baseline gap-3 py-2.5 text-brand-text no-underline transition-colors hover:text-brand-deep ${
                index === entrees.length - 1 ? "" : "border-b border-brand-grid"
              }`}
            >
              <span className="font-mono text-meta text-brand-faint tabular-nums">
                {entree.numero}
              </span>
              <span className="flex-1">{libelleDeSection(sections[index]!)}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
