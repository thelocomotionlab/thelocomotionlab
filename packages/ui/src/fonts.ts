// packages/ui/src/fonts.ts
//
// LA POLICE DE LA CHARTE, désormais unique : Ubuntu Sans partout, en variable
// 300 → 800, romain et italique. Ubuntu Sans Mono ne sert qu'aux étiquettes en
// petites capitales (surtitres, méta, numéros) — la voix « instrument ».
//
// Auto-hébergées via next/font/local : les woff2 officiels (sous-ensemble
// latin, Ubuntu Font Licence) vivent dans src/fonts/, plus aucune dépendance à
// Google Fonts au build, qui échouait silencieusement.
//
// Les apps posent `ubuntuSans.variable` / `ubuntuSansMono.variable` sur <body> ;
// les variables --next-font-* sont référencées par les tokens @theme.
// ⚠ Ces variables ne doivent JAMAIS s'appeler --font-* : ce nom entrerait en
// collision avec les tokens Tailwind (auto-référence).

import localFont from "next/font/local";

export const ubuntuSans = localFont({
  src: [
    { path: "./fonts/ubuntu-sans-300-800-normal.woff2", weight: "300 800", style: "normal" },
    { path: "./fonts/ubuntu-sans-300-800-italic.woff2", weight: "300 800", style: "italic" },
  ],
  variable: "--next-font-ubuntu",
  display: "swap",
});

export const ubuntuSansMono = localFont({
  src: [{ path: "./fonts/ubuntu-sans-mono-400-700-normal.woff2", weight: "400 700", style: "normal" }],
  variable: "--next-font-ubuntu-mono",
  display: "swap",
});

/** Classes des variables de police à poser sur <body> (ou <html>). */
export const fontVariables = `${ubuntuSans.variable} ${ubuntuSansMono.variable}`;
