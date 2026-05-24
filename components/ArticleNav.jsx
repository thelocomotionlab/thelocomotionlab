// components/ArticleNav.jsx
//
// Suggestions de lecture en bas d'un article ou projet.
// Présente jusqu'à deux fiches voisines (chronologiquement) sous une
// formulation positive ("À découvrir aussi"), sans mettre l'accent sur
// l'ordre prev/next. Les liens portent quand même rel="prev"/"next"
// pour les crawlers et les navigateurs.

import Link from "next/link";

export default function ArticleNav({ prev = null, next = null, label = "Article" }) {
  const items = [
    next ? { ...next, rel: "next" } : null,
    prev ? { ...prev, rel: "prev" } : null,
  ].filter(Boolean);

  if (items.length === 0) return null;

  const heading = items.length > 1 ? "À découvrir aussi" : "À découvrir ensuite";

  return (
    <nav
      aria-label={`Autres ${label.toLowerCase()}s à découvrir`}
      className="mt-14"
    >
      <div className="flex items-center justify-center gap-3 mb-5">
        <span aria-hidden="true" className="h-px w-10 bg-brand-accent/40" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-deep">
          {heading}
        </h2>
        <span aria-hidden="true" className="h-px w-10 bg-brand-accent/40" />
      </div>

      <ul
        className={`mx-auto grid gap-4 ${
          items.length === 1
            ? "max-w-md grid-cols-1"
            : "max-w-3xl grid-cols-1 sm:grid-cols-2"
        }`}
      >
        {items.map((item) => (
          <li key={item.slug} className="flex">
            <Link
              href={item.href}
              rel={item.rel}
              className="group flex w-full flex-col items-center text-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand-accent hover:shadow-md no-underline"
            >
              <span className="text-[0.7rem] uppercase tracking-[0.18em] text-brand-accent/90">
                {label}
              </span>
              <span className="font-semibold text-brand-deep group-hover:text-brand-accent transition line-clamp-2">
                {item.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
