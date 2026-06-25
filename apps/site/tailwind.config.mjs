// tailwind.config.mjs
//
// Tailwind v4 : la source de vérité du design system (couleurs, polices, ombres)
// est le bloc @theme de packages/ui, importé via app/globals.css. Ce fichier ne
// fait que ré-exporter le preset partagé (plugins) depuis packages/ui — source
// unique, pour que les futures apps puissent l'activer de la même façon.
//
// NB : en v4, ce fichier n'est chargé que si globals.css le référence via
// `@config`. Le site ne le fait pas — comportement historique préservé (le
// plugin typography n'est pas injecté, le style .prose vient du CSS du site).

import preset from "@locomotionlab/ui/tailwind-preset";

/** @type {import('tailwindcss').Config} */
const config = {
  presets: [preset],
};

export default config;
