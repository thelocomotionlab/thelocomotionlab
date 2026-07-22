// components/PhilosophieSection.jsx
//
// Section « La philosophie » de l'accueil (design_handoff_labo v3, 9a) :
// les 4 piliers du labo entre la section Explorer et la bande email.
// - Desktop (≥ md) : grille 4 colonnes STATIQUE — verbe + suite italique +
//   texte d'appui justifié, toujours visibles ; filets chauds, hover blanc.
// - Mobile (< md) : accordéon — punchline sur UNE ligne (« Questionner les
//   normes établies. », taille fluide clamp() calibrée pour ne pas replier
//   la plus longue de 320 à 430px), bouton cerclé « + » qui devient « − »
//   une fois déplié, déroulé animé par grid-template-rows 0fr → 1fr,
//   motion-reduce → bascule instantanée. Accordéon APG (h3 > button
//   aria-expanded/aria-controls + role="region"), items indépendants.
// Client component pour le seul état de l'accordéon mobile.

"use client";

import Link from "next/link";
import { useState } from "react";

// Contenu final du handoff (ne pas reformuler). Suite SANS point final :
// le point n'apparaît que sur la punchline mobile (en ligne).
const PILIERS = [
  {
    verb: "Questionner",
    suite: "les normes établies",
    texte:
      "Relire les dogmes de l’entraînement et de la santé à la lumière des études — et de millions d’années d’évolution.",
  },
  {
    verb: "Éprouver",
    suite: "par soi-même",
    texte:
      "Être son propre laboratoire : tester en conditions réelles, se tromper, recommencer. La connaissance qui reste est celle qui est vécue.",
  },
  {
    verb: "Jouer",
    suite: "pour durer",
    texte:
      "Le jeu est le moteur le plus durable : bouger comme un animal, rester curieux, faire de la pratique une récréation plutôt qu’une discipline.",
  },
  {
    verb: "Partager",
    suite: "pour ancrer",
    texte:
      "Écrire, raconter, accompagner : ce qui est partagé s’ancre plus profondément — et fait avancer les autres.",
  },
];

const FOOT_LINKS = [
  { label: "Science", href: "/comprendre" },
  { label: "Explorations", href: "/explorer" },
  { label: "Outils", href: "/outils" },
  { label: "Accompagnements", href: "#email" },
];

const FOOT_LINK_CLASS =
  "text-[14px] font-semibold tracking-[0.01em] text-brand-slate-dark transition hover:text-brand-accent-ink md:text-[14.5px]";

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
    <div className="border-b border-brand-deep-dark/18">
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
          <span className="block flex-1 text-[clamp(13.5px,6.2vw-5px,22px)] font-bold leading-[1.25] tracking-[-0.01em] text-brand-deep-dark">
            {verb}{" "}
            {/* Ocre doré (~3,2:1, choix assumé) : la graisse semibold sert
                d'indice de lecture complémentaire à la couleur. */}
            <em className="font-lora font-semibold italic text-brand-accent-ink">
              {suite}.
            </em>
          </span>
          <span
            aria-hidden="true"
            className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full border-[1.5px] border-brand-deep-dark/35 text-[16px] font-medium leading-none text-brand-deep-dark"
          >
            {open ? "−" : "+"}
          </span>
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
          <p className="pb-5 pl-0.5 pr-10 text-[14px] leading-[1.65] text-gray-600 [text-wrap:pretty]">
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
      <div className="mx-auto max-w-[1152px]">
        <p className="text-center font-mono text-[11px] font-bold tracking-[0.22em] text-brand-slate md:text-[13px] md:tracking-[0.25em]">
          / LE LABO
        </p>
        <h2 className="mt-3 text-center font-heading text-[28px] font-bold text-brand-primary-dark md:text-[40px]">
          La philosophie
        </h2>

        {/* Desktop ≥ md : grille 4 colonnes, textes justifiés */}
        <div className="mt-12 hidden border-t border-brand-deep-dark/18 md:grid md:grid-cols-4">
          {PILIERS.map((p) => (
            <div
              key={p.verb}
              className="border-r border-brand-deep-dark/14 px-6 pb-9 pt-[34px] transition-colors last:border-r-0 hover:bg-white"
            >
              <h3 className="text-[28px] font-bold leading-[1.1] tracking-[-0.01em] text-brand-deep-dark">
                {p.verb}
              </h3>
              {/* Ocre doré (~3,2:1, choix assumé) : semibold en compensation. */}
              <p className="mt-1.5 font-lora text-[17px] font-semibold italic leading-[1.35] text-brand-accent-ink [text-wrap:balance]">
                {p.suite}
              </p>
              <p className="mt-3.5 hyphens-auto text-justify text-[14px] leading-[1.65] text-gray-600">
                {p.texte}
              </p>
            </div>
          ))}
        </div>

        {/* Mobile < md : accordéon */}
        <div className="mt-[30px] border-t border-brand-deep-dark/18 md:hidden">
          {PILIERS.map((p) => (
            <AccordeonItem key={p.verb} {...p} />
          ))}
        </div>

        {/* Pied : « cette philosophie en action » + 4 liens à points médians */}
        <div className="mt-[26px] flex flex-col items-center gap-y-3.5 md:mt-8 md:flex-row md:flex-wrap md:items-baseline md:justify-center md:gap-x-[18px] md:border-t md:border-brand-deep-dark/14 md:pt-[26px]">
          <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-gray-400 md:text-[11px]">
            CETTE PHILOSOPHIE EN ACTION
          </span>
          <span className="inline-flex flex-wrap items-baseline justify-center gap-[18px]">
            {FOOT_LINKS.map((l, i) => (
              <span
                key={l.href}
                className="inline-flex items-baseline gap-[18px]"
              >
                {i > 0 ? (
                  <span aria-hidden="true" className="text-[13px] text-brand-accent">
                    ·
                  </span>
                ) : null}
                {l.href.startsWith("#") ? (
                  <a href={l.href} className={FOOT_LINK_CLASS}>
                    {l.label}
                  </a>
                ) : (
                  <Link href={l.href} className={FOOT_LINK_CLASS}>
                    {l.label}
                  </Link>
                )}
              </span>
            ))}
          </span>
        </div>
      </div>
    </section>
  );
}
