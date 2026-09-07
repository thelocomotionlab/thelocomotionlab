// app/blog/[slug]/page.jsx
//
// UN BILLET DU CARNET DE BORD.
//
// Colonne de lecture étroite, en-tête sobre (type, date, temps de lecture),
// puis le corps avec ses blocs Note et Protocole rendus en place. Les appels
// de référence sont numérotés à l'affichage, et la bibliographie de page ne
// liste que ce qui a été cité.

import { notFound } from "next/navigation";
import { Bibliographie } from "@locomotionlab/ui/contenu";

import { parSorte, parSlug, bibliographie } from "@/lib/contenu";
import { amorce } from "@/lib/blog";
import { TYPES } from "@/lib/blogRegistre";
import Corps from "@/components/contenu/Corps";
import FilDAriane from "@/components/contenu/FilDAriane";
import RetourAIndex from "@/components/contenu/RetourAIndex";
import { referencesDePage } from "@/components/contenu/references";
import { dateLisible, minutesDeLecture } from "@/lib/lisible";

export const dynamicParams = false;

export function generateStaticParams() {
  return parSorte("billet").map((page) => ({ slug: page.frontmatter.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = parSlug("billet", slug);
  if (!page) return {};
  const { titre, chapeau } = page.frontmatter;
  // Le fil du blog remplace un chapeau manquant par l'amorce du texte ; la
  // description de la page fait de même plutôt que d'annoncer « TODO ».
  return { title: titre, description: chapeau === "TODO" ? amorce(page.corps) : chapeau };
}

export default async function BilletPage({ params }) {
  const { slug } = await params;
  const page = parSlug("billet", slug);
  if (!page) notFound();

  const { frontmatter } = page;
  const { registre, Ref, citation } = referencesDePage(page.corps);

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-10 md:px-8">
      <FilDAriane
        maillons={[
          { href: "/blog", label: "Blog" },
          { label: frontmatter.titre },
        ]}
      />

      <article className="mx-auto mt-9 max-w-[40em] text-lecture">
        <header>
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs font-semibold uppercase tracking-etiquette text-brand-muted">
            <span className="rounded-xs border border-brand-gauge-full px-1.5 py-0.5 text-brand-soft">
              {TYPES[frontmatter.type]}
            </span>
            <span className="tabular-nums">{dateLisible(frontmatter.date)}</span>
            <span aria-hidden="true">·</span>
            <span>{minutesDeLecture(page.corps)} min</span>
          </div>

          <h1 className="mt-4.5 font-heading text-[30px] font-bold leading-[1.1] tracking-[-0.015em] md:text-[38px]">
            {frontmatter.titre}
          </h1>
          {frontmatter.chapeau !== "TODO" ? (
            <p className="mt-4 text-[1.18em] leading-normal text-brand-soft [text-wrap:pretty]">
              {frontmatter.chapeau}
            </p>
          ) : null}
          <div className="mt-5.5 h-[3px] w-16 rounded-full bg-brand-accent" aria-hidden="true" />
        </header>

        <div className="mt-9">
          <Corps page={page} citation={citation} appelDeReference={Ref} />
        </div>

        <Bibliographie registre={registre} entrees={bibliographie} id="references" />

        <RetourAIndex href="/blog" label="Retour au blog" />
      </article>
    </div>
  );
}
