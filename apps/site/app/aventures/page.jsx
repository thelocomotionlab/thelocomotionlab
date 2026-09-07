// app/aventures/page.jsx
//
// L'INDEX DES AVENTURES : une étagère.
//
// Peu d'objets, grands, avec leur cover et leurs chiffres. Rien à voir avec le
// registre du Blog : ici on regarde des campagnes, pas une chronologie.

import Image from "next/image";
import Link from "next/link";

import { aventures, recitDe, urlDe } from "@/lib/contenu";
import { ETATS, campagneLisible, chiffreDeCarte } from "@/lib/aventure";
import EnTeteDIndex from "@/components/contenu/EnTeteDIndex";

export const metadata = {
  title: "Aventures",
  description:
    "Une campagne à la fois : l'itinéraire, la préparation, le paquetage, les chiffres.",
};

const ACTION_PRIMAIRE =
  "inline-block rounded-full bg-brand-deep px-[22px] py-2.5 font-heading text-[14.5px] font-semibold text-white no-underline transition-colors hover:bg-brand-deep-dark";
const ACTION_SECONDAIRE =
  "inline-block rounded-full border-[1.5px] border-brand-deep px-5 py-[8.5px] font-heading text-[14.5px] font-semibold text-brand-deep no-underline transition-colors hover:bg-brand-deep hover:text-white";

function Chiffres({ resume }) {
  return (
    <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-brand-hairline pt-4 tabular-nums sm:grid-cols-4">
      {resume.map((entree) => {
        const { valeur, libelle } = chiffreDeCarte(entree);
        return (
          <div key={entree}>
            <dd className="m-0 font-heading text-[28px] font-bold leading-none">{valeur}</dd>
            {libelle ? (
              <dt className="mt-1.5 font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
                {libelle}
              </dt>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}

export default function AventuresPage() {
  const etagere = aventures();

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-12 md:px-8">
      <EnTeteDIndex
        titre="Aventures"
        accroche="Une campagne à la fois : l'itinéraire, la préparation, le paquetage, les chiffres."
        teinte="aventure"
      />

      <div className="mt-14 grid gap-16">
        {etagere.map((page) => {
          const { frontmatter } = page;
          const recit = recitDe(frontmatter);
          const url = urlDe(page);

          return (
            <article
              key={frontmatter.slug}
              className="grid items-end gap-10 border-b-[3px] border-brand-deep pb-9 shadow-etagere lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
            >
              {frontmatter.cover !== "TODO" ? (
                <div className="aspect-[11/6] overflow-hidden rounded-md shadow-card">
                  <Image
                    src={frontmatter.cover}
                    alt={frontmatter.titre}
                    width={1400}
                    height={764}
                    className="block h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-[11/6] items-center justify-center rounded-md border border-brand-hairline bg-brand-grid font-mono text-meta uppercase tracking-lien text-brand-faint">
                  cover à faire
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center gap-3 font-mono text-meta font-semibold uppercase tracking-etiquette text-brand-muted">
                  <span className="rounded-xs border border-brand-deep-dark px-2 py-0.5 font-bold text-brand-deep-dark">
                    {ETATS[frontmatter.etat]}
                  </span>
                  <span className="tabular-nums">{campagneLisible(frontmatter.campagne)}</span>
                </div>

                <h2 className="mt-3.5 font-heading text-[28px] font-bold leading-[1.1] tracking-[-0.01em] text-brand-deep md:text-[34px]">
                  <Link href={url} className="text-brand-deep no-underline hover:text-brand-deep-dark">
                    {frontmatter.titre}
                  </Link>
                </h2>

                <p className="m-0 mt-2.5 font-sans leading-normal text-brand-soft [text-wrap:pretty]">
                  {frontmatter.chapeau}
                </p>

                <Chiffres resume={frontmatter.resume} />

                <div className="mt-6 flex flex-wrap gap-3">
                  {recit ? (
                    <Link href={urlDe(recit)} className={ACTION_PRIMAIRE}>
                      Lire le récit
                    </Link>
                  ) : null}
                  <Link href={url} className={recit ? ACTION_SECONDAIRE : ACTION_PRIMAIRE}>
                    {frontmatter.etat === "termine" ? "Voir la campagne" : "Suivre la campagne"}
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
