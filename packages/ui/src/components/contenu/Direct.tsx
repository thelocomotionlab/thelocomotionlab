// packages/ui/src/components/contenu/Direct.tsx
//
// LA SECTION DIRECT : le replay de la campagne, sa version, ses réglages.
//
// Le replay arrive en `children` (l'app sait le rendre). La mention de version
// est une légende, donc en italique — c'est l'un des trois seuls endroits de la
// charte où l'italique est de mise.

import type { ReactNode } from "react";

export type ReglageDuDirect = { label: string; valeur: ReactNode };

export type DirectProps = {
  /** Le replay, rendu par l'app. */
  children?: ReactNode;
  /** « Direct v1 (2025) — smartphone + Traccar, conservé tel quel. » */
  version?: ReactNode;
  reglages?: readonly ReglageDuDirect[];
};

/**
 * L'appel vers la page d'archive du direct. Il se pose en tête de section,
 * avant le texte : c'est le premier geste possible sur une campagne terminée.
 */
export function ArchiveDuDirect({ url }: { url: string }) {
  return (
    <div className="mt-5 flex flex-col gap-5 rounded-[14px] border border-brand-wash-line bg-brand-mist px-6 py-5 shadow-mist sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <p className="m-0 font-mono text-xxs font-bold uppercase tracking-etiquette text-brand-slate">
          Direct archivé
        </p>
        <p className="m-0 mt-2 max-w-[52ch] font-sans text-lecture font-lecture leading-lecture text-brand-ink [text-wrap:pretty]">
          La carte, le profil, la progression et le carnet de bord, figés tels qu&rsquo;on les a
          suivis en direct.
        </p>
      </div>
      <a
        href={url}
        className="inline-block shrink-0 self-start whitespace-nowrap rounded-full bg-brand-accent px-[26px] py-3 font-heading text-[15px] font-semibold text-white no-underline shadow-cta transition-colors hover:bg-brand-accent-dark sm:self-auto"
      >
        Ouvrir le direct
      </a>
    </div>
  );
}

export default function Direct({ children, version, reglages = [] }: DirectProps) {
  return (
    <>
      {children || version ? (
        <figure className="m-0 mt-5">
          {children ? (
            <div className="overflow-hidden rounded-md border border-brand-hairline">{children}</div>
          ) : null}
          {version ? (
            <figcaption className="mt-3 font-sans italic leading-relaxed text-brand-muted">
              <span className="mb-2 block h-0.5 w-11 bg-brand-accent/75" />
              {version}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      {reglages.length > 0 ? (
        <dl className="m-0 mt-5 grid grid-cols-1 gap-x-7 gap-y-4 sm:grid-cols-3">
          {reglages.map((reglage) => (
            <div key={reglage.label}>
              <dt className="font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
                {reglage.label}
              </dt>
              <dd className="m-0 mt-1 font-semibold">{reglage.valeur}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}
