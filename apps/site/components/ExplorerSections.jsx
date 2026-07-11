// components/ExplorerSections.jsx
//
// Corps du pilier Explorer : deux sections « Projets » et « Récits »
// (titres en Lora italique + filet), chacune avec sa grille de cartes —
// les récits, sans bloc de notes, gardent ainsi une hauteur compacte au
// lieu de s'étirer sur celle des projets. Un filtre discret permet de
// n'afficher qu'un des deux types. Les items arrivent pré-formatés du
// serveur (chaînes uniquement).

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ExplorerLiveIndicator from "@/components/ExplorerLiveIndicator";

const FILTERS = [
  { key: "tout", label: "Tout" },
  { key: "projets", label: "Projets" },
  { key: "recits", label: "Récits" },
];

function SectionHeading({ children }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <h2 className="font-lora text-[24px] font-medium italic text-brand-deep md:text-[28px]">
        {children}
      </h2>
      <div
        className="h-px flex-1 translate-y-[2px] bg-gray-300/80"
        aria-hidden="true"
      />
    </div>
  );
}

function Card({ item }) {
  return (
    <div className="relative w-full max-w-[22rem] h-full">
      <Link
        href={item.href}
        className="group bg-white rounded-2xl shadow-card overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col"
      >
        {item.cover ? (
          <div className="relative w-full h-44">
            <Image
              src={item.cover}
              alt={`Illustration : ${item.title}`}
              fill
              className="object-cover"
              sizes="(min-width: 768px) 352px, 100vw"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="w-full h-44 bg-brand-bg" aria-hidden="true" />
        )}

        <div className="p-5 flex flex-col flex-1">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            {item.meta}
          </p>

          <h3 className="text-lg font-semibold text-brand-deep group-hover:underline mb-2">
            {item.title}
          </h3>

          {/* Description en Lora italique, centrée verticalement entre le
              titre et le bloc du bas (notes ou date). */}
          <div className="flex flex-1 items-center py-1">
            {item.description ? (
              <p className="font-lora text-[15px] italic text-gray-700 line-clamp-3">
                {item.description}
              </p>
            ) : null}
          </div>

          {item.notes && item.notes.length > 0 ? (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 mb-1">
                Dernières notes :
              </p>
              <ul className="space-y-1">
                {item.notes.map((note, i) => (
                  <li key={i} className="text-xs text-gray-600">
                    {note.date ? `${note.date} – ${note.title}` : note.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : item.dateLabel ? (
            <div className="pt-3 text-xs text-gray-500">
              <p>{item.dateLabel}</p>
            </div>
          ) : null}
        </div>
      </Link>
    </div>
  );
}

function CardGrid({ items }) {
  return (
    <div className="grid gap-6 justify-center justify-items-center grid-cols-1 sm:grid-cols-2 lg:justify-start lg:[grid-template-columns:repeat(3,22rem)]">
      {items.map((item) => (
        <Card key={item.slug} item={item} />
      ))}
    </div>
  );
}

export default function ExplorerSections({ projets, recits }) {
  const [filter, setFilter] = useState("tout");

  const showProjets = filter !== "recits" && projets.length > 0;
  const showRecits = filter !== "projets" && recits.length > 0;

  return (
    <div>
      {/* Rangée d'entrée : indicateur live discret à gauche, filtre
          tout / projets / récits à droite — zéro hauteur ajoutée. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ExplorerLiveIndicator tone="light" />
        <div
          role="group"
          aria-label="Filtrer les contenus"
          className="flex gap-1 rounded-full border border-gray-300/70 bg-white/60 p-1"
        >
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                filter === key
                  ? "bg-brand-primary-dark text-white"
                  : "text-gray-500 hover:bg-white hover:text-brand-primary-dark"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showProjets && (
        <section className="mb-12">
          <SectionHeading>Projets</SectionHeading>
          <CardGrid items={projets} />
        </section>
      )}

      {showRecits && (
        <section>
          <SectionHeading>Récits</SectionHeading>
          <CardGrid items={recits} />
        </section>
      )}
    </div>
  );
}
