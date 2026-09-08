// components/contenu/Apercu.jsx
//
// L'APERÇU D'UNE ENTRÉE dans une liste : deux lignes, pas plus.
//
// Ce qu'on choisit dans un registre, c'est un titre ; l'aperçu ne fait que
// donner le ton. Étalé sur cinq lignes il concurrence le titre et allonge la
// liste — sur téléphone, une entrée occupait la moitié de l'écran.
//
// La coupe est un fondu et non un bord net : le texte est plein sur la
// première ligne puis s'efface au fil de la seconde, ce qui se lit comme
// « la suite est ailleurs » plutôt que comme un défaut d'affichage. Le texte
// entier reste dans le document, donc lu par une synthèse vocale.

// À l'interligne `normal`, une ligne occupe 1,5em. La première reste donc
// PLEINE — le fondu ne commence qu'à 1,5em — et la seconde s'efface au fil de
// sa course, jusqu'à 2,7em, soit un peu moins de deux lignes en tout.
const HAUTEUR = "max-h-[2.7em]";
const FONDU =
  "[-webkit-mask-image:linear-gradient(to_bottom,#000_1.5em,transparent_2.65em)] [mask-image:linear-gradient(to_bottom,#000_1.5em,transparent_2.65em)]";

export default function Apercu({ children, className = "" }) {
  if (!children) return null;

  return (
    <span className={`block overflow-hidden leading-normal ${HAUTEUR} ${FONDU} ${className}`}>
      {children}
    </span>
  );
}
