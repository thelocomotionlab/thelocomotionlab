// tailwind.config.mjs
//
// Tailwind v4 : la source de vérité pour le design system (couleurs, polices,
// ombres, etc.) est le bloc `@theme` dans `app/globals.css`. Ce fichier ne
// sert plus qu'à charger le plugin `@tailwindcss/typography` (le plugin
// `line-clamp` est intégré nativement à Tailwind v4 et n'est plus requis).

import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
const config = {
  plugins: [typography],
};

export default config;
