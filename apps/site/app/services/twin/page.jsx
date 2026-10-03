// app/services/twin/page.jsx
//
// LE LOCOMOTION TWIN : le projet, où il en est, ce que tu reçois, ce que deviennent tes
// données — puis l'appel à la cohorte : c'est en déposant une archive qu'on obtient son
// jumeau.

import Link from "next/link";

import DonneesStructurees from "@/components/DonneesStructurees";
import FilDAriane from "@/components/contenu/FilDAriane";
import RetourAIndex from "@/components/contenu/RetourAIndex";
import { filDAriane } from "@/lib/jsonld";
import { partageDIndex } from "@/lib/seo";

const DESCRIPTION =
  "Un outil d'analyse des données d'entraînement en construction : ton jumeau d'endurance, et le plan de course qui en découle.";

export const metadata = {
  title: "Locomotion Twin",
  description: DESCRIPTION,
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
    question: "Le projet",
    reponse:
      "Je construis un outil d'analyse des données d'entraînement et de course. À partir de ton archive, il modélise ton endurance — ta vitesse, ta résistance à la fatigue, ta façon de monter et de descendre — et en tire un plan de course. À terme, il servira à l'accompagnement personnalisé des athlètes.",
  },
  {
    question: "Où on en est",
    reponse:
      "En calibration. Le moteur est validé sur les courses de dix heures et plus, et il progresse avec chaque archive confiée à la cohorte.",
  },
  {
    question: "Ce que tu reçois",
    reponse: "Ton plan de course, gratuitement, dès que ton jumeau est prêt.",
  },
  {
    question: "Tes données",
    reponse:
      "Ton archive est conservée chiffrée six mois, pour calibrer ton jumeau et pour la recherche du labo, puis supprimée. Elle n'est ni vendue ni partagée, et tu peux demander sa suppression à tout moment.",
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

        <Link
          href="/services/twin/cohorte"
          className="mt-10 inline-block rounded-full bg-brand-accent px-[26px] py-3 font-heading text-[15px] font-semibold text-white no-underline shadow-cta transition-colors hover:bg-brand-accent-dark"
        >
          Rejoindre la cohorte
        </Link>

        <RetourAIndex href="/services" label="Retour aux services" />
      </article>
    </div>
  );
}
