// components/Breadcrumb.jsx
//
// Fil d'Ariane sémantique pour les pages de détail.
// items : tableau d'objets { href?, label }. Le dernier item est considéré
// comme la page courante (sans lien).

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function Breadcrumb({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav
      aria-label="Fil d'Ariane"
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 text-sm text-gray-600"
    >
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-brand-accent hover:underline underline-offset-2"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "text-gray-800 font-medium truncate max-w-[60ch]" : ""}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight
                  size={14}
                  className="text-gray-400 shrink-0"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
