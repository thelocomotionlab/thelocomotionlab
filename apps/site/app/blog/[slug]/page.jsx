// app/blog/[slug]/page.jsx
//
// UN BILLET DU CARNET DE BORD.
//
// Colonne de lecture étroite, en-tête sobre (type, date, temps de lecture),
// puis le corps avec ses blocs Note et Protocole rendus en place. Les appels
// de référence sont numérotés à l'affichage, et la bibliographie de page ne
// liste que ce qui a été cité.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Bibliographie } from "@locomotionlab/ui/contenu";

import { parSorte, parSlug, bibliographie } from "@/lib/contenu";
import { TYPES } from "@/lib/blogRegistre";
import Corps from "@/components/contenu/Corps";
import { referencesDePage } from "@/components/contenu/references";
import { dateLisible, minutesDeLecture } from "@/lib/lisible";

export function generateStaticParams() {
  return parSorte("billet").map((page) => ({ slug: page.frontmatter.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = parSlug("billet", slug);
  if (!page) return {};
  return { title: page.frontmatter.titre, description: page.frontmatter.chapeau };
}

export default async function BilletPage({ params }) {
  const { slug } = await params;
  const page = parSlug("billet", slug);
  if (!page) notFound();

  const { frontmatter } = page;
  const { registre, Ref, citation } = referencesDePage(page.corps);

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-10 md:px-8">
      <Link
        href="/blog"
        className="font-mono text-xs tracking-lien text-brand-muted no-underline hover:text-brand-accent-ink"
      >
        Retour au blog
      </Link>

      <article className="mx-auto mt-9 max-w-[34em] text-lecture">
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
          <p className="mt-4 text-[1.18em] leading-normal text-brand-soft [text-wrap:pretty]">
            {frontmatter.chapeau}
          </p>
          <div className="mt-5.5 h-[3px] w-16 rounded-full bg-brand-accent" aria-hidden="true" />
        </header>

        <div className="mt-9">
          <Corps page={page} citation={citation} appelDeReference={Ref} />
        </div>

        <Bibliographie registre={registre} entrees={bibliographie} id="references" />
      </article>
    </div>
  );
}
