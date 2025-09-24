import { Link } from "react-router-dom";
/*import hero from "../assets/hero.png";*/
import hero from "../assets/hero_sunset_run.png";
/*import logo from "../assets/logo_bone.png"; // ajoute ton logo ici*/
import logo from "../assets/logo_fond_flou.png"; // ajoute ton logo ici

export default function Home() {
  return (
    <div>
      {/* Hero – même dimension */}
      <section className="relative min-h-[70vh] grid place-items-center text-center rounded-2xl overflow-hidden mt-6">
        <img
          src={hero}
          alt="Locomotion Lab – mouvement, respiration, hormèse"
          className="absolute inset-0 w-full h-full object-cover object-bottom object-right"
          loading="eager"
        />
        <div className="absolute inset-0 bg-black/20" aria-hidden />

        {/* Logo en haut à droite */}
{/*        <img
          src={logo}
          alt="Locomotion Lab"
          className="absolute top-24 right-4 h-36 w-auto z-20"
        />
*/}
        <div className="relative z-10 px-4 sm:px-6 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white drop-shadow-xl font-heading">
            {/* Explorer le mouvement, le corps et l'esprit */}
          </h1>
        </div>
      </section>

      {/* Intro + CTA */}
      <section className="py-12 md:py-16">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <p className="text-lg md:text-xl leading-relaxed">
            Bienvenue au <span className="font-heading font-semibold">Locomotion Lab</span> :
            un espace où je documente et explore le trail minimaliste, le parkour primal,
            la grimpe d’arbres, l’hormèse (chaud/froid) et la respiration, avec une démarche
            à la fois <em>carnet de terrain</em> et <em>rigueur scientifique</em>.
          </p>
          <div>
            <Link
              to="/labo"
              className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-primary text-white font-semibold shadow-cta shadow-lg hover:opacity-90 focus-visible:outline-none"
            >
              Entrer dans le labo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
