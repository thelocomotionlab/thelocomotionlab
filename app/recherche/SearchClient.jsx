// app/recherche/SearchClient.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

// Met tout en minuscule
function normalize(s) {
  return (s || "").toString().toLowerCase();
}

// Découpe un extrait propre autour de la première occurrence
function makeSnippet(text, q, radius = 120) {
  const t = text.replace(/\s+/g, " ").trim();
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1)
    return (
      t.slice(0, radius * 2) + (t.length > radius * 2 ? "…" : "")
    );
  const start = Math.max(0, i - radius);
  const end = Math.min(t.length, i + q.length + radius);
  const left = start > 0 ? "…" : "";
  const right = end < t.length ? "…" : "";
  return left + t.slice(start, end) + right;
}

// Nettoie le markdown pour n’afficher que du texte brut
function stripMarkdown(md) {
  return (
    md
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
      .replace(/\[[^\]]*\]\([^)]*\)/g, "") // liens
      .replace(/[`*_>#~\-\[\]\(\)]/g, "") // symboles markdown
      .replace(/:{3,}/g, "") // blocs :::split etc.
      .replace(/\/images\/[^\s]+/g, "") // chemins images
      .replace(/\s{2,}/g, " ") // espaces multiples
      .trim()
  );
}

// Surligne les occurrences du mot clé
function highlight(text, q) {
  if (!q) return text;
  const regex = new RegExp(`(${q})`, "gi");
  return text.replace(
    regex,
    `<strong class="text-gray-700 font-semibold">$1</strong>`
  );
}

export default function SearchClient({ articles, projects }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const q = searchParams.get("q") || "";
  const [mdCache, setMdCache] = useState({}); // { "article:slug": rawMarkdown }
  const inputRef = useRef(null);

  // Focus initial sur l'input si vide
  useEffect(() => {
    if (!q && inputRef.current) inputRef.current.focus();
  }, [q]);

  // Charge le markdown des articles + projets à la volée (comme avant)
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      if (!q) return;

      const allItems = [
        ...articles.map((a) => ({ type: "article", slug: a.slug })),
        ...projects.map((p) => ({ type: "project", slug: p.slug })),
      ];

      const entries = await Promise.all(
        allItems.map(async (item) => {
          const key = `${item.type}:${item.slug}`;
          if (mdCache[key]) return [key, mdCache[key]];

          try {
            const folder = item.type === "article" ? "articles" : "projets";
            const res = await fetch(`/${folder}/${item.slug}.md`);
            if (!res.ok) return [key, ""];
            const raw = await res.text();
            const cleaned = raw.replace(/^---[\s\S]*?---\n?/, ""); // retire frontmatter
            return [key, cleaned];
          } catch {
            return [key, ""];
          }
        })
      );

      if (!cancelled) {
        setMdCache((prev) => {
          const next = { ...prev };
          for (const [key, raw] of entries) {
            next[key] = raw;
          }
          return next;
        });
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, articles, projects]);

  // Résultats combinés (même logique que ton ancien Search.jsx)
  const results = useMemo(() => {
    const query = normalize(q);
    if (!query) return { arts: [], pros: [] };

    // Articles
    const arts = articles
      .map((a) => {
        const hayMeta = normalize(
          [a.title, (a.tags || []).join(" "), a.date].join(" ")
        );
        const body = mdCache[`article:${a.slug}`] || "";
        const hayBody = normalize(body);
        const hit = hayMeta.includes(query) || hayBody.includes(query);
        if (!hit) return null;

        const snippet = stripMarkdown(
          body ? makeSnippet(body, q) : a.description || ""
        );
        return { ...a, snippet };
      })
      .filter(Boolean);

    // Projets
    const pros = projects
      .map((p) => {
        const hayMeta = normalize(
          [p.title, p.status, p.description].join(" ")
        );
        const body = mdCache[`project:${p.slug}`] || "";
        const hayBody = normalize(body);
        const hit = hayMeta.includes(query) || hayBody.includes(query);
        if (!hit) return null;

        const snippet = stripMarkdown(
          body ? makeSnippet(body, q) : p.description || ""
        );
        return { ...p, snippet };
      })
      .filter(Boolean);

    return { arts, pros };
  }, [q, mdCache, articles, projects]);

  // Soumission du formulaire : met à jour l'URL /recherche?q=...
  function onSubmit(e) {
    e.preventDefault();
    const value = e.currentTarget.q.value.trim();
    if (value) {
      router.push(`/recherche?q=${encodeURIComponent(value)}`);
    } else {
      router.push("/recherche");
    }
  }

  return (
    <main className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-heading mb-4 text-brand-primary">
        Recherche
      </h1>

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

      {!q && (
        <p className="text-gray-600">
          Saisis un mot-clé pour lancer la recherche.
        </p>
      )}

      {q && results.arts.length === 0 && results.pros.length === 0 && (
        <p className="text-gray-600">Aucun résultat pour « {q} ».</p>
      )}

      {/* Articles */}
      {results.arts.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-heading font-bold mb-4 text-brand-deep">
            Carnets
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {results.arts.map((a) => (
              <Link
                key={a.slug}
                href={`/articles/${a.slug}?highlight=${encodeURIComponent(
                  q
                )}`}
                className="group block bg-white rounded-2xl shadow-card p-6 hover:shadow-lg transition-shadow"
              >
                <h3 className="text-xl font-semibold mb-2 text-brand-accent group-hover:underline">
                  {a.title}
                </h3>
                {a.snippet && (
                  <p
                    className="text-gray-700 line-clamp-3"
                    dangerouslySetInnerHTML={{
                      __html: highlight(a.snippet, q),
                    }}
                  />
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Projets */}
      {results.pros.length > 0 && (
        <section>
          <h2 className="text-2xl font-heading font-bold mb-4 text-brand-deep">
            Projets
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {results.pros.map((p) => (
              <Link
                key={p.slug}
                href={`/projets/${p.slug}?highlight=${encodeURIComponent(
                  q
                )}`}
                className="group block bg-white rounded-2xl shadow-card p-6 hover:shadow-lg transition-shadow"
              >
                <h3 className="text-xl font-semibold mb-2 text-brand-accent group-hover:underline">
                  {p.title}
                </h3>
                {p.snippet && (
                  <p
                    className="text-gray-700 line-clamp-3"
                    dangerouslySetInnerHTML={{
                      __html: highlight(p.snippet, q),
                    }}
                  />
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
