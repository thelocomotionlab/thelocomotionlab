// packages/ui/src/components/contenu/Protocole.tsx
//
// LE BLOC PROTOCOLE, écrit dans le flux d'un billet.
//
// Une carte à filet terracotta : surtitre, titre, ligne de méta
// (références), l'objectif et le corps en clé/valeur, l'encart
// « Sensations » en italique, et la mention qui clôt tout protocole.
// Le composant pose son ancre lui-même, dérivée de l'id du bloc.

import type { ReactNode } from "react";
import { ancreDeBloc } from "@locomotionlab/contenu/ancres";

export type ProtocoleProps = {
  id: string;
  titre: string;
  objectif: ReactNode;
  children: ReactNode;
  /** Le vécu de la séance, en italique. */
  sensations?: ReactNode;
  /** Appels de référence déjà numérotés, rendus après le numéro. */
  references?: ReactNode;
};

export default function Protocole({
  id,
  titre,
  objectif,
  children,
  sensations,
  references,
}: ProtocoleProps) {
  return (
    <section
      id={ancreDeBloc("protocole", { id })}
      className="my-8 scroll-mt-24 rounded-xl border border-brand-hairline border-t-[3px] border-t-brand-deep bg-brand-paper px-6 pb-4.5 pt-5.5 text-[0.94em] shadow-bloc"
    >
      <span className="font-mono text-xxs font-bold uppercase tracking-surtitre text-brand-deep-dark">
        Protocole
      </span>

      <h3 className="m-0 mt-2 font-heading text-[1.45em] font-bold leading-tight text-brand-text">
        {titre}
      </h3>

      {references ? (
        <div className="mt-1.5 font-mono text-xs text-brand-muted tabular-nums">
          réf. {references}
        </div>
      ) : null}

      <dl className="m-0 mt-4 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-5 gap-y-3 border-t border-brand-hairline pt-4">
        <dt className="pt-0.5 font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
          Objectif
        </dt>
        <dd className="m-0 font-sans leading-relaxed">{objectif}</dd>
        <dt className="pt-0.5 font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
          Protocole
        </dt>
        <dd className="m-0 font-sans leading-relaxed">{children}</dd>
      </dl>

      {sensations ? (
        <div className="mt-4 rounded-md bg-brand-sensations px-4 py-3.5">
          <div className="font-mono text-xxs font-bold uppercase tracking-etiquette text-brand-deep-dark">
            Sensations
          </div>
          <div className="mt-1.5 font-sans italic leading-relaxed text-brand-soft">{sensations}</div>
        </div>
      ) : null}

      <p className="m-0 mt-3.5 font-mono text-meta text-brand-faint">
        Démarche personnelle, ne constitue pas un conseil.
      </p>
    </section>
  );
}
