// components/ExplorerSections.jsx
//
// Corps du pilier Explorer : quatre sections, deux grammaires. Les expéditions
// en cartes, parce qu'elles ont une photo ; les protocoles et les fiches en
// registre ; le carnet entre les deux — la carte de l'année, ses dernières
// notes en registre à côté. Un filtre discret permet de n'afficher qu'une
// section. Les sections vides n'arrivent jamais jusqu'ici : le serveur les a
// retirées, et leur bouton de filtre avec.
//
// Les fiches sont REPLIÉES par défaut : on y arrive depuis un parent, la
// recherche ou la légende d'un post, pas en balayant l'index.

"use client";

import { useState } from "react";
import CarteExpedition from "@/components/CarteExpedition";
import CarteCarnet from "@/components/CarteCarnet";
import ExplorerLiveIndicator from "@/components/ExplorerLiveIndicator";
import Registre from "@/components/Registre";
import SectionHeading from "@/components/SectionHeading";

function pluriel(n, mot) {
  return `${n} ${mot}${n > 1 ? "s" : ""}`;
}

export default function ExplorerSections({
  expeditions = [],
  protocoles = [],
  carnet = null,
  fiches = [],
}) {
  const [filtre, setFiltre] = useState("tout");

  const sections = [
    expeditions.length && { key: "expedition", label: "Expéditions" },
    protocoles.length && { key: "protocole", label: "Protocoles" },
    carnet && { key: "carnet", label: "Carnet" },
    fiches.length && { key: "fiche", label: "Fiches" },
  ].filter(Boolean);

  const visible = (key) => filtre === "tout" || filtre === key;

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
            className="flex flex-wrap gap-1 rounded-full border border-gray-300/70 bg-white/60 p-1"
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

      {expeditions.length > 0 && visible("expedition") ? (
        <section className="mb-10">
          <SectionHeading className="mb-4" aside={String(expeditions.length)}>
            Expéditions
          </SectionHeading>
          <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {expeditions.map((item) => (
              <CarteExpedition key={item.slug} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {protocoles.length > 0 && visible("protocole") ? (
        <section className="mb-10">
          <SectionHeading
            className="mb-1.5"
            aside={`${protocoles.length} · le cahier de labo`}
          >
            Protocoles
          </SectionHeading>
          <Registre items={protocoles} pilier="explorer" />
        </section>
      ) : null}

      {carnet && visible("carnet") ? (
        <section className="mb-10">
          <SectionHeading
            className="mb-4"
            aside={`${carnet.carte.annee} · ${carnet.carte.detail.toLowerCase()}`}
          >
            Carnet
          </SectionHeading>
          <CarteCarnet carnet={carnet.carte} notes={carnet.notes} />
        </section>
      ) : null}

      {fiches.length > 0 && visible("fiche") ? (
        // Une section filtrée seule s'ouvre d'office : on est venu pour elle.
        <details
          className="ll-fiches mt-10 border-t border-brand-hairline pt-2"
          open={filtre === "fiche"}
        >
          <summary className="flex items-baseline gap-3.5">
            <h2 className="font-lora text-2xl font-medium italic text-brand-deep md:text-[28px]">
              Fiches
            </h2>
            <span className="ll-fiches-hint text-[12.5px] text-gray-500">
              {pluriel(fiches.length, "liste")} de référence ·
            </span>
          </summary>
          <Registre items={fiches} pilier="explorer" />
        </details>
      ) : null}
    </div>
  );
}
