// packages/ui/src/fonts.ts
//
// Polices de la charte (source unique) : Ubuntu (sans + titres) + Lora (serif
// d'accent, vraies italiques) + Ubuntu Mono (kickers, références, badges —
// voix « instrument »). AUTO-HÉBERGÉES via next/font/local : les woff2
// officiels (sous-ensemble latin, licences Ubuntu Font Licence / SIL OFL)
// vivent dans src/fonts/ — plus aucune dépendance à Google Fonts au build,
// qui échouait silencieusement (police de secours déployée sans erreur).
// Les apps Next consomment ces objets et posent `ubuntu.variable` /
// `lora.variable` / `ubuntuMono.variable` sur <body> ; les variables CSS
// --font-ubuntu / --font-lora / --font-ubuntu-mono sont ensuite référencées
// par les tokens @theme.

import localFont from "next/font/local";

export const ubuntu = localFont({
  src: [
    { path: "./fonts/ubuntu-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./fonts/ubuntu-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ubuntu-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ubuntu-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-ubuntu",
  display: "swap",
});

// Lora en fontes VARIABLES (graisse 400 → 700), romain + italique.
export const lora = localFont({
  src: [
    { path: "./fonts/lora-400-700-normal.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/lora-400-700-italic.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-lora",
  display: "swap",
});

export const ubuntuMono = localFont({
  src: [
    { path: "./fonts/ubuntu-mono-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ubuntu-mono-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-ubuntu-mono",
  display: "swap",
});

/** Classes des variables de police à poser sur <body> (ou <html>). */
export const fontVariables = `${ubuntu.variable} ${lora.variable} ${ubuntuMono.variable}`;
