// packages/ui/src/components/contenu/Accroche.tsx
//
// L'ACCROCHE — le chapeau d'une page ou d'une carte, sous le titre.
//
// Romain maigre, jamais italique : le composant pose `not-italic` lui-même, et
// n'accepte pas de classe qui pourrait l'annuler. L'italique de la charte est
// réservé aux légendes, à l'encart « Sensations » et aux mentions de version
// du Direct.
//
// L'interlettrage positif compense la maigreur : sans lui, le 300 se resserre
// et perd la respiration qui distingue l'accroche du corps.

import type { ReactNode } from "react";

export type AccrocheProps = {
  children: ReactNode;
  /** Taille de lecture. `page` sous un titre de page, `carte` dans une carte. */
  taille?: "page" | "carte";
  /** `clair` sur une photo sombre, où l'ocre doré remplace le brun. */
  teinte?: "brun" | "clair";
};

const TAILLES = {
  page: "mt-2.5 text-[22px] leading-snug",
  carte: "mt-2 text-lg leading-[1.4]",
} as const;

const TEINTES = {
  brun: "text-brand-deep-dark",
  clair: "text-brand-accent-light",
} as const;

export default function Accroche({
  children,
  taille = "page",
  teinte = "brun",
}: AccrocheProps) {
  return (
    <p
      className={`max-w-[64ch] font-sans font-light not-italic tracking-[0.012em] [text-wrap:pretty] ${TAILLES[taille]} ${TEINTES[teinte]}`}
    >
      {children}
    </p>
  );
}
