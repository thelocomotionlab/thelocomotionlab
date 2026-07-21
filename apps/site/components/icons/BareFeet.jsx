// components/icons/BareFeet.jsx
//
// Empreintes de pieds NUS (plante + orteils), style lucide : 24×24, trait 2,
// currentColor. lucide-react n'a que `Footprints`, qui évoque des semelles de
// chaussures — ici on marche pieds nus. Même signature que les icônes lucide
// (size, className) pour rester interchangeable dans la Navbar.

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
      {/* Pied gauche (bas-gauche), légèrement tourné vers l'extérieur */}
      <g transform="rotate(-12 8 14)">
        <ellipse cx="8" cy="14.5" rx="2.5" ry="4" />
        <path d="M5.1 9h.01" />
        <path d="M7.9 7.9h.01" />
        <path d="M10.6 8.8h.01" />
      </g>
      {/* Pied droit (haut-droite) */}
      <g transform="rotate(12 16 9)">
        <ellipse cx="16" cy="9.5" rx="2.5" ry="4" />
        <path d="M13.4 3.8h.01" />
        <path d="M16.1 2.9h.01" />
        <path d="M18.9 4h.01" />
      </g>
    </svg>
  );
}
