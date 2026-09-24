import { beforeAll, describe, expect, it } from "vitest";

import { definirVocabulaireDIcones } from "./canvas.ts";
import { THEMES } from "./charte.ts";
import { ctxFactice, type CtxFactice } from "./factice.ts";
import { semainesNeuves } from "./fabrique.ts";
import {
  avecTexteDuGraphique,
  axeDe,
  barreSous,
  cadreDesSemaines,
  ecrireLesSeries,
  graduationDe,
  graduationsDe,
  lireLesSeries,
  plafondDe,
} from "./semaines.ts";
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

describe("lire le bloc de données", () => {
  const BLOC = `
      abscisse: ["S1", "S2", "S3", "S4"]
      series:
        - { nom: "Distance", unite: "km", valeurs: [77, 84, 94, 102] }
        - { nom: "Dénivelé positif", unite: "m", valeurs: [3200, 3600, 4500, 7100] }
  `;

  it("lit l'abscisse et les séries", () => {
    const lu = lireLesSeries(BLOC);
    expect(lu.abscisse).toEqual(["S1", "S2", "S3", "S4"]);
    expect(lu.series).toHaveLength(2);
    expect(lu.series[0]).toEqual({ nom: "Distance", unite: "km", valeurs: [77, 84, 94, 102] });
    expect(lu.series[1]!.nom).toBe("Dénivelé positif");
  });

  /**
   * LA LECTURE EST TOLÉRANTE, et c'est le point : ce bloc se tape à la main, et
   * il y manque une accolade une fois sur deux. Refuser tout le bloc pour un
   * crochet oublié ferait perdre dix-sept valeurs à qui voulait en corriger une.
   */
  it("pardonne une accolade et un crochet oubliés en fin de bloc", () => {
    const lu = lireLesSeries(`
      abscisse: ["S1", "S2"]
      series:
        - { nom: "Distance", unite: "km", valeurs: [77, 84] }
        - { nom: "Dénivelé", unite: "m", valeurs: [3200, 3600]
    `);
    expect(lu.series).toHaveLength(2);
    expect(lu.series[1]!.valeurs).toEqual([3200, 3600]);
  });

  it("accepte la virgule décimale d'un tableur français", () => {
    expect(lireLesSeries('series:\n - { nom: "D", unite: "km", valeurs: [77,5] }')).toBeTruthy();
    const lu = lireLesSeries('abscisse: ["A"]\nseries:\n  - { nom: "D", unite: "h", valeurs: [7.5] }');
    expect(lu.series[0]!.valeurs).toEqual([7.5]);
  });

  it("ne rend rien plutôt que de jeter sur un bloc vide", () => {
    expect(lireLesSeries("")).toEqual({ abscisse: [], series: [] });
    expect(lireLesSeries("n'importe quoi")).toEqual({ abscisse: [], series: [] });
  });

  it("se relit : ce qu'on écrit se relit à l'identique", () => {
    const lu = lireLesSeries(BLOC);
    expect(lireLesSeries(ecrireLesSeries(lu))).toEqual(lu);
  });
});

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

describe("les axes", () => {
  it("choisissent un pas rond qui tombe sur le plafond", () => {
    // « 0 · 67 · 133 · 200 » se lisait comme une erreur de calcul.
    expect(axeDe(198, null, null)).toEqual({ plafond: 200, pas: 50 });
    expect(axeDe(12800, null, null)).toEqual({ plafond: 15000, pas: 5000 });
    expect(axeDe(121, null, null)).toEqual({ plafond: 125, pas: 25 });
  });

  it("suivent un plafond imposé ; un pas imposé pousse le plafond au multiple suivant", () => {
    expect(axeDe(198, 250, null)).toEqual({ plafond: 250, pas: 50 });
    expect(axeDe(198, null, 60)).toEqual({ plafond: 240, pas: 60 });
    expect(axeDe(198, 300, 100)).toEqual({ plafond: 300, pas: 100 });
  });

  it("énumèrent les graduations de zéro au plafond", () => {
    expect(graduationsDe({ plafond: 200, pas: 50 })).toEqual([0, 50, 100, 150, 200]);
    expect(graduationsDe(axeDe(0, null, null)).length).toBeGreaterThan(1);
  });
});

describe("les réglages du dessin", () => {
  const rendre = (e: ElementSemaines): CtxFactice => {
    const ctx = ctxFactice();
    dessinerSemaines(ctx, e, BOITE, contexte);
    return ctx;
  };
  const combien = (ctx: CtxFactice, op: string) => ctx.ops.filter((o) => o.op === op).length;

  it("la grille se coupe sans emporter les chiffres des axes", () => {
    const avec = rendre(semaines({ axes: true, grille: true, courbe: null, legende: [] }));
    const sans = rendre(semaines({ axes: true, grille: false, courbe: null, legende: [] }));
    expect(combien(sans, "fillRect")).toBeLessThan(combien(avec, "fillRect"));
    expect(combien(sans, "fillText")).toBe(combien(avec, "fillText"));
  });

  it("la largeur des barres suit le réglage, bornée à la colonne", () => {
    const etroit = cadreDesSemaines(semaines({ largeurBarre: 0.4 }), BOITE)!;
    const large = cadreDesSemaines(semaines({ largeurBarre: 1 }), BOITE)!;
    expect(large.barre).toBeCloseTo(large.colonne);
    expect(etroit.barre).toBeCloseTo(large.colonne * 0.4);
  });

  it("les pastilles s'éteignent, la courbe reste", () => {
    const avec = rendre(semaines({ pastilles: true, axes: false, legende: [] }));
    const sans = rendre(semaines({ pastilles: false, axes: false, legende: [] }));
    expect(combien(avec, "arc")).toBe(12);
    expect(combien(sans, "arc")).toBe(0);
    expect(combien(sans, "stroke")).toBeGreaterThan(0);
  });
});

