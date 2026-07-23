// components/live/ProgressionCard.jsx
//
// Bloc Progression (design 2a/2d) : pourcentage, barre en dégradé ambre,
// parcourus/restants, D+, temps écoulé. L'encart « Arrivée estimée » de la
// maquette est OMIS : le pronostic d'arrivée est hors-scope strict (brief §12).

"use client";

import { formatElapsed } from "@/lib/liveTime";

const KM = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function ProgressionCard({ stats, totalKm, elapsedSeconds }) {
  const doneKm = (stats?.distance ?? 0) / 1000;
  const percent = Math.min(100, totalKm > 0 ? (doneKm / totalKm) * 100 : 0);
  const remainingKm = totalKm > 0 ? Math.max(0, totalKm - doneKm) : 0;
  const dplus = Math.round(stats?.dplus ?? 0).toLocaleString("fr-FR");

  return (
    <section className="rounded-[18px] border border-brand-text/10 bg-white px-[18px] pb-5 pt-[18px] shadow-[0_6px_20px_rgba(51,51,51,0.06)] lg:px-5 lg:shadow-none">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep-dark">
        Progression
      </p>

      <div className="mt-2 flex items-baseline gap-[7px]">
        <span className="font-heading text-[40px] font-bold leading-[0.9] text-brand-text lg:text-[38px]">
          {PCT.format(percent)}
        </span>
        <span className="font-heading text-lg font-medium text-brand-deep-dark lg:text-[17px]">
          %
        </span>
      </div>

      <div className="mt-3 h-2.5 overflow-hidden rounded-[10px] bg-brand-text/10">
        <div
          className="h-full rounded-[10px] bg-gradient-to-r from-brand-accent to-brand-accent-dark"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-[7px] flex justify-between font-heading text-[11.5px] text-brand-text/65">
        <span>{KM.format(doneKm)} km parcourus</span>
        <span>{KM.format(remainingKm)} km restants</span>
      </div>

      <div className="my-[15px] h-px bg-brand-text/10 lg:hidden" />
      <div className="grid grid-cols-2 gap-3.5 lg:mt-4">
        <div>
          <p className="font-heading text-[10px] font-medium uppercase tracking-[0.1em] text-brand-text/55">
            Dénivelé +
          </p>
          <p className="mt-0.5 font-heading text-[19px] font-bold text-brand-text lg:text-lg">
            {dplus}
            <span className="text-xs font-normal text-brand-text/55"> m</span>
          </p>
        </div>
        <div>
          <p className="font-heading text-[10px] font-medium uppercase tracking-[0.1em] text-brand-text/55">
            Temps écoulé
          </p>
          <p className="mt-0.5 font-heading text-[19px] font-bold text-brand-text lg:text-lg">
            {formatElapsed(elapsedSeconds)}
          </p>
        </div>
      </div>
    </section>
  );
}
