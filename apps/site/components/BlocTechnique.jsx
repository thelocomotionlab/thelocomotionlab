// components/BlocTechnique.jsx
//
// Le bloc technique d'une expédition : intention, dates, distance, dénivelé —
// LUS depuis l'archive de l'aventure (public/replays/<slug>/aventure.json), pas
// écrits dans le markdown. Une expédition dont l'archive n'existe pas n'affiche
// rien : son corps porte déjà sa ligne de chiffres.

import Link from "next/link";

function Donnee({ label, valeur }) {
  if (!valeur) return null;
  return (
    <div>
      <dt className="font-heading text-[11px] uppercase tracking-[0.1em] text-gray-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-[15px] font-semibold text-brand-deep">
        {valeur}
      </dd>
    </div>
  );
}

export default function BlocTechnique({ archive }) {
  if (!archive) return null;

  const km = Number.isFinite(archive.distanceKm)
    ? `${archive.distanceKm.toLocaleString("fr-FR")} km`
    : null;
  const dplus = Number.isFinite(archive.deniveleM)
    ? `${archive.deniveleM.toLocaleString("fr-FR")} m`
    : null;

  return (
    <section
      aria-label="Fiche technique de l'aventure"
      className="mb-10 rounded-2xl border border-brand-primary-dark/25 bg-white/70 p-5 md:p-6"
    >
      {archive.intention ? (
        <p className="mb-4 font-lora text-[15px] italic text-gray-700">
          {archive.intention}
        </p>
      ) : null}

      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        <Donnee label="Dates" valeur={archive.dates} />
        <Donnee label="Distance" valeur={km} />
        <Donnee label="Dénivelé" valeur={dplus} />
      </dl>

      <Link
        href={`/live/archives/${archive.slug}`}
        className="mt-4 inline-block text-sm font-semibold text-brand-deep hover:underline"
      >
        Revoir le direct en entier
      </Link>
    </section>
  );
}
