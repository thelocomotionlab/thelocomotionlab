// components/ArticleNav.jsx
//
// Suggestions de lecture en bas d'un article ou projet.
// Style éditorial sobre : un bloc encadré par deux liserés accent fins,
// un kicker centré "À découvrir ensuite", puis chaque suggestion en pur
// texte, sans carte ni ombre. Les liens portent rel="prev"/"next" pour
// les crawlers et la navigation clavier des navigateurs.

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
      className="mt-14 border-y border-brand-accent/25 py-8"
    >
      <p className="text-center text-[0.7rem] uppercase tracking-[0.28em] text-brand-deep/80 mb-6">
        {heading}
      </p>

      <ul
        className={`mx-auto flex items-center justify-center gap-x-12 gap-y-6 ${
          items.length > 1 ? "flex-col sm:flex-row" : "flex-col"
        }`}
      >
        {items.map((item) => (
          <li key={item.slug} className="text-center">
            <Link
              href={item.href}
              rel={item.rel}
              className="group inline-block no-underline"
            >
              <span className="block text-[0.65rem] uppercase tracking-[0.2em] text-brand-accent/90 mb-1">
                {label}
              </span>
              <span className="font-medium text-brand-deep transition group-hover:text-brand-accent border-b border-transparent group-hover:border-brand-accent/60 pb-0.5">
                {item.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
