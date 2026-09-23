// packages/ui/src/components/formulaire/Etapes.tsx
//
// LES ÉTAPES D'UN OUTIL, numérotées, dans un rail : on voit où l'on est et l'on saute
// à n'importe laquelle — elles s'enchaînent, elles ne s'enferment pas.

import type { ReactNode } from "react";

export type Etape = { cle: string; titre: ReactNode };

export type EtapesProps = {
  etapes: Etape[];
  active: string;
  surChoix: (cle: string) => void;
  etiquette?: string;
};

export default function Etapes({ etapes, active, surChoix, etiquette = "Étapes" }: EtapesProps) {
  return (
    <nav aria-label={etiquette} className="flex flex-col gap-1">
      {etapes.map((etape, rang) => {
        const courante = etape.cle === active;
        return (
          <button
            key={etape.cle}
            type="button"
            onClick={() => surChoix(etape.cle)}
            aria-current={courante ? "step" : undefined}
            className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
              courante ? "bg-brand-mist font-semibold text-brand-text" : "text-brand-muted hover:text-brand-text"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                courante ? "bg-brand-slate text-brand-paper" : "border border-brand-hairline"
              }`}
            >
              {rang + 1}
            </span>
            {etape.titre}
          </button>
        );
      })}
    </nav>
  );
}
