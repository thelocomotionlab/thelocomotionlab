// components/icons/BareFeet.jsx
//
// Deux empreintes de pieds nus, dessinées d'après le pied du logo Locomotion
// Lab : plante en CONTOUR (avant-pied large, voûte creusée, talon rond) +
// cinq orteils décroissants, paire gauche/droite en quinconce de marche
// (gros orteils vers l'intérieur). Même signature que les icônes lucide
// (size, className, currentColor) pour rester interchangeable dans la Navbar.

// Pied DROIT, orteils vers le haut, gros orteil à gauche ; le pied gauche est
// le même tracé en miroir (scale(-…)). La paire remplit la boîte 24×24 comme
// les glyphes lucide (~20×20 utiles) pour un poids visuel homogène en navbar.
const SOLE =
  "M 0 0 C 2.2 0 3.7 1.2 3.9 3.0 C 4.1 5.2 3.0 6.6 3.0 8.4 C 3.0 10.2 3.3 11.4 3.2 13.0 C 3.1 15.2 1.9 16.6 0.2 16.6 C -1.5 16.6 -2.7 15.2 -2.6 13.4 C -2.5 11.6 -1.2 10.6 -1.3 8.6 C -1.4 6.6 -3.8 5.2 -4.0 3.0 C -4.2 1.0 -2.2 0 0 0 Z";

// Orteils [cx, cy, rx, ry] : ovales allongés dans l'axe du pied, blottis
// contre le bol, gros orteil dominant puis décroissance vers le petit.
const TOES = [
  [-3.15, -2.1, 1.35, 1.6],
  [-1.35, -2.85, 0.88, 1.05],
  [0.25, -3.0, 0.78, 0.95],
  [1.8, -2.7, 0.7, 0.85],
  [3.1, -2.0, 0.62, 0.75],
];

function Foot({ transform }) {
  return (
    <g transform={transform} strokeWidth="2.55">
      <path d={SOLE} fill="none" />
      {TOES.map(([cx, cy, rx, ry]) => (
        <ellipse key={cx} cx={cx} cy={cy} rx={rx} ry={ry} fill="currentColor" stroke="none" />
      ))}
    </g>
  );
}

export default function BareFeet({ size = 24, className = "", ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Foulée : pied droit un pas devant, les deux légèrement ouverts vers
          l'extérieur, comme de vraies traces de marche. (Le tracé étant en
          miroir pour le pied gauche, son angle « ouvert » est positif.) */}
      <Foot transform="translate(7.6 10.4) rotate(9) scale(-0.78 0.78)" />
      <Foot transform="translate(16.2 4.2) rotate(-9) scale(0.78 0.78)" />
    </svg>
  );
}
