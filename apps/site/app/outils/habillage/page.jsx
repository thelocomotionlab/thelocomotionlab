// app/outils/habillage/page.jsx
//
// Habiller une photo de sortie : profil altimétrique, distance, D+, D−, la
// signature du labo — au format story, dans la zone qu'Instagram ne recouvre
// pas. L'atelier lui-même est un composant client (canvas) ; cette page ne
// porte que le cadre et les métadonnées.
//
// `noindex` : c'est un outil d'atelier, pas une page de contenu. Il n'est pas
// listé dans /outils non plus — l'ouvrir depuis l'app installée suffit.
import PageHeader from "@/components/PageHeader";
import HabillagePhoto from "@/components/outils/HabillagePhoto";

export const metadata = {
  title: "Habiller une photo – The Locomotion Lab",
  description:
    "Poser le profil altimétrique, la distance et le dénivelé d'une sortie sur une photo, au format story. Tout se fait dans le navigateur : rien n'est envoyé.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: "https://thelocomotionlab.com/outils/habillage",
  },
};

export default function HabillagePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <PageHeader
        title="Habiller une photo"
        tagline="Le relief de la sortie, posé sur l'image."
      />

      <p className="mb-8 max-w-2xl text-base leading-[1.75] text-gray-600 md:text-[17px]">
        Partage ta dernière sortie sur les réseaux aux couleurs du labo. Fournis ta photo et le GPX
        de ta sortie. Les deux sont lues qui purgés, rien n'est stocké sur nos serveurs.{" "}
      </p>

      <HabillagePhoto />
    </div>
  );
}
