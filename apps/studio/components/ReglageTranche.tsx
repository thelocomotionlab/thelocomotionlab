"use client";

// components/ReglageTranche.tsx
//
// QUELLES JOURNÉES LA PLANCHE MONTRE.
//
// Un seul réglage, à un seul endroit : carte, profil et chiffres le suivent.
// « Le tour » montre tout, « L'avancement » l'itinéraire jusqu'au soir du jour
// N — c'est la planche qui dit où on en est —, « La journée » le jour N seul.
//
// Sans découpage il n'y a rien à trancher : le contrôle le dit plutôt que de
// proposer des jours qui n'existent pas.

import type { Tranche } from "@locomotionlab/planche";

const MODES: { cle: Tranche["mode"]; label: string; aide: string }[] = [
  { cle: "toutes", label: "Le tour", aide: "L'itinéraire entier" },
  { cle: "jusqua", label: "L'avancement", aide: "Jusqu'au soir du jour choisi" },
  { cle: "seule", label: "La journée", aide: "Ce jour-là seulement" },
];

export default function ReglageTranche({
  tranche,
  jours,
  onChange,
  compact = false,
}: {
  tranche: Tranche;
  jours: number;
  onChange: (t: Tranche) => void;
  compact?: boolean;
}) {
  if (jours === 0) {
    return (
      <p className="text-[11px] leading-snug text-brand-muted">
        Aucune journée découpée — va dans Données pour couper la trace.
      </p>
    );
  }
  const jour = Math.max(0, Math.min(jours - 1, tranche.jour));
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.cle}
            type="button"
            onClick={() => onChange({ mode: m.cle, jour })}
            aria-pressed={tranche.mode === m.cle}
            title={m.aide}
            className={`flex-1 rounded-md border px-1.5 py-1 text-[11px] transition-colors motion-reduce:transition-none ${
              tranche.mode === m.cle
                ? "border-brand-primary-dark bg-brand-primary/12 text-brand-text"
                : "border-brand-field text-brand-soft hover:bg-brand-primary/8"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {tranche.mode !== "toutes" && (
        <label className="flex items-center gap-2 text-[12px] text-brand-soft">
          Jour
          <select
            value={jour}
            onChange={(e) => onChange({ mode: tranche.mode, jour: Number(e.target.value) })}
            className="tabulaire h-7 flex-1 rounded-md border border-brand-field bg-brand-bg px-1.5 text-[12px]"
          >
            {Array.from({ length: jours }, (_, i) => (
              <option key={i} value={i}>
                J{i + 1}
              </option>
            ))}
          </select>
        </label>
      )}

      {!compact && (
        <p className="text-[11px] leading-snug text-brand-muted">
          {MODES.find((m) => m.cle === tranche.mode)?.aide}. Carte, profil et chiffres suivent.
        </p>
      )}
    </div>
  );
}
