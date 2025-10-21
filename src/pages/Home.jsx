import { Link } from "react-router-dom";
import hero from "../assets/hero_sunset_run.webp";
import { Helmet } from "react-helmet";


export default function Home() {
  return (
    <>
      <Helmet>
        <title>The Locomotion Lab – Explorations de la locomotion humaine</title>
        <meta
          name="description"
          content="De la course minimaliste au déplacement dans les arbres, des stress hormétiques au travail de respiration : le Locomotion Lab explore le mouvement humain à travers l'expérience brute et l'analyse scientifique."
        />
        <link rel="canonical" href="https://thelocomotionlab.com/" />

        {/* Open Graph */}
        <meta property="og:title" content="The Locomotion Lab – Explorations de la locomotion humaine" />
        <meta
          property="og:description"
          content="De la course minimaliste au déplacement dans les arbres, des stress hormétiques au travail de respiration : le Locomotion Lab explore le mouvement humain à travers l'expérience brute et l'analyse scientifique."
        />
        <meta property="og:image" content="https://thelocomotionlab.com/images/assets/og-image.jpg" />
        <meta property="og:url" content="https://thelocomotionlab.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="fr_FR" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="The Locomotion Lab – Explorations de la locomotion humaine" />
        <meta
          name="twitter:description"
          content="De la course minimaliste au déplacement dans les arbres, des stress hormétiques au travail de respiration : le Locomotion Lab explore le mouvement humain à travers l'expérience brute et l'analyse scientifique."
        />
        <meta name="twitter:image" content="https://thelocomotionlab.com/images/assets/og-image.jpg" />
      </Helmet>
      <div>
        {/* Hero – même dimension */}
        <section className="relative min-h-[70vh] grid place-items-center text-center rounded-2xl overflow-hidden mt-6">
          <img
            src={hero}
            alt="Locomotion Lab – trail primal, mouvement et hormèse"
            className="
              absolute inset-0 w-full h-full object-cover
              object-center md:object-[50%_70%]
            "
            loading="eager"
            fetchpriority="high"
          />
          <div className="absolute inset-0 bg-black/20" aria-hidden />

          <div className="relative z-10 px-4 sm:px-6 max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white drop-shadow-xl font-heading">
              {/* Explorer le mouvement, le corps et l'esprit */}
            </h1>
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
            <div>
              <Link
                to="/labo"
                className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-accent text-white font-semibold shadow-cta shadow-lg hover:opacity-90 focus-visible:outline-none"
              >
                Entrer dans le labo
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
