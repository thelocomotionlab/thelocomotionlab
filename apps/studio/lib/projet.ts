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
  deplacer,
  dupliquer,
  instancier,
  type CleFormat,
  type CleModele,
  type CleTheme,
  type ContexteModele,
  type Element,
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

/* ---------------------------------------------------- agir sur la sélection */

/** Applique une transformation aux éléments choisis de la planche courante. */
export function surSelection(
  p: Projet,
  index: number,
  ids: readonly string[],
  transforme: (e: Element) => Element,
): Projet {
  const planche = p.planches[index];
  if (!planche || planche.type !== "image") return p;
  const planches = [...p.planches];
  planches[index] = {
    ...planche,
    elements: planche.elements.map((e) => (ids.includes(e.id) ? transforme(e) : e)),
  };
  return avecPlanches(p, planches);
}

/** Retire les éléments choisis. Un élément verrouillé ne se supprime pas au
 *  clavier : c'est précisément ce contre quoi le verrou protège. */
export function sansSelection(p: Projet, index: number, ids: readonly string[]): Projet {
  const planche = p.planches[index];
  if (!planche || planche.type !== "image") return p;
  const planches = [...p.planches];
  planches[index] = {
    ...planche,
    elements: planche.elements.filter((e) => !ids.includes(e.id) || e.verrouille),
  };
  return avecPlanches(p, planches);
}

/** Duplique les éléments choisis, décalés, et rend les nouveaux identifiants. */
export function avecDoublons(
  p: Projet,
  index: number,
  ids: readonly string[],
): { projet: Projet; nouveaux: string[] } {
  const planche = p.planches[index];
  if (!planche || planche.type !== "image") return { projet: p, nouveaux: [] };
  const copies = planche.elements.filter((e) => ids.includes(e.id)).map((e) => dupliquer(e));
  if (copies.length === 0) return { projet: p, nouveaux: [] };
  const planches = [...p.planches];
  planches[index] = { ...planche, elements: [...planche.elements, ...copies] };
  return { projet: avecPlanches(p, planches), nouveaux: copies.map((e) => e.id) };
}

/**
 * Change l'ordre des calques.
 *
 * L'ordre du tableau EST l'ordre des calques, du fond vers l'avant : monter un
 * élément, c'est le déplacer vers la fin.
 */
export function avecOrdre(
  p: Projet,
  index: number,
  id: string,
  vers: "devant" | "derriere" | "premier" | "dernier",
): Projet {
  const planche = p.planches[index];
  if (!planche || planche.type !== "image") return p;
  const i = planche.elements.findIndex((e) => e.id === id);
  if (i < 0) return p;
  const elements = [...planche.elements];
  const [pris] = elements.splice(i, 1);
  const cible =
    vers === "devant"
      ? Math.min(elements.length, i + 1)
      : vers === "derriere"
        ? Math.max(0, i - 1)
        : vers === "dernier"
          ? elements.length
          : 0;
  elements.splice(cible, 0, pris!);
  const planches = [...p.planches];
  planches[index] = { ...planche, elements };
  return avecPlanches(p, planches);
}
