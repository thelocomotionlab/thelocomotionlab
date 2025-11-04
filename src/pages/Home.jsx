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
            <p className="text-lg text-center md:text-xl leading-relaxed">
              Le <span className="font-heading font-semibold">Locomotion Lab</span> explore et décortique la locomotion
              humaine sous toutes ses formes. De la course minimaliste au déplacement dans les arbres, des stress hormétiques
              au travail de respiration, l'expérience brute s'allie à l'analyse scientifique pour explorer le potentiel Humain. 
              Bienvenue dans ce laboratoire vivant. 
            </p>

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
                href="https://www.thelocomotionlab.com/projets/traversee-reunion#suivi-en-direct-live-tracking"
                className="inline-flex items-center gap-2 text-brand-deep font-medium hover:text-brand-accent transition-colors duration-200 group"
              >
                <SatelliteDish
                  size={18}
                  className="text-brand-accent group-hover:translate-y-[-1px] transition-transform duration-200"
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
