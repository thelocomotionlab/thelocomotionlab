// components/ChromeDuSite.jsx
//
// LA NAVBAR ET LE PIED DU SITE — SAUF DANS LE STUDIO.
//
// Le studio est un POSTE DE TRAVAIL, pas une page : la navbar (80 px, collée)
// et le pied lui mangeaient un quart de l'écran, sur lequel se trouve la seule
// chose qui compte, l'image qu'on est en train de faire. Canva règle ça d'une
// façon qui a fait ses preuves — une petite icône pour sortir, et rien d'autre.
// Le studio a donc la sienne (components/studio/Studio.jsx).
//
// POURQUOI ICI ET PAS DEUX LAYOUTS RACINES. Next sait faire ça avec des groupes
// de routes, mais il faut alors dupliquer `<html>`, `<body>`, les polices, les
// métadonnées — deux copies qui se désaccordent au premier oubli. Un garde
// d'une ligne sur le chemin garde UNE source de vérité, et le jour où une autre
// page veut le plein écran, il suffit de l'ajouter à la liste.

"use client";

import { usePathname } from "next/navigation";

/** Les routes qui prennent tout l'écran. */
const PLEIN_ECRAN = ["/studio"];

export default function ChromeDuSite({ children }) {
  const chemin = usePathname() ?? "";
  if (PLEIN_ECRAN.some((r) => chemin === r || chemin.startsWith(`${r}/`))) return null;
  return children;
}
