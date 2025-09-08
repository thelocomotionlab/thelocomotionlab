import { Link } from "react-router-dom";
import articles from "../content/articles.json";

export default function Home() {
  const latestArticles = articles.slice(0, 3); // les 3 plus récents

  return (
    <div>
      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center text-center bg-[#8CB9BD] text-white p-8">
        <h1 className="text-4xl md:text-6xl font-bold mb-6">
          Explorer le mouvement, le corps et l’esprit
        </h1>
        <p className="max-w-2xl mb-6">
          Bienvenue au Locomotion Lab : trail primal, parkour naturel, hormèse,
          respiration et états de conscience.
        </p>
        <Link
          to="/articles"
          className="bg-[#EFB159] text-white px-6 py-3 rounded-full hover:bg-[#d99e41] transition"
        >
          Voir tous les Carnets du Lab
        </Link>
      </section>

      {/* Derniers articles */}
      <section className="p-12 bg-[#FEFBF6]">
        <h2 className="text-2xl font-bold mb-6 text-[#8CB9BD] text-center">
          Derniers Carnets du Lab
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {latestArticles.map((article) => (
            <div
              key={article.slug}
              className="bg-white rounded-xl shadow-md p-6 hover:shadow-xl transition"
            >
              <h3 className="text-lg font-semibold text-[#B67352] mb-2">
                {article.title}
              </h3>
              <p className="text-sm mb-4">{article.excerpt}</p>
              <Link
                to={`/articles/${article.slug}`}
                className="text-[#EFB159] font-semibold hover:underline"
              >
                Lire l’article →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
