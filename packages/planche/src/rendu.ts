// packages/planche/src/rendu.ts
//
// DESSINER UNE PLANCHE : parcourir ses éléments, du fond vers l'avant.
//
// C'est le renversement de la v1. Un gabarit y était une fonction de 300 lignes
// qui posait un titre, une photo et des chiffres à des places connues d'elle
// seule ; rien n'existait séparément, donc rien ne pouvait être sélectionné,
// déplacé ni mis en calque. Ici chaque type d'élément a UNE fonction de dessin
// qui reçoit sa boîte, et la planche n'est plus que l'ordre de la liste.
//
// L'APERÇU EST L'IMAGE FINALE : le canvas est aux dimensions d'export, et le
// plan de travail ne fait que le réduire en CSS. Aucune fonction d'ici ne
// connaît le zoom.
//
// LES REPÈRES D'ATELIER (marges, zone sûre, cadre de sélection) NE SONT PAS
// DESSINÉS ICI. Ils se posent par-dessus, dans l'app : ce fichier ne produit que
// ce qui part sur Instagram.

import { formatDe, themeDe } from "./charte.ts";
import type { Ctx2D, SourceImage } from "./canvas.ts";
import { dessinerElement } from "./elements.ts";
import type { Contexte as ContexteVariables } from "./variables.ts";
import { segmentsDeLaTranche } from "./variables.ts";
import { enPixels } from "./geometrie.ts";
import type { Format, Theme } from "./charte.ts";
import type { Element, PlancheImage, Projet, Tranche } from "./types.ts";
import type { Segment } from "@locomotionlab/trace";

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
};

export type OptionsContexte = {
  images?: Map<string, SourceImage>;
  logo?: SourceImage | null;
  segments?: Segment[];
  police?: string;
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
  };
}

/** Les journées que la planche montre — carte, profil et chiffres les suivent. */
export function segmentsMontres(c: ContexteRendu): Segment[] {
  return segmentsDeLaTranche(c.segments, c.tranche);
}

/** Le fond de la planche : celui qu'elle impose, sinon celui du thème. */
export function dessinerFond(ctx: Ctx2D, planche: PlancheImage, c: ContexteRendu): void {
  ctx.save();
  ctx.fillStyle = planche.fond || c.theme.fond;
  ctx.fillRect(0, 0, c.format.width, c.format.height);
  ctx.restore();
}

/**
 * Dessine une planche entière.
 *
 * L'ORDRE DU TABLEAU EST L'ORDRE DES CALQUES, du fond vers l'avant : c'est la
 * seule chose qui décide de ce qui recouvre quoi. Un `zIndex` par élément aurait
 * permis deux vérités contradictoires — la liste et le nombre.
 */
export function dessinerPlanche(ctx: Ctx2D, planche: PlancheImage, c: ContexteRendu): void {
  dessinerFond(ctx, planche, c);
  for (const element of planche.elements) dessinerAvecCadre(ctx, element, c);
}

/**
 * Pose un élément dans son cadre : opacité, rotation, puis le dessin propre au
 * type.
 *
 * La rotation se fait autour du CENTRE de la boîte : autour du coin, tourner un
 * titre de deux degrés l'enverrait à l'autre bout de la planche.
 */
export function dessinerAvecCadre(ctx: Ctx2D, element: Element, c: ContexteRendu): void {
  if (element.masque) return;
  const boite = enPixels(element, c.format.cle);
  if (!(boite.l > 0) || !(boite.h > 0)) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, element.opacite));
  if (element.rotation) {
    const cx = boite.x + boite.l / 2;
    const cy = boite.y + boite.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((element.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  dessinerElement(ctx, element, boite, c);
  ctx.restore();
}
