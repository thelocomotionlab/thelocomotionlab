// app/comprendre/page.jsx
//
// Pilier « Comprendre » : la science de la robustesse physiologique.
// Liste les concepts publiés, plus les cartes « à paraître »
// (published: false + teaser: true) : titre + teaserText + badge
// « À paraître », SANS lien — leur corps n'est jamais rendu.
import Link from "next/link";
import Image from "next/image";
import CardMeta from "@/components/CardMeta";
import EmailCapture from "@/components/EmailCapture";
import PageHeader from "@/components/PageHeader";
import { listByKind, etatDe } from "@/lib/contentRoutes.mjs";
import { OG_IMAGE, OG_IMAGES } from "@/lib/seo";

export const metadata = {
  title: "Comprendre – La science de la robustesse physiologique",
  description:
    "Articles de fond sourcés et vulgarisés sur la robustesse physiologique : respiration, hormèse, endurance, mouvement.",
  alternates: {
    canonical: "https://thelocomotionlab.com/comprendre",
  },
  openGraph: {
    title: "Comprendre – The Locomotion Lab",
    description:
      "Articles de fond sourcés et vulgarisés sur la robustesse physiologique : respiration, hormèse, endurance, mouvement.",
    url: "https://thelocomotionlab.com/comprendre",
    type: "website",
    images: OG_IMAGES,
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Comprendre – The Locomotion Lab",
    description:
      "Articles de fond sourcés et vulgarisés sur la robustesse physiologique : respiration, hormèse, endurance, mouvement.",
    images: [OG_IMAGE],
  },
};

function getComprendreLists() {
  const entries = listByKind("concept");

  const shape = (e) => ({
    slug: e.slug,
    title: e.data.title || e.slug,
    date: e.data.date ? new Date(e.data.date) : null,
    cover: e.data.cover || "",
    description: e.data.description || "",
    teaserText: e.data.teaserText || "",
    etat: etatDe(e),
  });

  const byDateDesc = (a, b) => {
    if (a.date && b.date) return b.date - a.date;
    return 0;
  };

  return {
    articles: entries.filter((e) => e.published).map(shape).sort(byDateDesc),
    teasers: entries
      .filter((e) => !e.published && e.data.teaser === true)
      .map(shape)
      .sort(byDateDesc),
  };
}

function ArticleCard({ article }) {
  return (
    <div className="relative w-full max-w-[22rem] h-full">
      <Link
        href={`/comprendre/${article.slug}`}
        className="group bg-white rounded-2xl shadow-card overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col"
      >
        {article.cover ? (
          <div className="relative w-full h-44">
            <Image
              src={article.cover}
              alt={`Illustration de l'article : ${article.title}`}
              fill
              className="object-cover"
              sizes="(min-width: 768px) 384px, 100vw"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="w-full h-44 bg-brand-bg" aria-hidden="true" />
        )}

        <div className="p-5 flex flex-col flex-1">
          {/* Méta homogène avec les cartes du pilier Explorer. */}
          <CardMeta kind="Concept" detail={article.etat} className="mb-1" />

          <h3 className="text-lg font-semibold text-brand-deep group-hover:underline mb-2">
            {article.title}
          </h3>

          <div className="flex flex-1 items-center py-1">
            {article.description ? (
              <p className="font-lora text-[15px] italic text-gray-700 line-clamp-3">
                {article.description}
              </p>
            ) : null}
          </div>

          <div className="pt-4 text-xs text-gray-500">
            {article.date && (
              <p>Publié le {article.date.toLocaleDateString("fr-FR")}</p>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

// Carte « à paraître » : même gabarit que les cartes d'articles, mais sans
// lien ni date — seul le frontmatter du brouillon est exploité.
function TeaserCard({ article }) {
  return (
    <div className="relative w-full max-w-[22rem] h-full">
      <div className="bg-white rounded-2xl shadow-card overflow-hidden h-full flex flex-col">
        {article.cover ? (
          <div className="relative w-full h-44">
            <Image
              src={article.cover}
              alt=""
              aria-hidden="true"
              fill
              className="object-cover"
              sizes="(min-width: 768px) 384px, 100vw"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="w-full h-44 bg-brand-bg" aria-hidden="true" />
        )}

        <div className="p-5 flex flex-col flex-1">
          {/* Méta homogène avec les cartes du pilier Explorer. */}
          <CardMeta kind="Concept" detail="À paraître" className="mb-1" />

          <h3 className="text-lg font-semibold text-brand-deep mb-2">
            {article.title}
          </h3>

          <div className="flex flex-1 items-center py-1">
            {article.teaserText ? (
              <p className="font-lora text-[15px] italic text-gray-700 line-clamp-3">
                {article.teaserText}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ComprendrePage() {
  const { articles, teasers } = getComprendreLists();

  return (
    <section className="py-12 max-w-6xl mx-auto px-4 sm:px-6">
      {/* lg:px-6 : cale l'en-tête sur le bord gauche de la grille de
          cartes (colonnes de 22rem). */}
      <div className="lg:px-6">
        <PageHeader
          title="Comprendre"
          tagline="Creuser la science derrière les concepts."
        />

        {/* Grille : articles publiés puis cartes « à paraître ».
            h2 invisible : évite le saut h1 → h3 pour les lecteurs d'écran. */}
        <h2 className="sr-only">Tous les concepts</h2>
        {articles.length > 0 || teasers.length > 0 ? (
          <div className="grid gap-6 justify-center justify-items-center grid-cols-1 sm:grid-cols-2 lg:justify-start lg:[grid-template-columns:repeat(3,22rem)]">
            {articles.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
            {teasers.map((article) => (
              <TeaserCard key={article.slug} article={article} />
            ))}
          </div>
        ) : (
          // État vide : il était centré, seul élément centré d'une page ferrée
          // à gauche, et sans issue. Même encadré pointillé + capture email que
          // l'état vide de /pratiquer.
          <div className="rounded-2xl border-[1.5px] border-dashed border-brand-wash-line p-[22px] md:px-8 md:py-7">
            <p className="mb-4 max-w-[520px] text-base italic leading-[1.7] text-gray-600">
              Les premiers concepts sont à paraître. Laisse ton adresse pour
              être prévenu·e de leur publication.
            </p>
            <div className="max-w-[420px]">
              <EmailCapture
                title={null}
                description={null}
                source="comprendre-vide"
                placeholder="Ton adresse e-mail"
                buttonLabel="Me prévenir"
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-14 max-w-3xl mx-auto text-center">
        <h2 className="text-lg font-semibold text-brand-accent-ink mb-3">
          Être prévenu·e des prochaines parutions
        </h2>
        <EmailCapture
          title={null}
          description={null}
          source="comprendre"
          placeholder="Ton adresse e-mail"
          buttonLabel="M'inscrire"
        />
      </div>
    </section>
  );
}
