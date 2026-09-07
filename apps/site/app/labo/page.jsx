// app/labo/page.jsx
//
// LE LABO : la coulisse du site.
//
// Trois sections en une page — la quête, qui tient le labo, et comment
// écrire. Chacune pose son ancre ; la barre du haut y renvoie. Les textes de
// la quête et d'À propos vivent dans components/labo/, d'où les pages /quete
// et /a-propos les lisent aussi : un seul fichier source par texte.

import EmailCapture from "@/components/EmailCapture";
import ContactForm from "@/components/ContactForm";
import EnTeteDIndex from "@/components/contenu/EnTeteDIndex";
import LaQuete, { PARTIES, EXERGUE } from "@/components/labo/LaQuete";
import APropos, { PortraitDeValentin } from "@/components/labo/APropos";

export const metadata = {
  title: "Le labo",
  description: "La coulisse du site : la quête, qui est derrière, comment écrire.",
};

const COORDONNEES = [
  {
    libelle: "E-mail",
    valeur: "thelocomotionlab@gmail.com",
    href: "mailto:thelocomotionlab@gmail.com",
  },
  {
    libelle: "Instagram",
    valeur: "@valent1.fer",
    href: "https://www.instagram.com/valent1.fer",
  },
  { libelle: "Délai de réponse", valeur: "Quelques jours." },
];

const SECTIONS = [
  { id: "labo-quete", titre: "La quête" },
  { id: "labo-apropos", titre: "À propos" },
  { id: "labo-contact", titre: "Contact" },
];

/** L'exergue d'une section : une phrase en romain maigre contre un filet ocre. */
function Exergue({ children }) {
  return (
    <p className="m-0 max-w-[44ch] border-l-[3px] border-brand-accent pl-4.5 font-sans text-[22px] font-light not-italic leading-[1.4] tracking-[0.012em] text-brand-deep-dark [text-wrap:pretty]">
      {children}
    </p>
  );
}

function Section({ id, titre, exergue, children }) {
  return (
    <section id={id} className="mt-16 scroll-mt-24">
      <div className="flex items-baseline gap-3.5 border-b border-brand-hairline pb-2.5">
        <h2 className="m-0 font-heading text-[26px] font-bold">{titre}</h2>
      </div>
      {exergue ? <div className="mt-6">{exergue}</div> : null}
      {children}
    </section>
  );
}

export default function LaboPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-12 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <EnTeteDIndex
          titre="Le labo"
          accroche="La coulisse du site : la quête, qui est derrière, comment écrire."
        />
        <nav
          aria-label="Sections du labo"
          className="flex flex-wrap gap-2 font-mono text-meta font-semibold uppercase tracking-lien"
        >
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="whitespace-nowrap rounded-full border border-brand-gauge-full px-3 py-1.5 text-brand-soft no-underline transition-colors hover:border-brand-text hover:text-brand-text"
            >
              {section.titre}
            </a>
          ))}
        </nav>
      </div>

      <Section {...SECTIONS[0]} exergue={<Exergue>{EXERGUE}</Exergue>}>
        <div className="mt-8 grid items-start gap-14 lg:grid-cols-[12.5rem_minmax(0,1fr)]">
          <nav aria-label="Parties" className="sticky top-24 hidden self-start lg:block">
            <div className="border-b border-brand-hairline pb-2.5 font-mono text-xxs font-semibold uppercase tracking-surtitre text-brand-muted">
              Sommaire
            </div>
            <ol className="m-0 list-none p-0 font-heading text-sm">
              {PARTIES.map((partie, rang) => (
                <li key={partie.id}>
                  <a
                    href={`#${partie.id}`}
                    className={`flex gap-3 py-2.5 text-brand-text no-underline transition-colors hover:text-brand-deep-dark ${
                      rang === PARTIES.length - 1 ? "" : "border-b border-brand-grid"
                    }`}
                  >
                    {partie.titre}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0">
            <LaQuete />
            <div className="mt-9 flex flex-wrap items-center justify-between gap-6 border-t border-brand-hairline pt-5">
              <p className="m-0 max-w-[30ch] font-heading font-semibold leading-snug text-brand-deep-dark">
                Recevoir les prochaines parutions ou collaborer avec le labo
              </p>
              <div className="min-w-[17rem] flex-1">
                <EmailCapture
                  title={null}
                  description={null}
                  source="labo-quete"
                  placeholder="Ton adresse e-mail"
                  buttonLabel="M'inscrire"
                />
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section {...SECTIONS[1]} exergue={<Exergue>Qui suis-je ?</Exergue>}>
        <div className="mt-8 grid items-start gap-14 lg:grid-cols-[300px_minmax(0,1fr)]">
          <PortraitDeValentin />
          <div className="min-w-0">
            <APropos />
            <div className="mt-9 flex flex-wrap items-center justify-between gap-6 border-t border-brand-hairline pt-5">
              <p className="m-0 max-w-[30ch] font-heading font-semibold leading-snug text-brand-deep-dark">
                Suivre les explorations du labo
              </p>
              <div className="min-w-[17rem] flex-1">
                <EmailCapture
                  title={null}
                  description={null}
                  source="labo-apropos"
                  placeholder="Ton adresse e-mail"
                  buttonLabel="M'inscrire"
                />
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        {...SECTIONS[2]}
        exergue={<Exergue>Une question, une idée, une envie de collaborer ?</Exergue>}
      >
        <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="flex flex-col justify-between gap-7">
            <p className="m-0 font-sans text-lecture leading-[1.7] text-brand-ink [text-wrap:pretty]">
              Écris-moi via ce formulaire ou directement par mail. Une question sur un article, une
              aventure, un atelier ou une envie de collaborer : tout arrive au même endroit, et je
              réponds moi-même.
            </p>
            <dl className="m-0 grid gap-[18px] border-t border-brand-hairline pt-5">
              {COORDONNEES.map(({ libelle, valeur, href }) => (
                <div key={libelle}>
                  <dt className="font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted">
                    {libelle}
                  </dt>
                  <dd className="m-0 mt-1 font-heading font-semibold">
                    {href ? (
                      <a
                        href={href}
                        {...(href.startsWith("http")
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="text-brand-deep-dark underline decoration-brand-accent underline-offset-[3px]"
                      >
                        {valeur}
                      </a>
                    ) : (
                      valeur
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <ContactForm />
        </div>
      </Section>
    </div>
  );
}
