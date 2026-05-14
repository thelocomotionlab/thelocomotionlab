// app/articles/page.jsx
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Carnets du labo – Récits, réflexions et analyses scientifiques",
  description:
    "Articles, réflexions et analyses scientifiques autour du mouvement, du minimalisme, de l’hormèse et du potentiel humain.",
  alternates: {
    canonical: "https://thelocomotionlab.com/articles",
  },
  openGraph: {
    title: "Carnets du Labo – The Locomotion Lab",
    description:
      "Articles, réflexions et analyses scientifiques autour du mouvement, du minimalisme, de l’hormèse et du potentiel humain.",
    url: "https://thelocomotionlab.com/articles",
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
    title: "Carnets du Labo – The Locomotion Lab",
    description:
      "Articles, réflexions et analyses scientifiques autour du mouvement, du minimalisme, de l’hormèse et du potentiel humain.",
    images: ["https://thelocomotionlab.com/images/assets/og-image.jpg"],
  },
};

// Lecture des .md dans /public/articles
function getAllArticles() {
  const articlesDir = path.join(process.cwd(), "public/articles");
  const filenames = fs.existsSync(articlesDir)
    ? fs.readdirSync(articlesDir)
    : [];

  const articles = filenames
    .filter((fn) => fn.endsWith(".md"))
    .map((fn) => {
      const filePath = path.join(articlesDir, fn);
      const fileContent = fs.readFileSync(filePath, "utf8");
      const { data } = matter(fileContent);

      const slug = fn.replace(/\.md$/, "");
      const date = data.date ? new Date(data.date) : null;

      return {
        slug,
        title: data.title || slug,
        date,
        cover: data.cover || "",
        // description = petit texte d’accroche dans le .md
        description: data.description || "",
        // on garde excerpt si jamais tu veux le réutiliser plus tard
        excerpt: data.excerpt || "",
        published: data.published !== false,
      };
    })
    .filter((a) => a.published)
    .sort((a, b) => {
      if (a.date && b.date) return b.date - a.date;
      return 0;
    });

  return articles;
}

export default function ArticlesPage() {
  const articles = getAllArticles();

  return (
    <section className="py-12 max-w-6xl mx-auto px-4 sm:px-6">
      {/* Header */}
      <header className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-3xl font-bold font-heading mb-2 text-brand-primary">
          Carnets du Labo
        </h1>
        <p className="text-lg text-gray-700">
          <em>Récits, analyses scientifiques, découvertes, expérimentations</em>
        </p>
      </header>

      {/* Grille d’articles */}
      <div className="grid gap-6 justify-center justify-items-center grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(3,22rem)]">
        {articles.map((article) => (
          <div key={article.slug} className="relative w-full max-w-[22rem] h-full">
            <Link
              href={`/articles/${article.slug}`}
              className="group bg-white rounded-2xl shadow-card overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col"
            >
              {article.cover ? (
                <div className="relative w-full h-44">
                  <Image
                    src={article.cover}
                    alt={article.title}
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
                <h3 className="text-lg font-semibold text-brand-deep group-hover:underline mb-2">
                  {article.title}
                </h3>

                {article.description ? (
                  <p className="text-sm text-gray-700 italic line-clamp-3">
                    {article.description}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">&nbsp;</p>
                )}

                <div className="mt-auto pt-4 text-xs text-gray-500">
                  {article.date && (
                    <p>Publié le {article.date.toLocaleDateString("fr-FR")}</p>
                  )}
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
