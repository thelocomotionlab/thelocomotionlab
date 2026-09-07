// Routes, ancres et numérotation (systeme-de-contenu §2 et §7).
//
// Tout ici est dérivé : une ancre vient d'un slug, jamais d'un numéro, et un
// numéro vient d'une position, jamais du contenu. Insérer une section
// renumérote la page sans déplacer un seul lien.

import type { TypeDeBloc } from "./blocs.ts";
import type { Section } from "./sections.ts";
import type { Document } from "./sortes.ts";

/** L'URL de la page qui porte ce document. */
export function urlDuDocument(document: Document): string {
  switch (document.sorte) {
    case "aventure":
      return `/aventures/${document.slug}`;
    // Un récit est servi sous l'aventure : son propre slug n'apparaît dans
    // aucune URL, il ne sert qu'à le désigner depuis le champ `recit`.
    case "recit":
      return `/aventures/${document.aventure}/recit`;
    case "billet":
      return `/blog/${document.slug}`;
    case "article":
      return `/science/${document.slug}`;
  }
}

/**
 * L'ancre d'une section : son `id` s'il en porte un, sinon son type. Deux
 * sections de même type sur une même page doivent donc se donner des `id`,
 * faute de quoi le build échoue sur « ancre en double ».
 */
export function ancreDeSection(section: Section): string {
  return section.id ?? section.type;
}

/** L'ancre d'un bloc : son type et son id, jamais son numéro. */
export function ancreDeBloc(type: TypeDeBloc, id: string): string {
  return `${type}-${id}`;
}

/** L'URL complète d'un bloc écrit dans le corps d'un document. */
export function urlDuBloc(
  document: Document,
  type: TypeDeBloc,
  id: string,
): string {
  return `${urlDuDocument(document)}#${ancreDeBloc(type, id)}`;
}

/** Le numéro affiché d'une section, calculé depuis sa position. */
export function numeroDeSection(position: number): string {
  return String(position + 1).padStart(2, "0");
}

export type EntreeDeSommaire = {
  numero: string;
  ancre: string;
  type: Section["type"];
  titre?: string;
};

/**
 * Le sommaire latéral d'une aventure. Le numéro suit la position, l'ancre suit
 * le slug : les deux sont indépendants, et c'est tout l'intérêt.
 */
export function sommaire(sections: readonly Section[]): EntreeDeSommaire[] {
  return sections.map((section, position) => ({
    numero: numeroDeSection(position),
    ancre: ancreDeSection(section),
    type: section.type,
    ...(section.titre === undefined ? {} : { titre: section.titre }),
  }));
}
