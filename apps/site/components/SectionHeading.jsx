// components/SectionHeading.jsx
//
// Titre de section commun : le titre contre un filet qui court sous toute la
// largeur — le motif des sections de la maquette. Source unique, utilisée par
// les pages secondaires et la page Live.

export default function SectionHeading({ children, className = "" }) {
  return (
    <div
      className={`flex items-baseline gap-3.5 border-b border-brand-hairline pb-2.5 ${className}`}
    >
      <h2 className="m-0 font-heading text-2xl font-bold text-brand-deep md:text-[26px]">
        {children}
      </h2>
    </div>
  );
}
