// packages/planche/src/logo.ts
//
// LE LOGO, TRACÉ SUR LE CANVAS depuis sa géométrie.
//
// Le chemin SVG est relu une fois en commandes absolues — `moveTo`, `lineTo`,
// `bezierCurveTo` — plutôt que confié à `Path2D` : le rendu tourne aussi sous
// Node et sous les tests, où `Path2D` n'existe pas.

import { CERCLE_LOGO, CHEMIN_PIED, COTE_LOGO, EPAISSEUR_PIED } from "@locomotionlab/ui/logo";
import type { Ctx2D } from "./canvas.ts";

export type Commande =
  | { op: "M"; x: number; y: number }
  | { op: "L"; x: number; y: number }
  | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" };

/** Combien de nombres chaque commande consomme par répétition. */
const ARITE: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Z: 0 };

/**
 * Relit un chemin SVG en commandes absolues : M, L, H, V, C, S et Z, en absolu
 * comme en relatif. Des paires qui suivent un M sont des L, comme le veut SVG.
 * Une commande hors de cette liste lève une erreur plutôt que de dessiner faux.
 */
export function lireChemin(d: string): Commande[] {
  const jetons = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: Commande[] = [];
  let x = 0;
  let y = 0;
  let departX = 0;
  let departY = 0;
  // Le second point de contrôle de la dernière courbe : S le reflète.
  let controleX = 0;
  let controleY = 0;
  let lettre = "";
  let i = 0;
  const nombre = () => Number(jetons[i++]);

  while (i < jetons.length) {
    if (/^[A-Za-z]$/.test(jetons[i]!)) lettre = jetons[i++]!;
    const op = lettre.toUpperCase();
    const relatif = lettre !== op;
    if (!(op in ARITE)) throw new Error(`Commande de chemin non prise en charge : ${lettre}`);
    if (op === "Z") {
      out.push({ op: "Z" });
      x = departX;
      y = departY;
      continue;
    }
    if (i + ARITE[op]! > jetons.length) break;
    const dx = relatif ? x : 0;
    const dy = relatif ? y : 0;
    if (op === "M") {
      x = nombre() + dx;
      y = nombre() + dy;
      departX = x;
      departY = y;
      out.push({ op: "M", x, y });
      lettre = relatif ? "l" : "L";
    } else if (op === "L" || op === "H" || op === "V") {
      if (op !== "V") x = nombre() + dx;
      if (op !== "H") y = nombre() + dy;
      out.push({ op: "L", x, y });
    } else {
      // C porte ses deux points de contrôle ; S reprend le reflet du dernier.
      const derniere = out[out.length - 1];
      const reflet = derniere?.op === "C";
      const x1 = op === "C" ? nombre() + dx : reflet ? 2 * x - controleX : x;
      const y1 = op === "C" ? nombre() + dy : reflet ? 2 * y - controleY : y;
      const x2 = nombre() + dx;
      const y2 = nombre() + dy;
      x = nombre() + dx;
      y = nombre() + dy;
      controleX = x2;
      controleY = y2;
      out.push({ op: "C", x1, y1, x2, y2, x, y });
    }
  }
  return out;
}

let pied: Commande[] | null = null;

/** Le pied, relu au premier dessin puis gardé. */
export function cheminDuPied(): Commande[] {
  pied ??= lireChemin(CHEMIN_PIED);
  return pied;
}

/** Pose le logo dans le carré de côté `cote` dont le coin haut gauche est (x, y). */
export function dessinerLogo(ctx: Ctx2D, x: number, y: number, cote: number, encre: string): void {
  if (!(cote > 0)) return;
  const k = cote / COTE_LOGO;
  ctx.save();
  ctx.translate(x, y);
  // L'échelle s'applique aussi aux épaisseurs : le trait garde la proportion du SVG.
  ctx.scale(k, k);
  ctx.fillStyle = encre;
  ctx.strokeStyle = encre;

  ctx.beginPath();
  ctx.arc(CERCLE_LOGO.cx, CERCLE_LOGO.cy, CERCLE_LOGO.r, 0, Math.PI * 2);
  ctx.lineWidth = CERCLE_LOGO.epaisseur;
  ctx.stroke();

  ctx.beginPath();
  for (const c of cheminDuPied()) {
    if (c.op === "M") ctx.moveTo(c.x, c.y);
    else if (c.op === "L") ctx.lineTo(c.x, c.y);
    else if (c.op === "C") ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    else ctx.closePath();
  }
  ctx.fill();
  ctx.lineWidth = EPAISSEUR_PIED;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}
