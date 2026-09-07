// packages/ui/src/components/contenu/libelles.ts
//
// LE NOM LISIBLE D'UNE SECTION, quand elle n'en déclare pas.
//
// Le sommaire et le titre d'une section lisent tous les deux ici : le libellé
// affiché et l'entrée de sommaire ne peuvent donc pas diverger. Une section qui
// porte un `titre` l'emporte.

import type { Section, TypeDeSection } from "@locomotionlab/contenu/sections";

export const LIBELLES_DE_SECTION: Record<TypeDeSection, string> = {
  caracteristiques: "Caractéristiques",
  geo: "Trace",
  preparation: "Préparation",
  paquetage: "Paquetage",
  nutrition: "Nutrition",
  libre: "Section",
  direct: "Direct",
  recit: "Récit",
};

export function libelleDeSection(section: Section): string {
  return section.titre ?? LIBELLES_DE_SECTION[section.type];
}
