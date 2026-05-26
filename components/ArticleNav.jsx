// components/ArticleNav.jsx
//
// Suggestions de lecture en bas d'un article ou projet.
// Style sobre : liseres accent courts (memes dimensions que ceux des
// legendes d'images) au-dessus et en dessous, kicker centre, puis des
// petites cartes contenant uniquement le cover et le titre. Les liens
// portent rel="prev"/"next" pour les crawlers.

import Link from "next/link";
import Image from "next/image";

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
      className="mt-14 flex flex-col items-center"
    >
      <span
        aria-hidden="true"
        className="block h-[1.5px] w-[4.5rem] rounded-full bg-brand-accent/65"
      />

      <p className="my-5 text-center text-[0.7rem] uppercase tracking-[0.28em] text-brand-deep/80">
        {heading}
      </p>

      <ul
        className={`grid w-full gap-5 ${
          items.length === 1
            ? "max-w-[16rem] grid-cols-1"
            : "max-w-2xl grid-cols-1 sm:grid-cols-2"
        }`}
      >
        {items.map((item) => (
          <li key={item.slug}>
            <Link
              href={item.href}
              rel={item.rel}
              className="group flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-card transition hover:shadow-lg no-underline"
            >
              {item.cover ? (
                <div className="relative h-32 w-full overflow-hidden">
                  <Image
                    src={item.cover}
                    alt=""
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(min-width: 640px) 320px, 90vw"
                  />
                </div>
              ) : (
                <div className="h-32 w-full bg-brand-bg" aria-hidden="true" />
              )}
              <div className="px-4 py-3 text-center">
                <span className="block text-sm font-medium text-brand-deep transition group-hover:text-brand-accent line-clamp-2">
                  {item.title}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <span
        aria-hidden="true"
        className="mt-7 block h-[1.5px] w-[4.5rem] rounded-full bg-brand-accent/65"
      />
    </nav>
  );
}
