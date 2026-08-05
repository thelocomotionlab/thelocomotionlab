// components/live/ProgressionCard.jsx
//
// Bloc Progression : les TROIS chiffres du terrain (distance, D+, D−) sur une
// seule ligne, lisible d'un coup d'œil y compris en mobile ; le pourcentage et
// la barre en dessous, en retrait. C'est l'inverse de la première maquette, où
// le pourcentage occupait tout et où le dénivelé se cherchait — or en course,
// « où j'en suis » se lit dans les kilomètres et le dénivelé, pas dans un ratio.
//
// Le temps écoulé n'est PLUS ici : il vit sur la carte (ChronoBadge), où il
// bat la seconde.

"use client";

const KM = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const M = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Une des trois mesures de la ligne du haut. */
function Mesure({ label, valeur, unite }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="font-heading text-[9.5px] font-medium uppercase tracking-[0.08em] text-brand-text/55 lg:text-[10px]">
        {label}
      </p>
      <p className="mt-0.5 whitespace-nowrap font-heading text-[22px] font-bold leading-none text-brand-text lg:text-[24px]">
        {valeur}
        <span className="text-[11px] font-normal text-brand-text/55"> {unite}</span>
      </p>
    </div>
  );
}

export default function ProgressionCard({ stats, totalKm, avanceKm = null }) {
  // Deux grandeurs DIFFÉRENTES, et c'est voulu :
  //   • parcouruKm  = ce que les jambes ont fait (détours compris) — le chiffre
  //     qui doit coller à la montre ;
  //   • avanceKm    = où on en est SUR LE PARCOURS (projection, lib/progression).
  // Le pourcentage et le « restants » suivent le second : un aller-retour au
  // ravito ne fait pas avancer d'un mètre vers l'arrivée. Quand les deux
  // divergent, « parcourus + restants ≠ total » — c'est exact, pas un bug.
  const parcouruKm = (stats?.distance ?? 0) / 1000;
  const surTraceKm = Number.isFinite(avanceKm) ? avanceKm : parcouruKm;
  const percent = Math.min(100, totalKm > 0 ? (surTraceKm / totalKm) * 100 : 0);
  const remainingKm = totalKm > 0 ? Math.max(0, totalKm - surTraceKm) : 0;

  return (
    <section className="rounded-[18px] border border-brand-text/10 bg-white px-[18px] pb-[18px] pt-[18px] shadow-[0_6px_20px_rgba(51,51,51,0.06)] lg:px-5 lg:shadow-none">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep-dark">
        Progression
      </p>

      {/* Les trois chiffres, sur UNE ligne à toutes les tailles. Les libellés
          sont courts et les valeurs en `whitespace-nowrap` pour qu'un « 12 345 »
          ne casse jamais la ligne sur un petit écran. */}
      <div className="mt-3 flex items-start gap-2.5">
        <Mesure label="Distance" valeur={KM.format(parcouruKm)} unite="km" />
        <div className="mt-1 h-7 w-px flex-none bg-brand-text/10" aria-hidden="true" />
        <Mesure label="Dénivelé +" valeur={M.format(Math.round(stats?.dplus ?? 0))} unite="m" />
        <div className="mt-1 h-7 w-px flex-none bg-brand-text/10" aria-hidden="true" />
        <Mesure label="Dénivelé −" valeur={M.format(Math.round(stats?.dminus ?? 0))} unite="m" />
      </div>

      {/* Le pourcentage passe au second plan : petit, sur la ligne de la barre. */}
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <span className="font-heading text-[12px] text-brand-text/65">
          <span className="font-bold text-brand-text">{PCT.format(percent)} %</span> du parcours
        </span>
        <span className="font-heading text-[11.5px] text-brand-text/55">
          {KM.format(remainingKm)} km restants
        </span>
      </div>

      <div className="mt-1.5 h-2 overflow-hidden rounded-[10px] bg-brand-text/10">
        <div
          className="h-full rounded-[10px] bg-gradient-to-r from-brand-accent to-brand-accent-dark"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}
