// components/SectionHeading.jsx
//
// Titre de section commun : Lora italique + filet chaud aligné sur la ligne de
// base. Source unique du motif — utilisé par Pratiquer, les deux piliers et la
// page Live. `aside` pose, après le filet, ce qu'une section compte : « 3
// concepts », « 14 · le cahier de labo », « 2026 · en cours ».

export default function SectionHeading({ children, aside = null, className = "" }) {
  return (
    <div className={`flex items-baseline gap-3.5 md:gap-5 ${className}`}>
      <h2 className="flex-none font-lora text-2xl font-medium italic text-brand-deep md:text-[28px]">
        {children}
      </h2>
      <div className="h-px flex-1 bg-brand-hairline" aria-hidden="true" />
      {aside ? (
        <span className="flex-none text-xs text-gray-500 tabular-nums">
          {aside}
        </span>
      ) : null}
    </div>
  );
}
