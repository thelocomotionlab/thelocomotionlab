// packages/contenu/src/blocs.ts
//
// LES DEUX BLOCS RÉUTILISABLES ET L'INDEX GÉNÉRÉ.
//
// `Note` et `Protocole` n'ont pas de page propre : ils s'écrivent dans le flux
// d'un billet, sans changer de fichier, et sont adressés par ancre. Un bloc a
// donc UN SEUL fichier source ; partout ailleurs, une carte lit l'index et
// affiche titre, objectif, statut et lien — jamais une copie du corps.
//
// Conséquence recherchée : renommer un protocole ou changer son statut met à
// jour toutes ses citations sans toucher à aucune d'elles.

import { z } from "zod";
import { SORTES } from "./sortes.ts";
import { DateDeContenu } from "./sortes.ts";

export const TYPES_DE_BLOC = ["note", "protocole"] as const;
export type TypeBloc = (typeof TYPES_DE_BLOC)[number];

export const STATUTS_DE_PROTOCOLE = ["hypothese", "en-test", "eprouve", "abandonne"] as const;
export type StatutDeProtocole = (typeof STATUTS_DE_PROTOCOLE)[number];

/** Le nom de balise écrit dans le contenu, par type de bloc. */
export const BALISES_DE_BLOC: Record<string, TypeBloc> = { Note: "note", Protocole: "protocole" };

/** La balise de carte : elle résout n'importe quel bloc de l'index, note comprise. */
export const BALISE_DE_CARTE = "VersProtocole";

const identifiant = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "un identifiant s'écrit en minuscules, chiffres et tirets");

/**
 * Une propriété de liste s'écrit en chaîne séparée par des virgules, jamais en
 * accolades : une prop en accolades revient dans l'AST MDX sous forme de code
 * source à évaluer. On lit donc « a,b » et on rend ["a", "b"].
 */
const listeEnChaine = z
  .string()
  .transform((valeur) =>
    valeur
      .split(",")
      .map((element) => element.trim())
      .filter((element) => element.length > 0),
  );

/** `n="1"` arrive en chaîne depuis les props : on le ramène à un entier. */
const entierEnChaine = z.preprocess((valeur) => {
  if (typeof valeur === "string" && /^\d+$/.test(valeur.trim())) return Number(valeur.trim());
  return valeur;
}, z.number().int().positive());

const propsCommunes = {
  id: identifiant,
  titre: z.string().min(1),
  objectif: z.string().min(1),
  concepts: listeEnChaine.default([]),
  refs: listeEnChaine.default([]),
};

export const PropsNote = z.strictObject({ ...propsCommunes });

export const PropsProtocole = z.strictObject({
  ...propsCommunes,
  statut: z.enum(STATUTS_DE_PROTOCOLE),
  n: entierEnChaine,
});

export const SCHEMAS_DE_BLOC = { note: PropsNote, protocole: PropsProtocole } as const;

export type PropsBloc = z.infer<typeof PropsNote> & Partial<z.infer<typeof PropsProtocole>>;

/**
 * Une entrée de `.generated/blocs.json`.
 *
 * `url` pointe aujourd'hui vers une ancre dans la page qui porte le bloc. Le
 * jour où un bloc mérite sa propre URL, son corps part dans un fichier dédié
 * et le billet d'origine le remplace par une carte : seule `url` change, le
 * schéma reste celui-ci, et aucune page d'index n'est touchée.
 */
export const EntreeDeBloc = z.object({
  type: z.enum(TYPES_DE_BLOC),
  id: identifiant,
  titre: z.string().min(1),
  objectif: z.string().min(1),
  statut: z.enum(STATUTS_DE_PROTOCOLE).optional(),
  n: z.number().int().positive().optional(),
  concepts: z.array(z.string().min(1)),
  refs: z.array(z.string().min(1)),
  source: z.object({
    sorte: z.enum(SORTES),
    slug: z.string().min(1),
    titre: z.string().min(1),
  }),
  url: z.string().min(1),
  date: DateDeContenu.optional(),
});

export type Bloc = z.infer<typeof EntreeDeBloc>;

export const IndexDesBlocs = z.array(EntreeDeBloc);
