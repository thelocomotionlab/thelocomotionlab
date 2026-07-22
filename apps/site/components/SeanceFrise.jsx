// components/SeanceFrise.jsx
//
// Frise « une séance type » de la page Pratiquer. Les étapes sont des
// DONNÉES (tableau SEANCE_STEPS dans app/pratiquer/page.jsx) : les colonnes
// de la grille desktop sont générées depuis les étapes — la frise tient sur
// UNE ligne quel que soit leur nombre (l'étape `heart: true`, cœur de la
// séance, garde une colonne un peu plus large). Mobile : fil vertical.
// Les descriptions sont toujours visibles, sur les deux formats.
//
// Étape : { title, text, heart?, kicker?, chips? }.

export default function SeanceFrise({ steps }) {
  // Une colonne par étape — la frise tient sur une ligne par construction.
  const gridTemplateColumns = steps
    .map((s) => (s.heart ? "1.4fr" : "1fr"))
    .join(" ");

  return (
    <div className="relative">
      {/* Le fil : ligne horizontale en desktop, verticale en mobile, qui
          s'estompe vers la fin. */}
      <div
        className="absolute inset-x-0 top-[7px] hidden h-0.5 bg-[linear-gradient(90deg,var(--color-brand-accent)_0%,var(--color-brand-accent)_82%,color-mix(in_srgb,var(--color-brand-accent)_25%,transparent)_100%)] md:block"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-3.5 left-[7px] top-2 w-0.5 bg-[linear-gradient(180deg,var(--color-brand-accent)_0%,var(--color-brand-accent)_80%,color-mix(in_srgb,var(--color-brand-accent)_25%,transparent)_100%)] md:hidden"
        aria-hidden="true"
      />
      <ol
        className="flex list-none flex-col gap-[22px] md:grid md:gap-0"
        style={{ gridTemplateColumns }}
      >
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <li
              key={step.title}
              className={`relative pl-8 md:pl-0 ${isLast ? "" : "md:pr-[18px]"}`}
            >
              <span
                className={`absolute left-0 top-0.5 z-[2] block h-4 w-4 rounded-full border-[3px] border-white md:relative md:left-auto md:top-auto ${
                  step.heart
                    ? "bg-brand-deep shadow-[0_0_0_1.5px_var(--color-brand-deep)]"
                    : "bg-brand-accent shadow-[0_0_0_1.5px_var(--color-brand-accent)]"
                }`}
                aria-hidden="true"
              />
              {step.kicker ? (
                <p className="mb-[3px] mt-0 font-mono text-[10.5px] font-bold tracking-[0.16em] text-brand-deep md:mb-1 md:mt-4 md:text-[11px]">
                  {step.kicker}
                </p>
              ) : null}
              <p
                className={`mb-1 text-base font-bold leading-[1.3] text-brand-slate-dark md:mb-1.5 md:text-[16.5px] ${
                  step.kicker ? "" : "md:mt-4"
                }`}
              >
                {step.title}
              </p>
              <p className="text-[13.5px] leading-[1.55] text-gray-500">
                {step.text}
              </p>
              {step.chips?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5 md:mt-2.5 md:gap-2">
                  {step.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-brand-wash-line px-[9px] py-[3px] font-mono text-[10px] font-bold tracking-[0.08em] text-brand-slate md:px-2.5 md:text-[11px]"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
