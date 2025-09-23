import { Link, useSearchParams } from "react-router-dom";
import articles from "../content/articles.json";

export default function Articles() {
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag");

  const allTags = Array.from(new Set(articles.flatMap((a) => a.tags || [])));
  const list = tag ? articles.filter((a) => (a.tags || []).includes(tag)) : articles;

  return (
    <section className="py-12">
      <h2 className="text-3xl font-bold mb-6 text-brand-primary text-center">Carnets du Lab</h2>

      {/* Filtre tags */}
      <div className="flex flex-wrap gap-2 justify-center mb-8">
        <button
          onClick={() => setParams({})}
          className={`px-3 py-1 rounded-full border ${!tag ? "bg-brand-primary text-white" : "bg-white"}`}
        >
          Tous
        </button>
        {allTags.map((t) => (
          <button
            key={t}
            onClick={() => setParams({ tag: t })}
            className={`px-3 py-1 rounded-full border ${tag === t ? "bg-brand-primary text-white" : "bg-white"}`}
          >
            {t}
          </button>
        ))}
      </div>

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
            {article.excerpt && <p className="text-gray-700 line-clamp-3">{article.excerpt}</p>}

            {/* Tags */}
            {(article.tags || []).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {article.tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-1 rounded-full border">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
