import { Link } from "react-router-dom";
import hero from "../assets/hero_sunset_run.webp";
import { Helmet } from "react-helmet";
import { SatelliteDish } from "lucide-react"; // 👈 ajoute cette ligne

export default function Home() {
  return (
    <>
      <Helmet>
        {/* ... ton <Helmet> reste inchangé ... */}
      </Helmet>

      <div>
        {/* Hero */}
        <section className="relative min-h-[70vh] grid place-items-center text-center rounded-2xl overflow-hidden mt-6">
          <img
            src={hero}
            alt="Locomotion Lab – trail primal, mouvement et hormèse"
            className="absolute inset-0 w-full h-full object-cover object-center md:object-[50%_70%]"
            loading="eager"
            fetchpriority="high"
          />
          <div className="absolute inset-0 bg-black/20" aria-hidden />
          <div className="relative z-10 px-4 sm:px-6 max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white drop-shadow-xl font-heading"></h1>
          </div>
        </section>

        {/* Intro + CTA */}
        <section className="py-12 md:py-16">
          <div className="max-w-3xl mx-auto text-center space-y-6">


            <div className="text-lg text-center md:text-l leading-relaxed space-y-6">
              <p>
                Le <span className="font-heading font-semibold">Locomotion Lab</span> est un espace d'exploration de la locomotion humaine sous toutes ses formes.
                Du trail primal, au déplacement dans les arbres, à la locomotion animale, en passant par la natation ou toute autre forme de déplacement primordial.
              </p>

              <p>
                L'objectif est d'analyser et de décortiquer les facteurs favorisant la fluidité, l'endurance et la résilience dans le mouvement, pour optimiser potentiel et bien-être.
              </p>

              <p>
                Rigueur scientifique et expériences personnelles fusionnent pour proposer des contenus utiles et accessibles.
                Bienvenue dans ce laboratoire vivant.
              </p>
            </div>


            {/* --- CTA principal --- */}
            <div>
              <Link
                to="/labo"
                className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-accent text-white font-semibold shadow-cta shadow-lg hover:opacity-90 focus-visible:outline-none"
              >
                Entrer dans le labo
              </Link>
            </div>
            {/* --- Nouveau lien Live Tracking --- */}
            <div className="pt-6">
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

          </div>
        </section>
      </div>
    </>
  );
}
