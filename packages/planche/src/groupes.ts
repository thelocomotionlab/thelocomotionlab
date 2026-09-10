// packages/planche/src/groupes.ts
//
// PRENDRE L'UN, C'EST PRENDRE LES AUTRES.
//
// Le groupe est une étiquette portée par chaque membre (`Element.groupe`), pas
// un conteneur : la liste des calques reste à plat, le rendu ne devient pas
// récursif, et les positions restent celles de la planche. Tout ce qui s'ensuit
// est ici — étendre une sélection, nouer, dénouer, et re-nouer une copie.

import { idNeuf } from "./fabrique.ts";
import type { Element } from "./types.ts";

/**
 * La sélection, complétée des compagnons de groupe.
 *
 * C'est le seul endroit qui décide : cliquer sur un membre prend le groupe,
 * qu'on ait cliqué dans l'image, dans les calques ou tiré un rectangle.
 */
export function etendreAuxGroupes(elements: Element[], ids: string[]): string[] {
  const groupes = new Set(
    elements.flatMap((e) => (ids.includes(e.id) && e.groupe ? [e.groupe] : [])),
  );
  if (groupes.size === 0) return ids;
  const complet = elements.flatMap((e) =>
    ids.includes(e.id) || (e.groupe && groupes.has(e.groupe)) ? [e.id] : [],
  );
  // L'ordre suit la planche : une sélection triée par le fond vers l'avant se
  // relit ensuite sans surprise dans les calques.
  return complet;
}

/** Noue les éléments choisis. Sous deux membres, il n'y a rien à nouer. */
export function grouper(elements: Element[], ids: string[]): Element[] {
  if (ids.length < 2) return elements;
  const cle = idNeuf("groupe");
  return elements.map((e) => (ids.includes(e.id) ? { ...e, groupe: cle } : e));
}

/** Dénoue tout groupe touché par la sélection. */
export function degrouper(elements: Element[], ids: string[]): Element[] {
  const groupes = new Set(
    elements.flatMap((e) => (ids.includes(e.id) && e.groupe ? [e.groupe] : [])),
  );
  if (groupes.size === 0) return elements;
  return elements.map((e) => (e.groupe && groupes.has(e.groupe) ? { ...e, groupe: null } : e));
}

/** Vrai si la sélection contient au moins un élément noué. */
export function contientUnGroupe(elements: Element[], ids: string[]): boolean {
  return elements.some((e) => ids.includes(e.id) && e.groupe !== null);
}

/**
 * Ré-étiquette les groupes d'un lot copié.
 *
 * Sans ça, dupliquer un groupe donnerait deux fois la même étiquette : prendre
 * la copie prendrait l'original avec, et le geste suivant les déplacerait tous.
 */
export function renouer(copies: Element[]): Element[] {
  const table = new Map<string, string>();
  return copies.map((e) => {
    if (!e.groupe) return e;
    const neuf = table.get(e.groupe) ?? idNeuf("groupe");
    table.set(e.groupe, neuf);
    return { ...e, groupe: neuf };
  });
}
