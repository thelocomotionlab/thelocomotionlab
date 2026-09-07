// packages/contenu/src/ancres.ts
//
// ANCRES, NUMÉROTATION ET URLS.
//
// Une ancre ne dépend jamais d'une position : ni du numéro de section, ni de
// l'ordre du tableau `sections`. Insérer une section en tête d'une aventure
// renumérote l'affichage et ne déplace aucune ancre — c'est la propriété que
// le reste du système suppose acquise (liens externes, sommaire, cartes).

import type { Section } from "./sections.ts";
import type { PropsBloc, TypeBloc } from "./blocs.ts";
import type { Sorte } from "./sortes.ts";

/**
 * Translittération kebab-case : accents retirés, tout ce qui n'est ni lettre
 * ASCII ni chiffre devient un tiret. `« L'île intense »` → `l-ile-intense`.
 */
export function slug(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * L'ancre d'une section : son `id` quand elle en déclare un, sinon son `type`.
 *
 * Le titre n'entre pas dans le calcul : renommer « Trace » en « Itinéraire »
 * ne doit pas casser les liens déjà partagés. Une page qui porte deux sections
 * du même type sans `id` produit donc deux fois la même ancre, et le build
 * s'arrête là-dessus (règle « ancre en double »).
 */
export function ancreDeSection(section: Section): string {
  return section.id ? slug(section.id) : slug(section.type);
}

/** Les ancres d'une page, dans l'ordre du tableau `sections`. */
export function ancresDeSections(sections: readonly Section[]): string[] {
  return sections.map(ancreDeSection);
}

/**
 * Le sommaire latéral et les numéros « 01, 02, 03 » sont calculés ici, depuis
 * la position. Rien n'est écrit en dur dans le contenu.
 */
export function numeroterSections(
  sections: readonly Section[],
): { numero: string; ancre: string; type: Section["type"]; titre?: string }[] {
  return sections.map((section, index) => ({
    numero: String(index + 1).padStart(2, "0"),
    ancre: ancreDeSection(section),
    type: section.type,
    ...(section.titre === undefined ? {} : { titre: section.titre }),
  }));
}

/** L'ancre d'un bloc écrit dans le flux d'une page : `protocole-<id>`, `note-<id>`. */
export function ancreDeBloc(type: TypeBloc, props: Pick<PropsBloc, "id">): string {
  return `${type}-${slug(props.id)}`;
}

/** Le chemin de la page qui porte un contenu, sans ancre. */
export function cheminDeSorte(sorte: Sorte, slugPage: string, slugAventure?: string): string {
  switch (sorte) {
    case "aventure":
      return `/aventures/${slugPage}`;
    case "recit":
      // Un récit vit sous son aventure : le slug de la page est celui du récit,
      // mais l'URL est celle de l'aventure qui le porte.
      return `/aventures/${slugAventure ?? slugPage}/recit`;
    case "billet":
      return `/blog/${slugPage}`;
    case "article":
      return `/science/${slugPage}`;
  }
}

/** L'URL publique d'un bloc : la page qui le contient, plus son ancre. */
export function urlDeBloc(
  type: TypeBloc,
  props: Pick<PropsBloc, "id">,
  source: { sorte: Sorte; slug: string; aventure?: string },
): string {
  return `${cheminDeSorte(source.sorte, source.slug, source.aventure)}#${ancreDeBloc(type, props)}`;
}
