"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * FeedSection
 * - Articles : cover + title + description + "Publié le ..."
 * - Projets  : cover + statut "STATUS · LE date" + title + description
 *              + dernières notes.
 * - Carrousel : défilement smooth d'une carte à la fois (3 visibles).
 *               Flèches affichées uniquement si plus de 3 items.
 * - CTA "Voir tout" sous le feed.
 */

const GAP_PX = 24; // tailwind gap-6

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
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measureEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    measureEdges();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", measureEdges, { passive: true });
    window.addEventListener("resize", measureEdges);
    return () => {
      el.removeEventListener("scroll", measureEdges);
      window.removeEventListener("resize", measureEdges);
    };
  }, [measureEdges, items.length]);

  if (!items?.length) return null;

  const hasCarousel = items.length > 3;

  function scrollByCard(direction) {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector("[data-feed-card]");
    const step = (card?.offsetWidth ?? el.clientWidth) + GAP_PX;
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  }

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

  const arrowClass =
    "hidden md:inline-flex shrink-0 self-center items-center justify-center w-10 h-10 rounded-full bg-white text-brand-deep shadow-md ring-1 ring-black/5 hover:text-brand-primary hover:shadow-lg transition disabled:opacity-0 disabled:pointer-events-none";

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

        {/* Carousel row : flèche | track | flèche */}
        <div className="flex items-stretch gap-3 md:gap-4 lg:gap-5">
          {hasCarousel ? (
            <button
              type="button"
              onClick={() => scrollByCard(-1)}
              disabled={atStart}
              aria-label="Voir les éléments plus récents"
              className={arrowClass}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
          ) : null}

          <div
            ref={trackRef}
            className="flex-1 min-w-0 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth"
          >
            <div
              className={`flex gap-6 py-1 ${
                hasCarousel ? "" : "justify-center"
              }`}
            >
              {items.map((item) => {
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
                    data-feed-card
                    className="snap-start shrink-0 w-72 sm:w-80 lg:w-[22rem]"
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

          {hasCarousel ? (
            <button
              type="button"
              onClick={() => scrollByCard(1)}
              disabled={atEnd}
              aria-label="Voir les éléments plus anciens"
              className={arrowClass}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          ) : null}
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
