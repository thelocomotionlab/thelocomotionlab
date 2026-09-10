// packages/planche/src/fabrique.ts
//
// LES ÉLÉMENTS NEUFS, aux valeurs de la charte.
//
// Un seul endroit fabrique un élément : le tiroir « Texte » qui pose un titre et
// le modèle « Carte » qui en instancie un doivent produire exactement le même
// objet, sinon deux titres du même carrousel n'ont pas les mêmes réglages selon
// la façon dont ils sont arrivés.
//
// Les positions sont en FRACTIONS du format. Les corps restent en pixels d'une
// planche de 1080 de large — c'est ainsi que la charte les énonce.

import { CORPS, GRAISSES, LETTRAGE } from "./charte.ts";
import type {
  Boite,
  CleVariable,
  Element,
  ElementCases,
  ElementCarte,
  ElementFiche,
  ElementForme,
  ElementIcone,
  ElementMarque,
  ElementPhoto,
  ElementProfil,
  ElementStat,
  ElementTexte,
  RoleTexte,
} from "./types.ts";

let compteur = 0;

/** Un identifiant court et unique dans la session. */
export function idNeuf(prefixe: string): string {
  compteur += 1;
  return `${prefixe}-${compteur.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function commun(type: string, boite: Boite, nom: string) {
  return {
    id: idNeuf(type),
    nom,
    x: boite.x,
    y: boite.y,
    l: boite.l,
    h: boite.h,
    rotation: 0,
    opacite: 1,
    verrouille: false,
    masque: false,
    groupe: null,
  };
}

/**
 * LES TROIS RÔLES DE TEXTE DE LA CHARTE.
 *
 * Surtitre en capitales espacées ouvertes d'un filet ambre, titre en 700 sur
 * deux lignes, corps régulier et aéré. C'est la hiérarchie du compte, et elle
 * tient à la graisse, à la casse et à l'interlettrage — jamais à une seconde
 * fonte.
 */
export function styleDuRole(role: RoleTexte): Partial<ElementTexte> {
  switch (role) {
    case "surtitre":
      return {
        corps: CORPS.surtitre,
        graisse: GRAISSES.appuye,
        casse: "capitales",
        lettrage: LETTRAGE.surtitre,
        interligne: 1.2,
        filetOuvrant: { largeur: 46, epaisseur: CORPS.filet, couleur: "" },
      };
    case "titre":
      return {
        corps: CORPS.titre,
        graisse: GRAISSES.gras,
        casse: "normale",
        lettrage: 0,
        interligne: 1.12,
      };
    case "corps":
      return {
        corps: CORPS.corps,
        graisse: GRAISSES.courant,
        casse: "normale",
        lettrage: 0,
        interligne: 1.55,
      };
    default:
      return { corps: CORPS.corps, graisse: GRAISSES.courant, casse: "normale", lettrage: 0 };
  }
}

export function texteNeuf(
  boite: Boite,
  contenu = "",
  role: RoleTexte = "corps",
  over: Partial<ElementTexte> = {},
): ElementTexte {
  const nom = role === "libre" ? "Texte" : role[0]!.toUpperCase() + role.slice(1);
  return {
    ...commun("texte", boite, nom),
    type: "texte",
    contenu,
    lignesDures: true,
    role,
    puce: "point",
    corps: CORPS.corps,
    graisse: GRAISSES.courant,
    italique: false,
    casse: "normale",
    couleur: "",
    alignement: "gauche",
    interligne: 1.55,
    lettrage: 0,
    ombre: null,
    plaque: null,
    filetOuvrant: null,
    filetSousTitre: null,
    ...styleDuRole(role),
    ...over,
  } as ElementTexte;
}

export function photoNeuve(boite: Boite, over: Partial<ElementPhoto> = {}): ElementPhoto {
  return {
    ...commun("photo", boite, "Photo"),
    type: "photo",
    mediaId: null,
    cadrage: { x: 0.5, y: 0.5, echelle: 1 },
    retournee: false,
    reglages: { luminosite: 1, contraste: 1, saturation: 1 },
    voile: null,
    degrades: null,
    coins: 0,
    bordure: null,
    fondDePlanche: false,
    ...over,
  };
}

export function formeNeuve(boite: Boite, over: Partial<ElementForme> = {}): ElementForme {
  return {
    ...commun("forme", boite, "Forme"),
    type: "forme",
    forme: "rectangle",
    remplissage: "",
    contour: null,
    coins: 0,
    ...over,
  };
}

/** Le filet ambre de la charte, posable n'importe où. */
export function filetNeuf(boite: Boite, over: Partial<ElementForme> = {}): ElementForme {
  return formeNeuve(boite, { forme: "filet", remplissage: "", ...over, nom: "Filet" } as Partial<ElementForme>);
}

export function iconeNeuve(boite: Boite, cle: string, over: Partial<ElementIcone> = {}): ElementIcone {
  return {
    ...commun("icone", boite, "Icône"),
    type: "icone",
    cle,
    couleur: "",
    epaisseur: 1.75,
    ...over,
  };
}

export function marqueNeuve(boite: Boite, over: Partial<ElementMarque> = {}): ElementMarque {
  return {
    ...commun("marque", boite, "Marque"),
    type: "marque",
    variante: "logo-nom",
    teinte: "",
    ...over,
  };
}

export function statNeuve(
  boite: Boite,
  variable: CleVariable,
  libelle: string | null = null,
  over: Partial<ElementStat> = {},
): ElementStat {
  return {
    ...commun("stat", boite, "Chiffre"),
    type: "stat",
    variable,
    libelle,
    taille: 72,
    valeurManuelle: null,
    ...over,
  };
}

export function ficheNeuve(boite: Boite, over: Partial<ElementFiche> = {}): ElementFiche {
  return {
    ...commun("fiche", boite, "Fiche"),
    type: "fiche",
    tailleLibelle: CORPS.ficheLabel,
    tailleValeur: CORPS.ficheValeur,
    lignes: [
      { libelle: "Distance", valeur: null, variable: "distance", accent: false },
      { libelle: "Dénivelé", valeur: null, variable: "dplus", accent: false },
      { libelle: "Durée", valeur: null, variable: "duree", accent: true },
    ],
    ...over,
  };
}

export function carteNeuve(boite: Boite, over: Partial<ElementCarte> = {}): ElementCarte {
  return {
    ...commun("carte", boite, "Carte"),
    type: "carte",
    fond: "topo",
    couleurs: [],
    epaisseur: 6,
    etiquettes: [],
    depart: true,
    arrivee: true,
    itineraireSourdine: true,
    ...over,
  };
}

export function profilNeuf(boite: Boite, over: Partial<ElementProfil> = {}): ElementProfil {
  return {
    ...commun("profil", boite, "Profil"),
    type: "profil",
    remplissage: "",
    restantEstompe: true,
    ...over,
  };
}

export function casesNeuves(boite: Boite, over: Partial<ElementCases> = {}): ElementCases {
  return {
    ...commun("cases", boite, "Journées"),
    type: "cases",
    colonnes: 2,
    miniCarte: true,
    miniProfil: true,
    filet: true,
    ...over,
  };
}

/** Une copie décalée, prête à poser — ce que fait « Dupliquer ». */
export function dupliquer(element: Element, decalage = 0.02): Element {
  return {
    ...element,
    id: idNeuf(element.type),
    x: element.x + decalage,
    y: element.y + decalage,
  };
}
