import { useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import articles from "../content/articles.json";
import { projects } from "../content/projects";

function normalize(s){ return (s||"").toString().toLowerCase(); }

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";

  const results = useMemo(()=>{
    const qq = normalize(q);
    if (!qq) return {articles: [], projects: []};
    const art = articles.filter(a => {
      const hay = [a.title, a.excerpt, a.tags?.join(" "), a.date].map(normalize).join(" ");
      return hay.includes(qq);
    });
    const pro = projects.filter(p => {
      const hay = [p.title, p.summary, p.tags?.join(" ")].map(normalize).join(" ");
      return hay.includes(qq);
    });
    return {articles: art, projects: pro};
  }, [q]);

  return (
    <main className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-heading mb-6">Recherche</h1>
      <div className="mb-6 text-gray-600">
        {q ? <>Résultats pour <span className="font-medium">“{q}”</span></> : "Tape un mot-clé dans la barre de recherche."}
      </div>
      
      {q && (results.articles.length + results.projects.length === 0) && (
        <p className="text-gray-600">Aucun résultat trouvé. Essaie d’autres mots-clés.</p>
      )}

      {results.articles.length > 0 && (
        <section className="mb-10">
          <h2 className="text-2xl font-heading font-bold mb-4">Carnets</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {results.articles.map(a => (
              <article key={a.slug} className="bg-white rounded-2xl shadow-card p-6">
                <h3 className="text-xl font-semibold mb-2">{a.title}</h3>
                {a.excerpt && <p className="text-gray-700 mb-3">{a.excerpt}</p>}
                <Link to={`/articles/${a.slug}`} className="text-brand-accent font-semibold hover:underline">Lire →</Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {results.projects.length > 0 && (
        <section>
          <h2 className="text-2xl font-heading font-bold mb-4">Projets</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {results.projects.map(p => (
              <article key={p.slug || p.title} className="bg-white rounded-2xl shadow-card p-6">
                <h3 className="text-xl font-semibold mb-2">{p.title}</h3>
                {p.summary && <p className="text-gray-700 mb-3">{p.summary}</p>}
                <Link to="/projets" className="text-brand-accent font-semibold hover:underline">Voir →</Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
