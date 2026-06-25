// packages/ui/src/fonts.ts
//
// Polices de la charte (source unique) : Ubuntu (sans + titres) + Lora (serif
// d'accent), chargées via next/font/google. Les apps Next consomment ces objets
// et posent `ubuntu.variable` / `lora.variable` sur <body> ; les variables CSS
// --font-ubuntu / --font-lora sont ensuite référencées par les tokens @theme.

import { Ubuntu, Lora } from "next/font/google";

export const ubuntu = Ubuntu({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-ubuntu",
  display: "swap",
});

export const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lora",
  display: "swap",
});

/** Classes des variables de police à poser sur <body> (ou <html>). */
export const fontVariables = `${ubuntu.variable} ${lora.variable}`;
