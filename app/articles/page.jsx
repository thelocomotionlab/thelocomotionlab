// app/articles/page.jsx
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import Link from "next/link";

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
    <section className="py-12">
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
      <div className="grid md:grid-cols-2 gap-6">
        {articles.map((article) => (
          <Link
            key={article.slug}
            href={`/articles/${article.slug}`}
            className="group block bg-white rounded-2xl shadow-card p-6 hover:shadow-lg transition-shadow"
          >
            {article.cover && (
              <img
                src={article.cover}
                alt={article.title}
                className="w-full h-56 object-cover rounded-lg mb-4"
                loading="lazy"
              />
            )}

            {/* Titre */}
            <h3 className="text-xl font-semibold text-brand-deep mb-2 group-hover:underline">
              {article.title}
            </h3>

            {/* Date si présente */}
            {article.date && (
              <p className="text-sm text-gray-500 mb-2">
                {article.date.toLocaleDateString("fr-FR")}
              </p>
            )}

            {/* Texte d’aperçu basé sur description du .md */}
            {article.description && (
              <p className="italic text-sm text-gray-700 line-clamp-3">
                {article.description}
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
