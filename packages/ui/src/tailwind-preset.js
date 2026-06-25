// packages/ui/src/tailwind-preset.js
//
// Preset Tailwind partagé = source unique de la config "plugins" de la charte.
//
// NB (Tailwind v4) : une config JS n'est PAS chargée automatiquement ; il faut
// la référencer explicitement depuis le CSS via `@config`. Le site historique
// ne le fait pas — ce preset reproduit donc la config existante SANS modifier le
// rendu actuel. Pour l'activer dans une app, ajouter dans son globals.css :
//     @config "../tailwind.config.mjs";
// (le tailwind.config.mjs de l'app ré-exportant ce preset).

import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
const preset = {
  plugins: [typography],
};

export default preset;
