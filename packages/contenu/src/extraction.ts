// Lecture des balises de bloc dans le corps MDX (systeme-de-contenu §6).
//
// On lit l'AST, jamais le texte : c'est ce qui permet d'accepter les blocs où
// qu'ils soient dans le flux, et de voir qu'une prop a été écrite en accolades.

import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import {
  BALISE_SECTION_LIBRE,
  BALISES_DE_BLOC,
  BALISES_DE_CARTE,
} from "./blocs.ts";

/**
 * Une prop écrite `{...}`. On la garde telle quelle plutôt que de l'évaluer :
 * les schémas la rejettent, et le message dit où regarder.
 */
export type ValeurEnAccolades = { expressionMdx: string };

export type ValeurDeProp = string | true | ValeurEnAccolades;

export type BaliseLue = {
  balise: string;
  props: Record<string, ValeurDeProp>;
  ligne: number | undefined;
};

export type ExtraitMdx = {
  /** Les `<Note>` et `<Protocole>` écrits dans ce corps. */
  blocs: BaliseLue[];
  /** Les `<VersNote>` et `<VersProtocole>` qui citent un bloc. */
  cartes: BaliseLue[];
  /** Les `<SectionLibre id="...">` qui portent le corps d'une section libre. */
  slotsLibres: BaliseLue[];
};

const analyseur = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkMdx);

type NoeudJsx = {
  type: string;
  name?: string | null;
  attributes?: unknown[];
  position?: { start?: { line?: number } };
};

function lireProps(noeud: NoeudJsx): Record<string, ValeurDeProp> {
  const props: Record<string, ValeurDeProp> = {};
  for (const brut of noeud.attributes ?? []) {
    const attribut = brut as {
      type?: string;
      name?: string;
      value?: unknown;
    };
    if (attribut.type !== "mdxJsxAttribute" || typeof attribut.name !== "string") {
      // `{...spread}` : rien à nommer, on laisse les schémas constater le manque.
      continue;
    }
    const valeur = attribut.value;
    if (valeur === null || valeur === undefined) {
      props[attribut.name] = true;
    } else if (typeof valeur === "string") {
      props[attribut.name] = valeur;
    } else {
      const expression = valeur as { value?: unknown };
      props[attribut.name] = {
        expressionMdx:
          typeof expression.value === "string" ? expression.value : "",
      };
    }
  }
  return props;
}

/** Lit un corps MDX et en sort les blocs, les cartes et les slots libres. */
export function extraireDuMdx(source: string): ExtraitMdx {
  const extrait: ExtraitMdx = { blocs: [], cartes: [], slotsLibres: [] };
  const arbre = analyseur.parse(source);

  visit(arbre, (noeud) => {
    const jsx = noeud as unknown as NoeudJsx;
    if (
      jsx.type !== "mdxJsxFlowElement" &&
      jsx.type !== "mdxJsxTextElement"
    ) {
      return;
    }
    const nom = jsx.name;
    if (typeof nom !== "string") return;

    const lue: BaliseLue = {
      balise: nom,
      props: lireProps(jsx),
      ligne: jsx.position?.start?.line,
    };

    if (nom in BALISES_DE_BLOC) extrait.blocs.push(lue);
    else if (nom in BALISES_DE_CARTE) extrait.cartes.push(lue);
    else if (nom === BALISE_SECTION_LIBRE) extrait.slotsLibres.push(lue);
  });

  return extrait;
}
