// Les deux blocs qui vivent à l'intérieur d'un billet (systeme-de-contenu §6),
// et la forme de l'index généré qu'ils alimentent.

import { z } from "zod";
import { listeCsvSchema, slugSchema, sorteSchema } from "./champs.ts";

/** Les noms de balise MDX qui portent un bloc. */
export const BALISES_DE_BLOC = { Note: "note", Protocole: "protocole" } as const;

/** Les noms de balise MDX qui portent une carte vers un bloc. */
export const BALISES_DE_CARTE = {
  VersNote: "note",
  VersProtocole: "protocole",
} as const;

/** Le nom de balise MDX qui rattache de la prose à une section `libre`. */
export const BALISE_SECTION_LIBRE = "SectionLibre";

export const typeDeBlocSchema = z.enum(["note", "protocole"]);
export type TypeDeBloc = z.infer<typeof typeDeBlocSchema>;

export const statutProtocoleSchema = z.enum([
  "hypothese",
  "en-test",
  "eprouve",
  "abandonne",
]);

/** Props d'une `<Note>` : une note scientifique sourcée. */
export const propsNoteSchema = z.object({
  id: slugSchema,
  titre: z.string(),
  objectif: z.string().optional(),
  concepts: listeCsvSchema.optional().default([]),
  refs: listeCsvSchema.optional().default([]),
});

/** Props d'un `<Protocole>` : une `Note` plus un statut et un numéro. */
export const propsProtocoleSchema = propsNoteSchema.extend({
  objectif: z.string(),
  statut: statutProtocoleSchema,
  // Écrit `n="1"` en MDX : toute prop d'élément arrive en chaîne.
  n: z.coerce.number().int().positive().optional(),
});

export const propsParBalise = {
  Note: propsNoteSchema,
  Protocole: propsProtocoleSchema,
} as const;

/**
 * Une entrée de `.generated/blocs.json`. Le corps du bloc n'y figure pas : une
 * carte lit l'index, elle ne recopie jamais le texte. La promotion d'un bloc
 * vers sa propre page ne change que `url`.
 */
export const blocIndexeSchema = z.object({
  type: typeDeBlocSchema,
  id: slugSchema,
  titre: z.string(),
  objectif: z.string().optional(),
  statut: statutProtocoleSchema.optional(),
  n: z.number().int().positive().optional(),
  concepts: z.array(z.string()),
  refs: z.array(z.string()),
  source: z.object({
    sorte: sorteSchema,
    slug: slugSchema,
    titre: z.string(),
  }),
  url: z.string(),
  date: z.string().optional(),
});

export type BlocIndexe = z.infer<typeof blocIndexeSchema>;

export const indexDesBlocsSchema = z.array(blocIndexeSchema);
