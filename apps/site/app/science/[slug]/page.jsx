// app/science/[slug]/page.jsx
//
// UN ARTICLE SCIENCE : un document vivant.
//
// La date de révision est le marqueur du registre : elle s'affiche en évidence,
// à côté de la publication et du compte de références. L'encart des révisions
// dit ce qui a changé et quand ; la bibliographie ne liste que ce que le texte
// a réellement appelé.

import Image from "next/image";
import { notFound } from "next/navigation";
import { Bibliographie } from "@locomotionlab/ui/contenu";

import { parSorte, parSlug, bibliographie } from "@/lib/contenu";
import { dateLisible, minutesDeLecture } from "@/lib/lisible";
import Corps from "@/components/contenu/Corps";
import DonneesStructurees from "@/components/DonneesStructurees";
import FilDAriane from "@/components/contenu/FilDAriane";
import RetourAIndex from "@/components/contenu/RetourAIndex";
import { referencesDePage } from "@/components/contenu/references";
import { filDAriane, pageDeContenu } from "@/lib/jsonld";
import { partageDeContenu } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return parSorte("article").map((page) => ({ slug: page.frontmatter.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = parSlug("article", slug);
  if (!page) return {};
  const { titre, chapeau, cover, auteur, publie_le, revise_le } = page.frontmatter;
  return {
    title: titre,
    description: chapeau,
    ...partageDeContenu({
      titre,
      description: chapeau,
      url: `/science/${slug}`,
      cover,
      auteur,
      publieLe: publie_le,
      reviseLe: revise_le,
    }),
  };
}

export default async function ArticlePage({ params }) {
  const { slug } = await params;
  const page = parSlug("article", slug);
  if (!page) notFound();

  const { frontmatter } = page;
  const { registre, Ref, citation } = referencesDePage(page.corps);
  const references = registre.citees().length;
  const maillons = [{ href: "/science", label: "Science" }, { label: frontmatter.titre }];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-10 md:px-8">
      <DonneesStructurees
        id="article"
        donnees={[
          // `Article` et non `BlogPosting` : un article Science est un document
          // révisé, avec sa bibliographie et son historique de révisions.
          pageDeContenu(page, { url: `/science/${frontmatter.slug}`, type: "Article" }),
          filDAriane(maillons),
        ]}
      />

      <FilDAriane maillons={maillons} />

      <article className="mx-auto mt-9 max-w-[860px]">
        <header>
          <div className="font-mono text-meta font-bold uppercase tracking-surtitre text-brand-slate-dark">
            Article Science
          </div>
          <h1 className="mt-4 font-heading text-[32px] font-bold leading-[1.08] tracking-[-0.015em] text-brand-slate-dark md:text-[42px]">
            {frontmatter.titre}
          </h1>
          {frontmatter.auteur ? (
            <p className="mt-3.5 m-0 font-mono text-meta font-semibold uppercase tracking-etiquette text-brand-muted">
              par <span className="text-brand-slate-dark">{frontmatter.auteur}</span>
            </p>
          ) : null}
          <p className="mt-4 text-xl leading-normal text-brand-soft [text-wrap:pretty]">
            {frontmatter.chapeau}
          </p>

          <div className="mt-[26px] flex flex-wrap gap-x-7 gap-y-2.5 border-y border-brand-wash-line py-4 font-mono text-[12.5px] text-brand-muted tabular-nums">
            <span>
              Publié le <span className="text-brand-text">{dateLisible(frontmatter.publie_le)}</span>
            </span>
            {frontmatter.revise_le ? (
              <span>
                Dernière révision{" "}
                <span className="text-brand-text">{dateLisible(frontmatter.revise_le)}</span>
              </span>
            ) : null}
            {references > 0 ? (
              <span>
                <span className="text-brand-text">{references}</span> référence
                {references > 1 ? "s" : ""}
              </span>
            ) : null}
            <span>
              <span className="text-brand-text">
                {minutesDeLecture(page.corps, frontmatter.lecture)}
              </span>{" "}
              min de lecture
            </span>
          </div>

          {frontmatter.cover ? (
            // Pleine largeur de l'article : l'image ouvre le document sous son
            // bandeau, et la colonne de lecture reprend en dessous.
            <div className="mt-8 aspect-cover overflow-hidden rounded-md shadow-card">
              <Image
                src={frontmatter.cover}
                alt={frontmatter.titre}
                width={1720}
                height={938}
                priority
                className="block h-full w-full object-cover"
              />
            </div>
          ) : null}
        </header>

        <div className="mx-auto mt-10 max-w-[40em] text-lecture">
          <Corps page={page} citation={citation} appelDeReference={Ref} />

          {frontmatter.revisions.length > 0 ? (
            <aside className="mt-8 rounded-lg border border-brand-wash-line bg-brand-wash/30 px-4.5 py-3.5">
              <div className="font-mono text-xxs font-bold uppercase tracking-etiquette text-brand-slate-dark">
                Révisions
              </div>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1 text-brand-ink tabular-nums">
                {frontmatter.revisions.map((revision) => (
                  <div key={revision.date} className="contents">
                    <dt className="font-mono text-xs text-brand-slate">
                      {dateLisible(revision.date)}
                    </dt>
                    <dd className="m-0 font-sans">{revision.quoi}</dd>
                  </div>
                ))}
                <dt className="font-mono text-xs text-brand-slate">
                  {dateLisible(frontmatter.publie_le)}
                </dt>
                <dd className="m-0 font-sans">Publication.</dd>
              </dl>
            </aside>
          ) : null}

          <Bibliographie registre={registre} entrees={bibliographie} id="references" />

          <RetourAIndex href="/science" label="Retour à la science" />
        </div>
      </article>
    </div>
  );
}
