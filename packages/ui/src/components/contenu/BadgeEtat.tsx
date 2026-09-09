// packages/ui/src/components/contenu/BadgeEtat.tsx
//
// L'ÉTAT D'UNE CAMPAGNE, en pastille.
//
// Une couleur par état, prise dans les trois familles de la charte : l'ocre de
// ce qui s'annonce, le bleu-vert de ce qui se déroule, la terracotta de ce qui
// est derrière nous. Le texte et la bordure viennent par paire, et l'appelant
// n'a rien à choisir — il donne l'état et le mot à afficher.

import type { ReactNode } from "react";
import type { EtatDeCampagne } from "@locomotionlab/contenu/sortes";

type Jetons = { texte: string; bordure: string };

const ETATS: Record<EtatDeCampagne, Jetons> = {
  "en-preparation": { texte: "text-brand-accent-ink", bordure: "border-brand-accent" },
  "en-cours": { texte: "text-brand-slate-dark", bordure: "border-brand-slate" },
  termine: { texte: "text-brand-deep-dark", bordure: "border-brand-deep-dark" },
};

export type BadgeEtatProps = {
  etat: EtatDeCampagne;
  /** Le mot affiché — « Terminé », « En cours »… — écrit par l'app. */
  children: ReactNode;
};

export default function BadgeEtat({ etat, children }: BadgeEtatProps) {
  const { texte, bordure } = ETATS[etat];

  return (
    <span
      className={`rounded-xs border px-2 py-0.5 font-mono text-meta font-bold uppercase tracking-etiquette ${texte} ${bordure}`}
    >
      {children}
    </span>
  );
}
