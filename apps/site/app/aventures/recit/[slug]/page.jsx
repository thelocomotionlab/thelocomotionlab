// app/aventures/recit/[slug]/page.jsx
//
// LE RÉCIT D'UNE CAMPAGNE.
//
// Le seul gabarit du site qui commence par une image pleine largeur : le récit
// est le texte long, illustré et partageable d'une aventure. Sous la bannière,
// une barre qui ramène à la campagne et rappelle ses chiffres, puis une colonne
// de lecture large.

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Accroche, Bibliographie } from "@locomotionlab/ui/contenu";

import { parSorte, parSlug, aventureDe, bibliographie, urlDe } from "@/lib/contenu";
import { dateLisible, minutesDeLecture } from "@/lib/lisible";
import Corps from "@/components/contenu/Corps";
import DonneesStructurees from "@/components/DonneesStructurees";
import FilDAriane from "@/components/contenu/FilDAriane";
import { referencesDePage } from "@/components/contenu/references";
import { filDAriane, pageDeContenu } from "@/lib/jsonld";
import { partageDeContenu } from "@/lib/seo";

// Les récits publiés sont connus au build, et ils sont moins nombreux que les
// aventures : sans cette ligne, Next garde une fonction serveur pour les slugs
// d'aventure sans récit, que l'export Cloudflare Pages refuse de servir.
export const dynamicParams = false;

export function generateStaticParams() {
  return parSorte("recit")
    .filter((page) => parSlug("aventure", page.frontmatter.aventure))
    .map((page) => ({ slug: page.frontmatter.aventure }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const aventure = parSlug("aventure", slug);
  const recit = aventure ? parSlug("recit", aventure.frontmatter.recit) : undefined;
  if (!recit) return {};
  const { titre, chapeau, cover, date } = recit.frontmatter;
  return {
    title: titre,
    description: chapeau,
    ...partageDeContenu({
      titre,
      description: chapeau,
      url: `/aventures/recit/${slug}`,
      cover,
      publieLe: date,
    }),
  };
}

export default async function RecitPage({ params }) {
  const { slug } = await params;
  const aventure = parSlug("aventure", slug);
  const recit = aventure?.frontmatter.recit
    ? parSlug("recit", aventure.frontmatter.recit)
    : undefined;
  if (!recit) notFound();

  const { frontmatter } = recit;
  const campagne = aventureDe(frontmatter);
  const { registre, Ref, citation } = referencesDePage(recit.corps);
  const maillons = [
    { href: "/aventures", label: "Aventures" },
    ...(campagne ? [{ href: urlDe(campagne), label: campagne.frontmatter.titre }] : []),
    { label: "Récit" },
  ];

  return (
    <>
      <DonneesStructurees
        id="recit"
        donnees={[
          pageDeContenu(recit, { url: `/aventures/recit/${slug}` }),
          filDAriane(maillons),
        ]}
      />

      <div className="relative h-[26rem] overflow-hidden bg-brand-text md:h-[540px]">
        <Image
          src={frontmatter.cover}
          alt={frontmatter.titre}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-brand-text/85 via-brand-text/35 to-transparent"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex h-full max-w-[1180px] flex-col justify-end px-6 pb-12 md:px-8">
          <div className="font-mono text-meta font-semibold uppercase tracking-surtitre text-brand-accent-light">
            Récit · {campagne?.frontmatter.titre} · publié le {dateLisible(frontmatter.date)} ·{" "}
            {minutesDeLecture(recit.corps, frontmatter.lecture)} min
          </div>
          <h1 className="mt-3.5 max-w-[20ch] font-heading text-4xl font-bold leading-[1.02] tracking-[-0.02em] text-white [text-wrap:balance] md:text-[58px]">
            {frontmatter.titre}
          </h1>
          <Accroche teinte="clair">{frontmatter.chapeau}</Accroche>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-6 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-6 border-b border-brand-hairline py-5">
          <FilDAriane maillons={maillons} />
          {frontmatter.chiffres?.length ? (
            <div className="flex flex-wrap gap-7 font-mono text-meta text-brand-muted tabular-nums">
              {frontmatter.chiffres.map((chiffre) => (
                <span key={chiffre}>{chiffre}</span>
              ))}
            </div>
          ) : null}
        </div>

        <article className="mx-auto mt-12 max-w-[42em] pb-6 text-lecture">
          <Corps page={recit} citation={citation} appelDeReference={Ref} />
          <Bibliographie registre={registre} entrees={bibliographie} id="references" />

          {campagne ? (
            <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-brand-hairline pt-7">
              <Link
                href={urlDe(campagne)}
                className="inline-block rounded-full bg-brand-deep px-6 py-2.5 font-heading text-sm font-semibold text-white no-underline transition-colors hover:bg-brand-deep-dark"
              >
                Voir la campagne
              </Link>
              <Link
                href="/aventures"
                className="inline-block rounded-full border-[1.5px] border-brand-deep px-5 py-2 font-heading text-sm font-semibold text-brand-deep no-underline transition-colors hover:bg-brand-deep hover:text-white"
              >
                Toutes les aventures
              </Link>
            </div>
          ) : null}
        </article>
      </div>
    </>
  );
}
