// packages/ui/src/components/contenu/Nutrition.tsx
//
// LA SECTION NUTRITION : un tableau à colonnes libres.

import type { Section } from "@locomotionlab/contenu/sections";
import Tableau from "./Tableau.tsx";

export type TableauDeNutrition = {
  colonnes: readonly string[];
  lignes: readonly (readonly string[])[];
};

export type NutritionProps = {
  section: Extract<Section, { type: "nutrition" }>;
  /**
   * Le tableau tiré du paquetage, quand la section déclare un `ref` et que le
   * CSV existe. Il l'emporte sur le tableau écrit à la main ; absent, la
   * section ne rend rien plutôt qu'un cadre vide.
   */
  depuisLePaquetage?: TableauDeNutrition;
};

function colonnesNumeriques(colonnes: readonly string[]): number[] {
  return colonnes
    .map((colonne, index) => (/masse|qté|quantité|kcal|poids|g$/i.test(colonne) ? index : -1))
    .filter((index) => index >= 0);
}

export default function Nutrition({ section, depuisLePaquetage }: NutritionProps) {
  const tableau = depuisLePaquetage ?? (section.colonnes && section.lignes ? section : null);
  if (!tableau?.colonnes || !tableau.lignes) return null;

  return (
    <Tableau
      colonnes={tableau.colonnes}
      lignes={tableau.lignes}
      numeriques={colonnesNumeriques(tableau.colonnes)}
    />
  );
}
