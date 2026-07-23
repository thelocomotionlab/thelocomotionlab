// components/live/FreshnessPill.jsx
//
// Indicateur de fraîcheur, en overlay bas-gauche de la carte. Trois régimes
// (lib/freshness.js) : premier signal (texte validé PR1 §13), normal (point
// pulsant terracotta), zone blanche (glyphe montagne — information de terrain,
// jamais une alerte).

"use client";

import { brandColors } from "@locomotionlab/ui";

export default function FreshnessPill({ state }) {
  if (!state) return null;

  return (
    <div className="absolute bottom-3 left-3 z-[5] inline-flex items-center gap-2 rounded-xl bg-brand-bg/95 px-[13px] py-2 shadow-[0_4px_14px_rgba(51,51,51,0.18)] lg:bottom-3.5 lg:left-3.5 lg:px-3.5 lg:py-[9px]">
      {state.regime === "zone-blanche" ? (
        <svg width="15" height="12" viewBox="0 0 15 12" className="flex-none" aria-hidden="true">
          <path
            d="M1 11 L5.5 3 L8 7 L10 4 L14 11 Z"
            fill="none"
            stroke={brandColors.deepDark}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ) : state.regime === "termine" ? (
        // Aventure terminée (après ./track stop) : pastille pleine, statique.
        <span className="h-[9px] w-[9px] flex-none rounded-full bg-brand-primary-dark" />
      ) : (
        <span className="relative h-[9px] w-[9px] flex-none">
          <span
            className={`absolute inset-0 rounded-full ${
              state.regime === "premier-signal" ? "bg-brand-primary" : "bg-brand-deep"
            }`}
          />
          <span
            className={`absolute inset-0 animate-[ll-pulse_2s_ease-out_infinite] rounded-full ${
              state.regime === "premier-signal" ? "bg-brand-primary" : "bg-brand-deep"
            }`}
          />
        </span>
      )}
      <span className="font-heading text-xs font-medium text-brand-text lg:text-[12.5px]">
        {state.strong && <strong className="font-bold">{state.strong}</strong>}
        {state.rest}
      </span>
    </div>
  );
}
