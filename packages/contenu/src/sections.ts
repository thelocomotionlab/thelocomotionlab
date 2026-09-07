// Les huit types de section d'une page Aventure (systeme-de-contenu §5).
//
// Une aventure n'a pas de gabarit : aucune section n'est obligatoire, l'ordre
// est libre, la liste s'allonge en cours de campagne. Ce fichier ne décrit donc
// que la forme de chaque section, jamais une composition attendue.

import { z } from "zod";
import { celluleSchema, slugSchema, tableauSchema } from "./champs.ts";

/** Les huit types, dans l'ordre du document. Sert aussi au contrôle du §9. */
export const TYPES_DE_SECTION = [
  "caracteristiques",
  "geo",
  "preparation",
  "paquetage",
  "nutrition",
  "libre",
  "direct",
  "recit",
] as const;

export type TypeDeSection = (typeof TYPES_DE_SECTION)[number];

export function estTypeDeSection(valeur: unknown): valeur is TypeDeSection {
  return (
    typeof valeur === "string" &&
    (TYPES_DE_SECTION as readonly string[]).includes(valeur)
  );
}

/**
 * Champs communs. `id` n'est requis que sur `libre`, mais il est accepté
 * partout : c'est le seul moyen de distinguer l'ancre de deux sections de même
 * type sur une même page (par exemple deux `geo`), l'ancre étant dérivée du
 * slug et jamais du numéro (§7).
 */
const champsCommuns = {
  id: slugSchema.optional(),
  titre: z.string().optional(),
};

/** Fiche clé/valeur libre : aucun champ imposé, seulement leur forme. */
export const sectionCaracteristiquesSchema = z.object({
  ...champsCommuns,
  type: z.literal("caracteristiques"),
  champs: z.array(z.object({ label: z.string(), valeur: celluleSchema })),
});

/** Carte plus tableau ordonné, colonnes libres (trace ou itinéraire). */
export const sectionGeoSchema = z.object({
  ...champsCommuns,
  type: z.literal("geo"),
  carte: z.string().optional(),
  gpx: z.string().optional(),
  ...tableauSchema.shape,
});

/** Une série du graphe de préparation, alignée sur l'abscisse. */
export const serieSchema = z.object({
  nom: z.string(),
  unite: z.string(),
  valeurs: z.array(z.number()),
});

/** Un stresseur travaillé : schéma fixe, pas de phrase libre. */
export const stresseurSchema = z.object({
  nom: z.string(),
  dose: z.string(),
  frequence: z.string(),
  intensite: z.string(),
  pourquoi: z.string(),
});

/**
 * Quatre éléments indépendants et tous facultatifs : une préparation peut
 * n'avoir que des stresseurs.
 */
export const sectionPreparationSchema = z.object({
  ...champsCommuns,
  type: z.literal("preparation"),
  graphe: z
    .object({
      abscisse: z.array(z.string()),
      series: z.array(serieSchema),
    })
    .optional(),
  // La dernière colonne de `lignes` porte un slug de billet, résolu en lien.
  // Une cellule vide vaut « pas de billet ».
  seances: tableauSchema.optional(),
  stresseurs: z
    .object({
      travailles: z.array(stresseurSchema).optional().default([]),
      non_travailles: z.array(z.string()).optional().default([]),
    })
    .optional(),
  protocoles: z.array(slugSchema).optional().default([]),
});

/** Référence un jeu de données de paquetage ; produit tableau, masses et CSV. */
export const sectionPaquetageSchema = z.object({
  ...champsCommuns,
  type: z.literal("paquetage"),
  ref: z.string(),
});

/** Tableau à colonnes libres. */
export const sectionNutritionSchema = z.object({
  ...champsCommuns,
  type: z.literal("nutrition"),
  ...tableauSchema.shape,
});

/**
 * Section titrée dont le corps vit dans le MDX de la page, dans un slot nommé :
 * le frontmatter ne déclare que la position et le titre.
 */
export const sectionLibreSchema = z.object({
  type: z.literal("libre"),
  id: slugSchema,
  titre: z.string(),
});

/** Versions du live-tracking, replay, journal de bord de la campagne. */
export const sectionDirectSchema = z.object({
  ...champsCommuns,
  type: z.literal("direct"),
  version: z.string().optional(),
  mention: z.string().optional(),
  replay: z.string().optional(),
});

/** Grande carte de renvoi, résolue depuis le champ `recit` du frontmatter. */
export const sectionRecitSchema = z.object({
  ...champsCommuns,
  type: z.literal("recit"),
});

export const sectionSchema = z.discriminatedUnion("type", [
  sectionCaracteristiquesSchema,
  sectionGeoSchema,
  sectionPreparationSchema,
  sectionPaquetageSchema,
  sectionNutritionSchema,
  sectionLibreSchema,
  sectionDirectSchema,
  sectionRecitSchema,
]);

export type Section = z.infer<typeof sectionSchema>;
