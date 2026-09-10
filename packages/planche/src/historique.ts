// packages/planche/src/historique.ts
//
// ANNULER ET REFAIRE.
//
// Avec cent vingt et un réglages par planche, une fausse manœuvre coûtait cher
// et ne se rattrapait pas : c'est le manque le plus criant du studio v1, et
// « Propager », qui applique un style à TOUTES les planches, y était sans retour.
//
// DES ÉTATS, PAS DES DIFFÉRENCES. La pile garde des références vers les états
// successifs. Ça ne coûte pas ce qu'on croit, à une condition : que les mises à
// jour soient IMMUABLES et partagent ce qui n'a pas changé. Déplacer un élément
// crée alors un élément neuf, une planche neuve et un document neuf — tout le
// reste, y compris les autres planches et les médias, est partagé par référence.
// Une étape pèse quelques dizaines d'octets, pas un document.
//
// UN GLISSÉ EST UNE ÉTAPE, pas quarante. Un déplacement à la souris émet un état
// par image ; on les FUSIONNE par une clé (« deplacer:elem-3 »). La clé se
// referme au relâchement (`sceller`), et une fenêtre de temps sert de filet
// quand l'appelant oublie de le faire — deux glissés du même élément à dix
// secondes d'écart restent deux étapes.

/** Au-delà, la fusion ne joue plus : c'est un second geste, pas la suite. */
export const FENETRE_FUSION = 700;

/**
 * Le fond de pile. « Illimité dans la session » ne veut pas dire sans borne :
 * une session de plusieurs heures finirait par retenir des dizaines de milliers
 * d'états, et les plus anciens n'intéressent plus personne.
 */
export const PROFONDEUR = 500;

export type Etape<T> = {
  etat: T;
  /** Ce que le bouton « Annuler » annonce : « Annuler le déplacement ». */
  libelle: string;
};

export type Historique<T> = {
  present: T;
  passe: Etape<T>[];
  futur: Etape<T>[];
  /** La clé de fusion en cours, et l'instant du dernier ajout. */
  fusion: string | null;
  le: number;
};

export type OptionsPoussee = {
  libelle?: string;
  /** Deux poussées de suite portant la même clé ne font qu'une étape. */
  fusion?: string | null;
  /** L'horloge, injectable pour les tests. */
  maintenant?: number;
  profondeur?: number;
};

export function creer<T>(etat: T): Historique<T> {
  return { present: etat, passe: [], futur: [], fusion: null, le: 0 };
}

/**
 * Enregistre un nouvel état.
 *
 * Pousser efface le FUTUR : on vient de repartir dans une autre direction, et
 * garder un « refaire » qui rejouerait l'ancienne branche donnerait un document
 * que personne n'a composé.
 */
export function pousser<T>(
  h: Historique<T>,
  etat: T,
  options: OptionsPoussee = {},
): Historique<T> {
  const { libelle = "", fusion = null } = options;
  const maintenant = options.maintenant ?? Date.now();
  const profondeur = options.profondeur ?? PROFONDEUR;

  if (etat === h.present) return h;

  const fusionne =
    fusion !== null && h.fusion === fusion && maintenant - h.le <= FENETRE_FUSION;

  // En fusion, l'état courant remplace le précédent SANS empiler : le passé
  // garde l'état d'avant le geste, qui est celui où Ctrl+Z doit ramener.
  const passe = fusionne ? h.passe : [...h.passe, { etat: h.present, libelle }];

  return {
    present: etat,
    passe: passe.length > profondeur ? passe.slice(passe.length - profondeur) : passe,
    futur: [],
    fusion,
    le: maintenant,
  };
}

/** Referme le geste en cours : la poussée suivante ouvrira une étape neuve. */
export function sceller<T>(h: Historique<T>): Historique<T> {
  return h.fusion === null ? h : { ...h, fusion: null };
}

export function peutAnnuler<T>(h: Historique<T>): boolean {
  return h.passe.length > 0;
}

export function peutRefaire<T>(h: Historique<T>): boolean {
  return h.futur.length > 0;
}

export function annuler<T>(h: Historique<T>): Historique<T> {
  const derniere = h.passe[h.passe.length - 1];
  if (derniere === undefined) return h;
  return {
    present: derniere.etat,
    passe: h.passe.slice(0, -1),
    futur: [{ etat: h.present, libelle: derniere.libelle }, ...h.futur],
    fusion: null,
    le: 0,
  };
}

export function refaire<T>(h: Historique<T>): Historique<T> {
  const prochaine = h.futur[0];
  if (prochaine === undefined) return h;
  return {
    present: prochaine.etat,
    passe: [...h.passe, { etat: h.present, libelle: prochaine.libelle }],
    futur: h.futur.slice(1),
    fusion: null,
    le: 0,
  };
}

/** Ce que le bouton annonce, ou `null` s'il n'y a rien à annuler. */
export function libelleAnnulation<T>(h: Historique<T>): string | null {
  return h.passe[h.passe.length - 1]?.libelle ?? null;
}

export function libelleRetablissement<T>(h: Historique<T>): string | null {
  return h.futur[0]?.libelle ?? null;
}
