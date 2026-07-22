// components/SectionHeading.jsx
//
// Titre de section commun (refonte 2026) : Lora italique terracotta + filet
// chaud aligné sur la ligne de base. Source unique du motif — utilisé par
// Pratiquer, le pilier Explorer et la page Live (avant : deux variantes
// locales qui divergeaient de 1 px et de couleur de filet).

export default function SectionHeading({ children, className = "" }) {
  return (
    <div className={`flex items-baseline gap-3.5 md:gap-5 ${className}`}>
      <h2 className="flex-none font-lora text-2xl font-medium italic text-brand-deep md:text-[28px]">
        {children}
      </h2>
      <div className="h-px flex-1 bg-brand-hairline" aria-hidden="true" />
    </div>
  );
}
