// components/icons/BareFeet.jsx
//
// Deux empreintes de pieds nus, dessinées d'après le pied du logo Locomotion
// Lab : plante en CONTOUR (avant-pied large, voûte creusée, talon rond) +
// cinq orteils décroissants, paire gauche/droite en quinconce de marche
// (gros orteils vers l'intérieur). Même signature que les icônes lucide
// (size, className, currentColor) pour rester interchangeable dans la Navbar.

// Pied DROIT, orteils vers le haut, gros orteil à gauche ; le pied gauche est
// le même tracé en miroir (scale(-…)).
const SOLE =
  "M 0 -0.2 C 2.0 -0.2 3.4 0.9 3.6 2.6 C 3.9 4.9 2.6 6.3 2.7 8.1 C 2.8 9.9 3.1 11.0 3.0 12.7 C 2.9 14.6 1.6 15.9 0.1 15.9 C -1.4 15.9 -2.5 14.6 -2.4 13.0 C -2.3 11.4 -1.1 10.4 -1.2 8.5 C -1.3 6.5 -3.5 5.0 -3.7 3.0 C -3.9 0.9 -2.0 -0.2 0 -0.2 Z";

// Orteils [cx, cy, rayon], du gros orteil au petit.
const TOES = [
  [-3.0, -2.0, 1.45],
  [-1.2, -2.9, 1.0],
  [0.5, -3.1, 0.9],
  [2.1, -2.6, 0.8],
  [3.3, -1.8, 0.7],
];

function Foot({ transform }) {
  return (
    <g transform={transform} strokeWidth="2.6">
      <path d={SOLE} fill="none" />
      {TOES.map(([cx, cy, r]) => (
        <circle key={cx} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
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
      {/* Pied gauche, un demi-pas devant (miroir du tracé) */}
      <Foot transform="translate(7.2 6.0) rotate(-8) scale(-0.75 0.75)" />
      {/* Pied droit */}
      <Foot transform="translate(16.8 8.6) rotate(8) scale(0.75 0.75)" />
    </svg>
  );
}
