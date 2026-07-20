// components/PhilosophieSection.jsx
//
// Section « La philosophie » de l'accueil (design_handoff_labo v3, 9a +
// itération « textes déroulants partout ») : les 4 piliers du labo entre la
// section Explorer et la bande email.
// - Desktop (≥ md) : grille 4 colonnes — verbe + suite italique visibles,
//   texte d'appui DÉROULANT sous un « + » cerclé (même langage que mobile).
// - Mobile (< md) : accordéon — punchline sur UNE ligne (« Questionner les
//   normes établies. », taille fluide clamp() calibrée pour ne pas replier
//   la plus longue de 320 à 430px), « + » à droite de la rangée.
// UN SEUL DOM pour les deux rendus (variantes md:), donc un seul état
// open/fermé par pilier, conservé quand la fenêtre change de taille.
// Déroulé animé par grid-template-rows 0fr → 1fr (cross-browser), « + »
// qui tourne en « × » ; motion-reduce → bascule instantanée. Accordéon
// APG : <h3><button aria-expanded aria-controls>…</button></h3> +
// role="region". Items indépendants. Client component pour ce seul état.

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
      "Être son propre laboratoire : tester en conditions réelles, se tromper, recommencer. La connaissance qui reste est celle qui est vécue.",
  },
  {
    verb: "Jouer",
    suite: "pour durer",
    texte:
      "Le jeu est le moteur le plus durable : bouger comme un animal, rester curieux, faire de la pratique une récréation plutôt qu’une discipline.",
  },
  {
    verb: "Partager",
    suite: "pour ancrer",
    texte:
      "Écrire, raconter, accompagner : ce qui est partagé s’ancre plus profondément — et fait avancer les autres.",
  },
];

const FOOT_LINKS = [
  { label: "Science", href: "/comprendre" },
  { label: "Explorations", href: "/explorer" },
  { label: "Outils", href: "/outils" },
  { label: "Accompagnements", href: "#email" },
];

const FOOT_LINK_CLASS =
  "text-[14px] font-semibold tracking-[0.01em] text-brand-primary-dark transition hover:text-brand-accent-dark md:text-[14.5px]";

function slugify(verb) {
  return verb
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, "-");
}

/** Un pilier : punchline cliquable + texte d'appui déroulant (tous écrans). */
function Pilier({ verb, suite, texte, open, onToggle }) {
  const id = `philo-${slugify(verb)}`;

  return (
    <div className="border-b border-brand-deep-dark/18 transition-colors md:border-b-0 md:border-r md:border-brand-deep-dark/14 md:px-6 md:pb-8 md:pt-[34px] md:last:border-r-0 md:hover:bg-white">
      <h3>
        <button
          type="button"
          id={`${id}-bouton`}
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="flex w-full cursor-pointer items-center gap-3.5 px-0.5 py-[22px] text-left md:block md:p-0"
        >
          {/* Punchline : UNE ligne en mobile — taille fluide calibrée pour
              que la plus longue (« Questionner les normes établies. »)
              tienne sans replier de 320 à 430px, vérifié au pixel. En
              desktop, verbe et suite passent sur deux lignes (md:block). */}
          <span className="block flex-1 text-[clamp(13.5px,6.2vw-5px,22px)] font-bold leading-[1.25] tracking-[-0.01em] text-brand-deep-dark md:text-[28px] md:leading-[1.1]">
            {verb}{" "}
            <em className="font-lora font-medium italic text-brand-accent md:mt-1.5 md:block md:text-[17px] md:leading-[1.35] md:[text-wrap:balance]">
              {suite}
              <span className="md:hidden">.</span>
            </em>
          </span>
          <span
            aria-hidden="true"
            className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-full border-[1.5px] border-brand-deep-dark/35 text-[16px] font-medium leading-none text-brand-deep-dark transition-transform duration-[350ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none md:mt-4 ${
            open ? "rotate-45" : ""
            }`}
          >
            +
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
          <p className="pb-5 pl-0.5 pr-10 text-[14px] leading-[1.65] text-gray-600 [text-wrap:pretty] md:pb-1 md:pl-0 md:pr-0 md:pt-4">
            {texte}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PhilosophieSection() {
  // Piliers ouverts, par verbe. Un seul état pour mobile ET desktop
  // (même DOM) : l'ouverture survit à un changement de largeur.
  const [open, setOpen] = useState({});
  const toggle = (verb) => setOpen((o) => ({ ...o, [verb]: !o[verb] }));

  return (
    <section className="bg-brand-bg px-[26px] pb-12 pt-14 md:px-16 md:pb-[84px] md:pt-24">
      <div className="mx-auto max-w-[1152px]">
        <p className="text-center font-mono text-[11px] font-bold tracking-[0.22em] text-brand-slate md:text-[13px] md:tracking-[0.25em]">
          / LE LABO
        </p>
        <h2 className="mt-3 text-center font-heading text-[28px] font-bold text-brand-primary-dark md:text-[40px]">
          La philosophie
        </h2>

        {/* Liste mobile / grille desktop : un seul DOM, variantes md:. */}
        <div className="mt-[30px] border-t border-brand-deep-dark/18 md:mt-12 md:grid md:grid-cols-4">
          {PILIERS.map((p) => (
            <Pilier
              key={p.verb}
              {...p}
              open={!!open[p.verb]}
              onToggle={() => toggle(p.verb)}
            />
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
