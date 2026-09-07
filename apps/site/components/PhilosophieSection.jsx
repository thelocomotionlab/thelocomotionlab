// components/PhilosophieSection.jsx
//
// Section « La philosophie » de l'accueil : les 4 piliers du labo, entre le
// bloc Blog et la bande email.
// - Desktop (≥ md) : grille 4 colonnes STATIQUE — verbe, suite en romain
//   maigre et texte d'appui, toujours visibles ; filets chauds, hover blanc.
// - Mobile (< md) : accordéon — punchline sur UNE ligne (« Questionner les
//   normes établies. », taille fluide clamp() calibrée pour ne pas replier
//   la plus longue de 320 à 430px), bouton cerclé « + » qui devient « − »
//   une fois déplié, déroulé animé par grid-template-rows 0fr → 1fr,
//   motion-reduce → bascule instantanée. Accordéon APG (h3 > button
//   aria-expanded/aria-controls + role="region"), items indépendants.
// Client component pour le seul état de l'accordéon mobile.

"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

// Contenu final du handoff (ne pas reformuler). Suite SANS point final :
// le point n'apparaît que sur la punchline mobile (en ligne).
const PILIERS = [
  {
    verb: "Questionner",
    suite: "les normes établies",
    texte:
      "Relire les dogmes de l’entraînement et de la santé à la lumière des études et de millions d’années d’évolution.",
  },
  {
    verb: "Éprouver",
    suite: "par soi-même",
    texte:
      "Pour expérimenter les concepts en conditions réelles et se les approprier par le corps et l'esprit.",
  },
  {
    verb: "Jouer",
    suite: "pour durer",
    texte:
      "Appréhender chaque pratique comme un jeu, pour ne jamais se lasser et progresser sans limite.",
  },
  {
    verb: "Partager",
    suite: "pour ancrer",
    texte:
      "Écrire pour raconter, expliquer pour fixer et enrichir les connaissances, accompagner pour transmettre et amplifier le mouvement.",
  },
];

function slugify(verb) {
  return verb
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, "-");
}

/** Un rang de l'accordéon mobile (état indépendant par item). */
function AccordeonItem({ verb, suite, texte }) {
  const [open, setOpen] = useState(false);
  const id = `philo-${slugify(verb)}`;

  return (
    <div className="border-b border-brand-hairline">
      <h3>
        <button
          type="button"
          id={`${id}-bouton`}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-3.5 px-0.5 py-[22px] text-left"
        >
          {/* Punchline UNE ligne : taille fluide calibrée pour que la plus
              longue (« Questionner les normes établies. ») tienne sans
              replier de 320 à 430px — vérifié au pixel (Puppeteer). */}
          <span className="block flex-1 text-[clamp(13.5px,6.2vw-5px,22px)] font-bold leading-[1.25] tracking-[-0.01em] text-brand-deep">
            {verb}{" "}
            <span className="font-light tracking-[0.012em] text-brand-deep-dark">
              {suite}.
            </span>
          </span>
          {/* Chevron : à droite au repos, il pivote vers le bas au dépliage.
              Un signe qui TOURNE dit le mouvement mieux qu'un + qui devient −.
              (Mobile seulement : le bloc entier est en md:hidden.) */}
          <ChevronRight
            aria-hidden="true"
            size={22}
            strokeWidth={2}
            className={`flex-none text-brand-deep-dark/70 transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none ${
              open ? "rotate-90" : ""
            }`}
          />
        </button>
      </h3>
      <div
        id={id}
        role="region"
        aria-labelledby={`${id}-bouton`}
        className={`grid transition-[grid-template-rows] duration-[450ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="pb-5 pl-0.5 pr-10 text-[15.5px] leading-[1.6] text-brand-soft [text-wrap:pretty]">
            {texte}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PhilosophieSection() {
  return (
    <section className="bg-brand-bg px-[26px] pb-12 pt-14 md:px-16 md:pb-[84px] md:pt-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-heading text-[28px] font-bold tracking-[-0.015em] text-brand-slate-dark md:text-[40px]">
          La philosophie du lab
        </h2>

        {/* Desktop ≥ md : grille 4 colonnes, entre deux filets */}
        <div className="mt-12 hidden border-y border-brand-hairline md:grid md:grid-cols-4">
          {PILIERS.map((p) => (
            <div
              key={p.verb}
              className="border-r border-brand-hairline px-7 pb-11 pt-10 transition-colors last:border-r-0 hover:bg-brand-paper"
            >
              <h3 className="font-heading text-[28px] font-bold leading-[1.1] text-brand-deep">
                {p.verb}
              </h3>
              <p className="mt-1.5 font-sans text-[17px] font-light tracking-[0.012em] text-brand-deep-dark [text-wrap:balance]">
                {p.suite}
              </p>
              <p className="mt-4 text-[15.5px] leading-[1.6] text-brand-soft text-pretty">
                {p.texte}
              </p>
            </div>
          ))}
        </div>

        {/* Mobile < md : accordéon */}
        <div className="mt-[30px] border-t border-brand-hairline md:hidden">
          {PILIERS.map((p) => (
            <AccordeonItem key={p.verb} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}
