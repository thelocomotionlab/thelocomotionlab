// components/live/LiveHeader.jsx
//
// En-tête de l'état « En cours ». Titre bleu (comme le reste du site), ligne
// de stats dessous en Lora italique marron (km · D+ · Jour), badge figé
// (EN DIRECT / PARCOURS FIGÉ). En desktop, le sélecteur de fond de carte
// vient s'y loger. Ni logo ni « The Locomotion Lab » (recette 2026-07-24).

"use client";

import MapStyleSwitch from "./MapStyleSwitch";

function Dot() {
  return <span className="not-italic text-brand-deep/40">·</span>;
}

/** Ligne de stats sous le titre : Lora italique marron, chiffres en gras. */
function Stats({ km, dPlus, jour, className }) {
  return (
    <p className={`flex gap-3.5 font-lora italic text-brand-deep ${className}`}>
      <span>
        <strong className="font-bold">{km}</strong> km
      </span>
      <Dot />
      <span>
        <strong className="font-bold">{dPlus}</strong> m D+
      </span>
      <Dot />
      <span>Jour {jour}</span>
    </p>
  );
}

export default function LiveHeader({
  aventure,
  distanceKm,
  deniveleM,
  jour,
  running = true,
  mapStyle,
  onMapStyle,
}) {
  // Stats de la trace : « — » le temps (bref) que le .track.json se charge.
  const km = Number.isFinite(distanceKm) ? Math.round(distanceKm) : "—";
  const dPlus = Number.isFinite(deniveleM) ? Math.round(deniveleM).toLocaleString("fr-FR") : "—";

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
        <Stats km={km} dPlus={dPlus} jour={jour} className="mt-1 text-[13px]" />
      </div>

      {/* Mobile : titre + stats. */}
      <div className="lg:hidden">
        <h1 className="m-0 font-heading text-[21px] font-bold leading-[1.15] text-brand-slate-dark">
          {aventure.nom}
        </h1>
        <Stats km={km} dPlus={dPlus} jour={jour} className="mt-1 text-[12.5px]" />
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
  // tourne, « PARCOURS FIGÉ » une fois `./track stop` passé (page consultable).
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[20px] font-mono font-bold tracking-[0.1em] ${
        running ? "bg-brand-deep text-brand-bg" : "bg-brand-text/10 text-brand-text/70"
      } ${desktop ? "px-3 py-[5px] text-[11px]" : "px-[11px] py-[5px] text-[10.5px]"}`}
    >
      <span
        className={`inline-block h-[7px] w-[7px] rounded-full ${
          running ? "bg-brand-bg" : "bg-brand-text/40"
        }`}
      />
      {running ? "EN DIRECT" : "PARCOURS FIGÉ"}
    </span>
  );
}
