import { Link, useSearchParams } from "react-router-dom";
import articles from "../content/articles.json";

export default function Articles() {
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag");

  const allTags = Array.from(new Set(articles.flatMap(a => a.tags || [])));
  const list = tag ? articles.filter(a => (a.tags || []).includes(tag)) : articles;

  return (
    <section className="py-12">
      <h2 className="text-3xl font-bold mb-6 text-brand-primary text-center">Carnets du Lab</h2>
      {/* Tags */}
      <div className="flex flex-wrap gap-2 justify-center mb-8">
        <button onClick={()=>setParams({})} className={`px-3 py-1 rounded-full border ${!tag ? 'bg-brand-primary text-white' : 'bg-white'}`}>Tous</button>
        {allTags.map(t => (
          <button key={t} onClick={()=>setParams({tag: t})} className={`px-3 py-1 rounded-full border ${tag===t ? 'bg-brand-accent text-white' : 'bg-white'}`}>{t}</button>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-8">
        {list.map((article) => (
          <div
            key={article.slug}
            className="bg-white rounded-xl shadow-md p-6 hover:shadow-xl transition"
          >
            <h3 className="text-xl font-semibold text-brand-deep mb-2">
              {article.title}
            </h3>
            <p className="text-sm mb-4">{article.excerpt}</p>
            <div className="flex gap-2 flex-wrap mb-4">
              {(article.tags || []).map(t => (
                <button key={t} onClick={()=>setParams({tag: t})} className="text-xs px-2 py-1 rounded-full border">{t}</button>
              ))}
            </div>
            <Link
              to={`/articles/${article.slug}`}
              className="text-brand-accent font-semibold hover:underline"
            >
              Lire l’article →
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}