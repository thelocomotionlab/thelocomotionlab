// components/ExplorerSections.jsx
//
// Corps du pilier Explorer : une section par sorte (titre en Lora italique +
// filet), chacune avec sa grille de cartes. Un filtre discret permet de n'en
// afficher qu'une. Les sections vides n'arrivent jamais jusqu'ici : le serveur
// les a retirées, et leur bouton de filtre avec.
//
// Une section peut être REPLIÉE par défaut (les fiches) : on y arrive depuis
// un parent, la recherche ou la légende d'un post, pas en balayant l'index.

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import CardMeta from "@/components/CardMeta";
import ExplorerLiveIndicator from "@/components/ExplorerLiveIndicator";
import SectionHeading from "@/components/SectionHeading";

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
          <CardMeta
            kind={item.kindLabel}
            detail={item.detail}
            className="mb-1"
          />

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

/** Une section repliée : son titre reste, sa grille s'ouvre à la demande. */
function SectionRepliee({ section }) {
  const [ouverte, setOuverte] = useState(false);

  return (
    <section className="mb-12">
      <button
        type="button"
        onClick={() => setOuverte((v) => !v)}
        aria-expanded={ouverte}
        className="cursor-pointer group mb-6 flex w-full items-baseline gap-3 text-left"
      >
        <SectionHeading className="mb-0">{section.label}</SectionHeading>
        <span className="text-[13px] font-medium text-gray-500 group-hover:text-brand-primary-dark">
          {ouverte ? "masquer" : `voir les ${section.items.length}`}
        </span>
      </button>
      {ouverte ? <CardGrid items={section.items} /> : null}
    </section>
  );
}

export default function ExplorerSections({ sections = [] }) {
  const [filtre, setFiltre] = useState("tout");

  const visibles =
    filtre === "tout" ? sections : sections.filter((s) => s.key === filtre);

  return (
    <div>
      {/* Rangée d'entrée : indicateur live discret à gauche, filtre par sorte
          à droite — zéro hauteur ajoutée. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ExplorerLiveIndicator tone="light" />
        {sections.length > 1 ? (
          <div
            role="group"
            aria-label="Filtrer les contenus"
            className="flex gap-1 rounded-full border border-gray-300/70 bg-white/60 p-1"
          >
            {[{ key: "tout", label: "Tout" }, ...sections].map(
              ({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFiltre(key)}
                  aria-pressed={filtre === key}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                    filtre === key
                      ? "bg-brand-primary-dark text-white"
                      : "text-gray-500 hover:bg-white hover:text-brand-primary-dark"
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>
        ) : null}
      </div>

      {visibles.map((section) =>
        // Une section repliée s'ouvre d'office quand on l'a filtrée seule.
        section.replie && filtre !== section.key ? (
          <SectionRepliee key={section.key} section={section} />
        ) : (
          <section key={section.key} className="mb-12">
            <SectionHeading className="mb-6">{section.label}</SectionHeading>
            <CardGrid items={section.items} />
          </section>
        )
      )}
    </div>
  );
}
