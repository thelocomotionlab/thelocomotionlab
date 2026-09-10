// lib/projet.ts
//
// Fabriquer un document vide, et le faire vivre dans un historique.
//
// L'état du poste de travail EST un `Historique<Projet>` : toute modification
// passe par `pousser`, donc tout est annulable par construction. Aucun chemin
// détourné n'existe pour changer le document — c'est ce qui évite qu'une action
// ajoutée dans six mois soit la seule qu'on ne puisse pas défaire.

import {
  SCHEMA,
  creer,
  type CleFormat,
  type CleModele,
  type CleTheme,
  type Historique,
  type PlancheImage,
  type Projet,
} from "@locomotionlab/planche";

/** Un identifiant court, unique dans la session. */
export function id(prefixe: string): string {
  return `${prefixe}-${Math.random().toString(36).slice(2, 9)}`;
}

export function plancheNeuve(modele: CleModele = "texte"): PlancheImage {
  return {
    id: id("planche"),
    type: "image",
    nom: "",
    modele,
    fond: "",
    tranche: { mode: "toutes", jour: 0 },
    elements: [],
  };
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
    planches: [plancheNeuve("carte")],
  };
}

export function historiqueNeuf(): Historique<Projet> {
  return creer(projetNeuf());
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
