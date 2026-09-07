// packages/ui/src/components/contenu/Accroche.tsx
//
// L'ACCROCHE — le chapeau d'une page, sous le titre.
//
// Romain maigre, jamais italique : le composant pose `not-italic` lui-même, et
// n'accepte pas de classe qui pourrait l'annuler. L'italique de la charte est
// réservé aux légendes, à l'encart « Sensations » et aux mentions de version
// du Direct.

import type { ReactNode } from "react";

export type AccrocheProps = {
  children: ReactNode;
  /** Taille de lecture. `page` sous un titre de page, `carte` dans une carte. */
  taille?: "page" | "carte";
};

const TAILLES = {
  page: "text-xl leading-relaxed",
  carte: "text-lecture leading-snug",
} as const;

export default function Accroche({ children, taille = "page" }: AccrocheProps) {
  return (
    <p
      className={`mt-4 max-w-[64ch] font-lora font-light not-italic text-brand-soft [text-wrap:pretty] ${TAILLES[taille]}`}
    >
      {children}
    </p>
  );
}
