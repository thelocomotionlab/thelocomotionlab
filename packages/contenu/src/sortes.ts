// packages/contenu/src/sortes.ts
//
// LES QUATRE SORTES DE PAGE ET LEUR FRONTMATTER.
//
// Les schémas sont stricts : une clé que le modèle ne connaît pas arrête le
// build au lieu d'être retirée en silence. `lectuer: 12` est une faute de
// frappe, pas un champ absent.
//
//   aventure  campagne : données, préparation, matériel, direct  /aventures/<slug>
//   recit     le texte long d'une campagne                       /aventures/<slug-aventure>/recit
//   billet    entrée datée du carnet de bord                     /blog/<slug>
//   article   document scientifique vivant, sourcé, révisé       /science/<slug>
//
// Le statut par défaut est `brouillon` : un contenu qui n'écrit pas
// `statut: publie` n'est pas routé, n'apparaît dans aucun index et ne figure
// pas au sitemap. Rien d'inventé ou d'incomplet ne peut donc sortir par
// distraction.

import { z } from "zod";
import { SCHEMAS_DE_SECTION } from "./sections.ts";
import type { Section, TypeDeSection } from "./sections.ts";

export const SORTES = ["aventure", "recit", "billet", "article"] as const;
export type Sorte = (typeof SORTES)[number];

export const STATUTS = ["brouillon", "publie"] as const;
export type Statut = (typeof STATUTS)[number];

export const ETATS_DE_CAMPAGNE = ["termine", "en-cours", "en-preparation"] as const;
export const TYPES_DE_BILLET = ["recit-de-sortie", "bilan", "billet", "note-de-terrain"] as const;

const slugDePage = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "un slug s'écrit en minuscules, chiffres et tirets");

/**
 * Une date de frontmatter. YAML transforme `2025-09-29` en objet Date à minuit
 * UTC : on ramène les deux écritures à la même chaîne `AAAA-MM-JJ`, parce que
 * c'est elle qu'on compare, qu'on trie et qu'on écrit dans l'index des blocs.
 *
 * Un horodatage complet est refusé plutôt que tronqué : `2026-05-18 00:30 +02:00`
 * tombe la veille en UTC, et le jour lu ne serait pas le jour écrit.
 */
export const DateDeContenu = z.preprocess((valeur) => {
  if (valeur instanceof Date) {
    const minuitUTC =
      valeur.getUTCHours() === 0 &&
      valeur.getUTCMinutes() === 0 &&
      valeur.getUTCSeconds() === 0 &&
      valeur.getUTCMilliseconds() === 0;
    return minuitUTC ? valeur.toISOString().slice(0, 10) : valeur.toISOString();
  }
  return valeur;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "une date s'écrit AAAA-MM-JJ"));

/** Une clé de bibliographie, résolue au build contre content/bibliography.json. */
const cleDeReference = z.string().min(1);

/** Les cinq champs communs aux quatre sortes (§3). */
const communs = {
  titre: z.string().min(1),
  slug: slugDePage,
  statut: z.enum(STATUTS).default("brouillon"),
  chapeau: z.string().min(1),
};

/**
 * Le tableau `sections` d'une aventure. Un `type` inconnu est intercepté ici
 * pour porter le message exact de §9 plutôt qu'une erreur d'union Zod
 * illisible ; le reste du schéma est celui du type déclaré.
 */
const Sections = z.array(z.unknown()).transform((entrees, ctx) => {
  const sections: Section[] = [];

  entrees.forEach((entree, index) => {
    const type = (entree as { type?: unknown } | null)?.type;
    const schema = SCHEMAS_DE_SECTION[type as TypeDeSection];

    if (!schema) {
      // Signalé sans message : l'appelant produit « type de section inconnu :
      // "<type>" dans <fichier> », qui a besoin du chemin du fichier.
      ctx.addIssue({
        code: "custom",
        path: [index, "type"],
        message: `${TYPE_DE_SECTION_INCONNU}${String(type ?? "")}`,
      });
      return;
    }

    const resultat = schema.safeParse(entree);
    if (!resultat.success) {
      resultat.error.issues.forEach((issue) => {
        ctx.addIssue({ ...issue, path: [index, ...(issue.path ?? [])] });
      });
      return;
    }
    sections.push(resultat.data as Section);
  });

  return sections;
});

/**
 * Préfixe posé sur l'erreur Zod d'un `type` de section inconnu, suivi du type
 * lu : l'appelant le reconnaît pour émettre le message de §9
 * (« type de section inconnu : "<type>" dans <fichier> ») au lieu du message
 * Zod, qui n'a pas le chemin du fichier.
 */
export const TYPE_DE_SECTION_INCONNU = "type-de-section-inconnu:";

// ── aventure ────────────────────────────────────────────────────────────────

export const Aventure = z.strictObject({
  sorte: z.literal("aventure"),
  ...communs,
  etat: z.enum(ETATS_DE_CAMPAGNE),
  campagne: z.strictObject({
    debut: DateDeContenu,
    // Une campagne en préparation ou en cours n'a pas de fin connue.
    fin: DateDeContenu.optional(),
  }),
  cover: z.string().min(1),
  /** Les chiffres affichés sur la carte de l'index Aventures. */
  resume: z.array(z.string().min(1)).min(1),
  /** Slug du récit. Absent tant que le récit n'existe pas. */
  recit: slugDePage.optional(),
  sections: Sections.default([]),
});

// ── recit ───────────────────────────────────────────────────────────────────

export const Recit = z.strictObject({
  sorte: z.literal("recit"),
  ...communs,
  date: DateDeContenu,
  /** Obligatoire : un récit est toujours le texte long d'une campagne. */
  aventure: slugDePage,
  cover: z.string().min(1),
  /** Minutes de lecture. */
  lecture: z.number().int().positive().optional(),
  /** La barre de chiffres sous le titre. */
  chiffres: z.array(z.string().min(1)).optional(),
});

// ── billet ──────────────────────────────────────────────────────────────────

export const Billet = z.strictObject({
  sorte: z.literal("billet"),
  ...communs,
  date: DateDeContenu,
  type: z.enum(TYPES_DE_BILLET),
  /** Rattachement facultatif à une campagne. */
  aventure: slugDePage.optional(),
});

// ── article ─────────────────────────────────────────────────────────────────

export const Article = z.strictObject({
  sorte: z.literal("article"),
  ...communs,
  publie_le: DateDeContenu,
  /** Le marqueur de Science : affiché en évidence. Absent tant qu'il n'y a pas eu de révision. */
  revise_le: DateDeContenu.optional(),
  themes: z.array(z.string().min(1)).min(1),
  lecture: z.number().int().positive().optional(),
  refs: z.array(cleDeReference).default([]),
  revisions: z
    .array(z.strictObject({ date: DateDeContenu, quoi: z.string().min(1) }))
    .default([]),
});

export const SCHEMAS_DE_SORTE = {
  aventure: Aventure,
  recit: Recit,
  billet: Billet,
  article: Article,
} as const;

export type FrontmatterAventure = z.infer<typeof Aventure>;
export type FrontmatterRecit = z.infer<typeof Recit>;
export type FrontmatterBillet = z.infer<typeof Billet>;
export type FrontmatterArticle = z.infer<typeof Article>;
export type Frontmatter =
  | FrontmatterAventure
  | FrontmatterRecit
  | FrontmatterBillet
  | FrontmatterArticle;

export function estSorte(valeur: unknown): valeur is Sorte {
  return typeof valeur === "string" && (SORTES as readonly string[]).includes(valeur);
}
