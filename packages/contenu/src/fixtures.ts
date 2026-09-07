// packages/contenu/src/fixtures.ts
//
// MATÉRIEL DE TEST partagé par les fichiers *.test.ts. Ce module n'est pas
// réexporté par index.ts : rien du site ne le voit.

import type { PageAnalysee } from "./validation.ts";
import { extraireBlocs } from "./extraction.ts";
import { analyserFrontmatter } from "./validation.ts";

/**
 * L'aventure du §4 qui doit avoir l'air finie avec trois sections :
 * caractéristiques, une section libre, un paquetage.
 */
export const AVENTURE_TROIS_SECTIONS = {
  sorte: "aventure",
  titre: "Tour des Écrins",
  slug: "tour-des-ecrins",
  statut: "publie",
  chapeau: "En autonomie complète sur 4 jours.",
  etat: "termine",
  campagne: { debut: "2026-08-22", fin: "2026-08-25" },
  cover: "TODO",
  resume: ["198 km", "12 767 m D+", "4 jours en autonomie"],
  sections: [
    { type: "caracteristiques", champs: [{ label: "Distance parcourue", valeur: "198,1 km" }] },
    { type: "libre", id: "genese-et-preparatifs", titre: "Genèse et préparatifs" },
    { type: "paquetage", titre: "Le paquetage", ref: "tour-des-ecrins" },
  ],
};

/** Un billet minimal, support des blocs dans les tests. */
export const BILLET = {
  sorte: "billet",
  titre: "Nouveau bloc d'entraînement",
  slug: "nouveau-bloc",
  statut: "publie",
  chapeau: "TODO",
  date: "2026-05-17",
  type: "billet",
};

/** Construit une page analysée depuis un frontmatter et un corps, comme le chargeur. */
export function page(chemin: string, frontmatter: unknown, corps = ""): PageAnalysee {
  const analyse = analyserFrontmatter(chemin, frontmatter);
  if (!analyse.ok) throw new Error(`fixture invalide (${chemin}) : ${analyse.erreurs.join(" | ")}`);
  return { chemin, frontmatter: analyse.frontmatter, corps, extraction: extraireBlocs(corps) };
}

export const CATALOGUE_VIDE = { bibliographie: new Set<string>(), paquetages: new Set<string>() };
