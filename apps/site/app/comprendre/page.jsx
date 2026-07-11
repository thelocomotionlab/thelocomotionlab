// app/comprendre/page.jsx
//
// Pilier « Comprendre » : la science de la robustesse physiologique.
// Liste les contenus `type: "article"` publiés, plus les cartes « à
// paraître » (published: false + teaser: true) : titre + teaserText +
// badge « À paraître », SANS lien — leur corps n'est jamais rendu.
import Link from "next/link";
import Image from "next/image";
import EmailCapture from "@/components/EmailCapture";
import { listArticleEntries } from "@/lib/contentRoutes.mjs";

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
    images: [
      {
        url: "https://thelocomotionlab.com/images/assets/og-image.jpg",
      },
    ],
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Comprendre – The Locomotion Lab",
    description:
      "Articles de fond sourcés et vulgarisés sur la robustesse physiologique : respiration, hormèse, endurance, mouvement.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

function getComprendreLists() {
  const entries = listArticleEntries().filter((e) => e.kind === "article");

  const shape = (e) => ({
    slug: e.slug,
    title: e.data.title || e.slug,
    date: e.data.date ? new Date(e.data.date) : null,
    cover: e.data.cover || "",
    description: e.data.description || "",
    teaserText: e.data.teaserText || "",
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
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            Article
          </p>

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
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            Article · À paraître
          </p>

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
      {/* Header — écho de la section Comprendre de l'accueil : kicker mono,
          titre Ubuntu bleu profond, tagline en Lora italique, liseré ocre. */}
      <header className="max-w-4xl mx-auto text-left mb-10">
        <p className="mb-3 font-mono text-[13px] font-bold tracking-[0.25em] text-brand-slate">
          / LA SCIENCE
        </p>
        <h1 className="font-heading text-4xl font-bold text-brand-slate-dark md:text-5xl">
          Comprendre
          <span className="mt-2 block font-lora text-[22px] font-medium italic text-brand-deep md:text-[26px]">
            décortiquer la science derrière les concepts
          </span>
        </h1>
        <div
          className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent"
          aria-hidden="true"
        />
      </header>

      {/* Grille : articles publiés puis cartes « à paraître » */}
      {articles.length > 0 || teasers.length > 0 ? (
        <div className="grid gap-6 justify-center justify-items-center grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(3,22rem)]">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
          {teasers.map((article) => (
            <TeaserCard key={article.slug} article={article} />
          ))}
        </div>
      ) : (
        <p className="text-center text-gray-600">
          Les premiers articles sont à paraître.
        </p>
      )}

      <div className="mt-14 max-w-3xl mx-auto text-center">
        <h2 className="text-lg font-semibold text-brand-accent mb-3">
          Être prévenu·e des parutions
        </h2>
        <EmailCapture
          title={null}
          description={null}
          source="comprendre"
          placeholder="Votre adresse e-mail"
          buttonLabel="M'inscrire"
        />
      </div>
    </section>
  );
}
