// components/ArticleNav.jsx
//
// Navigation prev/next en bas d'un article ou projet.
// `label` permet de personnaliser le mot ("Carnet", "Projet").

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function ArticleNav({ prev = null, next = null, label = "Article" }) {
  if (!prev && !next) return null;

  return (
    <nav
      aria-label={`Navigation entre ${label.toLowerCase()}s`}
      className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      {prev ? (
        <Link
          href={prev.href}
          rel="prev"
          className="group flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-4 shadow-card hover:border-brand-accent hover:shadow-md transition no-underline"
        >
          <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500">
            <ArrowLeft size={14} aria-hidden="true" />
            {label} précédent
          </span>
          <span className="font-semibold text-brand-deep group-hover:text-brand-accent transition line-clamp-2">
            {prev.title}
          </span>
        </Link>
      ) : (
        <div aria-hidden="true" />
      )}

      {next ? (
        <Link
          href={next.href}
          rel="next"
          className="group flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-4 shadow-card hover:border-brand-accent hover:shadow-md transition no-underline sm:text-right"
        >
          <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500 sm:justify-end">
            {label} suivant
            <ArrowRight size={14} aria-hidden="true" />
          </span>
          <span className="font-semibold text-brand-deep group-hover:text-brand-accent transition line-clamp-2">
            {next.title}
          </span>
        </Link>
      ) : (
        <div aria-hidden="true" />
      )}
    </nav>
  );
}
