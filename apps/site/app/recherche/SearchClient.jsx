// app/recherche/SearchClient.jsx
//
// Recherche client-side : charge UN seul fichier /search-index.json
// (pré-généré au build) puis filtre en mémoire. Plus de fetch par
// fichier .md, plus de strip markdown côté client.

"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function normalize(s) {
  return (s || "").toString().toLowerCase();
}

function makeSnippet(text, q, radius = 120) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const i = t.toLowerCase().indexOf((q || "").toLowerCase());
  if (i === -1) {
    return t.slice(0, radius * 2) + (t.length > radius * 2 ? "…" : "");
  }
  const start = Math.max(0, i - radius);
  const end = Math.min(t.length, i + q.length + radius);
  const left = start > 0 ? "…" : "";
  const right = end < t.length ? "…" : "";
  return left + t.slice(start, end) + right;
}

function escapeRegExp(s) {
  return (s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlight(text, q) {
  const safe = escapeHtml(text);
  if (!q) return safe;
  const regex = new RegExp(`(${escapeRegExp(q)})`, "gi");
  return safe.replace(
    regex,
    `<strong class="text-gray-700 font-semibold">$1</strong>`
  );
}

export default function SearchClient() {
  return (
    <Suspense fallback={null}>
      <SearchClientInner />
    </Suspense>
  );
}

function SearchClientInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const q = searchParams.get("q") || "";
  const [index, setIndex] = useState(null); // null = loading, [] = vide
  const inputRef = useRef(null);

  // Focus initial sur l'input quand pas de requête
  useEffect(() => {
    if (!q && inputRef.current) inputRef.current.focus();
  }, [q]);

  // Chargement unique de l'index (mis en cache navigateur grâce au header)
  useEffect(() => {
    let cancelled = false;
    fetch("/search-index.json")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setIndex(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setIndex([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => {
    const query = normalize(q);
    if (!query || !index) return { arts: [], pros: [] };

    const filtered = index
      .map((item) => {
        const meta = normalize(
          [
            item.title,
            item.description,
            item.status,
            (item.tags || []).join(" "),
          ].join(" ")
        );
        const body = normalize(item.body || "");
        const hit = meta.includes(query) || body.includes(query);
        if (!hit) return null;

        const source = (item.body || "").length
          ? item.body
          : item.description || "";

        return {
          ...item,
          snippet: makeSnippet(source, q),
        };
      })
      .filter(Boolean);

    return {
      // Pilier Comprendre : articles de fond.
      arts: filtered.filter((i) => i.type === "article"),
      // Pilier Explorer : récits + projets ("project" = ancien index encore
      // en cache navigateur pendant la bascule).
      pros: filtered.filter(
        (i) => i.type === "recit" || i.type === "projet" || i.type === "project"
      ),
    };
  }, [q, index]);

  function onSubmit(e) {
    e.preventDefault();
    const value = e.currentTarget.q.value.trim();
    if (value) {
      router.push(`/recherche?q=${encodeURIComponent(value)}`);
    } else {
      router.push("/recherche");
    }
  }

  const isLoading = q && index === null;
  const noResults =
    q && index !== null && results.arts.length === 0 && results.pros.length === 0;

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold font-heading mb-4 text-brand-primary">
        Recherche
      </h1>

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

      {isLoading && (
        <p className="text-gray-600">Chargement de l’index…</p>
      )}

      {noResults && (
        <p className="text-gray-600">Aucun résultat pour « {q} ».</p>
      )}

      {results.arts.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-heading font-bold mb-4 text-brand-deep">
            Comprendre
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {results.arts.map((a) => (
              <Link
                key={a.slug}
                href={`${a.href}?highlight=${encodeURIComponent(q)}`}
                scroll={false}
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

      {results.pros.length > 0 && (
        <section>
          <h2 className="text-2xl font-heading font-bold mb-4 text-brand-deep">
            Explorer
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {results.pros.map((p) => (
              <Link
                key={p.slug}
                href={`${p.href}?highlight=${encodeURIComponent(q)}`}
                scroll={false}
                className="group block bg-white rounded-2xl shadow-card p-6 hover:shadow-lg transition-shadow"
              >
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  {p.type === "recit" ? "Récit" : "Projet"}
                </p>
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
    </div>
  );
}
