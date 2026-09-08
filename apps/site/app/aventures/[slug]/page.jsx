// app/aventures/[slug]/page.jsx
//
// UNE PAGE AVENTURE : la liste ordonnée de ses sections.
//
// Aucun gabarit par type de campagne. Le sommaire latéral et la numérotation
// sont dérivés du tableau `sections` par les mêmes fonctions que les sections
// elles-mêmes ; une page à trois sections a l'air finie.

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decouperLeCorps } from "@locomotionlab/contenu";
import { Accroche, Sommaire, SectionsAventure } from "@locomotionlab/ui/contenu";

import { parSorte, parSlug } from "@/lib/contenu";
import { ETATS, campagneLisible, rendusDe } from "@/lib/aventure";
import DonneesStructurees from "@/components/DonneesStructurees";
import FilDAriane from "@/components/contenu/FilDAriane";
import Corps from "@/components/contenu/Corps";
import MapEmbed from "@/components/MapEmbedLazy";
import RetourAIndex from "@/components/contenu/RetourAIndex";
import { referencesDePage } from "@/components/contenu/references";
import { filDAriane, pageDeContenu } from "@/lib/jsonld";
import { partageDeContenu } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return parSorte("aventure").map((page) => ({ slug: page.frontmatter.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = parSlug("aventure", slug);
  if (!page) return {};
  const { titre, chapeau, cover, campagne } = page.frontmatter;
  return {
    title: titre,
    description: chapeau,
    ...partageDeContenu({
      titre,
      description: chapeau,
      url: `/aventures/${slug}`,
      cover,
      publieLe: campagne.debut,
    }),
  };
}

/**
 * Les corps des sections libres, écrits dans le MDX de la page. Chaque morceau
 * repasse par `Corps` : une section libre porte donc les mêmes balises qu'un
 * billet — une note, un protocole, le replay d'un direct.
 */
function corpsDesSectionsLibres(page, citation) {
  const libres = {};
  for (const segment of decouperLeCorps(page.corps, ["SectionLibre"])) {
    if (segment.type !== "balise" || !segment.attributs.id) continue;
    libres[segment.attributs.id] = {
      corps: <Corps page={page} corps={segment.corps} citation={citation} />,
    };
  }
  return libres;
}

export default async function AventurePage({ params }) {
  const { slug } = await params;
  const page = parSlug("aventure", slug);
  if (!page) notFound();

  const { frontmatter } = page;
  const { citation } = referencesDePage(page.corps);
  const rendus = rendusDe(page, {
    libres: corpsDesSectionsLibres(page, citation),
    cover: (src, alt) => <Image src={src} alt={alt} width={900} height={600} />,
    carte: (gpxUrl, reperes) => (
      <MapEmbed gpx={gpxUrl} reperes={reperes} defaultMinHeight={420} />
    ),
  });

  const maillons = [{ href: "/aventures", label: "Aventures" }, { label: frontmatter.titre }];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-10 md:px-8">
      <DonneesStructurees
        id="aventure"
        donnees={[
          pageDeContenu(page, { url: `/aventures/${frontmatter.slug}`, type: "Article" }),
          filDAriane(maillons),
        ]}
      />

      <FilDAriane maillons={maillons} />

      <div className="mt-7 grid items-start gap-14 lg:grid-cols-[12.5rem_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <Sommaire sections={frontmatter.sections} />
        </div>

        <div className="min-w-0 tabular-nums">
          <header>
            <div className="flex flex-wrap items-center gap-3 font-mono text-meta font-semibold uppercase tracking-etiquette text-brand-muted">
              <span>Aventure</span>
              <span className="rounded-xs border border-brand-deep-dark px-2 py-0.5 font-bold text-brand-deep-dark">
                {ETATS[frontmatter.etat]}
              </span>
              <span className="tabular-nums">{campagneLisible(frontmatter.campagne)}</span>
            </div>

            <h1 className="mt-4 font-heading text-[32px] font-bold leading-[1.05] tracking-[-0.015em] text-brand-deep md:text-[44px]">
              {frontmatter.titre}
            </h1>
            <Accroche>{frontmatter.chapeau}</Accroche>
            <div className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent" aria-hidden="true" />

            {frontmatter.cover !== "TODO" ? (
              <div className="mt-7 aspect-[11/6] overflow-hidden rounded-md shadow-card">
                <Image
                  src={frontmatter.cover}
                  alt={frontmatter.titre}
                  width={1400}
                  height={764}
                  priority
                  className="block h-full w-full object-cover"
                />
              </div>
            ) : null}
          </header>

          <SectionsAventure sections={frontmatter.sections} rendus={rendus} />

          <RetourAIndex href="/aventures" label="Retour aux aventures" />
        </div>
      </div>
    </div>
  );
}
