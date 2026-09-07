// app/services/page.jsx
//
// SERVICES : deux offres, et rien d'autre.
//
// Le Twin et les ateliers ne sont pas deux entrées d'un catalogue : l'un est un
// outil qui s'obtient en échange d'une archive d'entraînement, l'autre un
// rendez-vous en extérieur, à une date, dans un lieu. Ils n'ont donc ni famille,
// ni numéro, ni schéma de carte commun — chacun est présenté selon ce qu'il est.

import Link from "next/link";

import EmailCapture from "@/components/EmailCapture";
import EnTeteDIndex from "@/components/contenu/EnTeteDIndex";
import { listAteliers } from "@/lib/ateliers.mjs";
import { dateEnToutesLettres } from "@/lib/lisible";

export const metadata = {
  title: "Services",
  description:
    "Deux offres : le Locomotion Twin, en échange d'une archive d'entraînement, et les ateliers de motricité primale.",
};

const ETIQUETTE =
  "font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted";

/** Les quatre questions auxquelles la carte du Twin doit répondre. */
const TWIN = [
  {
    question: "Ce qu'il fait",
    reponse:
      "À partir de ton archive d'entraînement, le moteur construit ton jumeau physiologique — vitesse critique, endurance, durabilité — puis le confronte au coût réel de la pente le long de ta trace, par simulation, pour en déduire un plan de pacing segment par segment.",
  },
  {
    question: "Ce dont il a besoin",
    reponse:
      "Ton archive d'entraînement complète (Garmin, Polar, Strava, Coros ou Suunto), déposée telle quelle, et le GPX de ta course cible. Il faut au moins une saison d'archive et des courses passées : c'est sur elles que le jumeau se cale.",
  },
  {
    question: "Ce que tu récupères",
    reponse:
      "Un rapport de pacing segment par segment, avec des fenêtres horaires construites sur tes propres courses, et une relecture du rapport avec moi.",
  },
  {
    question: "Ce qui est fait de tes données",
    reponse:
      "Ton archive sert à calibrer le moteur, puis elle est supprimée immédiatement après analyse. Seuls ton rapport et quelques métadonnées sont conservés. Elle n'est ni revendue, ni partagée.",
  },
];

export default function ServicesPage() {
  const ateliers = listAteliers();

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-12 md:px-8">
      <EnTeteDIndex
        titre="Services"
        accroche="Deux choses : un outil qui se calibre sur tes données, et des rendez-vous en extérieur."
      />

      {/* ── Le Twin ─────────────────────────────────────────────────────── */}
      <section id="twin" className="mt-14 scroll-mt-24">
        <article className="grid overflow-hidden rounded-[14px] border border-brand-wash-line bg-brand-mist shadow-mist lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="px-8 py-9 md:px-10">
            <div className="font-mono text-xxs font-bold uppercase tracking-etiquette text-brand-slate-dark">
              Jumeau physiologique · en calibration
            </div>
            <h2 className="mt-2.5 font-heading text-3xl font-bold leading-[1.05] tracking-[-0.015em] text-brand-slate-dark md:text-4xl">
              Locomotion Twin
            </h2>
            <p className="m-0 mt-2.5 max-w-[46ch] font-sans text-xl font-light not-italic leading-snug text-brand-deep-dark [text-wrap:pretty]">
              Ton jumeau physiologique, et le plan de course qui en découle.
            </p>

            <dl className="m-0 mt-5 grid grid-cols-1 gap-x-[18px] gap-y-3 text-[15px] leading-normal sm:grid-cols-[118px_minmax(0,1fr)]">
              {TWIN.map(({ question, reponse }) => (
                <div key={question} className="contents">
                  <dt className={`${ETIQUETTE} sm:pt-1`}>{question}</dt>
                  <dd className="m-0 font-sans [text-wrap:pretty]">{reponse}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-col justify-between gap-6 border-brand-wash-line bg-brand-paper/60 px-8 py-9 lg:border-l">
            <div>
              <div className="font-mono text-xxs font-bold uppercase tracking-etiquette text-brand-slate">
                Ce que ça coûte
              </div>
              <p className="m-0 mt-2.5 font-sans text-[15px] leading-[1.55] text-brand-ink">
                Rien. Le Twin s&rsquo;obtient en échange de ton archive d&rsquo;entraînement :
                elle sert à valider le moteur sur des données réelles, et ton plan de course est
                la contrepartie.
              </p>
              <p className="m-0 mt-4 font-sans text-[15px] leading-[1.55] text-brand-soft [text-wrap:pretty]">
                L&rsquo;outil est en cours de calibration. C&rsquo;est précisément le moment où
                une archive de plus compte.
              </p>
            </div>

            <Link
              href="/outils/twin/cohorte"
              className="inline-block self-start rounded-full bg-brand-accent px-[26px] py-3 font-heading text-[15px] font-semibold text-white no-underline shadow-cta transition-colors hover:bg-brand-accent-dark"
            >
              Rejoindre la cohorte
            </Link>
          </div>
        </article>
      </section>

      {/* ── Les ateliers ────────────────────────────────────────────────── */}
      <section id="ateliers" className="mt-16 scroll-mt-24 pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-brand-hairline pb-2.5">
          <h2 className="m-0 font-heading text-[26px] font-bold text-brand-deep">
            Ateliers de motricité primale
          </h2>
          <span className={ETIQUETTE}>en extérieur · gratuits pendant le lancement</span>
        </div>

        <p className="m-0 mt-5 max-w-[60ch] font-sans text-lecture leading-[1.7] text-brand-ink [text-wrap:pretty]">
          Des rendez-vous en extérieur pour réincarner l&rsquo;animal qui sommeille en toi :
          quadrupédie, suspension, équilibre, sauts de précision. On y vient sans matériel et sans
          niveau requis.
        </p>

        {ateliers.length > 0 ? (
          <ul className="m-0 mt-7 grid list-none gap-4 p-0 md:grid-cols-2">
            {ateliers.map((atelier) => (
              <li
                key={atelier.id}
                className="rounded-xl border border-brand-hairline bg-brand-paper p-6 shadow-bloc"
              >
                <div className={ETIQUETTE}>
                  {dateEnToutesLettres(atelier.date)} · {atelier.heureDebut}–{atelier.heureFin}
                </div>
                <h3 className="m-0 mt-2 font-heading text-xl font-bold leading-snug">
                  {atelier.title}
                </h3>
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
          <div className="mt-7 rounded-xl border-[1.5px] border-dashed border-brand-wash-line px-6 py-6">
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
          </div>
        )}
      </section>
    </div>
  );
}
