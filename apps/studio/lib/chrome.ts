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
  type SourceImage,
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
  /** Le recadrage en cours : la photo entière, son cadre, et de quoi la dessiner. */
  recadrage: { source: SourceImage; cadre: BoitePx; etendue: BoitePx } | null;
};

/**
 * LE RECADRAGE MONTRE CE QU'ON ÉCARTE.
 *
 * La photo entière apparaît en sourdine autour du cadre, qui reste net : on
 * voit alors ce qu'on est en train de perdre, au lieu de tirer à l'aveugle sur
 * ce qui ne s'affiche pas. Le tout est dessiné sur le calque des repères, donc
 * ne part jamais à l'export.
 */
function dessinerRecadrage(ctx: Ctx2D, l: number, h: number, o: OptionsChrome): void {
  const r = o.recadrage;
  if (!r) return;
  const z = o.zoom;
  ctx.save();

  // Le voile sur toute la planche, la photo entière par-dessus mais estompée.
  ctx.fillStyle = "rgba(24, 26, 22, 0.62)";
  ctx.fillRect(0, 0, l, h);
  ctx.globalAlpha = 0.4;
  ctx.drawImage(r.source, r.etendue.x, r.etendue.y, r.etendue.l, r.etendue.h);
  ctx.globalAlpha = 1;

  // Et la part retenue, à pleine lumière, dans son cadre.
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.cadre.x, r.cadre.y, r.cadre.l, r.cadre.h);
  ctx.clip();
  ctx.drawImage(r.source, r.etendue.x, r.etendue.y, r.etendue.l, r.etendue.h);
  ctx.restore();

  ctx.strokeStyle = TEINTE;
  ctx.lineWidth = 2 / z;
  ctx.setLineDash([]);
  ctx.strokeRect(r.cadre.x, r.cadre.y, r.cadre.l, r.cadre.h);

  // La règle des tiers : le seul repère de cadrage qui serve à quelque chose.
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1 / z;
  ctx.beginPath();
  for (let i = 1; i < 3; i += 1) {
    ctx.moveTo(r.cadre.x + (r.cadre.l * i) / 3, r.cadre.y);
    ctx.lineTo(r.cadre.x + (r.cadre.l * i) / 3, r.cadre.y + r.cadre.h);
    ctx.moveTo(r.cadre.x, r.cadre.y + (r.cadre.h * i) / 3);
    ctx.lineTo(r.cadre.x + r.cadre.l, r.cadre.y + (r.cadre.h * i) / 3);
  }
  ctx.stroke();
  ctx.restore();
}

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

  // Le recadrage prend toute la place : pas de cadre de sélection, pas de
  // guides, rien d'autre à faire tant qu'on est dedans.
  if (o.recadrage) {
    dessinerRecadrage(ctx, l, h, o);
    return;
  }

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
