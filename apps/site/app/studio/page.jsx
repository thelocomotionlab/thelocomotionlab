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
  return (
    <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
      <Studio />
    </div>
  );
}
