// packages/ui/src/components/contenu/Video.tsx
//
// UNE VIDÉO DANS UNE SECTION LIBRE.
//
// Même cadre que Photo, sur fond sombre : le lecteur arrive en `children`
// (l'app choisit sa balise), et l'affiche par défaut tient la place tant qu'il
// n'y en a pas.

import type { ReactNode } from "react";

export type VideoProps = {
  children?: ReactNode;
  legende?: ReactNode;
};

export default function Video({ children, legende }: VideoProps) {
  return (
    <figure className="m-0">
      <div className="aspect-video overflow-hidden rounded-lg bg-brand-text [&>*]:block [&>*]:h-full [&>*]:w-full">
        {children ?? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5">
            <span className="h-13 w-13 rounded-full border-2 border-brand-bg/70" />
            <span className="font-mono text-xxs font-semibold uppercase tracking-surtitre text-brand-accent-light">
              Vidéo
            </span>
            {legende ? (
              <span className="px-6 text-center font-sans text-sm text-brand-bg/75">{legende}</span>
            ) : null}
          </div>
        )}
      </div>
      {children && legende ? (
        <figcaption className="mt-2.5 font-sans text-sm italic leading-relaxed text-brand-muted">
          <span className="mb-2 block h-0.5 w-11 bg-brand-accent/75" />
          {legende}
        </figcaption>
      ) : null}
    </figure>
  );
}
