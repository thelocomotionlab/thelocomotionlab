// packages/ui/src/components/formulaire/index.ts
//
// Les primitives des OUTILS du laboratoire (tableau de bord, page de plan) : des champs
// courts, des actions qui se lisent comme du texte, des choix côte à côte. `Button` et
// `Field` restent ceux des pages ; ceux-ci sont ceux d'un écran de travail.

export { default as BoutonTexte } from "./BoutonTexte";
export type { BoutonTexteProps } from "./BoutonTexte";
export { default as Case } from "./Case";
export type { CaseProps } from "./Case";
export { default as ChampCompact } from "./ChampCompact";
export type { ChampCompactProps } from "./ChampCompact";
export { default as Choix } from "./Choix";
export type { ChoixProps, OptionDeChoix } from "./Choix";
export { default as Etapes } from "./Etapes";
export type { Etape, EtapesProps } from "./Etapes";
export { default as Segments } from "./Segments";
export type { OptionDeSegment, SegmentsProps } from "./Segments";
