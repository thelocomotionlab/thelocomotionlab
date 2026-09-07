// packages/ui/src/components/contenu/BadgeStatut.tsx
//
// LE STATUT D'UN PROTOCOLE, en pastille.
//
// Chaque statut porte deux jetons : un pour le texte, lisible sur fond clair,
// et un pour le point et la bordure. La combinaison illisible n'existe pas,
// parce qu'aucun appelant ne choisit les couleurs.

import { STATUTS_DE_PROTOCOLE } from "@locomotionlab/contenu/blocs";
import type { StatutDeProtocole } from "@locomotionlab/contenu/blocs";

type Jetons = { libelle: string; texte: string; bordure: string; point: string };

const STATUTS: Record<StatutDeProtocole, Jetons> = {
  hypothese: {
    libelle: "Hypothèse",
    texte: "text-brand-slate-dark",
    bordure: "border-brand-primary",
    point: "bg-brand-primary",
  },
  "en-test": {
    libelle: "En test",
    texte: "text-brand-accent-ink",
    bordure: "border-brand-accent",
    point: "bg-brand-accent",
  },
  eprouve: {
    libelle: "Éprouvé",
    texte: "text-brand-success",
    bordure: "border-brand-success",
    point: "bg-brand-success",
  },
  abandonne: {
    libelle: "Abandonné",
    texte: "text-brand-muted",
    bordure: "border-brand-gauge-full",
    point: "bg-brand-gauge-full",
  },
};

export type BadgeStatutProps = {
  statut: StatutDeProtocole;
};

export default function BadgeStatut({ statut }: BadgeStatutProps) {
  const { libelle, texte, bordure, point } = STATUTS[statut];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xxs font-bold uppercase tracking-etiquette ${texte} ${bordure}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${point}`} aria-hidden="true" />
      {libelle}
    </span>
  );
}

export { STATUTS_DE_PROTOCOLE };
