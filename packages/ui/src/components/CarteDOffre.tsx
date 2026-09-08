// packages/ui/src/components/CarteDOffre.tsx
//
// LA CARTE D'UNE OFFRE, et le groupe qui en réunit plusieurs.
//
// Une offre se présente toujours de la même façon : le lieu où elle se passe,
// son état du moment, son nom, la promesse en une ligne, deux phrases, une
// action et un lien vers sa page. L'index n'a donc rien à décider — il donne
// le texte, la charte donne la forme.
//
// `GroupeDOffres` accepte une carte comme dix, sous un intertitre ou sans :
// le jour où « en ligne » compte trois outils, la page ne change pas, elle
// range ses cartes dans un groupe titré.

import type { ReactNode } from "react";

/** La teinte du registre, comme sur les en-têtes d'index. */
const TEINTES = {
  neutre: "text-brand-text",
  aventure: "text-brand-deep",
  science: "text-brand-slate-dark",
} as const;

export type LienDOffre = { href: string; libelle: string };

export type CarteDOffreProps = {
  /** « En ligne », « Sur le terrain » — le surtitre. */
  lieu: string;
  /** « En calibration », « Aucune date ouverte » — la pastille. */
  etat?: string;
  nom: string;
  /** La promesse, en une ligne. */
  promesse: string;
  /** Les deux phrases qui disent ce que c'est. */
  children?: ReactNode;
  /** L'action principale ; `contour` la rend en second plan. */
  action?: LienDOffre & { contour?: boolean };
  /** Le renvoi vers la page de l'offre. */
  lien?: LienDOffre;
  teinte?: keyof typeof TEINTES;
};

const ACTION_PLEINE =
  "inline-block rounded-full bg-brand-accent px-[26px] py-3 font-heading text-[15px] font-semibold text-white no-underline shadow-cta transition-colors hover:bg-brand-accent-dark";

const ACTION_CONTOUR =
  "inline-block rounded-full border-[1.5px] border-brand-deep px-[26px] py-3 font-heading text-[15px] font-semibold text-brand-deep no-underline transition-colors hover:bg-brand-deep hover:text-white";

export default function CarteDOffre({
  lieu,
  etat,
  nom,
  promesse,
  children,
  action,
  lien,
  teinte = "neutre",
}: CarteDOffreProps) {
  return (
    <article className="flex h-full flex-col rounded-[14px] border border-brand-hairline bg-brand-paper px-7 py-6 shadow-bloc">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span
          className={`font-mono text-xxs font-bold uppercase tracking-etiquette ${TEINTES[teinte]}`}
        >
          {lieu}
        </span>
        {etat ? (
          <span className="rounded-full border border-brand-gauge-full px-3 py-1 font-mono text-xxs font-semibold uppercase tracking-pastille text-brand-soft">
            {etat}
          </span>
        ) : null}
      </div>

      <h3
        className={`m-0 mt-4 font-heading text-[26px] font-bold leading-[1.1] tracking-[-0.015em] ${TEINTES[teinte]}`}
      >
        {nom}
      </h3>

      <p className="m-0 mt-2.5 font-sans text-lg font-light leading-snug text-brand-ink [text-wrap:pretty]">
        {promesse}
      </p>

      {children ? (
        <div className="mt-4 font-sans leading-relaxed text-brand-soft [text-wrap:pretty]">
          {children}
        </div>
      ) : null}

      {/* `mt-auto` colle la rangée d'actions en bas : deux cartes côte à côte
          alignent leurs boutons même si leurs textes n'ont pas la même hauteur. */}
      {action || lien ? (
        <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-3 pt-7">
          {action ? (
            <a href={action.href} className={action.contour ? ACTION_CONTOUR : ACTION_PLEINE}>
              {action.libelle}
            </a>
          ) : null}
          {lien ? (
            <a
              href={lien.href}
              className="font-sans text-[15px] text-brand-soft no-underline transition-colors hover:text-brand-accent-ink"
            >
              {lien.libelle} <span aria-hidden="true">→</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export type GroupeDOffresProps = {
  /** L'intertitre du groupe. Absent, les cartes se posent sans annonce. */
  titre?: string;
  children: ReactNode;
};

/**
 * Les cartes se rangent en colonnes qui s'ajustent au nombre : une carte
 * seule occupe la largeur, deux se partagent la ligne.
 */
export function GroupeDOffres({ titre, children }: GroupeDOffresProps) {
  return (
    <section className="mt-12">
      {titre ? (
        <h2 className="m-0 mb-6 flex items-center gap-3 font-heading text-[15px] font-bold uppercase tracking-etiquette text-brand-accent-ink">
          <span className="h-[3px] w-6 shrink-0 rounded-full bg-brand-accent" aria-hidden="true" />
          {titre}
        </h2>
      ) : null}
      <div className="grid items-stretch gap-6 [grid-template-columns:repeat(auto-fit,minmax(20rem,1fr))]">
        {children}
      </div>
    </section>
  );
}
