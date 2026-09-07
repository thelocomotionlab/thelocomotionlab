// packages/ui/src/components/contenu/SectionLibre.tsx
//
// LA SECTION LIBRE : du texte, des images, des vidéos.
//
// Le frontmatter ne déclare que la position, l'id et le titre ; le corps arrive
// d'ailleurs (le MDX de la page) et se place ici. Deux dispositions : le corps
// seul, ou le corps à côté d'un média.

import type { ReactNode } from "react";

export type SectionLibreProps = {
  children: ReactNode;
  /** Un média posé à côté du texte, à droite par défaut. */
  media?: ReactNode;
  cote?: "droite" | "gauche";
  /** Des médias en pleine largeur, sous le texte. */
  suite?: ReactNode;
};

export default function SectionLibre({ children, media, cote = "droite", suite }: SectionLibreProps) {
  const corps = (
    <div className="font-sans text-[1.03rem] leading-loose text-brand-ink [text-wrap:pretty] [&>p+p]:mt-4 [&>p]:m-0">
      {children}
    </div>
  );

  return (
    <>
      {media ? (
        <div className="mt-5 grid items-start gap-8 md:grid-cols-2">
          {cote === "gauche" ? (
            <>
              {media}
              {corps}
            </>
          ) : (
            <>
              {corps}
              {media}
            </>
          )}
        </div>
      ) : (
        <div className="mt-5 max-w-[68ch]">{corps}</div>
      )}
      {suite ? <div className="mt-5 grid gap-5 md:grid-cols-2">{suite}</div> : null}
    </>
  );
}
