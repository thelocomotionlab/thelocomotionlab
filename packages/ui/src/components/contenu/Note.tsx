// packages/ui/src/components/contenu/Note.tsx
//
// LE BLOC NOTE, écrit dans le flux d'un billet.
//
// Un aparté sourcé, sans statut ni numéro : filet bleu-vert de Comprendre,
// lavis léger, et un renvoi facultatif vers l'article Science qui développe.
// Le composant pose son ancre lui-même, dérivée de l'id du bloc.

import type { ReactNode } from "react";
import { ancreDeBloc } from "@locomotionlab/contenu/ancres";

export type NoteProps = {
  id: string;
  titre: string;
  children: ReactNode;
  /** Renvoi vers l'article qui développe la note. */
  article?: { titre: string; url: string };
};

export default function Note({ id, titre, children, article }: NoteProps) {
  return (
    <aside
      id={ancreDeBloc("note", { id })}
      className="my-7 scroll-mt-24 rounded-r-lg border-l-[3px] border-brand-primary-dark bg-brand-wash/35 py-4 pl-5.5 pr-5"
    >
      <div className="flex items-baseline gap-2.5 font-mono text-xxs font-bold uppercase tracking-surtitre text-brand-slate-dark">
        Note
        <span className="font-normal normal-case tracking-pastille text-brand-muted">{titre}</span>
      </div>
      <div className="mt-2 font-sans text-[0.95em] leading-relaxed text-brand-ink">{children}</div>
      {article ? (
        <a
          href={article.url}
          className="mt-2.5 inline-block border-b border-brand-wash-line font-mono text-meta tracking-lien text-brand-slate-dark no-underline"
        >
          Article Science : « {article.titre} »
        </a>
      ) : null}
    </aside>
  );
}
