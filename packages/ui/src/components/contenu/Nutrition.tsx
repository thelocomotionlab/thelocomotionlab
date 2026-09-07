// packages/ui/src/components/contenu/Nutrition.tsx
//
// LA SECTION NUTRITION : un tableau à colonnes libres.

import type { Section } from "@locomotionlab/contenu/sections";
import Tableau from "./Tableau.tsx";

export type NutritionProps = {
  section: Extract<Section, { type: "nutrition" }>;
};

function colonnesNumeriques(colonnes: readonly string[]): number[] {
  return colonnes
    .map((colonne, index) => (/masse|qté|quantité|kcal|poids|g$/i.test(colonne) ? index : -1))
    .filter((index) => index >= 0);
}

export default function Nutrition({ section }: NutritionProps) {
  return (
    <Tableau
      colonnes={section.colonnes}
      lignes={section.lignes}
      numeriques={colonnesNumeriques(section.colonnes)}
    />
  );
}
