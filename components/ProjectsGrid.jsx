// components/ProjectsGrid.jsx
"use client";

import { useState } from "react";
import Link from "next/link";

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
      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((p) => {
          const notes = notesMap[p.slug] || [];

          // Tri par date décroissante, on garde les 2 plus récentes
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
            <Link
              key={p.slug}
              href={`/projets/${p.slug}`}
              className="group block bg-white rounded-2xl shadow-card p-6 hover:shadow-lg transition flex flex-col hover:-translate-y-1"
            >
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                {p.status}
              </p>

              <h3 className="text-xl font-semibold text-brand-deep mb-2">
                {p.title}
              </h3>

              <p className="italic text-sm text-gray-700 mb-4 flex-1">
                {p.description}
              </p>

              <hr className="my-3 border border-gray-300/70" />

              {lastNotes.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-600 mb-1">
                    Dernières notes :
                  </p>
                  <ul className="space-y-1">
                    {lastNotes.map((note, i) => (
                      <li key={i} className="text-sm text-gray-700">
                        {note.date
                          ? `${note.date} – ${note.title}`
                          : note.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Link>
          );
        })}
      </section>
    </>
  );
}
