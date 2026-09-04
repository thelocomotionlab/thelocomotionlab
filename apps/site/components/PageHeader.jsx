// components/PageHeader.jsx
//
// En-tête de page commun (identité refonte 2026) : titre Ubuntu gras bleu
// profond, tagline en Lora italique terracotta, court liseré ocre. Aligné à
// gauche par défaut.
//
// Les kickers « / SCIENCE », « / TERRAIN »… ont été retirés du site (audit
// des titres, 08/2026) : ils répétaient le pilier déjà porté par le titre et
// par la navigation. Ne pas les réintroduire ici.
//
// ⚠️ La tagline est un <p> FRÈRE du <h1>, jamais un enfant. Quand elle vivait
// dans le titre (<span> interne), le H1 réel valait « ComprendreLa science
// derrière les concepts. » — deux phrases collées, servies telles quelles aux
// moteurs de recherche et aux lecteurs d'écran.

export default function PageHeader({ title, tagline = null, className = "" }) {
  return (
    <header className={`mb-10 ${className}`}>
      <h1 className="font-heading text-4xl font-bold text-brand-slate-dark md:text-5xl">
        {title}
      </h1>
      {tagline ? (
        <p className="mt-2 font-lora text-[22px] font-medium italic text-brand-deep md:text-[26px]">
          {tagline}
        </p>
      ) : null}
      <div
        className="mt-5 h-[3px] w-16 rounded-full bg-brand-accent"
        aria-hidden="true"
      />
    </header>
  );
}
