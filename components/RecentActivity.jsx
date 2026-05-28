"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * FeedSection
 * - Articles : cover + title + description + "Publié le ..."
 * - Projets  : cover + statut "STATUS · LE date" + title + description
 *              + dernières notes.
 * - Carrousel : pagination par groupes de 3 items (flèches affichées
 *               uniquement si plus de 3 items au total).
 * - CTA "Voir tout" sous le feed.
 */

const PAGE_SIZE = 3;

function parseFrenchDate(str) {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const [dayStr, monthStr, yearStr] = parts;
  const day = Number(dayStr);
  const month = Number(monthStr);
  let year = Number(yearStr);
  if (!day || !month || !year) return null;
  if (year < 100) year += year < 50 ? 2000 : 1900;
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickLastNotes(notes, limit = 2) {
  if (!Array.isArray(notes) || notes.length === 0) return [];
  return [...notes]
    .sort((a, b) => {
      const dA = parseFrenchDate(a.date);
      const dB = parseFrenchDate(b.date);
      if (!dA && !dB) return 0;
      if (!dA) return 1;
      if (!dB) return -1;
      return dB - dA;
    })
    .slice(0, limit);
}

export default function RecentActivity({
  title,
  icon = null,
  items = [],
  notesMap = {},
  ctaHref = null,
  ctaLabel = "Voir tout",
}) {
  const [page, setPage] = useState(0);

  if (!items?.length) return null;

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const hasPagination = items.length > PAGE_SIZE;
  const safePage = Math.min(page, totalPages - 1);
  const visibleItems = items.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  const count = visibleItems.length;

  const gridCols =
    count >= 3
      ? "grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(3,22rem)]"
      : count === 2
      ? "grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(2,22rem)]"
      : "grid-cols-1";

  function formatProjectStatusLine(item) {
    if (!item.status) return "";
    if (item.status === "Terminé" && item.completedAt) {
      const d =
        item.completedAt instanceof Date
          ? item.completedAt
          : new Date(item.completedAt);
      return `${item.status} le ${d.toLocaleDateString("fr-FR")}`;
    }
    return item.status;
  }

  const canPrev = hasPagination && safePage > 0;
  const canNext = hasPagination && safePage < totalPages - 1;

  const arrowBaseClass =
    "absolute top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/85 backdrop-blur text-brand-deep shadow-sm ring-1 ring-black/5 hover:bg-white hover:text-brand-primary transition disabled:opacity-0 disabled:pointer-events-none";

  return (
    <section className="py-6 md:py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Title */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {icon}

          <h2 className="text-2xl sm:text-3xl font-bold text-brand-primary text-center">
            {title}
          </h2>
        </div>

        {/* Carousel wrapper */}
        <div className="relative">
          {hasPagination ? (
            <>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={!canPrev}
                aria-label="Voir les éléments plus récents"
                className={`${arrowBaseClass} left-0 sm:-left-2 lg:-left-4`}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
                disabled={!canNext}
                aria-label="Voir les éléments plus anciens"
                className={`${arrowBaseClass} right-0 sm:-right-2 lg:-right-4`}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </>
          ) : null}

          {/* Cards */}
          <div
            className={`grid gap-6 justify-center justify-items-center ${gridCols}`}
          >
            {visibleItems.map((item) => {
              const isProjet = item.type === "Projet";
              const lastNotes = isProjet ? pickLastNotes(notesMap[item.slug]) : [];
              const projetStatusLine = isProjet ? formatProjectStatusLine(item) : "";
              const itemDate =
                item.date instanceof Date
                  ? item.date
                  : item.date
                  ? new Date(item.date)
                  : null;
              const meta =
                item.type === "Carnet" && itemDate ? (
                  <p>Publié le {itemDate.toLocaleDateString("fr-FR")}</p>
                ) : null;

              return (
                <div
                  key={`${item.type}-${item.slug}`}
                  className="relative w-full max-w-[22rem] h-full"
                >
                  <Link
                    href={item.href}
                    className="
                      group
                      bg-white rounded-2xl shadow-card overflow-hidden
                      hover:shadow-lg transition-shadow
                      h-full flex flex-col
                    "
                  >
                    {/* Cover */}
                    {item.cover ? (
                      <div className="relative w-full h-44">
                        <Image
                          src={item.cover}
                          alt={`Illustration : ${item.title}`}
                          fill
                          className="object-cover"
                          sizes="(min-width: 768px) 384px, 100vw"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-44 bg-brand-bg" aria-hidden="true" />
                    )}

                    {/* Content */}
                    <div className="p-5 flex flex-col flex-1">
                      {isProjet && projetStatusLine ? (
                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                          {projetStatusLine}
                        </p>
                      ) : null}

                      <h3 className="text-lg font-semibold text-brand-deep group-hover:underline mb-2">
                        {item.title}
                      </h3>

                      {item.description ? (
                        <p className="text-sm text-gray-700 italic line-clamp-3">
                          {item.description}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">&nbsp;</p>
                      )}

                      {isProjet && lastNotes.length > 0 ? (
                        <div className="mt-auto pt-3 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-500 mb-1">
                            Dernières notes :
                          </p>
                          <ul className="space-y-1">
                            {lastNotes.map((note, i) => (
                              <li key={i} className="text-xs text-gray-600">
                                {note.date
                                  ? `${note.date} – ${note.title}`
                                  : note.title}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {meta ? (
                        <div
                          className={`${
                            isProjet && lastNotes.length > 0 ? "mt-2" : "mt-auto"
                          } pt-4 text-xs text-gray-500`}
                        >
                          {meta}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA under feed (same style as "Entrer dans le labo") */}
        {ctaHref ? (
          <div className="mt-7 flex items-center justify-center">
            <Link
              href={ctaHref}
              className="
                inline-block
                bg-brand-accent text-white font-semibold
                px-6 py-3 rounded-full shadow
                hover:bg-brand-primary-dark transition
              "
            >
              {ctaLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
