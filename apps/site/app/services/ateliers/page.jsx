// app/services/ateliers/page.jsx
//
// LES ATELIERS DE MOTRICITÉ PRIMALE : ce qu'on y fait, et les dates ouvertes.
//
// Le catalogue (lib/ateliers.mjs) décide de la page : des dates, ou l'encart
// qui prévient de leur ouverture. Aucune carte vide, aucun « à venir ».

import Link from "next/link";

import EmailCapture from "@/components/EmailCapture";
import FilDAriane from "@/components/contenu/FilDAriane";
import RetourAIndex from "@/components/contenu/RetourAIndex";
import { listAteliers } from "@/lib/ateliers.mjs";
import { dateEnToutesLettres } from "@/lib/lisible";

export const metadata = {
  title: "Ateliers de motricité primale",
  description:
    "Des rendez-vous dehors pour réincarner l'animal qui sommeille en toi : quadrupédie, suspension, équilibre, sauts de précision.",
  alternates: { canonical: "https://thelocomotionlab.com/services/ateliers" },
};

const ETIQUETTE =
  "font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted";

export default function AteliersPage() {
  const ateliers = listAteliers();

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-10 md:px-8">
      <FilDAriane
        maillons={[
          { href: "/services", label: "Services" },
          { label: "Ateliers de motricité primale" },
        ]}
      />

      <article className="mx-auto mt-9 max-w-[860px] pb-6">
        <header>
          <div className="flex flex-wrap items-center gap-3 font-mono text-meta font-semibold uppercase tracking-etiquette text-brand-muted">
            <span className="font-bold text-brand-deep">Sur le terrain</span>
            <span className="rounded-full border border-brand-gauge-full px-3 py-0.5 tracking-pastille text-brand-soft">
              {ateliers.length > 0
                ? `${ateliers.length} date${ateliers.length > 1 ? "s" : ""} ouverte${ateliers.length > 1 ? "s" : ""}`
                : "Aucune date ouverte"}
            </span>
          </div>

          <h1 className="mt-4 font-heading text-[32px] font-bold leading-[1.05] tracking-[-0.015em] text-brand-deep md:text-[42px]">
            Ateliers de motricité primale
          </h1>
          <p className="m-0 mt-3.5 max-w-[46ch] font-sans text-xl font-light leading-snug text-brand-deep-dark [text-wrap:pretty]">
            Des rendez-vous dehors pour réincarner l&rsquo;animal qui sommeille en toi.
          </p>
          <div className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent" aria-hidden="true" />
        </header>

        {/* La promesse est déjà dans l'en-tête : le corps enchaîne sur ce
            qu'on y fait, sans la répéter. */}
        <p className="m-0 mt-9 max-w-[62ch] font-sans text-lecture leading-[1.7] text-brand-ink [text-wrap:pretty]">
          Quadrupédie, suspension, équilibre, sauts de précision. On y vient sans matériel et sans
          niveau requis.
        </p>

        <div className="mt-4 font-mono text-meta text-brand-muted">
          En extérieur · gratuits pendant le lancement
        </div>

        {ateliers.length > 0 ? (
          <ul className="m-0 mt-9 grid list-none gap-4 p-0 md:grid-cols-2">
            {ateliers.map((atelier) => (
              <li
                key={atelier.id}
                className="rounded-xl border border-brand-hairline bg-brand-paper p-6 shadow-bloc"
              >
                <div className={ETIQUETTE}>
                  {dateEnToutesLettres(atelier.date)} · {atelier.heureDebut}–{atelier.heureFin}
                </div>
                <h2 className="m-0 mt-2 font-heading text-xl font-bold leading-snug">
                  {atelier.title}
                </h2>
                <p className="m-0 mt-1.5 font-sans leading-snug text-brand-soft">{atelier.lieu}</p>
                <Link
                  href={`/pratiquer/inscription/${atelier.slug}`}
                  className="mt-4 inline-block rounded-full border-[1.5px] border-brand-deep px-5 py-2 font-heading text-sm font-semibold text-brand-deep no-underline transition-colors hover:bg-brand-deep hover:text-white"
                >
                  S&rsquo;inscrire
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <section
            id="prevenir"
            className="mt-9 scroll-mt-24 rounded-xl border-[1.5px] border-dashed border-brand-wash-line px-6 py-6"
          >
            <p className="m-0 mb-4 max-w-[52ch] font-sans leading-normal text-brand-soft">
              Aucune date ouverte pour l&rsquo;instant. Laisse ton adresse pour être prévenu·e de
              l&rsquo;ouverture des inscriptions.
            </p>
            <div className="max-w-[26rem]">
              <EmailCapture
                title={null}
                description={null}
                source="services-ateliers"
                placeholder="Ton adresse e-mail"
                buttonLabel="Me prévenir"
              />
            </div>
          </section>
        )}

        <RetourAIndex href="/services" label="Retour aux services" />
      </article>
    </div>
  );
}
