// packages/ui/src/components/contenu/CarteBillet.tsx
//
// LA CARTE DE RENVOI VERS UN BILLET — <VersBillet>.
//
// Le récit d'une préparation appartient au carnet de bord ; la page Aventure
// n'en garde qu'un renvoi. Même grammaire que les cartes de bloc — filet
// d'accent, surtitre, titre, une ligne de texte — avec l'ocre du carnet.
//
// La carte ne recopie pas le billet : elle en montre le titre, sa date et son
// amorce, et l'app résout le tout depuis le slug.

import type { ReactNode } from "react";

export type CarteBilletProps = {
  url: string;
  titre: string;
  /** « Billet », « Bilan », « Récit de sortie »… */
  surtitre: string;
  /** Le chapeau du billet, ou l'amorce de son texte. */
  extrait?: ReactNode;
  /** « 18 août 2026 ». */
  date?: ReactNode;
};

export default function CarteBillet({ url, titre, surtitre, extrait, date }: CarteBilletProps) {
  return (
    <a
      href={url}
      className="block rounded-[10px] border border-brand-hairline border-t-[3px] border-t-brand-accent bg-brand-paper px-5 py-4.5 text-brand-text no-underline shadow-bloc transition-colors hover:border-brand-accent"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-xxs font-bold uppercase tracking-surtitre text-brand-accent-ink">
          {surtitre}
        </span>
        {date ? (
          <span className="font-mono text-meta text-brand-muted tabular-nums">{date}</span>
        ) : null}
      </div>

      <div className="mt-2 font-heading text-[19px] font-bold leading-[1.2]">{titre}</div>

      {extrait ? (
        <div className="mt-1.5 font-sans text-[15px] leading-normal text-brand-soft [text-wrap:pretty]">
          {extrait}
        </div>
      ) : null}

      <div className="mt-3.5 font-mono text-meta tracking-pastille text-brand-accent-ink">
        Lire dans le carnet de bord
      </div>
    </a>
  );
}
