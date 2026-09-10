"use client";

// components/Rail.tsx
//
// LE RAIL (64 px) : sept entrées, dans l'ordre où l'on compose — Modèles,
// Texte, Médias, Données, Éléments, Calques, Projets.
//
// Le rail sert à AJOUTER ; l'inspecteur, à régler ce qui est sélectionné. C'est
// tout le renversement par rapport aux six onglets « par genre de chose » de la
// v1, où le titre se saisissait dans « Texte », sa police dans « Allure ›
// Polices » et son filet dans « Texte › Titre ».

import {
  FolderOpen,
  Images,
  Layers,
  LayoutTemplate,
  Route,
  Shapes,
  Type,
  type LucideIcon,
} from "lucide-react";

import type { CleTiroir } from "@/lib/usePosteDeTravail";

export const TIROIRS: { cle: CleTiroir; label: string; Icone: LucideIcon }[] = [
  { cle: "modeles", label: "Modèles", Icone: LayoutTemplate },
  { cle: "texte", label: "Texte", Icone: Type },
  { cle: "medias", label: "Médias", Icone: Images },
  { cle: "donnees", label: "Données", Icone: Route },
  { cle: "elements", label: "Éléments", Icone: Shapes },
  { cle: "calques", label: "Calques", Icone: Layers },
  { cle: "projets", label: "Projets", Icone: FolderOpen },
];

export default function Rail({
  actif,
  onChange,
}: {
  actif: CleTiroir | null;
  onChange: (cle: CleTiroir | null) => void;
}) {
  return (
    <nav
      aria-label="Ajouter"
      className="flex w-16 shrink-0 flex-col gap-0.5 border-r border-brand-field bg-brand-paper py-1.5"
    >
      {TIROIRS.map(({ cle, label, Icone }) => {
        const ouvert = actif === cle;
        return (
          <button
            key={cle}
            type="button"
            // Recliquer sur l'entrée ouverte REPLIE le tiroir : le poste de
            // travail redevient canvas + inspecteur, ce qui est le réglage de
            // travail sur un petit écran d'ordinateur portable.
            onClick={() => onChange(ouvert ? null : cle)}
            aria-current={ouvert ? "page" : undefined}
            className={`mx-1.5 flex flex-col items-center gap-1 rounded-md py-2 transition-colors motion-reduce:transition-none ${
              ouvert
                ? "bg-brand-primary-dark text-brand-bg"
                : "text-brand-soft hover:bg-brand-primary/12 hover:text-brand-text"
            }`}
          >
            <Icone size={20} strokeWidth={1.75} aria-hidden />
            <span className="text-[10px] leading-none">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
