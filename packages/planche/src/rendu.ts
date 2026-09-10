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

import type { Ctx2D } from "./canvas.ts";
import { besoinDeFond, type BesoinDeFond } from "./carte.ts";
import { contexteDeRendu, segmentsMontres, type ContexteRendu } from "./contexte.ts";
import { dessinerElement } from "./elements.ts";
import { enPixels } from "./geometrie.ts";
import type { Element, PlancheImage } from "./types.ts";

export { contexteDeRendu, segmentsMontres };
export type { ContexteRendu, OptionsContexte } from "./contexte.ts";

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

/**
 * TOUT CE QU'UNE PLANCHE A BESOIN DE TÉLÉCHARGER avant d'être dessinée.
 *
 * L'app appelle ceci, va chercher les tuiles, remplit `contexte.fonds`, puis
 * dessine. Deux cartes qui cadrent le même terrain au même zoom partagent leur
 * besoin — il n'est donc rendu qu'une fois.
 */
export function besoinsDeFond(planche: PlancheImage, c: ContexteRendu): BesoinDeFond[] {
  const vus = new Set<string>();
  const out: BesoinDeFond[] = [];
  for (const e of planche.elements) {
    if (e.type !== "carte" || e.masque) continue;
    const besoin = besoinDeFond(e, enPixels(e, c.format.cle), c);
    if (!besoin || vus.has(besoin.cle)) continue;
    vus.add(besoin.cle);
    out.push(besoin);
  }
  return out;
}
