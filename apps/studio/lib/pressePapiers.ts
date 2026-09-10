"use client";

// lib/pressePapiers.ts
//
// COPIER, COLLER — DANS L'ONGLET.
//
// Le presse-papiers du système ne transporte que du texte et des fichiers ; y
// écrire un élément voudrait dire le sérialiser, le relire, et le réconcilier
// avec des médias qui ne sont pas dans l'autre onglet. Ici, la copie reste en
// mémoire : c'est ce qui rend le geste instantané et sans surprise. Changer de
// navigateur passe par le fichier `.llstudio`, qui, lui, emporte les photos.
//
// LES COPIES SONT DÉJÀ DES COPIES : on range des clones, pour qu'une
// modification de l'original entre le Ctrl+C et le Ctrl+V ne remonte pas dans
// ce qu'on colle.

import { apparenceDe, dupliquer, renouer, type Apparence, type Element } from "@locomotionlab/planche";

let elements: Element[] = [];
let apparence: Apparence | null = null;

export function copier(choisis: readonly Element[]): void {
  elements = choisis.map((e) => ({ ...e }));
}

/** Les éléments à coller : des clones neufs, décalés, aux groupes re-noués. */
export function aColler(decalage = 0.02): Element[] {
  if (elements.length === 0) return [];
  return renouer(elements.map((e) => dupliquer(e, decalage)));
}

export function aQuelqueChose(): boolean {
  return elements.length > 0;
}

export function copierApparence(element: Element): void {
  apparence = apparenceDe(element);
}

export function apparenceCopiee(): Apparence | null {
  return apparence;
}
