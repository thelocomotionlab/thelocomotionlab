// packages/ui/src/components/contenu/SectionAventure.tsx
//
// L'ENVELOPPE D'UNE SECTION D'AVENTURE : l'ancre, le numéro et le titre.
//
// C'est ici que se tient la règle : le composant pose SON ancre, dérivée du
// slug de la section, et son numéro vient de la position dans le tableau
// `sections`. Rien n'est écrit à la main, donc insérer une section renumérote
// tout et ne déplace aucune ancre.

import type { ReactNode } from "react";
import { ancreDeSection } from "@locomotionlab/contenu/ancres";
import type { Section } from "@locomotionlab/contenu/sections";
import { libelleDeSection } from "./libelles.ts";

export type SectionAventureProps = {
  section: Section;
  /** Position dans le tableau `sections` — d'où vient le numéro affiché. */
  index: number;
  /** Ce qui se pose juste sous le titre, avant le texte : un renvoi, un appel. */
  entete?: ReactNode;
  children: ReactNode;
};

/** Le numéro affiché d'une section : « 01 », « 02 »… depuis sa position. */
export function numeroDeSection(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export default function SectionAventure({
  section,
  index,
  entete,
  children,
}: SectionAventureProps) {
  return (
    <section id={ancreDeSection(section)} className="mt-12 scroll-mt-24">
      <div className="flex items-baseline gap-3.5 border-b border-brand-hairline pb-2.5">
        <span className="font-mono text-meta text-brand-faint tabular-nums">
          {numeroDeSection(index)}
        </span>
        <h2 className="m-0 font-heading text-2xl font-bold text-brand-deep">
          {libelleDeSection(section)}
        </h2>
      </div>
      {entete}
      {children}
    </section>
  );
}
