// packages/ui/src/components/contenu/CarteRecit.tsx
//
// LA GRANDE CARTE DE RENVOI VERS LE RÉCIT D'UNE CAMPAGNE.
//
// Même motif que les cartes de bloc, en plus grand : la cover à gauche, le
// surtitre, la date et le temps de lecture, le titre du récit et son chapeau —
// en romain, comme tous les chapeaux de carte. La carte entière est le lien.

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
      className="mt-5 grid overflow-hidden rounded-xl border border-brand-hairline bg-brand-paper text-brand-text no-underline shadow-renvoi transition-colors hover:border-brand-deep md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"
    >
      {cover ? (
        <div className="min-h-70 [&>*]:block [&>*]:h-full [&>*]:w-full [&>img]:object-cover">
          {cover}
        </div>
      ) : null}
      <div className="flex flex-col justify-center px-9 py-8">
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
        <h3 className="m-0 mt-3 font-heading text-3xl font-bold leading-tight text-brand-deep">
          {titre}
        </h3>
        {chapeau ? (
          <p className="m-0 mt-3 font-lora text-lecture font-light not-italic leading-snug text-brand-soft [text-wrap:pretty]">
            {chapeau}
          </p>
        ) : null}
        <span className="mt-4 inline-block font-mono text-meta tracking-pastille text-brand-deep-dark">
          {action}
        </span>
      </div>
    </a>
  );
}
