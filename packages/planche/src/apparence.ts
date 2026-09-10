// packages/planche/src/apparence.ts
//
// COPIER L'APPARENCE SANS COPIER LE CONTENU.
//
// « Copier le style » sert quand on a réglé un titre — corps, graisse, couleur,
// ombre, plaque — et qu'on veut les onze autres pareils. Ce qui se copie est
// donc tout ce qui décide de l'APPARENCE, et rien de ce qui décide du FOND :
// le texte reste le sien, la photo la sienne, la variable la sienne, la
// position la sienne.
//
// UN STYLE NE TRAVERSE PAS LES TYPES. Poser le style d'un texte sur une icône
// ne veut rien dire ; la fonction rend l'élément inchangé plutôt que d'inventer
// une correspondance que personne n'a demandée. L'opacité, elle, est commune :
// c'est le seul réglage d'apparence que tout élément porte.

import type { Element } from "./types.ts";

/** Ce qui se copie, par type. Tout le reste est du contenu ou de la place. */
const APPARENCE: Record<Element["type"], readonly string[]> = {
  texte: [
    "role",
    "puce",
    "corps",
    "graisse",
    "italique",
    "casse",
    "couleur",
    "alignement",
    "interligne",
    "lettrage",
    "ombre",
    "plaque",
    "filetOuvrant",
    "filetSousTitre",
  ],
  photo: ["reglages", "voile", "degrades", "coins", "bordure"],
  forme: ["forme", "remplissage", "contour", "coins"],
  icone: ["couleur", "epaisseur"],
  marque: ["variante", "teinte"],
  carte: ["fond", "couleurs", "epaisseur", "depart", "arrivee", "itineraireSourdine"],
  profil: ["remplissage", "restantEstompe", "parJournee", "couleurs"],
  stat: ["taille", "libelle"],
  fiche: ["tailleLibelle", "tailleValeur"],
  cases: ["colonnes", "miniCarte", "miniProfil", "filet", "taille", "couleurs"],
};

export type Apparence = { type: Element["type"]; valeurs: Record<string, unknown> };

export function apparenceDe(element: Element): Apparence {
  const source = element as unknown as Record<string, unknown>;
  const valeurs: Record<string, unknown> = { opacite: element.opacite };
  for (const cle of APPARENCE[element.type]) valeurs[cle] = source[cle];
  return { type: element.type, valeurs };
}

export function avecApparence(element: Element, apparence: Apparence): Element {
  if (element.type !== apparence.type) return element;
  return { ...element, ...apparence.valeurs } as Element;
}
