// packages/contenu/src/sections.ts
//
// LES HUIT TYPES DE SECTION D'UNE PAGE AVENTURE.
//
// Une aventure n'a pas de gabarit : sa page est la liste ordonnée des sections
// déclarées dans son frontmatter. Aucun type n'est obligatoire, l'ordre est
// libre, et la même page peut n'en porter que trois.
//
// Deux champs sont communs aux huit types :
//   `titre`  facultatif, affiché en tête de section ;
//   `id`     facultatif, il fixe l'ancre (cf. ancres.ts). Deux sections du même
//            type sur une page ont besoin d'un `id` chacune pour ne pas
//            produire deux fois la même ancre.
// La section `libre` est la seule à exiger les deux.

import { z } from "zod";

/** Les huit types, dans l'ordre de docs/systeme-de-contenu.md §5. */
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

const identifiant = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "un identifiant s'écrit en minuscules, chiffres et tirets");

const communs = {
  titre: z.string().min(1).optional(),
  id: identifiant.optional(),
};

/**
 * Les deux champs d'un tableau ordonné : des colonnes libres, et des lignes.
 */
const champsDeTableau = {
  colonnes: z.array(z.string().min(1)).min(1),
  lignes: z.array(z.array(z.string())).min(1),
};

/**
 * Toutes les lignes d'un tableau ont exactement autant de cellules que de
 * colonnes. Une ligne trop courte est un décalage silencieux à l'affichage,
 * donc une erreur ici.
 */
function verifierLargeurDesLignes(
  nom: string,
  valeur: { colonnes: string[]; lignes: string[][] },
  ctx: z.RefinementCtx,
): void {
  valeur.lignes.forEach((ligne, index) => {
    if (ligne.length !== valeur.colonnes.length) {
      ctx.addIssue({
        code: "custom",
        path: ["lignes", index],
        message: `${nom} : la ligne ${index + 1} a ${ligne.length} cellules pour ${valeur.colonnes.length} colonnes`,
      });
    }
  });
}

// ── caracteristiques ────────────────────────────────────────────────────────
// Fiche clé/valeur libre : aucun champ imposé, chaque aventure déclare les
// siens (distance et dénivelé ici, climat et hébergement ailleurs).

export const SectionCaracteristiques = z.strictObject({
  type: z.literal("caracteristiques"),
  ...communs,
  champs: z
    .array(z.strictObject({ label: z.string().min(1), valeur: z.string().min(1) }))
    .min(1),
});

// ── geo ─────────────────────────────────────────────────────────────────────
// Carte plus tableau ordonné. Les colonnes sont libres : « Repère / km / D+
// cumulé » pour une trace, « Étape / jours / lieu » pour un voyage.

/**
 * Un repère posé sur la trace : il est saisi en KILOMÈTRES le long du parcours
 * — ce qui se lit sur une trace, et qui reste juste même si le GPX est
 * régénéré. La carte retrouve la coordonnée en projetant le km sur le profil.
 * `icone` nomme un pictogramme du site (`bivouac`, `refuge`, `eau`…).
 */
const Repere = z.strictObject({
  nom: z.string().min(1),
  km: z.number().nonnegative(),
  icone: z.string().min(1).optional(),
});

export const SectionGeo = z
  .strictObject({
    type: z.literal("geo"),
    ...communs,
    carte: z.string().min(1),
    gpx: z.string().min(1).optional(),
    reperes: z.array(Repere).optional(),
    ...champsDeTableau,
  })
  .superRefine((valeur, ctx) => verifierLargeurDesLignes("geo", valeur, ctx));

// ── preparation ─────────────────────────────────────────────────────────────
// Quatre éléments indépendants et TOUS facultatifs : une préparation peut
// n'avoir que des stresseurs.

const Graphe = z
  .strictObject({
    abscisse: z.array(z.string().min(1)).min(1),
    series: z
      .array(
        z.strictObject({
          nom: z.string().min(1),
          unite: z.string().min(1),
          valeurs: z.array(z.number()).min(1),
        }),
      )
      .min(1),
  })
  .superRefine((valeur, ctx) => {
    valeur.series.forEach((serie, index) => {
      if (serie.valeurs.length !== valeur.abscisse.length) {
        ctx.addIssue({
          code: "custom",
          path: ["series", index, "valeurs"],
          message: `graphe : la série « ${serie.nom} » a ${serie.valeurs.length} valeurs pour ${valeur.abscisse.length} points d'abscisse`,
        });
      }
    });
  });

