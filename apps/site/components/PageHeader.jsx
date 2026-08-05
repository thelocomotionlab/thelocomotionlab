// components/PageHeader.jsx
//
// En-tête de page commun (identité refonte 2026) : kicker Ubuntu Mono,
// titre Ubuntu gras bleu profond, tagline en Lora italique terracotta,
// court liseré ocre. Aligné à gauche par défaut.

export default function PageHeader({
  kicker = null,
  title,
  tagline = null,
  className = "",
}) {
  return (
    <header className={`mb-10 ${className}`}>
      {kicker ? (
        <p className="mb-3 font-heading text-[13px] font-bold tracking-[0.25em] text-brand-slate">
          {kicker}
        </p>
      ) : null}
      <h1 className="font-heading text-4xl font-bold text-brand-slate-dark md:text-5xl">
        {title}
        {tagline ? (
          <span className="mt-2 block font-lora text-[22px] font-medium italic text-brand-deep md:text-[26px]">
            {tagline}
          </span>
        ) : null}
      </h1>
      <div
        className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent"
        aria-hidden="true"
      />
    </header>
  );
}
