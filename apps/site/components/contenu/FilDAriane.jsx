// components/contenu/FilDAriane.jsx
//
// LE FIL D'ARIANE D'UNE PAGE DE DÉTAIL : « Blog › Le titre ».
//
// Il dit où l'on se trouve plutôt que d'où l'on vient : chaque maillon sauf
// le dernier est cliquable, et le dernier est la page courante. Le retour en
// arrière, lui, vit en bas de page — c'est là qu'on en a besoin.

import Link from "next/link";

export default function FilDAriane({ maillons = [] }) {
  if (maillons.length === 0) return null;

  return (
    <nav aria-label="Fil d'Ariane" className="font-mono text-xs tracking-lien text-brand-muted">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
        {maillons.map(({ href, label }, rang) => {
          const dernier = rang === maillons.length - 1;
          return (
            <li key={label} className="flex items-center gap-1.5">
              {rang > 0 ? (
                <span aria-hidden="true" className="text-brand-faint">
                  ›
                </span>
              ) : null}
              {dernier || !href ? (
                <span aria-current={dernier ? "page" : undefined} className="max-w-[46ch] truncate">
                  {label}
                </span>
              ) : (
                <Link href={href} className="text-brand-muted no-underline hover:text-brand-accent-ink">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
