// components/PhotoSlot.jsx
//
// Emplacement photo de la page Pratiquer : rend l'image (next/image, cover)
// quand `src` est fourni, sinon un placeholder charte discret (lavis bleu +
// quadrillage labo) en attendant les photos du client. Dimensionner via
// `className` (hauteur, rounded, …).

import Image from "next/image";

export default function PhotoSlot({ src = "", alt = "", sizes, className = "" }) {
  if (src) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image src={src} alt={alt} fill className="object-cover" sizes={sizes} />
      </div>
    );
  }
  return (
    <div
      className={`bg-brand-wash/45 bg-lab-grid-blue [background-size:28px_28px] ${className}`}
      aria-hidden="true"
    />
  );
}
