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
  /** La page d'archive du direct, quand il en existe une. */
  archiveUrl?: string;
};

export default function Direct({
  children,
  version,
  reglages = [],
  archiveUrl,
}: DirectProps) {
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

      {archiveUrl ? (
        <a
          href={archiveUrl}
          className="mt-5 inline-block border-b border-brand-accent font-mono text-meta font-semibold uppercase tracking-lien text-brand-accent-ink no-underline"
        >
          Ouvrir le direct archivé
        </a>
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