describe("les graduations", () => {
  it("abrège au-delà du millier", () => {
    // « 12800 » prend la largeur de deux barres et ne se lit pas mieux.
    expect(graduationDe(12800)).toBe("12.8k");
    expect(graduationDe(4500)).toBe("4.5k");
    expect(graduationDe(5000)).toBe("5k");
    expect(graduationDe(800)).toBe("800");
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
    expect(barreSous(semaines({ abscisse: [], series: [] }), BOITE, 500, 400)).toBeNull();
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

describe("les textes du graphique", () => {
  const k = BOITE.l / 1080;
  const avec = (textes: Partial<ElementSemaines["textes"]>, over: Partial<ElementSemaines> = {}) => {
    const e = semaines(over);
    return { ...e, textes: { ...e.textes, ...textes } };
  };

  /** Des graduations de trois caractères au plus : « 200 » à gauche, « 15k » à droite. */
  const troisCaracteres = {
    abscisse: ["S1", "S2", "S3"],
    series: [
      { nom: "Distance", unite: "km", valeurs: [77, 198, 44] },
      { nom: "Dénivelé positif", unite: "m", valeurs: [3200, 12800, 700] },
    ],
  };

  it("gardent par défaut la géométrie d'avant", () => {
    const e = semaines({ ...troisCaracteres, axes: true, titresAxes: true, courbe: 1, inclinaison: 0 });
    const cadre = cadreDesSemaines(e, BOITE)!;
    const c = 22 * k;
    expect(cadre.trace.y - BOITE.y).toBeCloseTo(c * 1.9, 6);
    expect(cadre.trace.x - BOITE.x).toBeCloseTo(c * 2.6, 6);
    expect(BOITE.x + BOITE.l - (cadre.trace.x + cadre.trace.l)).toBeCloseTo(c * 2.6, 6);
    expect(cadre.reserveBas).toBeCloseTo(c * 2.2, 6);
  });

  it("élargissent la marge d'un axe dont les graduations sont plus longues", () => {
    const e = semaines({ ...troisCaracteres, axes: true, courbe: 1 });
    const court = cadreDesSemaines(e, BOITE)!;
    // « 2.5k » : quatre caractères, la marge de 2,6 corps ne suffit plus.
    const long = cadreDesSemaines({ ...e, plafondCourbe: 2500, pasCourbe: 500 }, BOITE)!;
    expect(long.trace.l).toBeLessThan(court.trace.l);
    expect(long.trace.x).toBeCloseTo(court.trace.x, 6);
  });

  it("font suivre les marges à leur corps", () => {
    const base = cadreDesSemaines(semaines({ axes: true, titresAxes: true }), BOITE)!;
    const ord = cadreDesSemaines(avec({ ordonnees: { taille: 40, couleur: "" } }, { axes: true }), BOITE)!;
    expect(ord.trace.x).toBeGreaterThan(base.trace.x);
    expect(ord.trace.y).toBeGreaterThan(base.trace.y);
    const tit = cadreDesSemaines(avec({ titres: { taille: 40, couleur: "" } }, { axes: true }), BOITE)!;
    expect(tit.trace.y).toBeGreaterThan(base.trace.y);
    expect(tit.trace.x).toBeCloseTo(base.trace.x, 6);
    const abs = cadreDesSemaines(avec({ abscisse: { taille: 40, couleur: "" } }), BOITE)!;
    expect(abs.reserveBas).toBeGreaterThan(base.reserveBas);
    const leg = (taille: number | null) =>
      cadreDesSemaines(
        avec({ legende: { taille, couleur: "" } }, { legende: [{ couleur: "", texte: "WEC" }] }),
        BOITE,
      )!.trace.h;
    expect(leg(60)).toBeLessThan(leg(null));
  });

  it("posent chaque texte à son corps et à son encre", () => {
    const vus: { texte: string; encre: string; fonte: string }[] = [];
    const ctx = ctxFactice();
    const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
    const fillText = cible.fillText!.bind(ctx);
    cible.fillText = (...a: unknown[]) => {
      vus.push({ texte: String(a[0]), encre: String(ctx.fillStyle), fonte: String(ctx.font) });
      fillText(...a);
    };
    const e = avec(
      {
        abscisse: { taille: 30, couleur: "#111111" },
        ordonnees: { taille: 26, couleur: "#222222" },
        titres: { taille: 34, couleur: "#333333" },
        legende: { taille: 28, couleur: "#444444" },
      },
      { axes: true, titresAxes: true, courbe: 1, legende: [{ couleur: "", texte: "WEC" }] },
    );
    dessinerSemaines(ctx, e, BOITE, contexte);
    const cadre = cadreDesSemaines(e, BOITE)!;
    const de = (texte: string) => vus.find((v) => v.texte === texte)!;
    expect(de("S1")).toMatchObject({ encre: "#111111" });
    expect(de("S1").fonte).toContain(`${cadre.tailles.abscisse}px`);
    expect(de("0")).toMatchObject({ encre: "#222222" });
    expect(de("0").fonte).toContain(`${cadre.tailles.ordonnees}px`);
    expect(de("Distance (km)")).toMatchObject({ encre: "#333333" });
    expect(de("Dénivelé positif (m)")).toMatchObject({ encre: "#333333" });
    expect(de("Distance (km)").fonte).toContain(`${cadre.tailles.titres}px`);
    expect(de("WEC")).toMatchObject({ encre: "#444444" });
    expect(de("WEC").fonte).toContain(`${cadre.tailles.legende}px`);
  });

  it("se règlent un par un, même sur un graphique posé avant qu'ils se règlent", () => {
    const { textes: _, ...ancien } = semaines();
    const regle = avecTexteDuGraphique(ancien as ElementSemaines, "titres", { taille: 34 });
    expect(regle.textes.titres).toEqual({ taille: 34, couleur: "" });
    expect(regle.textes.abscisse).toEqual({ taille: null, couleur: "" });
    const encre = avecTexteDuGraphique(regle, "titres", { couleur: "#333333" });
    expect(encre.textes.titres).toEqual({ taille: 34, couleur: "#333333" });
  });

  it("gardent par défaut les encres du thème, et la couleur de sa série pour chaque titre", () => {
    const vus = new Map<string, string>();
    const ctx = ctxFactice();
    const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
    const fillText = cible.fillText!.bind(ctx);
    cible.fillText = (...a: unknown[]) => {
      if (!vus.has(String(a[0]))) vus.set(String(a[0]), String(ctx.fillStyle));
      fillText(...a);
    };
    const e = semaines({ axes: true, titresAxes: true, courbe: 1, couleurBarres: "#8CB9BD", couleurCourbe: "#EFB159" });
    dessinerSemaines(ctx, e, BOITE, contexte);
    expect(vus.get("S1")).toBe(THEMES.sombre.encreDouce);
    expect(vus.get("0")).toBe(THEMES.sombre.encreFaible);
    expect(vus.get("Distance (km)")).toBe("#8CB9BD");
    expect(vus.get("Dénivelé positif (m)")).toBe("#EFB159");
  });
});

describe("les étiquettes en biais", () => {
  it("réservent plus de place sous l'axe que les droites", () => {
    const droites = cadreDesSemaines(semaines({ inclinaison: 0 }), BOITE)!;
    const biais = cadreDesSemaines(semaines({ inclinaison: 45 }), BOITE)!;
    expect(biais.reserveBas).toBeGreaterThan(droites.reserveBas);
    expect(biais.trace.h).toBeLessThan(droites.trace.h);
  });

  it("tournent chaque étiquette écrite, et aucune de plus", () => {
    const ctx = ctxFactice();
    dessinerSemaines(
      ctx,
      semaines({ inclinaison: 45, pasDesLabels: 3, axes: false, legende: [] }),
      BOITE,
      contexte,
    );
    const rotations = ctx.ops.filter((o) => o.op === "rotate");
    expect(rotations.length).toBe(4);
    expect(rotations[0]!.args[0]).toBeCloseTo(-Math.PI / 4);
  });

  it("ne tournent rien quand elles sont droites", () => {
    const ctx = ctxFactice();
    dessinerSemaines(ctx, semaines({ inclinaison: 0, axes: false, legende: [] }), BOITE, contexte);
    expect(ctx.ops.some((o) => o.op === "rotate")).toBe(false);
  });

  it("posent la légende sous les étiquettes, quelle que soit leur pente", () => {
    const ctx = ctxFactice();
    const e = semaines({ inclinaison: 60, axes: false, legende: [{ couleur: "", texte: "WEC" }] });
    dessinerSemaines(ctx, e, BOITE, contexte);
    const cadre = cadreDesSemaines(e, BOITE)!;
    const legende = ctx.ops.find((o) => o.op === "fillText" && o.args[0] === "WEC")!;
    expect(legende.args[2] as number).toBeGreaterThan(cadre.trace.y + cadre.trace.h + cadre.reserveBas);
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
    const e = semaines({ axes: false, courbe: null, couleurs: [] });
    e.couleurs[3] = "#D6246E";
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
    const vide = semaines({ abscisse: [], series: [] });
    expect(() => rendre(vide)).not.toThrow();
    expect(rendre(vide).ops.length).toBe(0);
  });
});
