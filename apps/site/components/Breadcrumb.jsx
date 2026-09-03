// components/Breadcrumb.jsx
//
// Fil d'Ariane sémantique pour les pages de détail.
// items : tableau d'objets { href?, label }. Le dernier item est considéré
// comme la page courante (sans lien).
//
// `className` REMPLACE les classes de gabarit (largeur, marges, padding) —
// il ne s'y ajoute pas. Sans lui, le fil se cale sur les pages d'article et de
// projet. Une page bâtie sur un autre gabarit doit passer le sien, sinon le
// `max-w-5xl mx-auto` par défaut recentre le fil DANS le conteneur de la page
// et le décale de plusieurs dizaines de pixels par rapport au titre (c'est ce
// qui arrivait à /live/archives/<slug>, en max-w-6xl).

import Link from "next/link";
import { ChevronRight } from "lucide-react";

const GABARIT_PAR_DEFAUT = "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4";

export default function Breadcrumb({ items = [], className = null }) {
  if (!items.length) return null;

  return (
    <nav
      aria-label="Fil d'Ariane"
      className={`${className ?? GABARIT_PAR_DEFAUT} text-sm text-gray-600`}
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
