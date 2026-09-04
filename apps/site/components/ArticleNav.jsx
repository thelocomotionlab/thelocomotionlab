// components/ArticleNav.jsx
//
// Une rangée de mini-cartes sous un titre : le motif commun de tous les blocs
// de relation d'une page de détail. Titre aligné à gauche, liseré accent court
// juste en dessous, puis les cartes (cover + sorte + titre).

import Link from "next/link";
import CardMeta from "@/components/CardMeta";
import CarteVisuel from "@/components/CarteVisuel";

export default function ArticleNav({ items = [], heading }) {
  if (!items?.length) return null;

  return (
    <nav aria-label={heading} className="mt-14">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-brand-deep">{heading}</h2>
        <span
          aria-hidden="true"
          className="mt-2 block h-[1.5px] w-[4.5rem] rounded-full bg-brand-accent/65"
        />
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.slug}>
            <Link
              href={item.href}
              className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-card transition hover:shadow-lg no-underline"
            >
              <CarteVisuel
                item={item}
                hauteur="h-32"
                sizes="(min-width: 1024px) 240px, (min-width: 640px) 45vw, 90vw"
                decoratif
              />
              <div className="px-4 py-3">
                {item.kindLabel ? (
                  <CardMeta
                    kind={item.kindLabel}
                    detail={item.etat}
                    className="mb-1"
                  />
                ) : null}
                <span className="block text-sm font-medium text-brand-deep transition group-hover:text-brand-accent line-clamp-2">
                  {item.title}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
