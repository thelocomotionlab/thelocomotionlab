import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import projects from "../content/projects.json";
import { extractSubheadings } from "../utils/extractSubheadings";

import { Helmet } from "react-helmet";


export default function Projets() {
  const [filter, setFilter] = useState("Tous");
  const [headingsMap, setHeadingsMap] = useState({});

  // Statuts uniques
  const statuses = ["Tous", ...new Set(projects.map((p) => p.status))];
  const filtered =
    filter === "Tous" ? projects : projects.filter((p) => p.status === filter);

  // Charger les titres ### + dates
  useEffect(() => {
    async function loadAll() {
      const entries = await Promise.all(
        projects.map(async (p) => [p.slug, await extractSubheadings(p.slug)])
      );
      setHeadingsMap(Object.fromEntries(entries));
    }
    loadAll();
  }, []);

  return (
    <>
      <Helmet>
        <title>Projets du Labo – Expérimentations vivantes et terrain</title>
        <meta
          name="description"
          content="Suivi vivant des expérimentations du Locomotion Lab : ultra minimalisme, respiration consciente, préparation physique et résilience."
        />
        <link rel="canonical" href="https://thelocomotionlab.com/projets" />

        {/* Open Graph */}
        <meta property="og:title" content="Projets du Labo – Locomotion Lab" />
        <meta
          property="og:description"
          content="Découvre les expérimentations vivantes du Locomotion Lab : projets de terrain, ultra minimalisme, mouvement et exploration humaine."
        />
        <meta property="og:image" content="https://thelocomotionlab.com/images/assets/og-image.jpg" />
        <meta property="og:url" content="https://thelocomotionlab.com/projets" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="fr_FR" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Projets du Labo – Locomotion Lab" />
        <meta
          name="twitter:description"
          content="Expérimentations autour du mouvement, de la respiration et de la performance au Locomotion Lab."
        />
        <meta name="twitter:image" content="https://thelocomotionlab.com/images/assets/og-image.jpg" />
      </Helmet>


      <main className="container mx-auto px-4 py-12">
        {/* Header */}
        <header className="max-w-3xl mx-auto text-center mb-10">
          <h1 className="text-3xl font-bold font-heading mb-2 text-brand-primary">
            Projets du Labo
          </h1>
          <p className="text-lg text-gray-700">
            <em>Suivi expérimental vivant</em>
          </p>
        </header>

        {/* Filtres */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-full border ${
                filter === s ? "bg-brand-accent text-white" : "bg-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Grille des projets */}
        <section className="grid md:grid-cols-3 gap-6">
          {filtered.map((p) => {
            const notes = headingsMap[p.slug] || [];

            return (
              <Link
                key={p.slug}
                to={`/projets/${p.slug}`}
                className="group block bg-white rounded-2xl shadow-card p-6 hover:shadow-lg transition flex flex-col hover:-translate-y-1"
              >
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  {p.status}
                </p>

                <h3 className="text-xl font-semibold text-brand-deep mb-2">
                  {p.title}
                </h3>

                <p className="italic text-sm text-gray-700 mb-4 flex-1">
                  {p.description}
                </p>

                <hr className="my-3" />

                {notes.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">
                      Dernières notes :
                    </p>
                    <ul className="space-y-1">
                      {notes.slice(0, 2).map((note, i) => (
                        <li key={i} className="text-sm text-gray-700">
                          {note.date
                            ? `${note.date} – ${note.title}`
                            : note.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Link>
            );
          })}
        </section>
      </main>
    </>
  );
}
