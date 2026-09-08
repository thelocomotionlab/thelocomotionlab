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
import { partageDIndex } from "@/lib/seo";

const DESCRIPTION =
  "Itinéraires, préparations, paquetages, nutrition, protocoles, et plus encore !";

export const metadata = {
  title: "Aventures",
  description: DESCRIPTION,
  ...partageDIndex({
    titre: "Aventures – The Locomotion Lab",
    description: DESCRIPTION,
    url: "/aventures",
  }),
};

const ACTION_PRIMAIRE =
  "inline-block rounded-full bg-brand-deep px-[22px] py-2.5 font-heading text-[14.5px] font-semibold text-white no-underline transition-colors hover:bg-brand-deep-dark";
const ACTION_SECONDAIRE =
  "inline-block rounded-full border-[1.5px] border-brand-deep px-5 py-[8.5px] font-heading text-[14.5px] font-semibold text-brand-deep no-underline transition-colors hover:bg-brand-deep hover:text-white";

/** Écrites en toutes lettres : Tailwind ne voit pas une classe fabriquée. */
const COLONNES = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

function Chiffres({ resume }) {
  return (
    // Autant de colonnes que d'entrées, quatre au plus : à quatre colonnes
    // fixes, trois repères en laissaient une vide et se serraient dans les
    // trois autres — « Autonomie » débordait alors sur son voisin.
    <dl
      className={`mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-brand-hairline pt-4 tabular-nums ${
        COLONNES[Math.min(resume.length, 4)]
      }`}
    >
      {resume.map((entree) => {
        const { valeur, libelle } = chiffreDeCarte(entree);
        return (
          <div key={valeur} className="min-w-0">
            {/* Un mot plus large que sa colonne se coupe plutôt que de mordre
                sur la suivante. */}
            <dd className="m-0 font-heading text-xl font-bold leading-[1.15] [overflow-wrap:break-word] md:text-2xl">
              {valeur}
            </dd>
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
        accroche="Itinéraires, préparations, paquetages, nutrition, protocoles, et plus encore !"
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
                <div className="aspect-cover overflow-hidden rounded-md shadow-card">
                  <Image
                    src={frontmatter.cover}
                    alt={frontmatter.titre}
                    width={1400}
                    height={764}
                    className="block h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-cover items-center justify-center rounded-md border border-brand-hairline bg-brand-grid font-mono text-meta uppercase tracking-lien text-brand-faint">
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
                    {frontmatter.etat === "termine" ? "Voir l'aventure" : "Suivre l'aventure"}
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
