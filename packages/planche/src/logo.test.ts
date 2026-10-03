import { describe, expect, it } from "vitest";
import { CERCLE_LOGO, COTE_LOGO } from "@locomotionlab/ui/logo";

import { ctxFactice } from "./factice.ts";
import { cheminDuPied, dessinerLogo, lireChemin } from "./logo.ts";

describe("relire un chemin SVG", () => {
  it("rend des commandes absolues, en absolu comme en relatif", () => {
    expect(lireChemin("M 10,20 L 30,40 Z")).toEqual([
      { op: "M", x: 10, y: 20 },
      { op: "L", x: 30, y: 40 },
      { op: "Z" },
    ]);
    expect(lireChemin("m 10,20 l 5,5 h 10 v -5 z")).toEqual([
      { op: "M", x: 10, y: 20 },
      { op: "L", x: 15, y: 25 },
      { op: "L", x: 25, y: 25 },
      { op: "L", x: 25, y: 20 },
      { op: "Z" },
    ]);
  });

  it("lit les paires qui suivent un M comme des L, et repart du début après Z", () => {
    expect(lireChemin("m 1,1 2,0 0,2 z m 1,0 1,1")).toEqual([
      { op: "M", x: 1, y: 1 },
      { op: "L", x: 3, y: 1 },
      { op: "L", x: 3, y: 3 },
      { op: "Z" },
      { op: "M", x: 2, y: 1 },
      { op: "L", x: 3, y: 2 },
    ]);
  });

  it("répète une courbe sans relettre, et reflète le contrôle pour S", () => {
    expect(lireChemin("M 0,0 c 1,0 2,1 2,2 0,1 1,2 2,2 s 2,-1 2,-2")).toEqual([
      { op: "M", x: 0, y: 0 },
      { op: "C", x1: 1, y1: 0, x2: 2, y2: 1, x: 2, y: 2 },
      { op: "C", x1: 2, y1: 3, x2: 3, y2: 4, x: 4, y: 4 },
      { op: "C", x1: 5, y1: 4, x2: 6, y2: 3, x: 6, y: 2 },
    ]);
    // Sans courbe avant lui, S part du point courant.
    expect(lireChemin("M 1,1 S 2,2 3,3")[1]).toEqual({ op: "C", x1: 1, y1: 1, x2: 2, y2: 2, x: 3, y: 3 });
  });

  it("refuse une commande qu'il ne sait pas dessiner", () => {
    expect(() => lireChemin("M 0,0 A 1 1 0 0 1 2 2")).toThrow(/A/);
  });
});

describe("le pied du logo", () => {
  it("compte huit contours fermés, tous dans le carré du logo", () => {
    const pied = cheminDuPied();
    expect(pied.filter((c) => c.op === "M")).toHaveLength(8);
    expect(pied.filter((c) => c.op === "Z")).toHaveLength(8);
    for (const c of pied) {
      if (c.op === "Z") continue;
      const points = c.op === "C" ? [c.x1, c.y1, c.x2, c.y2, c.x, c.y] : [c.x, c.y];
      for (const v of points) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(COTE_LOGO);
      }
    }
  });
});

describe("dessiner le logo", () => {
  it("le pose à l'échelle de son carré, cercle puis pied, dans l'encre donnée", () => {
    const ctx = ctxFactice();
    const encres: unknown[] = [];
    const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
    const remplir = cible.fill!.bind(ctx);
    cible.fill = (...a: unknown[]) => {
      encres.push(ctx.fillStyle);
      remplir(...a);
    };
    dessinerLogo(ctx, 10, 20, COTE_LOGO / 2, "#123456");
    const ops = ctx.ops.map((o) => o.op);
    expect(ctx.ops.find((o) => o.op === "translate")!.args).toEqual([10, 20]);
    expect(ctx.ops.find((o) => o.op === "scale")!.args).toEqual([0.5, 0.5]);
    expect(ctx.ops.find((o) => o.op === "arc")!.args.slice(0, 3)).toEqual([
      CERCLE_LOGO.cx,
      CERCLE_LOGO.cy,
      CERCLE_LOGO.r,
    ]);
    expect(ops.indexOf("arc")).toBeLessThan(ops.indexOf("bezierCurveTo"));
    expect(encres).toEqual(["#123456"]);
    expect(ops.filter((o) => o === "stroke")).toHaveLength(2);
    expect(ctx.strokeStyle).toBe("#123456");
    expect(ops.at(-1)).toBe("restore");
  });

  it("ne pose rien dans un carré vide", () => {
    const ctx = ctxFactice();
    dessinerLogo(ctx, 0, 0, 0, "#123456");
    expect(ctx.ops).toHaveLength(0);
  });
});
