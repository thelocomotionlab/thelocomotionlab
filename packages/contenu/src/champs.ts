// Primitives partagées par les quatre sortes et par les blocs.

import { z } from "zod";

/** Marqueur d'une donnée qu'on n'a pas encore (systeme-de-contenu §8). */
export const TODO = "TODO";

/** Les quatre sortes de pages. */
export const sorteSchema = z.enum(["aventure", "recit", "billet", "article"]);
export type Sorte = z.infer<typeof sorteSchema>;

/**
 * Le statut d'un contenu. Le défaut est `brouillon` : une page sans
 * `statut: publie` explicite n'est ni routée, ni indexée, ni au sitemap.
 */
export const statutSchema = z.enum(["brouillon", "publie"]).default("brouillon");
export type Statut = z.infer<typeof statutSchema>;

/**
 * Un identifiant d'URL ou d'ancre. Sert aux slugs de page, aux ids de bloc,
 * aux ids de section libre et aux clés de thème : tous finissent dans une URL.
 */
export const slugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "identifiant attendu en minuscules non accentuées, mots séparés par des tirets",
  );

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Une date de calendrier, normalisée en `AAAA-MM-JJ`.
 *
 * YAML transforme `2025-09-29` en `Date` avant que Zod ne voie la valeur : on
 * accepte donc les deux formes et on renormalise en chaîne, seule forme
 * sérialisable telle quelle dans l'index généré. `TODO` passe aussi (§8).
 */
export const dateSchema = z
  .union([z.date(), z.string()])
  .transform((valeur, ctx) => {
    if (valeur === TODO) return TODO;
    const texte =
      valeur instanceof Date ? valeur.toISOString().slice(0, 10) : valeur.trim();
    if (!JOUR_ISO.test(texte)) {
      ctx.addIssue({
        code: "custom",
        message: `date attendue au format AAAA-MM-JJ (ou ${TODO}), reçu « ${texte} »`,
      });
      return z.NEVER;
    }
    return texte;
  });

/** Une cellule de tableau : les nombres saisis sans guillemets restent lisibles. */
export const celluleSchema = z
  .union([z.string(), z.number()])
  .transform((valeur) => String(valeur));

/** Un tableau à colonnes libres : en-têtes + lignes de cellules. */
export const tableauSchema = z.object({
  colonnes: z.array(z.string()),
  lignes: z.array(z.array(celluleSchema)),
});
export type Tableau = z.infer<typeof tableauSchema>;

/**
 * Une prop de bloc qui porte une liste : `concepts="a,b"`, jamais `{["a","b"]}`.
 * Une prop en accolades revient dans l'AST MDX sous forme de code source à
 * évaluer ; l'extraction la remplace par un objet sentinelle, que `z.string()`
 * rejette ici même.
 */
export const listeCsvSchema = z
  .string()
  .transform((valeur) =>
    valeur
      .split(",")
      .map((element) => element.trim())
      .filter(Boolean),
  );
