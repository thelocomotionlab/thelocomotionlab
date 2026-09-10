// packages/planche/src/factice.ts
//
// UN CONTEXTE 2D DE COMPTOIR, pour les tests.
//
// Une lettre vaut dix pixels, quelle que soit la fonte, et chaque opération de
// dessin est notée. Mesurer sans canvas rend la mise en page testable ; noter
// les tracés rend la POSE testable — l'ordre de la plaque et du texte, la
// position d'un soulignement, l'écart entre deux capitales.
//
// Ce module ne sort pas du barrel : rien d'une app ne doit l'importer.

import type { Ctx2D } from "./canvas.ts";

export type Op = { op: string; args: unknown[] };

export type CtxFactice = Ctx2D & { ops: Op[] };

/** Largeur d'une lettre dans le contexte de comptoir. */
export const LETTRE = 10;

export function ctxFactice(): CtxFactice {
  const ops: Op[] = [];
  const note =
    (op: string) =>
    (...args: unknown[]) => {
      ops.push({ op, args });
    };
  return {
    ops,
    font: "",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    shadowColor: "rgba(0,0,0,0)",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    measureText: (t: string) => ({ width: t.length * LETTRE }),
    fillText: note("fillText"),
    fillRect: note("fillRect"),
    strokeRect: note("strokeRect"),
    clearRect: note("clearRect"),
    drawImage: note("drawImage"),
    beginPath: note("beginPath"),
    closePath: note("closePath"),
    moveTo: note("moveTo"),
    lineTo: note("lineTo"),
    quadraticCurveTo: note("quadraticCurveTo"),
    arc: note("arc"),
    ellipse: note("ellipse"),
    rect: note("rect"),
    fill: note("fill"),
    stroke: note("stroke"),
    clip: note("clip"),
    setLineDash: note("setLineDash"),
    save: note("save"),
    restore: note("restore"),
    translate: note("translate"),
    rotate: note("rotate"),
    scale: note("scale"),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  } as CtxFactice;
}
