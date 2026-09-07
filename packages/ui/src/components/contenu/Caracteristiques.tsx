// packages/ui/src/components/contenu/Caracteristiques.tsx
//
// LA FICHE CLÉ/VALEUR D'UNE AVENTURE.
//
// Aucun champ n'est imposé : chaque campagne déclare les siens, et la grille
// s'adapte à leur nombre.

import type { Section } from "@locomotionlab/contenu/sections";

export type CaracteristiquesProps = {
  section: Extract<Section, { type: "caracteristiques" }>;
};

export default function Caracteristiques({ section }: CaracteristiquesProps) {
  return (
    <dl className="m-0 mt-5 grid grid-cols-1 gap-x-7 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {section.champs.map((champ) => (
        <div key={champ.label}>
          <dt className="font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
            {champ.label}
          </dt>
          <dd className="m-0 mt-1 font-heading text-lg font-semibold">{champ.valeur}</dd>
        </div>
      ))}
    </dl>
  );
}
