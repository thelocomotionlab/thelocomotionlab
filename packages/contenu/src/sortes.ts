// Le frontmatter des quatre sortes de pages (systeme-de-contenu §2 et §3).
//
// Règle de partage entre requis et facultatif appliquée ici : est requis ce
// sans quoi la page ne peut être ni routée ni rangée dans son index (sorte,
// titre, slug, statut, date de tri, rattachement obligatoire) ; tout le reste
// est facultatif, pour qu'un brouillon puisse exister avant d'être complet.

import { z } from "zod";
import { dateSchema, slugSchema, sorteSchema, statutSchema } from "./champs.ts";
import { sectionSchema } from "./sections.ts";

/** Champs communs à toutes les sortes. */
const champsCommuns = {
  titre: z.string(),
  slug: slugSchema,
  statut: statutSchema,
};

/** Campagne : la fin manque tant qu'elle n'a pas eu lieu. */
export const campagneSchema = z.object({
  debut: dateSchema,
  fin: dateSchema.optional(),
});

export const aventureSchema = z.object({
  ...champsCommuns,
  sorte: z.literal("aventure"),
  chapeau: z.string(),
  etat: z.enum(["termine", "en-cours", "en-preparation"]),
  campagne: campagneSchema,
  cover: z.string().optional(),
  // Chiffres affichés sur la carte d'index.
  resume: z.array(z.string()).optional().default([]),
  // Slug du récit, absent s'il n'existe pas.
  recit: slugSchema.optional(),
  sections: z.array(sectionSchema).optional().default([]),
});

export const recitSchema = z.object({
  ...champsCommuns,
  sorte: z.literal("recit"),
  date: dateSchema,
  aventure: slugSchema,
  chapeau: z.string().optional(),
  cover: z.string().optional(),
  // Minutes.
  lecture: z.number().int().positive().optional(),
  // Barre de chiffres sous le titre.
  chiffres: z.array(z.string()).optional().default([]),
});

export const billetSchema = z.object({
  ...champsCommuns,
  sorte: z.literal("billet"),
  chapeau: z.string(),
  date: dateSchema,
  type: z.enum(["recit-de-sortie", "bilan", "billet", "note-de-terrain"]),
  // Rattachement facultatif à une campagne.
  aventure: slugSchema.optional(),
});

export const revisionSchema = z.object({
  date: dateSchema,
  quoi: z.string(),
});

export const articleSchema = z.object({
  ...champsCommuns,
  sorte: z.literal("article"),
  chapeau: z.string(),
  publie_le: dateSchema,
  // Affiché en évidence : c'est le marqueur de Science.
  revise_le: dateSchema.optional(),
  themes: z.array(slugSchema).optional().default([]),
  lecture: z.number().int().positive().optional(),
  // Clés de la bibliographie.
  refs: z.array(z.string()).optional().default([]),
  revisions: z.array(revisionSchema).optional().default([]),
});

export const documentSchema = z.discriminatedUnion("sorte", [
  aventureSchema,
  recitSchema,
  billetSchema,
  articleSchema,
]);

export type Aventure = z.infer<typeof aventureSchema>;
export type Recit = z.infer<typeof recitSchema>;
export type Billet = z.infer<typeof billetSchema>;
export type Article = z.infer<typeof articleSchema>;
export type Document = z.infer<typeof documentSchema>;

export const schemaParSorte = {
  aventure: aventureSchema,
  recit: recitSchema,
  billet: billetSchema,
  article: articleSchema,
} as const;

export { sorteSchema };
