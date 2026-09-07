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
