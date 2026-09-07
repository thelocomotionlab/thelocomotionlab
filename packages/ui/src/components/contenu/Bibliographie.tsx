// packages/ui/src/components/contenu/Bibliographie.tsx
//
// LA BIBLIOGRAPHIE D'UNE PAGE, dans l'ordre des appels.
//
// Elle ne liste que les clés réellement citées, et dans l'ordre que le registre
// leur a donné : une clé déclarée mais jamais appelée n'apparaît pas.

import type { ReactNode } from "react";
import type { RegistreDeReferences } from "./references.ts";

export type EntreeDeBibliographie = {
  auteur?: string;
  annee?: string;
  titre?: string;
  journal?: string;
  lien?: string;
};

export type BibliographieProps = {
  registre: RegistreDeReferences;
  /** La bibliographie du site, clé → entrée. */
  entrees: Record<string, EntreeDeBibliographie>;
  id?: string;
  titre?: ReactNode;
};

export default function Bibliographie({
  registre,
  entrees,
  id = "bibliographie",
  titre = "Références",
}: BibliographieProps) {
  const citees = registre.citees();
  if (citees.length === 0) return null;

  return (
    <section id={id} className="mt-12 scroll-mt-24 border-t border-brand-hairline pt-5">
      <h2 className="m-0 font-mono text-xxs font-bold uppercase tracking-surtitre text-brand-muted">
        {titre}
      </h2>
      <ol className="mt-4 list-none space-y-3 p-0">
        {citees.map((cle, index) => {
          const entree = entrees[cle];
          return (
            <li key={cle} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
              <span className="font-mono text-sm text-brand-faint tabular-nums">{index + 1}</span>
              <span className="font-lora text-tableau leading-relaxed text-brand-soft">
                {entree ? (
                  <>
                    {entree.auteur ? `${entree.auteur} ` : null}
                    {entree.annee ? `(${entree.annee}). ` : null}
                    {entree.titre ? `${entree.titre}. ` : null}
                    {entree.journal ? <em className="not-italic">{entree.journal}. </em> : null}
                    {entree.lien ? (
                      <a
                        href={entree.lien}
                        className="border-b border-brand-wash-line text-brand-slate-dark no-underline"
                      >
                        Lire
                      </a>
                    ) : null}
                  </>
                ) : (
                  <span className="font-mono text-brand-faint">{cle}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
