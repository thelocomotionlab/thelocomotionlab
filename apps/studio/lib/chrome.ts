// lib/chrome.ts
//
// LE CHROME DE SÉLECTION, dessiné sur le calque des repères.
//
// Il ne part JAMAIS à l'export : cadre, poignées et guides vivent sur un second
// canvas, posé par-dessus la planche. Les dessiner dans le même canvas les
// enverrait sur Instagram.
//
// TOUT EST DIVISÉ PAR LE ZOOM. Le canvas est aux dimensions d'export et réduit
// en CSS ; une poignée de 10 px de planche mesurerait 5 px à l'écran à 50 %.
// On dessine donc en `taille / zoom`, ce qui la rend constante sous le doigt —
// et la visée utilise la même règle (cf. `poigneeSous`).

import {
  POIGNEE,
  centreDe,
  poignees,
  type BoitePx,
  type Ctx2D,
  type Guide,
  type Theme,
} from "@locomotionlab/planche";
import { brandColors } from "@locomotionlab/ui/tokens";

/** Le bleu-vert de la charte : sélection, poignées, guides, focus. Jamais l'ambre,
 *  réservé aux planches. */
const TEINTE = brandColors.primaryDark;

export type OptionsChrome = {
  zoom: number;
  cadre: BoitePx | null;
  rotation: number;
  /** Les boîtes de chaque élément choisi, quand il y en a plusieurs. */
  membres: BoitePx[];
  guides: Guide[];
  rectangle: BoitePx | null;
  verrouille: boolean;
};

/** Les repères d'atelier : marges de la charte et zone sûre d'Instagram. */
export function dessinerReperes(
  ctx: Ctx2D,
  l: number,
  h: number,
  marge: number,
  zoneSure: { top: number; bottom: number } | null,
  theme: Theme,
  zoom: number,
): void {
  ctx.save();
  ctx.strokeStyle = theme.filet;
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([6 / zoom, 7 / zoom]);
  ctx.strokeRect(marge, marge, l - marge * 2, h - marge * 2);
  if (zoneSure) {
    ctx.beginPath();
    ctx.moveTo(0, zoneSure.top);
    ctx.lineTo(l, zoneSure.top);
    ctx.moveTo(0, zoneSure.bottom);
    ctx.lineTo(l, zoneSure.bottom);
    ctx.stroke();
  }
  ctx.restore();
}

export function dessinerChrome(ctx: Ctx2D, l: number, h: number, o: OptionsChrome): void {
  const z = o.zoom;
  const px = (n: number) => n / z;

  // Les guides d'alignement, sous le cadre : ils traversent toute la planche.
  ctx.save();
  ctx.strokeStyle = TEINTE;
  ctx.lineWidth = px(1);
  ctx.setLineDash([]);
  for (const g of o.guides) {
    ctx.beginPath();
    if (g.axe === "x") {
      ctx.moveTo(g.position, 0);
      ctx.lineTo(g.position, h);
    } else {
      ctx.moveTo(0, g.position);
      ctx.lineTo(l, g.position);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Le rectangle de sélection tracé sur le fond.
  if (o.rectangle) {
    ctx.save();
    ctx.strokeStyle = TEINTE;
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(4), px(4)]);
    ctx.strokeRect(o.rectangle.x, o.rectangle.y, o.rectangle.l, o.rectangle.h);
    ctx.restore();
  }

  if (!o.cadre) return;

  // Sur une sélection multiple, chaque membre porte un liseré léger : sans lui
  // on ne sait pas ce qui est pris dans l'englobante.
  if (o.membres.length > 1) {
    ctx.save();
    ctx.strokeStyle = TEINTE;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(3), px(3)]);
    for (const m of o.membres) ctx.strokeRect(m.x, m.y, m.l, m.h);
    ctx.restore();
  }

  ctx.save();
  const c = centreDe(o.cadre);
  if (o.rotation) {
    ctx.translate(c.x, c.y);
    ctx.rotate((o.rotation * Math.PI) / 180);
    ctx.translate(-c.x, -c.y);
  }

  ctx.strokeStyle = TEINTE;
  ctx.lineWidth = px(1.5);
  ctx.setLineDash([]);
  ctx.strokeRect(o.cadre.x, o.cadre.y, o.cadre.l, o.cadre.h);

  // Un élément VERROUILLÉ montre son cadre mais pas ses poignées : il se
  // sélectionne — sinon on ne pourrait plus le déverrouiller — sans se déplacer.
  if (o.verrouille) {
    ctx.setLineDash([px(5), px(4)]);
    ctx.strokeRect(o.cadre.x, o.cadre.y, o.cadre.l, o.cadre.h);
    ctx.restore();
    return;
  }

  const cote = px(POIGNEE);
  const tout = poignees(o.cadre, 0);
  ctx.fillStyle = brandColors.paper;
  ctx.lineWidth = px(1.5);
  for (const [cle, p] of Object.entries(tout)) {
    if (cle === "rotation") {
      // La hampe qui relie la poignée de rotation au bord haut : sans elle, un
      // rond flotte au-dessus de l'élément sans qu'on sache à quoi il tient.
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, o.cadre.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, cote / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      continue;
    }
    // Les poignées de CÔTÉ ne servent qu'à un élément seul : sur une sélection
    // multiple, seuls les coins gardent un sens.
    if (o.membres.length > 1 && cle.length === 1) continue;
    ctx.beginPath();
    ctx.rect(p.x - cote / 2, p.y - cote / 2, cote, cote);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
