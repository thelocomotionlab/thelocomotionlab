import { Link } from "react-router-dom";
import articles from "../content/articles.json";

export default function Home() {
  const latestArticles = articles.slice(0, 3); // les 3 plus récents

  return (
    <div>
      {/* Hero */}
      <section className="min-h-[70vh] flex flex-col items-center justify-center text-center bg-brand-primary text-white px-6 py-16">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4">
          Explorer le mouvement, le corps et l’esprit
        </h1>
        <p className="max-w-2xl mb-8 text-lg">
          Bienvenue au Locomotion Lab : trail primal, parkour naturel, hormèse,
          respiration et états de conscience.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/articles" className="inline-block bg-brand-accent text-white px-6 py-3 rounded-full font-semibold hover:opacity-90">
            Lire les carnets
          </Link>
         {/* <Link to="/contact" className="inline-block bg-white text-brand-text px-6 py-3 rounded-full font-semibold hover:bg-gray-100">
            Me contacter
          </Link>*/}
        </div>
      </section>

      {/* Derniers articles */}
      <section className="p-12 bg-[#FEFBF6]">
        <h2 className="text-3xl font-bold mb-6 text-brand-primary text-center">
          Derniers carnets du labo
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {latestArticles.map((article) => (
            <div
              key={article.slug}
              className="bg-white rounded-xl shadow-card p-6 hover:shadow-xl transition"
            >
              <h3 className="text-xl font-semibold text-brand-deep mb-2">
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

