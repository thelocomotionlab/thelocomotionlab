// components/live/LiveHeader.jsx
//
// En-tête de l'état « En cours » (design 2a / 2d) : identité, badge EN DIRECT
// clignotant, titre, ligne de stats avec le Jour courant. En desktop, le
// sélecteur Topo/Satellite vient s'y loger (2d).

"use client";

import MapStyleSwitch from "./MapStyleSwitch";

function Dot() {
  return <span className="text-brand-text/30">·</span>;
}

export default function LiveHeader({ aventure, distanceKm, deniveleM, jour, mapStyle, onMapStyle }) {
  // Stats de la trace : « — » le temps (bref) que le .track.json se charge.
  const km = Number.isFinite(distanceKm) ? Math.round(distanceKm) : "—";
  const dPlus = Number.isFinite(deniveleM) ? Math.round(deniveleM).toLocaleString("fr-FR") : "—";

  return (
    <div className="flex flex-col gap-2.5 pt-1 pb-3.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <div className="flex items-center justify-between lg:hidden">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-brand-primary">
            <span className="h-[13px] w-[13px] -rotate-[30deg] rounded-full border-[2.2px] border-brand-bg border-r-transparent" />
          </span>
          <span className="font-heading text-xs font-medium text-brand-text">
            The Locomotion Lab
          </span>
        </div>
        <LiveBadge />
      </div>

      <div className="flex items-center gap-3 max-lg:hidden">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-primary">
          <span className="h-4 w-4 -rotate-[30deg] rounded-full border-[2.6px] border-brand-bg border-r-transparent" />
        </span>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="m-0 font-heading text-[23px] font-bold text-brand-text">
              {aventure.nom}
            </h1>
            <LiveBadge desktop />
          </div>
          <div className="mt-1 flex gap-3.5 font-heading text-[13px] text-brand-text/65">
            <span>The Locomotion Lab</span>
            <Dot />
            <span>
              <strong className="font-bold text-brand-text">{km}</strong> km
            </span>
            <Dot />
            <span>
              <strong className="font-bold text-brand-text">{dPlus}</strong> m D+
            </span>
            <Dot />
            <span>Jour {jour}</span>
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        <h1 className="m-0 font-heading text-[21px] font-bold leading-[1.15] text-brand-text">
          {aventure.nom}
        </h1>
        <div className="mt-1.5 flex gap-3 font-heading text-[12.5px] text-brand-text/65">
          <span>
            <strong className="font-bold text-brand-text">{km}</strong> km
          </span>
          <Dot />
          <span>
            <strong className="font-bold text-brand-text">{dPlus}</strong> m D+
          </span>
          <Dot />
          <span>Jour {jour}</span>
        </div>
      </div>

      {/* 2d : le sélecteur de fond de carte quitte la carte pour le header. */}
      <div className="max-lg:hidden">
        <MapStyleSwitch value={mapStyle} onChange={onMapStyle} variant="header" />
      </div>
    </div>
  );
}

function LiveBadge({ desktop = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[20px] bg-brand-deep font-mono font-bold tracking-[0.1em] text-brand-bg ${
        desktop ? "px-3 py-[5px] text-[11px]" : "px-[11px] py-[5px] text-[10.5px]"
      }`}
    >
      <span className="inline-block h-[7px] w-[7px] animate-[ll-blink_1.1s_ease-in-out_infinite] rounded-full bg-brand-bg" />
      EN DIRECT
    </span>
  );
}
