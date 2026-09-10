// packages/planche/src/contexte.ts
//
// CE QU'UN ÉLÉMENT PEUT AVOIR BESOIN DE SAVOIR, rassemblé une fois.
//
// Ce module ne dessine rien : il est le socle que le rendu, les éléments et la
// carte partagent. Le sortir de `rendu.ts` évite un cycle — le rendu appelle les
// éléments, qui appellent la carte, qui a besoin du contexte.

import { formatDe, themeDe } from "./charte.ts";
import type { FondPret } from "./carte.ts";
import type { SourceImage } from "./canvas.ts";
import type { Format, Theme } from "./charte.ts";
import type { Contexte as ContexteVariables } from "./variables.ts";
import { segmentsDeLaTranche } from "./variables.ts";
import type { Coord, PointSeance, Segment } from "@locomotionlab/trace";
import type { PlancheImage, PlancheSurvol, Projet, Tranche } from "./types.ts";

/**
 * TOUT CE QU'UN ÉLÉMENT PEUT AVOIR BESOIN DE SAVOIR, rassemblé une fois.
 *
 * Les images sont DÉJÀ DÉCODÉES : le rendu est synchrone de bout en bout, et
 * c'est ce qui permet d'exporter une vidéo image par image sans jamais attendre.
 * Charger est le travail de l'app, dessiner celui d'ici.
 */
export type ContexteRendu = {
  format: Format;
  theme: Theme;
  /** La famille CSS résolue — une seule dans la charte. */
  police: string;
  /** Les photos du projet, par identifiant de média. */
  images: Map<string, SourceImage>;
  /** L'empreinte du labo, pour les éléments « marque ». */
  logo: SourceImage | null;
  /** Les journées découpées, dans l'ordre. */
  segments: Segment[];
  /** La tranche que suivent les éléments liés aux données. */
  tranche: Tranche;
  /** De quoi résoudre `{distance}`, `{allure}`… */
  variables: ContexteVariables;
  /**
   * LES MOSAÏQUES DÉJÀ ASSEMBLÉES, par clé de fond.
   *
   * Le rendu est synchrone et les tuiles viennent du réseau : la carte DIT ce
   * dont elle a besoin, l'app va le chercher et le range ici. Une carte dont la
   * mosaïque manque se dessine quand même, sur son aplat.
   */
  fonds: Map<string, FondPret>;
  /**
   * LES COORDONNÉES QUI CADRENT LES CARTES, figées.
   *
   * Changer la tranche de journées ne doit pas recadrer la carte, sinon la série
   * glisse d'une planche à l'autre. `null` : on cadre sur la trace courante.
   */
  cadrage: Coord[] | null;
};

export type OptionsContexte = {
  images?: Map<string, SourceImage>;
  logo?: SourceImage | null;
  segments?: Segment[];
  police?: string;
  fonds?: Map<string, FondPret>;
  cadrage?: Coord[] | null;
};

/**
 * Le contexte de rendu d'une planche du projet.
 *
 * La tranche vient de la PLANCHE, pas du projet : c'est elle qui fait qu'une
 * planche d'étape montre le jour 3 quand sa voisine montre le tour entier.
 */
export function contexteDeRendu(
  projet: Projet,
  planche: PlancheImage,
  options: OptionsContexte = {},
): ContexteRendu {
  const segments = options.segments ?? [];
  return {
    format: formatDe(projet.format),
    theme: themeDe(projet.theme),
    police: options.police ?? "sans-serif",
    images: options.images ?? new Map(),
    logo: options.logo ?? null,
    segments,
    tranche: planche.tranche,
    variables: {
      trace: projet.donnees.trace,
      seance: projet.donnees.seance,
      segments,
      tranche: planche.tranche,
      bilan: projet.bilan,
      nomProjet: projet.nom,
      planche: Math.max(0, projet.planches.indexOf(planche)),
      planches: projet.planches.length,
    },
    fonds: options.fonds ?? new Map(),
    cadrage: options.cadrage ?? projet.donnees.traceCadrage?.coords ?? null,
  };
}

/** Les journées que la planche montre — carte, profil et chiffres les suivent. */
export function segmentsMontres(c: ContexteRendu): Segment[] {
  return segmentsDeLaTranche(c.segments, c.tranche);
}

/**
 * Le contexte de rendu du HUD d'un survol, à un point donné de la séance.
 *
 * UN SEUL ENDROIT construit ce contexte, et l'aperçu comme l'export l'appellent.
 * Les deux le fabriquaient chacun de leur côté — même recette, deux copies —, et
 * c'est très exactement là qu'ils auraient fini par diverger : le jour où l'un
 * gagne un réglage que l'autre n'a pas, la vidéo cesse d'être l'aperçu qu'on a
 * validé, et c'est toute la promesse du studio qui tombe.
 *
 * `instant` est le point regardé : c'est lui qui fait défiler les chiffres.
 */
export function contexteDuHud(
  projet: Projet,
  planche: PlancheSurvol,
  instant: PointSeance | null,
  options: OptionsContexte = {},
): { contexte: ContexteRendu; elements: PlancheImage["elements"] } {
  // Le HUD est une liste d'éléments ordinaires : on l'emballe dans une planche
  // image le temps du rendu, sans fond ni tranche — la scène est dessous, et un
  // survol montre la sortie entière.
  const support: PlancheImage = {
    id: planche.id,
    type: "image",
    nom: planche.nom,
    modele: "texte",
    fond: "",
    tranche: { mode: "toutes", jour: 0 },
    elements: planche.hud,
  };
  const base = contexteDeRendu(projet, support, options);
  return {
    contexte: { ...base, variables: { ...base.variables, instant } },
    elements: planche.hud,
  };
}
