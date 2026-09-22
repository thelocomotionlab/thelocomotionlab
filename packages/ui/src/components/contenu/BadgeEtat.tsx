// packages/ui/src/components/contenu/BadgeEtat.tsx
//
// UN STATUT, en pastille.
//
// Trois tons, et trois seulement, pris dans les familles de la charte : l'ocre de ce
// qui s'annonce, le bleu-vert de ce qui se déroule, la terracotta de ce qui est
// derrière nous. Le texte et la bordure viennent par paire, et l'appelant n'a rien à
// choisir — il donne le ton et le mot à afficher.
//
// Deux façons de le dire, parce que deux endroits l'emploient : `etat` pour l'état
// d'une campagne (le modèle de contenu, qui n'a que ces trois valeurs), `ton` pour
// tout le reste — un statut d'ingestion, un plan publié, une demande ouverte. Le
// modèle de contenu ne connaît pas ces statuts-là, et n'a aucune raison de les
// apprendre ; les couleurs, elles, sont les mêmes.

import type { ReactNode } from "react";
import type { EtatDeCampagne } from "@locomotionlab/contenu/sortes";

/** Ce que la couleur dit, en trois mots. */
export type TonDeStatut = "annonce" | "deroule" | "derriere";

type Jetons = { texte: string; bordure: string };

const TONS: Record<TonDeStatut, Jetons> = {
  annonce: { texte: "text-brand-accent-ink", bordure: "border-brand-accent" },
  deroule: { texte: "text-brand-slate-dark", bordure: "border-brand-slate" },
  derriere: { texte: "text-brand-deep-dark", bordure: "border-brand-deep-dark" },
};

const DEPUIS_LETAT: Record<EtatDeCampagne, TonDeStatut> = {
  "en-preparation": "annonce",
  "en-cours": "deroule",
  termine: "derriere",
};

export type BadgeEtatProps = {
  /** L'état d'une campagne du modèle de contenu. */
  etat?: EtatDeCampagne;
  /** Le ton, quand ce qu'on affiche n'est pas une campagne. */
  ton?: TonDeStatut;
  /** Le mot affiché — « Terminé », « Ingestion en cours »… — écrit par l'app. */
  children: ReactNode;
};

export default function BadgeEtat({ etat, ton, children }: BadgeEtatProps) {
  const choisi: TonDeStatut = ton ?? (etat ? DEPUIS_LETAT[etat] : "annonce");
  const { texte, bordure } = TONS[choisi];

  return (
    <span
      className={`rounded-xs border px-2 py-0.5 font-mono text-meta font-bold uppercase tracking-etiquette ${texte} ${bordure}`}
    >
      {children}
    </span>
  );
}
