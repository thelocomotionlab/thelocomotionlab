"use client";

// lib/pieces.ts
//
// LES PIÈCES DÉTACHÉES : la trace, le profil, la carte, la marque — seules, en
// PNG transparent.
//
// C'est ce qu'on va chercher quand la planche ne suffit pas : poser la
// silhouette d'un tour sur une affiche, glisser un profil dans un message,
// mettre le logo sur un dossard. La v1 les sortait depuis un coin de l'atelier,
// avec ses propres réglages ; ici elles passent par LE MÊME rendu que les
// planches, donc par la même charte, les mêmes couleurs de journées et les
// mêmes tuiles.
//
// LA PIÈCE EST ROGNÉE À SA BOÎTE. On ne rend pas une planche entière pour n'en
// garder qu'un morceau au milieu de mille pixels vides : le canvas fait la
// taille de l'élément, et le rendu y est translaté. Le fond de la planche vaut
// « transparent » — une couleur CSS valide qui ne peint rien.

import {
  besoinsDeFond,
  carteNeuve,
  contexteDeRendu,
  dessinerAvecCadre,
  enPixels,
  marqueNeuve,
  profilNeuf,
  type Element,
  type PlancheImage,
  type Projet,
} from "@locomotionlab/planche";
import { decouperTrace } from "@locomotionlab/trace";

import { imagesEnCache } from "./images";
import { policeDuLabo } from "./police";
import { completerLesFonds, fondsEnCache } from "./tuiles";
import { enNomDeFichier, logoDuLabo } from "./export";

export type Piece = {
  cle: string;
  label: string;
  aide: string;
  /** Vrai quand le projet a de quoi la dessiner. */
  possible: boolean;
  element: (p: Projet) => Element;
};

/** Une boîte carrée, pleine largeur : la pièce sera rognée à ce rapport. */
const CARREE = { x: 0, y: 0, l: 1, h: 0.8 };
const BANDE = { x: 0, y: 0, l: 1, h: 0.28 };

export const PIECES: Piece[] = [
  {
    cle: "trace",
    label: "La trace",
    aide: "La silhouette seule, sans fond de carte ni étiquette.",
    possible: true,
    element: () =>
      carteNeuve(CARREE, { fond: "aucun", etiquettes: [], nom: "Trace" } as never),
  },
  {
    cle: "carte",
    label: "La carte",
    aide: "L'itinéraire sur son relief, sans un mot.",
    possible: true,
    element: () => carteNeuve(CARREE, { etiquettes: [], nom: "Carte" } as never),
  },
  {
    cle: "profil",
    label: "Le profil",
    aide: "La silhouette altimétrique, remplie.",
    possible: true,
    element: () => profilNeuf(BANDE),
  },
  {
    cle: "marque",
    label: "La marque",
    aide: "Le logo cerclé et le nom, à l'ambre du thème.",
    possible: true,
    element: () => marqueNeuve(BANDE, { variante: "logo-nom" }),
  },
];

/** Les pièces que CE projet peut réellement fournir. */
export function piecesDe(projet: Projet): Piece[] {
  const aTrace = projet.donnees.trace !== null;
  return PIECES.map((p) => ({
    ...p,
    possible: p.cle === "marque" ? true : aTrace,
  }));
}

/**
 * Rend une pièce sur un fond transparent, rognée à sa boîte.
 *
 * `largeur` est la largeur voulue du fichier ; la hauteur suit le rapport de la
 * pièce, pour qu'un profil ne sorte jamais dans un carré à bandes.
 */
export async function rendrePiece(
  projet: Projet,
  piece: Piece,
  largeur: number,
): Promise<HTMLCanvasElement> {
  const element = piece.element(projet);
  const boite = enPixels(element, projet.format);
  const echelle = largeur / boite.l;

  const toile = document.createElement("canvas");
  toile.width = Math.max(1, Math.round(boite.l * echelle));
  toile.height = Math.max(1, Math.round(boite.h * echelle));
  const ctx = toile.getContext("2d");
  if (!ctx) throw new Error("canvas indisponible");

  // Une planche d'un seul élément, sur un fond qui ne peint rien : c'est le
  // même rendu que celui des planches, sans second chemin.
  const planche: PlancheImage = {
    id: `piece-${piece.cle}`,
    type: "image",
    nom: piece.label,
    modele: "texte",
    fond: "transparent",
    tranche: { mode: "toutes", jour: 0 },
    elements: [element],
  };
  const c = contexteDeRendu(projet, planche, {
    police: policeDuLabo(),
    segments: decouperTrace(projet.donnees.trace, projet.donnees.coupures),
    fonds: fondsEnCache(),
    images: imagesEnCache(),
    logo: await logoDuLabo(),
  });
  await completerLesFonds(besoinsDeFond(planche, c));

  ctx.scale(echelle, echelle);
  ctx.translate(-boite.x, -boite.y);
  dessinerAvecCadre(ctx, element, { ...c, fonds: fondsEnCache() });
  return toile;
}

export function nomDePiece(projet: Projet, piece: Piece): string {
  return `${enNomDeFichier(projet.nom, "projet")}-${piece.cle}.png`;
}
