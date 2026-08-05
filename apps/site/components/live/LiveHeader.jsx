// components/live/LiveHeader.jsx
//
// En-tête de l'état « En cours ». Titre bleu (comme le reste du site), jour
// de l'aventure dessous, badge figé (EN DIRECT / PARCOURS FIGÉ). En desktop,
// le sélecteur de fond de carte vient s'y loger. Ni logo ni « The Locomotion
// Lab » (recette 2026-07-24).
//
// Les kilomètres et le dénivelé du PARCOURS ne sont plus ici : ils ont rejoint
// la ligne au-dessus de la carte (ItineraireLine), partagée avec l'état Avant.
// Ils y étaient en Lora italique, une typographie qui ne servait qu'ici.

"use client";

import MapStyleSwitch from "./MapStyleSwitch";

/** Jour de l'aventure, sous le titre. */
function Jour({ jour, className }) {
  return (
    <p
      className={`m-0 font-heading font-bold uppercase tracking-[0.16em] text-brand-deep-dark ${className}`}
    >
      Jour {jour}
    </p>
  );
}

export default function LiveHeader({ aventure, jour, running = true, mapStyle, onMapStyle }) {
  return (
    <div className="flex flex-col gap-2.5 pt-1 pb-3.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      {/* Mobile : badge seul en tête (l'ancien logo + wordmark est retiré). */}
      <div className="flex justify-end lg:hidden">
        <LiveBadge running={running} />
      </div>

      {/* Desktop : titre + badge, stats dessous. */}
      <div className="max-lg:hidden">
        <div className="flex items-center gap-3">
          <h1 className="m-0 font-heading text-[23px] font-bold text-brand-slate-dark">
            {aventure.nom}
          </h1>
          <LiveBadge desktop running={running} />
        </div>
        <Jour jour={jour} className="mt-1.5 text-[11px]" />
      </div>

      {/* Mobile : titre + stats. */}
      <div className="lg:hidden">
        <h1 className="m-0 font-heading text-[21px] font-bold leading-[1.15] text-brand-slate-dark">
          {aventure.nom}
        </h1>
        <Jour jour={jour} className="mt-1.5 text-[10.5px]" />
      </div>

      {/* Le sélecteur de fond de carte quitte la carte pour le header (desktop). */}
      <div className="max-lg:hidden">
        <MapStyleSwitch value={mapStyle} onChange={onMapStyle} variant="header" />
      </div>
    </div>
  );
}

function LiveBadge({ desktop = false, running = true }) {
  // Figé en marron (pas de clignotement) : « EN DIRECT » tant que le tracker
  // tourne, « TERMINÉ » dès `./track stop` (la page reste consultable telle
  // quelle, jusqu'à l'archivage définitif depuis un ordinateur).
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[20px] font-heading font-bold tracking-[0.1em] ${
        running ? "bg-brand-deep text-brand-bg" : "bg-brand-primary-dark text-brand-bg"
      } ${desktop ? "px-3 py-[5px] text-[11px]" : "px-[11px] py-[5px] text-[10.5px]"}`}
    >
      <span className="inline-block h-[7px] w-[7px] rounded-full bg-brand-bg" />
      {running ? "EN DIRECT" : "TERMINÉ"}
    </span>
  );
}