/** Schéma fixe d'un stresseur : rien de libre, cinq champs, tous requis. */
const Stresseur = z.strictObject({
  nom: z.string().min(1),
  dose: z.string().min(1),
  frequence: z.string().min(1),
  intensite: z.string().min(1),
  pourquoi: z.string().min(1),
});

export const SectionPreparation = z.strictObject({
  type: z.literal("preparation"),
  ...communs,
  graphe: Graphe.optional(),
  seances: z
    .strictObject(champsDeTableau)
    .superRefine((valeur, ctx) => verifierLargeurDesLignes("seances", valeur, ctx))
    .optional(),
  stresseurs: z
    .strictObject({
      travailles: z.array(Stresseur).default([]),
      // Champ structuré, pas une phrase libre : ce qu'on n'a pas travaillé
      // s'affiche comme une liste, à côté de ce qu'on a travaillé.
      non_travailles: z.array(z.string().min(1)).default([]),
    })
    .optional(),
  protocoles: z.array(identifiant).optional(),
});

// ── paquetage ───────────────────────────────────────────────────────────────
// Référence un jeu de données de paquetage : le tableau, les masses et
// l'export CSV sont produits à partir de lui.

export const SectionPaquetage = z.strictObject({
  type: z.literal("paquetage"),
  ...communs,
  ref: z.string().min(1),
});

// ── nutrition ───────────────────────────────────────────────────────────────

export const SectionNutrition = z
  .strictObject({ type: z.literal("nutrition"), ...communs, ...champsDeTableau })
  .superRefine((valeur, ctx) => verifierLargeurDesLignes("nutrition", valeur, ctx));

// ── libre ───────────────────────────────────────────────────────────────────
// Le frontmatter ne déclare que la position et le titre ; le corps vit dans le
// MDX de la page, dans un slot nommé par cet `id`.

export const SectionLibre = z.strictObject({
  type: z.literal("libre"),
  id: identifiant,
  titre: z.string().min(1),
});

// ── direct ──────────────────────────────────────────────────────────────────
// Versions du live-tracking, replay, journal de bord. La section ne porte
// aucune donnée : le direct d'une campagne se lit à partir du slug de
// l'aventure.

export const SectionDirect = z.strictObject({ type: z.literal("direct"), ...communs });

// ── recit ───────────────────────────────────────────────────────────────────
// Grande carte de renvoi vers /aventures/<slug>/recit, résolue depuis le champ
// `recit` du frontmatter. Absente si le récit n'existe pas, donc sans donnée
// propre elle non plus.

export const SectionRecit = z.strictObject({ type: z.literal("recit"), ...communs });

/**
 * Le schéma d'une section, choisi par son `type`. Un `type` inconnu n'arrive
 * jamais ici : il est intercepté en amont pour produire le message
 * « type de section inconnu » de docs/systeme-de-contenu.md §9.
 */
export const SCHEMAS_DE_SECTION = {
  caracteristiques: SectionCaracteristiques,
  geo: SectionGeo,
  preparation: SectionPreparation,
  paquetage: SectionPaquetage,
  nutrition: SectionNutrition,
  libre: SectionLibre,
  direct: SectionDirect,
  recit: SectionRecit,
} as const;

export type Section =
  | z.infer<typeof SectionCaracteristiques>
  | z.infer<typeof SectionGeo>
  | z.infer<typeof SectionPreparation>
  | z.infer<typeof SectionPaquetage>
  | z.infer<typeof SectionNutrition>
  | z.infer<typeof SectionLibre>
  | z.infer<typeof SectionDirect>
  | z.infer<typeof SectionRecit>;

export function estTypeDeSection(valeur: unknown): valeur is TypeDeSection {
  return typeof valeur === "string" && (TYPES_DE_SECTION as readonly string[]).includes(valeur);
}
