// Fabriques de contenu pour les tests : des documents en mémoire, pas de disque.

import type { DocumentBrut } from "../src/index.ts";

export function doc(
  fichier: string,
  donnees: Record<string, unknown>,
  corps = "",
): DocumentBrut {
  return { fichier, donnees, corps };
}

/** L'aventure minimale : trois sections, comme le Tour des Écrins. */
export function aventureATroisSections(
  sections?: readonly unknown[],
): DocumentBrut {
  return doc("content/aventures/ecrins-2026.mdx", {
    sorte: "aventure",
    titre: "Tour des Écrins en autonomie",
    slug: "ecrins-2026",
    statut: "publie",
    chapeau: "Quatre jours autour du massif, en autonomie complète.",
    etat: "termine",
    campagne: { debut: "2026-08-22", fin: "2026-08-25" },
    sections: sections ?? [
      {
        type: "caracteristiques",
        champs: [{ label: "Parcouru", valeur: "198,1 km, 12 767 m D+" }],
      },
      {
        type: "geo",
        titre: "Itinéraire",
        gpx: "tour-des-ecrins.gpx",
        colonnes: ["Étape", "Jour", "km"],
        lignes: [["Vénosc → Valgaudémar", "1", "57,5"]],
      },
      { type: "libre", id: "genese", titre: "Genèse du projet" },
    ],
  }, "<SectionLibre id=\"genese\">\nLa trace est née le lendemain du Vercors.\n</SectionLibre>\n");
}

export function billet(slug: string, corps = ""): DocumentBrut {
  return doc(`content/blog/${slug}.mdx`, {
    sorte: "billet",
    titre: `Billet ${slug}`,
    slug,
    statut: "publie",
    chapeau: "Un chapeau.",
    date: "2026-05-17",
    type: "billet",
  }, corps);
}

export const sansBibliographie = { bibliographie: [], paquetages: [] };
