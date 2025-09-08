import { Link } from "react-router-dom";
import articles from "../content/articles.json";

export default function Articles() {
  return (
    <section className="p-12 bg-[#FEFBF6]">
      <h2 className="text-3xl font-bold mb-6 text-[#8CB9BD] text-center">
        Carnets du Lab
      </h2>
      <div className="grid md:grid-cols-3 gap-8">
        {articles.map((article) => (
          <div
            key={article.slug}
            className="bg-white rounded-xl shadow-md p-6 hover:shadow-xl transition"
          >
            <h3 className="text-xl font-semibold text-[#B67352] mb-2">
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
  );
}
