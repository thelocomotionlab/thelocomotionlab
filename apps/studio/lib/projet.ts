// lib/projet.ts
//
// Fabriquer un document vide, et le faire vivre dans un historique.
//
// L'état du poste de travail EST un `Historique<Projet>` : toute modification
// passe par `pousser`, donc tout est annulable par construction. Aucun chemin
// détourné n'existe pour changer le document — c'est ce qui évite qu'une action
// ajoutée dans six mois soit la seule qu'on ne puisse pas défaire.

import {
  CONTEXTE_PAR_DEFAUT,
  SCHEMA,
  changerModele,
  creer,
  instancier,
  type CleFormat,
  type CleModele,
  type CleTheme,
  type ContexteModele,
  type Historique,
  type PlancheImage,
  type Projet,
} from "@locomotionlab/planche";

/** Un identifiant court, unique dans la session. */
export function id(prefixe: string): string {
  return `${prefixe}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Le contexte qu'un modèle lit pour s'instancier : ce que la planche doit
 * savoir du projet avant de poser ses éléments.
 */
export function contexteDuProjet(p: Projet): ContexteModele {
  return {
    ...CONTEXTE_PAR_DEFAUT,
    format: p.format,
    theme: p.theme,
    bilan: p.bilan,
    nomTrace: p.donnees.trace?.nom ?? null,
    vecue: p.donnees.trace?.vecue ?? false,
  };
}

export function plancheNeuve(p: Projet, modele: CleModele = "texte"): PlancheImage {
  return instancier(modele, contexteDuProjet(p));
}

/** Change le modèle d'une planche en gardant ce qui a été écrit. */
export function avecModele(p: Projet, index: number, modele: CleModele): Projet {
  const planche = p.planches[index];
  if (!planche || planche.type !== "image") return p;
  const planches = [...p.planches];
  planches[index] = changerModele(planche, modele, contexteDuProjet(p));
  return avecPlanches(p, planches);
}

export function projetNeuf(nom = "Sans titre"): Projet {
  const maintenant = new Date().toISOString();
  return {
    schema: SCHEMA,
    id: id("projet"),
    nom,
    creeLe: maintenant,
    modifieLe: maintenant,
    format: "carrousel",
    theme: "sombre",
    bilan: "apres",
    donnees: {
      trace: null,
      coupures: [],
      etiquettes: [],
      traceCadrage: null,
      seance: null,
    },
    medias: [],
    planches: [],
  };
}

export function historiqueNeuf(): Historique<Projet> {
  const vide = projetNeuf();
  // Un projet neuf s'ouvre sur une planche : un document sans rien n'apprend
  // pas ce qu'est une planche, et la première chose à faire serait d'en créer
  // une.
  return creer({ ...vide, planches: [plancheNeuve(vide, "carte")] });
}

/** Le format et le thème sont des réglages DU LOT : ils valent pour tout le projet. */
export function avecFormat(p: Projet, format: CleFormat): Projet {
  return { ...p, format, modifieLe: new Date().toISOString() };
}

export function avecTheme(p: Projet, theme: CleTheme): Projet {
  return { ...p, theme, modifieLe: new Date().toISOString() };
}

export function avecNom(p: Projet, nom: string): Projet {
  return { ...p, nom, modifieLe: new Date().toISOString() };
}

export function avecPlanches(p: Projet, planches: Projet["planches"]): Projet {
  return { ...p, planches, modifieLe: new Date().toISOString() };
}
