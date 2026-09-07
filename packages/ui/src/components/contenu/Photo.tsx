// packages/ui/src/components/contenu/Photo.tsx
//
// UNE PHOTO À LÉGENDE.
//
// La légende est le seul endroit du contenu où l'italique est de mise (avec
// l'encart « Sensations » et les mentions de version du Direct) ; elle est
// précédée d'un filet ocre court, qui la distingue d'un paragraphe.
//
// Le composant ne rend pas <img> lui-même : les apps ont leur propre balise
// d'image (next/image côté site), qui arrive en `children`.

import type { ReactNode } from "react";

export type PhotoProps = {
  /** L'image, telle que l'app sait la rendre. */
  children: ReactNode;
  legende?: ReactNode;
  /** Proportions du cadre. Le contenu est recadré pour les remplir. */
  format?: "paysage" | "portrait" | "large" | "libre";
};

const FORMATS = {
  paysage: "aspect-[4/3]",
  portrait: "aspect-[3/4]",
  large: "aspect-[16/9]",
  libre: "",
} as const;

export default function Photo({ children, legende, format = "libre" }: PhotoProps) {
  return (
    <figure className="m-0">
      <div
        className={`overflow-hidden rounded-lg shadow-card [&>*]:block [&>*]:h-full [&>*]:w-full [&>img]:object-cover ${FORMATS[format]}`}
      >
        {children}
      </div>
      {legende ? (
        <figcaption className="mt-2.5 font-lora text-sm italic leading-relaxed text-brand-muted">
          <span className="mb-2 block h-0.5 w-11 bg-brand-accent/75" />
          {legende}
        </figcaption>
      ) : null}
    </figure>
  );
}
