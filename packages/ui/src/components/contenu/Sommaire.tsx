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
  /**
   * Le même sommaire, plié dans un `<details>`. C'est la forme qu'il prend
   * quand il n'y a pas de colonne où le poser à côté du texte : il annonce le
   * plan sans prendre l'écran, et s'ouvre pour sauter à une section.
   */
  repliable?: boolean;
  className?: string;
};

export default function Sommaire({
  sections,
  titre = "Sommaire",
  repliable = false,
  className = "",
}: SommaireProps) {
  if (sections.length === 0) return null;
  const entrees = numeroterSections(sections);

  const liste = (
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
  );

  if (repliable) {
    return (
      <details className={`group rounded-xl border border-brand-hairline bg-brand-paper px-4 ${className}`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 font-mono text-xxs font-semibold uppercase tracking-surtitre text-brand-muted [&::-webkit-details-marker]:hidden">
          <span>{titre}</span>
          <span className="flex items-center gap-2.5 tracking-etiquette text-brand-faint">
            {entrees.length} sections
            {/* Le même triangle que les catégories du paquetage. */}
            <span
              aria-hidden="true"
              className="h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-brand-deep-dark transition-transform duration-150 ease-out group-open:rotate-90"
            />
          </span>
        </summary>
        <nav aria-label={titre} className="pb-2">
          {liste}
        </nav>
      </details>
    );
  }

  return (
    <nav aria-label={titre} className={`sticky top-24 self-start ${className}`}>
      <div className="border-b border-brand-hairline pb-2.5 font-mono text-xxs font-semibold uppercase tracking-surtitre text-brand-muted">
        {titre}
      </div>
      {liste}
    </nav>
  );
}
