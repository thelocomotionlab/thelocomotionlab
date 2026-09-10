// app/page.tsx
//
// LE STUDIO — le poste de travail des visuels du labo.
//
// Une seule page, plein écran, sans rien qui défile : un poste de travail n'est
// pas un document, il tient dans l'écran et c'est le panneau qui défile.
//
// PAS DE MOT DE PASSE. Décision assumée : le studio ne porte aucune donnée,
// aucun secret, aucun appel serveur — il n'y a rien à protéger derrière. Tout
// vit dans le navigateur de Valentin, et cette app n'est liée de nulle part.

import PosteDeTravail from "@/components/PosteDeTravail";

export default function Page() {
  return <PosteDeTravail />;
}
