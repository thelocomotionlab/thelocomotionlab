// packages/ui/src/components/contenu/CarteDeBloc.tsx
//
// LA CARTE DE RENVOI VERS UN BLOC — <VersProtocole> et <VersNote>.
//
// Elle lit l'index généré et affiche titre, objectif et lien. Elle ne recopie
// jamais le corps du bloc : renommer un protocole met donc à jour toutes ses
// citations sans toucher à aucune d'elles.
//
// La carte entière est le lien. Le bloc reste introuvable → le résolveur lève,
// et le build s'arrête ; ce composant n'a pas d'état « absent » à rendre.

import type { CarteDeBloc as DonneesDeCarte } from "@locomotionlab/contenu/resolveur";

// Chaque sorte de bloc garde son accent : terracotta d'Explorer pour un
// protocole, bleu-vert de Comprendre pour une note. Le filet du haut, le
// surtitre et la ligne de provenance lisent le même jeton.
const ACCENTS = {
  protocole: {
    surtitre: "Protocole",
    ecrit: "Protocole écrit dans",
    filet: "border-t-brand-deep",
    survol: "hover:border-brand-deep",
    texte: "text-brand-deep-dark",
  },
  note: {
    surtitre: "Note",
    ecrit: "Note écrite dans",
    filet: "border-t-brand-primary-dark",
    survol: "hover:border-brand-primary-dark",
    texte: "text-brand-slate-dark",
  },
} as const;

/** Un bloc s'écrit dans un billet, mais rien n'interdit les trois autres sortes. */
const PORTEUR = {
  billet: "le billet",
  recit: "le récit",
  article: "l'article",
  aventure: "l'aventure",
} as const;

export type CarteDeBlocProps = {
  bloc: DonneesDeCarte;
};

function Carte({ bloc }: CarteDeBlocProps) {
  const accent = ACCENTS[bloc.type];

  return (
    <a
      href={bloc.url}
      className={`block rounded-[10px] border border-brand-hairline border-t-[3px] bg-brand-paper px-5 py-4.5 text-brand-text no-underline shadow-bloc transition-colors ${accent.filet} ${accent.survol}`}
    >
      <span className={`font-mono text-xxs font-bold uppercase tracking-surtitre ${accent.texte}`}>
        {accent.surtitre}
      </span>

      <div className="mt-2 font-heading text-[19px] font-bold leading-[1.2]">{bloc.titre}</div>

      <div className="mt-1.5 font-sans text-[15px] leading-normal text-brand-soft">
        Objectif : {bloc.objectif}
      </div>

      <div className={`mt-3.5 font-mono text-meta tracking-pastille ${accent.texte}`}>
        {accent.ecrit} {PORTEUR[bloc.source.sorte]} « {bloc.source.titre} »
      </div>
    </a>
  );
}

/** Carte de renvoi vers un protocole. */
export function VersProtocole({ bloc }: CarteDeBlocProps) {
  return <Carte bloc={bloc} />;
}

/** Carte de renvoi vers une note. Même motif, sans pastille de statut. */
export function VersNote({ bloc }: CarteDeBlocProps) {
  return <Carte bloc={bloc} />;
}

export default Carte;
