// components/ProjectsGrid.jsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

/**
 * Parse une date au format français "JJ/MM/AAAA" ou "J/M/AA"
 * et renvoie un objet Date. Retourne null si invalide.
 */
function parseFrenchDate(str) {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;

  const [dayStr, monthStr, yearStr] = parts;
  const day = Number(dayStr);
  const month = Number(monthStr);
  let year = Number(yearStr);

  if (!day || !month || !year) return null;
  if (year < 100) {
    year += year < 50 ? 2000 : 1900;
  }

  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export default function ProjectsGrid({ projets, notesMap = {} }) {
  const [filter, setFilter] = useState("Tous");

  const statuses = [
    "Tous",
    ...Array.from(
      new Set(projets.map((p) => p.status).filter((s) => !!s))
    ),
  ];

  const filtered =
    filter === "Tous"
      ? projets
      : projets.filter((p) => p.status === filter);

  return (
    <>
      {/* Filtres */}
      <div className="flex flex-wrap gap-2 justify-center mb-8">
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={`px-3 py-1 rounded-full border border-gray-300 ${
              filter === s ? "bg-brand-accent text-white" : "bg-white"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Grille des projets */}
      <div className="grid gap-6 justify-center justify-items-center grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(3,22rem)]">
        {filtered.map((p) => {
          const notes = notesMap[p.slug] || [];

          const lastNotes = [...notes]
            .sort((a, b) => {
              const dA = parseFrenchDate(a.date);
              const dB = parseFrenchDate(b.date);
              if (!dA && !dB) return 0;
              if (!dA) return 1;
              if (!dB) return -1;
              return dB - dA;
            })
            .slice(0, 2);

          return (
            <div key={p.slug} className="relative w-full max-w-[22rem] h-full">
              <Link
                href={`/projets/${p.slug}`}
                className="group bg-white rounded-2xl shadow-card overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col"
              >
                {p.cover ? (
                  <div className="relative w-full h-44">
                    <Image
                      src={p.cover}
                      alt={`Illustration : ${p.title}`}
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 352px, 100vw"
                    />
                  </div>
                ) : (
                  <div className="w-full h-44 bg-brand-bg" aria-hidden="true" />
                )}

                <div className="p-5 flex flex-col flex-1">
                  {p.status && (
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                      {p.status === "Terminé" && p.completedAt
                        ? `${p.status} le ${p.completedAt.toLocaleDateString("fr-FR")}`
                        : p.status}
                    </p>
                  )}

                  <h3 className="text-lg font-semibold text-brand-deep group-hover:underline mb-2">
                    {p.title}
                  </h3>

                  <p className="text-sm text-gray-700 italic line-clamp-3">
                    {p.description}
                  </p>

                  {lastNotes.length > 0 && (
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
                  )}
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
