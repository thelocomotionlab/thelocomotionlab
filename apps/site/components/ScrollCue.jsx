// components/ScrollCue.jsx
//
// Petit indicateur de défilement des listes scrollables (carrousels
// verticaux mobiles, registre des articles) : chevron rond qui clignote
// doucement, cliquable pour faire défiler d'un cran. `tone` : "light"
// (fond crème) ou "dark" (photo sombre).

"use client";

import { ChevronDown } from "lucide-react";

const TONES = {
  light: "border-brand-primary-dark/40 text-brand-primary-dark",
  dark: "border-white/50 text-white/90",
};

export default function ScrollCue({
  onClick,
  tone = "light",
  className = "",
  label = "Faire défiler la liste",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`mx-auto flex h-7 w-7 cursor-pointer animate-[ll-blink_2.6s_ease-in-out_infinite] items-center justify-center rounded-full border ${
        TONES[tone] ?? TONES.light
      } ${className}`}
    >
      <ChevronDown size={16} aria-hidden="true" />
    </button>
  );
}
