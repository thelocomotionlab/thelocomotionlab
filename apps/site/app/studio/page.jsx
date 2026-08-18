// app/studio/page.jsx
//
// L'espace de création des visuels du labo. Deux ateliers, une seule page :
// les onglets ne rechargent rien et ne perdent rien (cf. components/studio).
//
// Page NON RÉFÉRENCÉE : `noindex` vient du layout, et aucun lien du site n'y
// mène. Ce n'est pas un contrôle d'accès — qui a l'URL entre — mais les deux
// ateliers ne portent ni donnée ni secret : tout se passe dans le navigateur.
//
// ⚠️ ON NE MET SURTOUT PAS `Disallow: /studio` DANS robots.txt. Ce fichier est
// public et lu en premier par qui cherche les coins discrets d'un site : y
// écrire le chemin le PUBLIERAIT au lieu de le cacher. Le `noindex` du layout
// fait mieux — il demande de ne pas indexer même à un robot qui a déjà l'URL.
import Studio from "@/components/studio/Studio";

export const metadata = {
  title: "Studio – The Locomotion Lab",
  description:
    "L'espace de création des visuels du labo : carrousels d'itinéraire et habillage de photos, entièrement dans le navigateur.",
  alternates: {
    canonical: "https://thelocomotionlab.com/studio",
  },
};

export default function StudioPage() {
  // LARGE, et peu de marge : l'atelier carrousel est un poste de travail (barre
  // du haut, rail, panneau, scène) et il lui faut la place d'un écran, pas la
  // colonne de lecture du site. Chaque atelier se re-cadre lui-même s'il en a
  // besoin (cf. components/studio/Studio.jsx).
  return (
    <div className="mx-auto max-w-[1600px] px-3 pb-6 pt-4 sm:px-5">
      <Studio />
    </div>
  );
}
