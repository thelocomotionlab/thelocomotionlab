"use client";

// components/Feuille.tsx
//
// LA FEUILLE DU BAS : UN SEUL RÉGLAGE À LA FOIS.
//
// C'est le modèle de Canva sur téléphone, et il tient à une contrainte : la
// feuille ne dépasse jamais 40 % de la hauteur. La planche reste visible
// au-dessus, donc le réglage se voit en direct — un panneau plein écran
// obligerait à fermer pour regarder, puis rouvrir pour corriger.

import { X } from "lucide-react";
import type { ReactNode } from "react";

export default function Feuille({
  titre,
  onFermer,
  children,
}: {
  titre: string;
  onFermer: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-label={titre}
      className="absolute inset-x-0 bottom-0 z-40 flex max-h-[40dvh] flex-col rounded-t-xl border-t border-brand-field bg-brand-paper shadow-card"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-brand-hairline px-3 py-2">
        <h2 className="text-[13px] font-medium">{titre}</h2>
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer"
          className="rounded-md p-1.5 text-brand-soft transition-colors hover:bg-brand-primary/12 motion-reduce:transition-none"
        >
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">{children}</div>
    </div>
  );
}
