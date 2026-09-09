// packages/ui/src/components/contenu/CarteRecit.tsx
//
// LA GRANDE CARTE DE RENVOI VERS LE RÉCIT D'UNE CAMPAGNE.
//
// Même motif que les cartes de bloc, en plus grand : la cover à gauche, le
// surtitre, la date et le temps de lecture, le titre du récit et son chapeau.
// Sans cover, le texte reprend toute la largeur : la carte entière est le lien.

import type { ReactNode } from "react";

export type CarteRecitProps = {
  titre: string;
  url: string;
  chapeau?: ReactNode;
  /** La cover du récit, rendue par l'app. */
  cover?: ReactNode;
  /** « Publié le 09/12/2025 », déjà mis en forme par l'app. */
  publieLe?: string;
  /** Minutes de lecture. */
  lecture?: number;
  /** « Lire le récit » sur une campagne terminée, « Suivre la campagne » sinon. */
  action?: string;
};

export default function CarteRecit({
  titre,
  url,
  chapeau,
  cover,
  publieLe,
  lecture,
  action = "Lire le récit",
}: CarteRecitProps) {
  const meta = [publieLe, lecture ? `${lecture} min` : null].filter(Boolean).join(" · ");

  return (
    <a
      href={url}
      // `grid-cols-1` et non la colonne implicite : `auto` se dimensionne sur
      // le contenu, et la photo imposait alors sa largeur naturelle à la carte.
      className={`mt-5 grid grid-cols-1 overflow-hidden rounded-xl border border-brand-hairline bg-brand-paper text-brand-text no-underline shadow-renvoi transition-colors hover:border-brand-deep ${
        cover ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]" : ""
      }`}
    >
      {cover ? (
        // En colonne, la photo garde le format des couvertures ; en ligne, elle
        // s'étire sur la hauteur du texte à côté d'elle.
        <div className="aspect-cover md:aspect-auto md:min-h-44 [&>*]:block [&>*]:h-full [&>*]:w-full [&>img]:object-cover">
          {cover}
        </div>
      ) : null}
      <div className="flex flex-col justify-center px-7 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-xxs font-bold uppercase tracking-surtitre text-brand-deep-dark">
            Récit
          </span>
          {meta ? (
            <span className="font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
              {meta}
            </span>
          ) : null}
        </div>
        <h3 className="m-0 mt-2.5 font-heading text-xl font-bold leading-[1.12] tracking-[-0.01em] text-brand-deep">
          {titre}
        </h3>
        {chapeau ? (
          <p className="m-0 mt-2.5 font-sans leading-normal text-brand-soft [text-wrap:pretty]">
            {chapeau}
          </p>
        ) : null}
        <span className="mt-3.5 inline-block font-mono text-meta tracking-pastille text-brand-deep-dark">
          {action}
        </span>
      </div>
    </a>
  );
}
