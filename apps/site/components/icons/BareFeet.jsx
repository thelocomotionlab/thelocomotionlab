// components/icons/BareFeet.jsx
//
// Deux empreintes de pieds nus en foulée (pied gauche un pas devant, gros
// orteils vers l'intérieur), redessinées d'après une empreinte à l'encre :
// plante en contour — avant-pied large et légèrement asymétrique (plus haut
// côté gros orteil), voûte creusée, talon rond — + trois orteils pleins
// bien visibles, dans l'esprit du PawPrint lucide adapté au pied (3 gros
// cercles décroissants plutôt que 5 points qui fusionnent à 18 px).
// Grammaire lucide stricte (24×24, trait 2, bouts ronds, currentColor) et
// même signature (size, className) pour rester interchangeable dans la
// Navbar. Itérée sur rendu réel à 18 px.

// Pied DROIT, orteils vers le haut, gros orteil à gauche ; le gauche est le
// même tracé en miroir (scale(-1 1)).
const SOLE =
  "M -3.1 -0.6 C -3.3 0.6 -2.45 1.55 -1.7 2.55 C -1.0 3.5 -1.35 4.35 -1.8 5.35 C -2.35 6.9 -1.3 7.8 0.1 7.8 C 1.5 7.8 2.35 6.85 2.2 5.5 C 2.05 4.2 1.75 3.3 1.95 2.1 C 2.15 0.9 3.0 0.25 3.05 -0.95 C 3.1 -2.2 2.0 -3.05 0.35 -3.2 C -1.5 -3.4 -2.85 -2.0 -3.1 -0.6 Z";

// Orteils [cx, cy, r] : gros orteil dominant puis décroissance, avec du
// jour entre chaque cercle et avec la plante (vérifié au rendu).
const TOES = [
  [-2.4, -5.65, 1.55],
  [0.3, -6.1, 1.05],
  [2.4, -5.15, 0.92],
];

function Foot({ transform }) {
  return (
    <g transform={transform}>
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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <Foot transform="translate(7.2 7.5) rotate(-10) scale(-1 1)" />
      <Foot transform="translate(16.8 14.0) rotate(10)" />
    </svg>
  );
}
