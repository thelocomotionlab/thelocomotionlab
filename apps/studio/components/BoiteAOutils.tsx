"use client";

// components/BoiteAOutils.tsx
//
// QUATRE OUTILS, POSÉS SUR LE PLAN DE TRAVAIL.
//
// `V` prend, `T` pose un texte, `R` une forme, `L` une ligne. C'est une palette
// flottante et non une colonne de plus : elle appartient au plan de travail, se
// prend au clavier d'une lettre, et se range dès qu'on a posé.

import { MousePointer2, Minus, Square, Type, type LucideIcon } from "lucide-react";

import type { Outil } from "@/lib/usePosteDeTravail";

const OUTILS: { cle: Outil; label: string; Icone: LucideIcon }[] = [
  { cle: "V", label: "Sélection", Icone: MousePointer2 },
  { cle: "T", label: "Texte", Icone: Type },
  { cle: "R", label: "Rectangle", Icone: Square },
  { cle: "L", label: "Ligne", Icone: Minus },
];

export default function BoiteAOutils({
  actif,
  onChange,
}: {
  actif: Outil;
  onChange: (o: Outil) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Outils"
      className="pointer-events-auto absolute left-3 top-3 flex flex-col gap-0.5 rounded-lg border border-brand-field bg-brand-paper p-1 shadow-card"
    >
      {OUTILS.map(({ cle, label, Icone }) => (
        <button
          key={cle}
          type="button"
          onClick={() => onChange(cle)}
          aria-pressed={actif === cle}
          aria-label={`${label} — ${cle}`}
          title={`${label} — ${cle}`}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors motion-reduce:transition-none ${
            actif === cle
              ? "bg-brand-primary-dark text-brand-bg"
              : "text-brand-soft hover:bg-brand-primary/12 hover:text-brand-text"
          }`}
        >
          <Icone size={16} strokeWidth={1.75} aria-hidden />
        </button>
      ))}
    </div>
  );
}
