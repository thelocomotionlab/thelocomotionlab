// components/contenu/Apercu.jsx
//
// L'APERÇU D'UNE ENTRÉE dans une liste : une ligne et demie, pas plus.
//
// Ce qu'on choisit dans un registre, c'est un titre ; l'aperçu ne fait que
// donner le ton. Étalé sur cinq lignes il concurrence le titre et allonge la
// liste — sur téléphone, une entrée occupait la moitié de l'écran.
//
// La coupe est un fondu et non un bord net : le texte est plein sur la
// première ligne puis s'efface au fil de la seconde, ce qui se lit comme
// « la suite est ailleurs » plutôt que comme un défaut d'affichage. Le texte
// entier reste dans le document, donc lu par une synthèse vocale.

/** 1,5 ligne à l'interligne `normal` (1,5) : 2,25em. */
const HAUTEUR = "max-h-[2.25em]";
const FONDU =
  "[-webkit-mask-image:linear-gradient(to_bottom,#000_1.15em,transparent_2.2em)] [mask-image:linear-gradient(to_bottom,#000_1.15em,transparent_2.2em)]";

export default function Apercu({ children, className = "" }) {
  if (!children) return null;

  return (
    <span className={`block overflow-hidden leading-normal ${HAUTEUR} ${FONDU} ${className}`}>
      {children}
    </span>
  );
}
