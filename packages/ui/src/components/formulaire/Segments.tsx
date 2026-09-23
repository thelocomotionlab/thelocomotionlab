// packages/ui/src/components/formulaire/Segments.tsx
//
// UN CHOIX PARMI QUELQUES-UNS, côte à côte : le mode d'un plan, la phase choisie.
//
// Les options se touchent ; celle qui est choisie prend l'ocre plein. C'est un groupe de
// boutons radio pour un lecteur d'écran, et rien d'autre ne change à la sélection.

import type { ReactNode } from "react";

export type OptionDeSegment = { valeur: string; libelle: ReactNode };

export type SegmentsProps = {
  options: OptionDeSegment[];
  valeur: string;
  surChange: (valeur: string) => void;
  /** Ce que le groupe choisit, pour un lecteur d'écran. */
  etiquette: string;
  /** Des pastilles séparées plutôt qu'une barre continue, quand les options sont nombreuses. */
  separes?: boolean;
  className?: string;
};

export default function Segments({ options, valeur, surChange, etiquette, separes = false, className = "" }: SegmentsProps) {
  return (
    <span role="radiogroup" aria-label={etiquette} className={`flex ${separes ? "flex-wrap gap-2" : ""} ${className}`}>
      {options.map((option, rang) => {
        const choisi = option.valeur === valeur;
        const forme = separes
          ? "rounded-full"
          : rang === 0
            ? "rounded-l-full"
            : rang === options.length - 1
              ? "-ml-px rounded-r-full"
              : "-ml-px";
        return (
          <button
            key={option.valeur}
            type="button"
            role="radio"
            aria-checked={choisi}
            onClick={() => surChange(option.valeur)}
            className={`cursor-pointer border border-brand-accent px-3.5 py-1 text-sm font-semibold ${forme} ${
              choisi ? "bg-brand-accent text-brand-paper" : "bg-brand-paper text-brand-accent-ink hover:bg-brand-grid"
            }`}
          >
            {option.libelle}
          </button>
        );
      })}
    </span>
  );
}
