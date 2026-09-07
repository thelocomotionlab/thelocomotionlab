// packages/ui/src/fonts.ts
//
// LA POLICE DE LA CHARTE, unique : Ubuntu Sans partout, en variable 300 → 800,
// romain et italique. Titres, corps et étiquettes en petites capitales sortent
// de la même fonte ; ce sont la graisse, la casse et l'interlettrage qui les
// distinguent, pas une seconde famille.
//
// Auto-hébergée via next/font/local : le woff2 officiel (sous-ensemble latin,
// Ubuntu Font Licence) vit dans src/fonts/, plus aucune dépendance à Google
// Fonts au build, qui échouait silencieusement.
//
// Les apps posent `fontVariables` sur <body> ; la variable --next-font-* est
// référencée par les tokens @theme.
// ⚠ Elle ne doit JAMAIS s'appeler --font-* : ce nom entrerait en collision
// avec les tokens Tailwind (auto-référence).

import localFont from "next/font/local";

export const ubuntuSans = localFont({
  src: [
    { path: "./fonts/ubuntu-sans-300-800-normal.woff2", weight: "300 800", style: "normal" },
    { path: "./fonts/ubuntu-sans-300-800-italic.woff2", weight: "300 800", style: "italic" },
  ],
  variable: "--next-font-ubuntu",
  display: "swap",
});

/** Classes des variables de police à poser sur <body> (ou <html>). */
export const fontVariables = ubuntuSans.variable;
