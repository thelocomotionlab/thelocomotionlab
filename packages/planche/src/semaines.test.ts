import { beforeAll, describe, expect, it } from "vitest";

import { definirVocabulaireDIcones } from "./canvas.ts";
import { THEMES } from "./charte.ts";
import { ctxFactice, type CtxFactice } from "./factice.ts";
import { semainesNeuves } from "./fabrique.ts";
import { barreSous, cadreDesSemaines, graduationDe, plafondDe } from "./semaines.ts";
import { dessinerSemaines } from "./semaines.ts";
import type { BoitePx, ElementSemaines } from "./types.ts";

beforeAll(() => {
  definirVocabulaireDIcones({ connue: () => false, dessiner: () => true });
});

const BOITE: BoitePx = { x: 64, y: 200, l: 952, h: 600 };

function semaines(over: Partial<ElementSemaines> = {}): ElementSemaines {
  return { ...semainesNeuves({ x: 0, y: 0, l: 1, h: 1 }), ...over };
}

const contexte = {
  police: "Ubuntu",
  theme: THEMES.sombre,
} as unknown as Parameters<typeof dessinerSemaines>[3];

describe("le plafond d'un axe", () => {
  /** Un axe qui s'arrête pile sur le maximum colle la plus haute barre au bord
   *  et donne une graduation qu'on ne lit pas. */
  it("arrondit vers le haut à un cran rond", () => {
    expect(plafondDe(87)).toBe(100);
    expect(plafondDe(100)).toBe(100);
    expect(plafondDe(101)).toBe(125);
    expect(plafondDe(4813)).toBe(5000);
  });

  it("ne rend jamais zéro, même sans données", () => {
    expect(plafondDe(0)).toBe(1);
    expect(plafondDe(-4)).toBe(1);
  });
});

describe("les graduations", () => {
  it("dit les minutes en heures", () => {
    // « 480 » ne veut rien dire d'une semaine ; « 8 » se lit d'un coup.
    expect(graduationDe(480, "minutes")).toBe("8");
  });

  it("abrège les milliers de mètres", () => {
    expect(graduationDe(4500, "dplus")).toBe("4.5k");
    expect(graduationDe(800, "dplus")).toBe("800");
  });
});

describe("viser une barre", () => {
  /**
   * LA MÊME GÉOMÉTRIE SERT À DESSINER ET À VISER. Deux calculs séparés auraient
   * fini par désigner deux barres différentes pour le même point — on clique la
   * troisième, c'est la quatrième qui change de couleur.
   */
  it("rend la barre sous le point", () => {
    const e = semaines();
    const cadre = cadreDesSemaines(e, BOITE)!;
    for (const i of [0, 5, 11]) {
      const x = cadre.trace.x + i * cadre.colonne + cadre.colonne / 2;
      expect(barreSous(e, BOITE, x, cadre.trace.y + 10)).toBe(i);
    }
  });

  it("ne vise rien hors du graphique", () => {
    const e = semaines();
    expect(barreSous(e, BOITE, BOITE.x - 20, BOITE.y + 10)).toBeNull();
    expect(barreSous(e, BOITE, BOITE.x + 100, BOITE.y - 20)).toBeNull();
  });

  it("ne vise rien quand il n'y a pas de semaine", () => {
    expect(barreSous(semaines({ lignes: [] }), BOITE, 500, 400)).toBeNull();
  });
});

describe("l'air du haut", () => {
  /** La graduation la plus haute s'écrit AU-DESSUS de sa ligne : sans réserve,
   *  elle sortait de la boîte, coupée en deux. */
  it("garde la graduation du haut dans la boîte", () => {
    const cadre = cadreDesSemaines(semaines({ axes: true }), BOITE)!;
    expect(cadre.trace.y).toBeGreaterThan(BOITE.y);
  });

  it("ne réserve rien quand il n'y a pas d'axes", () => {
    const cadre = cadreDesSemaines(semaines({ axes: false, legende: [] }), BOITE)!;
    expect(cadre.trace.y).toBe(BOITE.y);
    expect(cadre.trace.h).toBeLessThan(BOITE.h);
  });
});

describe("le dessin", () => {
  function rendre(e: ElementSemaines): CtxFactice {
    const ctx = ctxFactice();
    dessinerSemaines(ctx, e, BOITE, contexte);
    return ctx;
  }

  const teintes = (ctx: CtxFactice) =>
    ctx.ops.filter((o) => o.op === "fillRect").map(() => String(ctx.fillStyle));

  it("pose une barre par semaine", () => {
    const rects = rendre(semaines({ axes: false, legende: [] })).ops.filter(
      (o) => o.op === "fillRect",
    );
    // Douze barres, plus la ligne de sol.
    expect(rects.length).toBe(13);
  });

  it("donne à une barre SA couleur", () => {
    const e = semaines({ axes: false, courbe: null });
    e.lignes[3]!.couleur = "#D6246E";
    const ctx = ctxFactice();
    const vus: string[] = [];
    const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
    const fillRect = cible.fillRect!.bind(ctx);
    cible.fillRect = (...a: unknown[]) => {
      vus.push(String(ctx.fillStyle));
      fillRect(...a);
    };
    dessinerSemaines(ctx, e, BOITE, contexte);
    expect(vus).toContain("#D6246E");
    void teintes;
  });

  it("n'écrit qu'une étiquette sur N", () => {
    const dits = (pas: number) =>
      rendre(semaines({ pasDesLabels: pas, axes: false, legende: [] })).ops
        .filter((o) => o.op === "fillText")
        .map((o) => String(o.args[0]))
        .filter((t) => t.startsWith("S"));
    expect(dits(1).length).toBe(12);
    expect(dits(3).length).toBe(4);
  });

  it("ne dessine rien sans semaine, plutôt que de jeter", () => {
    expect(() => rendre(semaines({ lignes: [] }))).not.toThrow();
    expect(rendre(semaines({ lignes: [] })).ops.length).toBe(0);
  });
});
