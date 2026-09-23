// packages/ui/src/components/formulaire/BoutonTexte.tsx
//
// UNE ACTION QUI SE LIT COMME DU TEXTE : « copier le lien », « Restaurer », « abandon ».
//
// Un `Button` a l'allure d'un appel à l'action ; lui confier un geste secondaire, au fil
// d'une phrase ou au bout d'une ligne de tableau, crierait plus fort que ce qu'il fait.
// Trois tons : le lien (ambre, souligné), le discret (gris), l'alerte (terracotta foncée,
// pour ce qui supprime).

import type { ButtonHTMLAttributes, ReactNode } from "react";

const TONS = {
  lien: "font-semibold text-brand-accent-ink underline decoration-brand-accent underline-offset-4 hover:text-brand-deep",
  discret: "text-brand-muted hover:text-brand-deep",
  alerte: "font-semibold text-brand-deep-dark hover:text-brand-deep",
} as const;

export type BoutonTexteProps = {
  ton?: keyof typeof TONS;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

export default function BoutonTexte({ ton = "lien", className = "", children, ...reste }: BoutonTexteProps) {
  return (
    <button
      type="button"
      className={`cursor-pointer bg-transparent p-0 text-left disabled:cursor-not-allowed disabled:opacity-50 ${TONS[ton]} ${className}`}
      {...reste}
    >
      {children}
    </button>
  );
}
