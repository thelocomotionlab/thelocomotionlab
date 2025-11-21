// app/page.jsx
import Link from "next/link";
import { SatelliteDish } from "lucide-react";

export const metadata = {
  title: "The Locomotion Lab",
  description:
    "Le Locomotion Lab est un laboratoire vivant d'exploration de la locomotion humaine, du trail primal à la grimpe d’arbres et à l’hormèse.",
  alternates: {
    canonical: "https://thelocomotionlab.com/",
  },
  openGraph: {
    title: "The Locomotion Lab",
    description:
      "Espace d'exploration de la locomotion humaine, entre rigueur scientifique et expériences personnelles.",
    url: "https://thelocomotionlab.com/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Locomotion Lab",
    description:
      "Espace d'exploration de la locomotion humaine, entre rigueur scientifique et expériences personnelles.",
  },
};

export default function HomePage() {
  return (
    <div>
      {/* Hero identique à l’ancien : section dans le container, image en “carte” */}
      <section className="relative min-h-[70vh] grid place-items-center text-center rounded-2xl overflow-hidden mt-6">
        {/* ⚠️ mets hero_sunset_run.webp dans /public/hero_sunset_run.webp */}
        <img
          src="/hero_sunset_run.webp"
          alt="Locomotion Lab – trail primal, mouvement et hormèse"
          className="absolute inset-0 w-full h-full object-cover object-center md:object-[50%_70%]"
          loading="eager"
        />
        <div className="absolute inset-0 bg-black/20" aria-hidden="true" />

        <div className="relative z-10 px-4 sm:px-6 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white drop-shadow-xl font-heading">
            {/* remets ton titre ici si tu en avais un */}
          </h1>
        </div>
      </section>

      {/* Intro + CTA */}
      <section className="py-12 md:py-16">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="text-lg text-center md:text-l leading-relaxed space-y-6">
            <p>
              Le{" "}
              <span className="font-heading font-semibold">
                Locomotion Lab
              </span>{" "}
              est un espace d&apos;exploration de la locomotion humaine sous
              toutes ses formes. Du trail primal, au déplacement dans les
              arbres, à la locomotion animale, en passant par la natation ou
              toute autre forme de déplacement primordial.
            </p>

            <p>
              L&apos;objectif est d&apos;analyser et de décortiquer les
              facteurs favorisant la fluidité, l&apos;endurance et la
              résilience dans le mouvement, pour optimiser potentiel et
              bien-être.
            </p>

            <p>
              Rigueur scientifique et expériences personnelles fusionnent pour
              proposer des contenus utiles et accessibles. Bienvenue dans ce
              laboratoire vivant.
            </p>
          </div>

          {/* CTA principal */}
          <div>
            <Link
              href="/labo"
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-accent text-white font-semibold shadow-cta shadow-lg hover:opacity-90 focus-visible:outline-none"
            >
              Entrer dans le labo
            </Link>
          </div>

          {/* Lien Live Tracking */}
{/*          <div className="pt-6">
            <a
              href="https://www.thelocomotionlab.com/projets/traversee-reunion#la-travers%C3%A9e-de-la-r%C3%A9union-en-direct"
              className="inline-flex flex-col sm:flex-row items-center justify-center gap-2 text-brand-deep font-medium hover:text-brand-accent transition-colors duration-200 group text-center"
            >
              <SatelliteDish
                size={18}
                className="text-brand-deep shrink-0 group-hover:translate-y-[-1px] transition-transform duration-200"
              />
              <span>Suivre la traversée de la Réunion en direct</span>
            </a>
          </div>
*/}
        </div>
      </section>
    </div>
  );
}
