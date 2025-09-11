import { Link } from "react-router-dom";
import articles from "../content/articles.json";
import hero from "../assets/hero.png";

import { projects } from "../content/projects";

export default function Home() {
  const latestArticles = [...articles].sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0, 3);
  const latestProjects = projects.slice(0,3);
 

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[70vh] grid place-items-center text-center rounded-2xl overflow-hidden mt-6">
        <img src={hero} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 px-6 py-16 text-white">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 font-heading">
            Explorer le mouvement, le corps et l’esprit
          </h1>
{/*          <p className="max-w-2xl mx-auto mb-8 text-lg">
            Trail minimaliste, parkour primal, hormèse chaud/froid, respiration et modulation d’état de conscience.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="/articles" className="bg-brand-accent text-white px-5 py-3 rounded-full font-semibold shadow-md hover:opacity-90">Lire les Carnets</Link>
            <Link to="/projets" className="bg-white text-brand-deep px-5 py-3 rounded-full font-semibold shadow-md hover:bg-brand-grid/50">Voir les Projets</Link>
          </div>*/}
        </div>
      </section>

      {/* Carnets */}
      <section className="py-12">
        <h2 className="text-3xl font-bold mb-6 text-brand-primary text-center font-heading">Carnets du Labo</h2>
        <div className="flex flex-wrap justify-center gap-8">
          {latestArticles.map((article) => (
            <div key={article.slug} className="bg-white rounded-xl shadow-card p-6 hover:shadow-xl transition">
              <h3 className="text-xl font-semibold text-brand-deep mb-2">{article.title}</h3>
              <p className="text-sm mb-4">{article.excerpt}</p>
              <Link to={`/articles/${article.slug}`} className="text-brand-accent font-semibold hover:underline">
                Lire l’article →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Projets */}
      <section className="py-12 bg-brand-grid/50 rounded-2xl">
        <h2 className="text-3xl font-bold mb-6 text-brand-primary text-center font-heading">Projets du Labo</h2>
        <div className="grid md:grid-cols-3 gap-8 justify-center">
          {latestProjects.map((p) => (
            <Link key={p.id} to={p.href} className="bg-white rounded-xl shadow-card p-6 hover:shadow-xl transition block">
              <h3 className="text-xl font-semibold text-brand-deep mb-2">{p.title}</h3>
              <p className="text-sm mb-4">{p.summary}</p>
              <span className="text-brand-accent font-semibold">Suivre le projet →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Soutenir */}
      <section className="py-12">
        <div className="bg-white rounded-2xl shadow-card p-8 grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h3 className="text-2xl font-bold mb-2 text-brand-deep font-heading">Soutenir le Labo</h3>
            <p className="mb-4">Commandez un sticker ou suivez les annonces pour le futur Patreon et le merch.</p>
            <Link to="/soutenir" className="inline-block bg-brand-accent text-white px-5 py-3 rounded-full font-semibold hover:opacity-90">Voir comment aider</Link>
          </div>
          <div className="h-40 rounded-xl bg-[radial-gradient(circle_at_30%_30%,rgba(239,177,89,.25),transparent_60%)] border border-brand-grid/70 grid place-items-center">
            <span className="text-sm opacity-80">Sticker “Locomotion Lab”</span>
          </div>
        </div>
      </section>

      {/* À propos teaser */}
{/*      <section className="py-12">
        <div className="bg-white rounded-2xl shadow-card p-8 grid md:grid-cols-3 gap-6 items-center">
          <div className="md:col-span-2">
            <h3 className="text-2xl font-bold mb-2 text-brand-deep font-heading">À propos</h3>
            <p>Vision, parcours, et l’identité du labo : carnet de terrain × rigueur scientifique.</p>
          </div>
          <Link to="/about" className="justify-self-end self-start bg-brand-primary text-white px-5 py-3 rounded-full font-semibold hover:opacity-90">Découvrir</Link>
        </div>
      </section>
*/}    </div>
  );
}