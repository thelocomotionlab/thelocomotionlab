// app/outils/carrousel/page.jsx
//
// L'atelier carrousel : une trace (prévue ou vécue) → un lot d'images aux
// couleurs du labo, prêtes à publier. L'atelier est un composant client
// (canvas) ; cette page ne porte que le cadre et les métadonnées.
//
// `noindex` : outil d'atelier, pas une page de contenu — même traitement que
// /outils/habillage.
import PageHeader from "@/components/PageHeader";
import CarrouselAtelier from "@/components/outils/CarrouselAtelier";

export const metadata = {
  title: "Atelier carrousel – The Locomotion Lab",
  description:
    "Fabriquer un carrousel à partir d'une trace : l'itinéraire découpé en journées, des photos, des chiffres. Tout se fait dans le navigateur : rien n'est envoyé.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: "https://thelocomotionlab.com/outils/carrousel",
  },
};

export default function CarrouselPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <PageHeader
        title="Atelier carrousel"
        tagline="L'itinéraire, journée par journée."
      />

      <p className="mb-8 max-w-2xl text-base leading-[1.75] text-gray-600 md:text-[17px]">
        Charge une trace — celle d&rsquo;une aventure à venir comme celle d&rsquo;une sortie déjà
        faite — découpe-la en journées, ajoute tes photos et tes mots, puis exporte le lot. La
        trace et les photos sont lues dans le navigateur&nbsp;: rien n&rsquo;est envoyé sur nos
        serveurs.
      </p>

      <CarrouselAtelier />
    </div>
  );
}
