// app/services/twin/page.jsx
//
// LE LOCOMOTION TWIN : ce qu'il fait, ce dont il a besoin, ce que tu
// récupères, ce qui est fait de tes données, ce que ça coûte.
//
// L'index ne porte plus qu'une carte : le détail est ici, et l'appel à la
// cohorte avec lui — c'est en déposant une archive qu'on obtient son jumeau.

import Link from "next/link";

import DonneesStructurees from "@/components/DonneesStructurees";
import FilDAriane from "@/components/contenu/FilDAriane";
import RetourAIndex from "@/components/contenu/RetourAIndex";
import { filDAriane } from "@/lib/jsonld";
import { partageDIndex } from "@/lib/seo";

const DESCRIPTION =
  "Ton jumeau physiologique, et le plan de course qui en découle : ce que fait le Twin, ce dont il a besoin, ce que tu récupères, et ce qui est fait de tes données.";

export const metadata = {
  title: "Locomotion Twin",
  description: DESCRIPTION,
  alternates: { canonical: "https://thelocomotionlab.com/services/twin" },
  ...partageDIndex({
    titre: "Locomotion Twin – The Locomotion Lab",
    description: DESCRIPTION,
    url: "/services/twin",
  }),
};

const ETIQUETTE =
  "font-mono text-xxs font-semibold uppercase tracking-etiquette text-brand-muted";

/** Les quatre questions auxquelles la page doit répondre. */
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

const MAILLONS = [{ href: "/services", label: "Services" }, { label: "Locomotion Twin" }];

export default function TwinPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-10 md:px-8">
      <DonneesStructurees id="twin" donnees={filDAriane(MAILLONS)} />

      <FilDAriane maillons={MAILLONS} />

      <article className="mx-auto mt-9 max-w-[860px] pb-6">
        <header>
          <div className="flex flex-wrap items-center gap-3 font-mono text-meta font-semibold uppercase tracking-etiquette text-brand-muted">
            <span className="font-bold text-brand-slate-dark">En ligne</span>
            <span className="rounded-full border border-brand-gauge-full px-3 py-0.5 tracking-pastille text-brand-soft">
              En calibration
            </span>
          </div>

          <h1 className="mt-4 font-heading text-[32px] font-bold leading-[1.05] tracking-[-0.015em] text-brand-slate-dark md:text-[42px]">
            Locomotion Twin
          </h1>
          <p className="m-0 mt-3.5 max-w-[46ch] font-sans text-xl font-light leading-snug text-brand-deep-dark [text-wrap:pretty]">
            Ton jumeau physiologique, et le plan de course qui en découle.
          </p>
          <div className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent" aria-hidden="true" />
        </header>

        <dl className="m-0 mt-10 grid grid-cols-1 gap-x-[18px] gap-y-5 text-lecture font-lecture leading-lecture sm:grid-cols-[140px_minmax(0,1fr)]">
          {TWIN.map(({ question, reponse }) => (
            <div key={question} className="contents">
              <dt className={`${ETIQUETTE} sm:pt-1.5`}>{question}</dt>
              <dd className="m-0 font-sans [text-wrap:pretty]">{reponse}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-10 rounded-[14px] border border-brand-wash-line bg-brand-mist px-7 py-6 shadow-mist">
          <div className="font-mono text-xxs font-bold uppercase tracking-etiquette text-brand-slate">
            Ce que ça coûte
          </div>
          <p className="m-0 mt-2.5 max-w-[40em] font-sans text-lecture font-lecture leading-lecture text-brand-ink [text-wrap:pretty]">
            Rien. Le Twin s&rsquo;obtient en échange de ton archive d&rsquo;entraînement : elle
            sert à valider le moteur sur des données réelles, et ton plan de course est la
            contrepartie.
          </p>
          <p className="m-0 mt-4 max-w-[40em] font-sans text-lecture font-lecture leading-lecture text-brand-soft [text-wrap:pretty]">
            L&rsquo;outil est en cours de calibration. C&rsquo;est précisément le moment où une
            archive de plus compte.
          </p>

          <Link
            href="/services/twin/cohorte"
            className="mt-6 inline-block rounded-full bg-brand-accent px-[26px] py-3 font-heading text-[15px] font-semibold text-white no-underline shadow-cta transition-colors hover:bg-brand-accent-dark"
          >
            Rejoindre la cohorte
          </Link>
        </section>

        <p className="m-0 mt-8 max-w-[40em] font-sans text-lecture font-lecture leading-lecture text-brand-soft [text-wrap:pretty]">
          Le Twin est le premier module d&rsquo;une plateforme en construction : d&rsquo;autres
          outils en ligne viendront s&rsquo;y ajouter.
        </p>

        <RetourAIndex href="/services" label="Retour aux services" />
      </article>
    </div>
  );
}
