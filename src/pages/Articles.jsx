import { Link, useSearchParams } from "react-router-dom";
import articles from "../content/articles.json";
import { Helmet } from "react-helmet";

export default function Articles() {
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag");

  const allTags = Array.from(new Set(articles.flatMap((a) => a.tags || [])));
  const list = tag ? articles.filter((a) => (a.tags || []).includes(tag)) : articles;

  return (
    <>
      <Helmet>
        <title>Carnets du labo – Récits, réflexions et analyses scientifiques</title>
        <meta
          name="description"
          content="Articles, réflexions et analyses scientifiques autour du mouvement, du minimalisme, de l’hormèse et du potentiel humain."
        />
        <link rel="canonical" href="https://thelocomotionlab.com/articles" />

        {/* Open Graph */}
        <meta property="og:title" content="Carnets du Labo – The Locomotion Lab" />
        <meta
          property="og:description"
          content="Articles, réflexions et analyses scientifiques autour du mouvement, du minimalisme, de l’hormèse et du potentiel humain."
        />
        <meta
          property="og:image"
          content="https://thelocomotionlab.com/images/assets/og-image.jpg"
        />
        <meta property="og:url" content="https://thelocomotionlab.com/articles" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="fr_FR" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Carnets du Labo – The Locomotion Lab" />
        <meta
          name="twitter:description"
          content="Articles, réflexions et analyses scientifiques autour du mouvement, du minimalisme, de l’hormèse et du potentiel humain."
        />
        <meta
          name="twitter:image"
          content="https://thelocomotionlab.com/images/assets/og-image.jpg"
        />
      </Helmet>

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
          {list.map((article) => (
            <Link
              key={article.slug}
              to={`/articles/${article.slug}`}
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
              <h3 className="text-xl font-semibold text-brand-deep mb-2 group-hover:underline">
                {article.title}
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                {new Date(article.date).toLocaleDateString("fr-FR")}
              </p>
              {article.excerpt && (
                <p className="text-gray-700 line-clamp-3">{article.excerpt}</p>
              )}

              {/* Tags */}
              {(article.tags || []).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {article.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2 py-1 rounded-full border"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
