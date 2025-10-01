import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import articles from "../content/articles.json";
import { projects } from "../content/projects";

function normalize(s) {
  return (s || "").toString().toLowerCase();
}

// Découpe un extrait propre autour de la première occurrence
function makeSnippet(text, q, radius = 120) {
  const t = text.replace(/\s+/g, " ").trim();
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return t.slice(0, radius * 2) + (t.length > radius * 2 ? "…" : "");
  const start = Math.max(0, i - radius);
  const end = Math.min(t.length, i + q.length + radius);
  const left = start > 0 ? "…" : "";
  const right = end < t.length ? "…" : "";
  return left + t.slice(start, end) + right;
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [mdCache, setMdCache] = useState({}); // {slug: rawMarkdown}
  const q = params.get("q") || "";
  const inputRef = useRef(null);

  // Au premier affichage, focus l'input si pas de requête
  useEffect(() => {
    if (!q && inputRef.current) inputRef.current.focus();
  }, [q]);

  // Charge le contenu .md de tous les articles quand on a une requête
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      if (!q) return;
      const entries = await Promise.all(
        articles.map(async (a) => {
          if (mdCache[a.slug]) return [a.slug, mdCache[a.slug]];
          try {
            const res = await fetch(`/articles/${a.slug}.md`);
            if (!res.ok) return [a.slug, ""];
            const raw = await res.text();
            // enlève le frontmatter
            const cleaned = raw.replace(/^---[\s\S]*?---\n?/, "");
            return [a.slug, cleaned];
          } catch {
            return [a.slug, ""];
          }
        })
      );
      if (!cancelled) {
        setMdCache((prev) => {
          const next = { ...prev };
          for (const [slug, raw] of entries) next[slug] = raw;
          return next;
        });
      }
    }
    loadAll();
    return () => {
      cancelled = true;
    };
  }, [q, articles]); // eslint-disable-line

  // Résultats
  const results = useMemo(() => {
    const query = normalize(q);
    if (!query) return { arts: [], pros: [] };

    // Articles : cherche dans titre + tags + contenu markdown
    const arts = articles
      .map((a) => {
        const hayMeta = normalize([a.title, a.tags?.join(" "), a.date].join(" "));
        const body = mdCache[a.slug] || "";
        const hayBody = normalize(body);
        const hit =
          hayMeta.includes(query) || hayBody.includes(query);
        if (!hit) return null;

        const snippet = body
          ? makeSnippet(body, q)
          : a.excerpt || "";
        return { ...a, snippet };
      })
      .filter(Boolean);

    // Projets : titre / résumé / updates
    const pros = projects.filter((p) => {
      const hay = normalize(
        [p.title, p.summary, ...(p.updates || []).map((u) => `${u.date} ${u.text}`)].join(" ")
      );
      return hay.includes(query);
    });

    return { arts, pros };
  }, [q, mdCache]);

  function onSubmit(e) {
    e.preventDefault();
    const value = e.currentTarget.q.value.trim();
    setParams(value ? { q: value } : {});
  }

  return (
    <main className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-heading mb-4 text-brand-primary">Recherche</h1>

      {/* Champ de recherche */}
      <form onSubmit={onSubmit} className="mb-8">
        <input
          ref={inputRef}
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Tape un mot-clé (ex. respiration, sandales, froid)…"
          className="w-full max-w-2xl px-4 py-2 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent"
          aria-label="Rechercher sur le site"
        />
      </form>

      {!q && <p className="text-gray-600">Saisis un mot-clé pour lancer la recherche.</p>}

      {q && results.arts.length === 0 && results.pros.length === 0 && (
        <p className="text-gray-600">Aucun résultat pour « {q} ».</p>
      )}

      {results.arts.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-heading font-bold mb-4 text-brand-deep">Carnets</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {results.arts.map((a) => (
              <Link
                key={a.slug}
                to={`/articles/${a.slug}`}
                className="group block bg-white rounded-2xl shadow-card p-6 hover:shadow-lg transition-shadow"
              >
                <h3 className="text-xl font-semibold mb-2 text-brand-accent group-hover:underline">{a.title}</h3>
                {a.snippet && <p className="text-gray-700 line-clamp-3">{a.snippet}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.pros.length > 0 && (
        <section>
          <h2 className="text-2xl font-heading font-bold mb-4 text-brand-deep">Projets</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {results.pros.map((p) => (
              <Link
                key={p.id || p.title}
                to="/projets"
                className="group block bg-white rounded-2xl shadow-card p-6 hover:shadow-lg transition-shadow"
              >
                <h3 className="text-xl font-semibold mb-2 text-brand-accent group-hover:underline">{p.title}</h3>
                {p.summary && <p className="text-gray-700 line-clamp-3">{p.summary}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
