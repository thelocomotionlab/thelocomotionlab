"use client";

// components/contenu/RegistreDuBlog.jsx
//
// LE REGISTRE CHRONOLOGIQUE DU BLOG.
//
// Pas de cover : les covers vivent sur les pages de destination. L'année tient
// la marge, les mois jalonnent le fil, et chaque entrée dit sa date, son type,
// son titre, son chapeau, et les blocs qu'elle contient.
//
// Le filtre par type est le seul morceau interactif de la page : il est ici,
// et le reste du site est rendu au build.

import { useMemo, useState } from "react";
import Link from "next/link";

import { TYPES, parAnnee } from "@/lib/blogRegistre";

function Pastille({ actif, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`cursor-pointer rounded-full border px-3 py-1.5 font-mono text-meta font-semibold uppercase tracking-lien transition-colors ${
        actif
          ? "border-brand-deep bg-brand-deep text-white"
          : "border-brand-gauge-full text-brand-soft hover:border-brand-deep hover:text-brand-deep"
      }`}
    >
      {children}
    </button>
  );
}

export default function RegistreDuBlog({ entrees, enTete }) {
  const [filtre, setFiltre] = useState("tout");

  const presents = useMemo(
    () => Object.keys(TYPES).filter((type) => entrees.some((entree) => entree.type === type)),
    [entrees],
  );

  const visibles = useMemo(
    () => (filtre === "tout" ? entrees : entrees.filter((entree) => entree.type === filtre)),
    [entrees, filtre],
  );

  const annees = useMemo(() => parAnnee(visibles), [visibles]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-8">
        {enTete}
        <div className="flex flex-col items-start gap-3.5 md:items-end">
        {presents.length > 1 ? (
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Pastille actif={filtre === "tout"} onClick={() => setFiltre("tout")}>
              Tout
            </Pastille>
            {presents.map((type) => (
              <Pastille key={type} actif={filtre === type} onClick={() => setFiltre(type)}>
                {TYPES[type]}
              </Pastille>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-4 font-mono text-meta text-brand-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-slate" aria-hidden="true" />
            contient une Note
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-deep" aria-hidden="true" />
            contient un Protocole
          </span>
        </div>
        </div>
      </div>

      <div className="mt-12">
        {annees.map((annee) => (
          <section
            key={annee.annee}
            id={`blog-${annee.annee}`}
            className="grid scroll-mt-24 grid-cols-1 md:grid-cols-[9rem_minmax(0,1fr)]"
          >
            <div className="pr-0 text-left md:pr-8 md:text-right">
              <h2 className="sticky top-24 m-0 font-heading text-5xl font-light leading-none tracking-tighter md:text-6xl">
                {annee.annee}
              </h2>
            </div>

            <div className="border-l-2 border-brand-gauge-full pb-10 pl-6 md:pl-10">
              {annee.mois.map((mois) => (
                <div key={mois.id} id={mois.id} className="relative mb-6 scroll-mt-24 pt-1.5">
                  <span
                    className="absolute top-2 hidden h-3 w-3 rounded-full border-2 border-brand-text bg-brand-bg md:block md:-left-[3.05rem]"
                    aria-hidden="true"
                  />
                  <div className="font-mono text-xs font-bold uppercase tracking-etiquette">
                    {mois.libelle}
                  </div>

                  {mois.entrees.map((entree) => (
                    <Link
                      key={entree.url}
                      href={entree.url}
                      className="group relative block pb-1 pt-4 text-brand-text no-underline"
                    >
                      <span className="flex flex-wrap items-baseline gap-3.5">
                        <span className="font-mono text-xs text-brand-muted tabular-nums">
                          {entree.dateLisible}
                        </span>
                        <span className="font-mono text-xxs font-semibold uppercase tracking-lien text-brand-muted">
                          {entree.typeLabel}
                        </span>
                      </span>
                      <span className="mt-1.5 block font-heading text-xl font-semibold leading-snug transition-colors group-hover:text-brand-accent-ink">
                        {entree.titre}
                      </span>
                      <span className="mt-1.5 block max-w-[64ch] font-lora text-lecture leading-snug text-brand-soft [text-wrap:pretty]">
                        {entree.chapeau}
                      </span>
                      {entree.note || entree.protocole ? (
                        <span className="mt-2 flex items-center gap-3.5 font-mono text-meta font-bold uppercase tracking-lien">
                          {entree.note ? <span className="text-brand-slate">● Note</span> : null}
                          {entree.protocole ? (
                            <span className="text-brand-deep">● Protocole</span>
                          ) : null}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
