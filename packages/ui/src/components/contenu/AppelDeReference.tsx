// packages/ui/src/components/contenu/AppelDeReference.tsx
//
// L'APPEL DE RÉFÉRENCE EN EXPOSANT.
//
// Le numéro n'est jamais écrit dans le contenu : il vient du registre de la
// page, qui le donne dans l'ordre de première rencontre (cf. references.ts).
//
//   const references = creerRegistreDeReferences();
//   const Ref = creerAppelDeReference(references, "#bibliographie");
//   … <Ref cle="gundersen2016" /> …
//   <Bibliographie registre={references} entrees={bibliographie} />

import type { RegistreDeReferences } from "./references.ts";

export type AppelDeReferenceProps = {
  cle: string;
};

/** Lie un appel de référence au registre d'une page. */
export function creerAppelDeReference(
  registre: RegistreDeReferences,
  ancreDeLaBibliographie = "#bibliographie",
) {
  return function AppelDeReference({ cle }: AppelDeReferenceProps) {
    const numero = registre.numero(cle);
    return (
      <a
        href={ancreDeLaBibliographie}
        className="font-bold text-brand-slate-dark no-underline"
        aria-label={`Référence ${numero}`}
      >
        <sup className="ml-px text-[0.7em]">{numero}</sup>
      </a>
    );
  };
}
