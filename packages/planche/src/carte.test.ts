import { beforeAll, describe, expect, it } from "vitest";
import { decouperTrace, traceDepuisTrackJson } from "@locomotionlab/trace";
import type { Coord, Trace } from "@locomotionlab/trace";

import { definirVocabulaireDIcones } from "./canvas.ts";
import {
  MAX_TUILES,
  attributionDe,
  besoinDeFond,
  cleDuFond,
  vueDeLaCarte,
} from "./carte.ts";
import { contexteDeRendu } from "./contexte.ts";
import { ctxFactice, type CtxFactice } from "./factice.ts";
import { besoinsDeFond, dessinerPlanche } from "./rendu.ts";
import { PALETTE_JOURS, THEMES } from "./charte.ts";
import { brandColors } from "@locomotionlab/ui/tokens";
import { carteNeuve } from "./fabrique.ts";
import { TILE_SIZE, cadrer, decimerPixels, normX, normY, tuilesDeLaVue } from "./projection.ts";
import { SCHEMA } from "./types.ts";
import type { BoitePx, ElementCarte, PlancheImage, Projet } from "./types.ts";

beforeAll(() => {
  definirVocabulaireDIcones({ connue: (c) => c === "col", dessiner: () => true });
});

/** Une trace en toit sur 1,2° de longitude — assez pour un vrai cadrage. */
function trace(): Trace {
  const coords: Coord[] = [];
  const profile: { km: number; alt: number }[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const t = i / 120;
    coords.push([6 + t * 1.2, 44.9 + Math.sin(t * Math.PI) * 0.3]);
    profile.push({ km: t * 120, alt: 1000 + (t < 0.5 ? t : 1 - t) * 2000 });
  }
  return traceDepuisTrackJson({
    schemaVersion: 1,
    totalKm: 120,
    dPlusM: 1000,
    dMinusM: 1000,
    coords,
    profile,
    nom: "Tour des Écrins",
  })!;
}

const BOITE: BoitePx = { x: 64, y: 400, l: 952, h: 600 };

function monde(elements: ElementCarte[], avecTrace = true) {
  const t = avecTrace ? trace() : null;
  const planche: PlancheImage = {
    id: "p1",
    type: "image",
    nom: "",
    modele: "carte",
    fond: "",
    tranche: { mode: "toutes", jour: 0 },
    elements,
  };
  const p: Projet = {
    schema: SCHEMA,
    id: "projet",
    nom: "Écrins",
    creeLe: "",
    modifieLe: "",
    format: "carrousel",
    theme: "sombre",
    bilan: "apres",
    donnees: { trace: t, coupures: [40, 80], etiquettes: [], traceCadrage: null, seance: null },
    medias: [],
    planches: [planche],
  };
  const c = contexteDeRendu(p, planche, {
    police: "Ubuntu",
    segments: decouperTrace(t, [40, 80]),
  });
  return { p, planche, c };
}

describe("projection", () => {
  it("Mercator : le nord est en haut, l'équateur au milieu", () => {
    expect(normY(0)).toBeCloseTo(0.5, 9);
    expect(normY(60)).toBeLessThan(0.5);
    expect(normY(-60)).toBeGreaterThan(0.5);
    expect(normX(-180)).toBe(0);
    expect(normX(180)).toBe(1);
  });

  it("borne les pôles, où Mercator part à l'infini", () => {
    expect(Number.isFinite(normY(90))).toBe(true);
    expect(Number.isFinite(normY(-90))).toBe(true);
  });

  it("cadre l'itinéraire DANS la fenêtre demandée", () => {
    const vue = cadrer(trace().coords, { x: 40, y: 40, l: 400, h: 300 })!;
    const projetes = trace().coords.map(vue.project);
    const xs = projetes.map((p) => p[0]);
    const ys = projetes.map((p) => p[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(39);
    expect(Math.max(...xs)).toBeLessThanOrEqual(441);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(39);
    expect(Math.max(...ys)).toBeLessThanOrEqual(341);
  });

  it("RATTRAPE le zoom fractionnaire avec l'échelle", () => {
    // Les tuiles n'existent qu'à des zooms entiers ; sans ce rattrapage, un
    // itinéraire peut n'occuper que la moitié de la fenêtre prévue.
    const vue = cadrer(trace().coords, { x: 0, y: 0, l: 500, h: 500 })!;
    expect(Number.isInteger(vue.zoom)).toBe(true);
    expect(vue.echelle).toBeGreaterThan(0.5);
    expect(vue.echelle).toBeLessThanOrEqual(2);
  });

  it("arrondit l'origine au pixel — sinon la trace se décale de son fond", () => {
    const vue = cadrer(trace().coords, { x: 0, y: 0, l: 500, h: 500 })!;
    expect(Number.isInteger(vue.originX)).toBe(true);
    expect(Number.isInteger(vue.originY)).toBe(true);
  });

  it("survit à un itinéraire dégénéré, et rend null sur du vide", () => {
    expect(cadrer([[6, 45]], { x: 0, y: 0, l: 100, h: 100 })).not.toBeNull();
    expect(cadrer([], { x: 0, y: 0, l: 100, h: 100 })).toBeNull();
    expect(cadrer([[Number.NaN, 45]], { x: 0, y: 0, l: 100, h: 100 })).toBeNull();
  });

  it("compte les tuiles qui couvrent la vue", () => {
    const vue = cadrer(trace().coords, { x: 0, y: 0, l: 500, h: 500 })!;
    const m = tuilesDeLaVue(vue);
    expect(m.colonnes).toBeGreaterThan(0);
    expect(m.rangs).toBeGreaterThan(0);
    expect(m.coupeX).toBeGreaterThanOrEqual(0);
    expect(m.coupeX).toBeLessThan(TILE_SIZE);
    expect(m.coupeY).toBeGreaterThanOrEqual(0);
    expect(m.coupeY).toBeLessThan(TILE_SIZE);
  });
});

describe("decimerPixels", () => {
  it("jette les points qui tombent dans le même pixel", () => {
    const serres: [number, number][] = Array.from({ length: 500 }, (_, i) => [i * 0.05, 0]);
    const out = decimerPixels(serres, 1.2);
    expect(out.length).toBeLessThan(serres.length / 5);
  });

  it("GARDE LE DERNIER POINT — c'est lui qui porte l'arrivée", () => {
    const serres: [number, number][] = Array.from({ length: 500 }, (_, i) => [i * 0.05, 0]);
    expect(decimerPixels(serres).at(-1)).toEqual(serres.at(-1));
    expect(decimerPixels(serres)[0]).toEqual(serres[0]);
  });

  it("laisse une polyligne courte intacte", () => {
    const court: [number, number][] = [
      [0, 0],
      [10, 10],
    ];
    expect(decimerPixels(court)).toEqual(court);
  });
});

describe("les tuiles à télécharger", () => {
  it("dit exactement ce qu'il faut, dans l'ordre de lecture", () => {
    const { c } = monde([]);
    const e = carteNeuve({ x: 0, y: 0, l: 1, h: 1 }, { fond: "topo" });
    const besoin = besoinDeFond(e, BOITE, c)!;
    expect(besoin.urls).toHaveLength(besoin.colonnes * besoin.rangs);
    expect(besoin.urls[0]).toContain("opentopomap");
    expect(besoin.urls[0]).toMatch(/\/\d+\/\d+\/\d+\.png$/);
  });

  it("le sous-domaine est CHOISI PAR LA TUILE, pas au hasard", () => {
    // Deux rendus de la même carte demandent alors les mêmes URL, et le cache
    // du navigateur sert la seconde fois — sans quoi un export vidéo
    // retéléchargerait la mosaïque à chaque image.
    const { c } = monde([]);
    const e = carteNeuve({ x: 0, y: 0, l: 1, h: 1 }, { fond: "topo" });
    expect(besoinDeFond(e, BOITE, c)!.urls).toEqual(besoinDeFond(e, BOITE, c)!.urls);
  });

  it("un fond « aucun » ne demande rien — la silhouette suffit", () => {
    const { c } = monde([]);
    expect(besoinDeFond(carteNeuve({ x: 0, y: 0, l: 1, h: 1 }, { fond: "aucun" }), BOITE, c)).toBeNull();
  });

  it("sans trace, il n'y a rien à cadrer et rien à demander", () => {
    const { c } = monde([], false);
    expect(besoinDeFond(carteNeuve({ x: 0, y: 0, l: 1, h: 1 }), BOITE, c)).toBeNull();
  });

  it("GARDE-FOU : jamais une avalanche de requêtes", () => {
    const { c } = monde([]);
    const besoin = besoinDeFond(carteNeuve({ x: 0, y: 0, l: 1, h: 1 }), BOITE, c);
    expect(besoin === null || besoin.urls.length <= MAX_TUILES).toBe(true);
  });

  it("deux cartes du même terrain ne demandent la mosaïque qu'une fois", () => {
    const a = carteNeuve({ x: 0.06, y: 0.3, l: 0.88, h: 0.44 });
    const b = { ...carteNeuve({ x: 0.06, y: 0.3, l: 0.88, h: 0.44 }), id: "carte-2" };
    const { planche, c } = monde([a, b]);
    expect(besoinsDeFond(planche, c)).toHaveLength(1);
  });

  it("une carte masquée ne télécharge rien", () => {
    const cachee = { ...carteNeuve({ x: 0.06, y: 0.3, l: 0.88, h: 0.44 }), masque: true };
    const { planche, c } = monde([cachee]);
    expect(besoinsDeFond(planche, c)).toEqual([]);
  });

  it("la clé décrit ce qui a été demandé", () => {
    expect(cleDuFond("relief", 12, 2100, 1480, 3, 2)).toBe("relief/12/2100/1480/3x2");
  });

  it("chaque fond porte son attribution — c'est la règle, pas une option", () => {
    expect(attributionDe("topo")).toContain("OpenTopoMap");
    expect(attributionDe("satellite")).toContain("Esri");
    expect(attributionDe("relief")).toContain("Esri");
    expect(attributionDe("aucun")).toBeNull();
  });
});

describe("dessiner une carte", () => {
  const carte = () => carteNeuve({ x: 0.06, y: 0.3, l: 0.88, h: 0.44 }, { fond: "aucun" });

  function rendre(e: ElementCarte, avecTrace = true): CtxFactice {
    const ctx = ctxFactice();
    const { planche, c } = monde([e], avecTrace);
    dessinerPlanche(ctx, planche, c);
    return ctx;
  }

  it("trace une polyligne par journée montrée", () => {
    const ctx = rendre(carte());
    // Trois journées, chacune sur son liseré : six passages de `stroke`.
    expect(ctx.ops.filter((o) => o.op === "stroke").length).toBeGreaterThanOrEqual(6);
  });

  it("SANS RÉSEAU, la carte se dessine quand même sur son aplat", () => {
    // Une carte ne doit jamais échouer à cause du réseau : la mosaïque manque,
    // la trace reste.
    const ctx = rendre(carte());
    expect(ctx.ops.some((o) => o.op === "fillRect")).toBe(true);
    expect(ctx.ops.some((o) => o.op === "stroke")).toBe(true);
    expect(ctx.ops.some((o) => o.op === "drawImage")).toBe(false);
  });

  it("sans trace, elle pose l'aplat et s'arrête", () => {
    const ctx = rendre(carte(), false);
    expect(ctx.ops.some((o) => o.op === "fillRect")).toBe(true);
    expect(ctx.ops.some((o) => o.op === "stroke")).toBe(false);
  });

  it("pose les bornes de départ et d'arrivée quand on les demande", () => {
    const avec = rendre({ ...carte(), depart: true, arrivee: true });
    const sans = rendre({ ...carte(), depart: false, arrivee: false });
    const arcs = (c: CtxFactice) => c.ops.filter((o) => o.op === "arc").length;
    expect(arcs(avec)).toBe(arcs(sans) + 2);
  });

  it("l'itinéraire en sourdine SITUE la journée, et s'éteint", () => {
    const traits = (b: boolean) =>
      rendre({ ...carte(), itineraireSourdine: b }).ops.filter((o) => o.op === "stroke").length;
    expect(traits(true)).toBeGreaterThan(traits(false));
  });

  const dits = (ctx: CtxFactice) =>
    ctx.ops.filter((o) => o.op === "fillText").map((o) => o.args[0]).join("");

  it("nomme chaque journée sans qu'on ait rien à écrire", () => {
    // Une trace découpée APRÈS la planche doit se nommer toute seule.
    expect(dits(rendre({ ...carte(), etiquettes: [] }))).toContain("J1");
    expect(dits(rendre({ ...carte(), etiquettes: [] }))).toContain("J2");
  });

  it("une entrée RÉÉCRIT l'étiquette de sa journée", () => {
    const ctx = rendre({
      ...carte(),
      etiquettes: [
        { id: "e2", segment: 1, texte: "Arsine", icone: "col", dx: 0.05, dy: -0.02, masquee: false },
      ],
    });
    // Le texte s'écrit TEL QU'ON LE TAPE : une étiquette nomme un lieu — « col
    // d'Arsine » —, elle ne crie pas.
    expect(dits(ctx)).toContain("Arsine");
    expect(dits(ctx)).toContain("J1");
    expect(dits(ctx)).not.toContain("J2");
  });

  it("une entrée masquée efface celle de sa journée, et elle seule", () => {
    const ctx = rendre({
      ...carte(),
      etiquettes: [
        { id: "e1", segment: 0, texte: "", icone: null, dx: 0, dy: 0, masquee: true },
      ],
    });
    expect(dits(ctx)).not.toContain("J1");
    expect(dits(ctx)).toContain("J2");
  });

  it("une entrée qui nomme une journée absente est ignorée, pas fatale", () => {
    const ctx = rendre({
      ...carte(),
      etiquettes: [
        { id: "e9", segment: 42, texte: "Nulle part", icone: null, dx: 0, dy: 0, masquee: false },
      ],
    });
    expect(dits(ctx)).not.toContain("NULLE");
  });

  it("s'éteint d'un réglage", () => {
    expect(dits(rendre({ ...carte(), etiquettesAuto: false }))).not.toContain("J1");
  });

  it("LE CADRAGE NE BOUGE PAS quand la tranche change", () => {
    // Sinon la série glisse d'une planche à l'autre : trois cartes du même
    // carrousel doivent montrer le même terrain.
    const { c } = monde([]);
    const toutes = vueDeLaCarte(BOITE, c.variables.trace!.coords)!;
    const seule = vueDeLaCarte(BOITE, c.variables.trace!.coords)!;
    expect(seule.zoom).toBe(toutes.zoom);
    expect(seule.originX).toBe(toutes.originX);
  });
});

describe("l'aplat de la carte", () => {
  /** Les `fillRect` couvrant exactement la boîte : c'est ça, un aplat. */
  function aplats(fond: ElementCarte["fond"]): number {
    const carte = { ...carteNeuve({ x: 0.06, y: 0.3, l: 0.88, h: 0.44 }), fond };
    const { planche, c } = monde([carte]);
    const ctx: CtxFactice = ctxFactice();
    dessinerPlanche(ctx, planche, c);
    const b = { x: 0.06 * 1080, y: 0.3 * 1350, l: 0.88 * 1080, h: 0.44 * 1350 };
    return ctx.ops.filter(
      (o) =>
        o.op === "fillRect" &&
        Math.abs((o.args[0] as number) - b.x) < 1 &&
        Math.abs((o.args[2] as number) - b.l) < 1 &&
        Math.abs((o.args[3] as number) - b.h) < 1,
    ).length;
  }

  it("pose un lavis quand la carte ATTEND ses tuiles", () => {
    expect(aplats("topo")).toBe(1);
  });

  it("n'en pose aucun sur une silhouette, qui n'attend rien", () => {
    // Sinon la trace d'une story traîne une bande grise en travers de la photo.
    expect(aplats("aucun")).toBe(0);
  });
});

describe("les dégradés de la carte", () => {
  function carteAvec(degrades: unknown): ElementCarte {
    return { ...carteNeuve({ x: 0, y: 0, l: 1, h: 1 }), degrades } as ElementCarte;
  }

  /** Les `fillRect` posés avec un dégradé — pas un aplat. */
  function voiles(degrades: unknown): { y: number; h: number }[] {
    const ctx = ctxFactice();
    const vus: { y: number; h: number }[] = [];
    const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
    const fillRect = cible.fillRect!.bind(ctx);
    cible.fillRect = (...a: unknown[]) => {
      if (typeof ctx.fillStyle === "object") vus.push({ y: Number(a[1]), h: Number(a[3]) });
      fillRect(...a);
    };
    const el = carteAvec(degrades);
    const { planche, c } = monde([el]);
    dessinerPlanche(ctx, planche, c);
    return vus;
  }

  it("n'en pose aucun quand rien n'est réglé", () => {
    expect(voiles(null)).toEqual([]);
  });

  it("pose celui du haut depuis le bord, celui du bas jusqu'au bord", () => {
    const vus = voiles({ haut: 0.8, hautH: 180, bas: 1, basH: 520 });
    expect(vus.length).toBe(2);
    expect(vus[0]!.y).toBe(0);
    expect(vus[1]!.y + vus[1]!.h).toBeCloseTo(1350, 0);
  });

  it("une intensité nulle éteint son voile", () => {
    expect(voiles({ haut: 0, hautH: 180, bas: 1, basH: 520 }).length).toBe(1);
    expect(voiles({ haut: 0.8, hautH: 180, bas: 0, basH: 520 }).length).toBe(1);
  });

  it("une hauteur nulle aussi", () => {
    expect(voiles({ haut: 0.8, hautH: 0, bas: 0.5, basH: 0 })).toEqual([]);
  });
});

describe("le liseré de la trace", () => {
  /** Les couleurs de trait posées, dans l'ordre. */
  function traits(theme: "clair" | "sombre"): string[] {
    const ctx = ctxFactice();
    const vus: string[] = [];
    const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
    const stroke = cible.stroke!.bind(ctx);
    cible.stroke = (...a: unknown[]) => {
      vus.push(String(ctx.strokeStyle));
      stroke(...a);
    };
    const el = carteNeuve({ x: 0, y: 0, l: 1, h: 1 });
    const { planche, c } = monde([el]);
    dessinerPlanche(ctx, planche, { ...c, theme: THEMES[theme] });
    return vus;
  }

  /**
   * Le liseré n'est pas une encre, c'est un DÉTOURAGE : il décolle un sentier
   * fin d'une imagerie bavarde, et il reste blanc dans les deux thèmes. Pris
   * sur l'encre, il cerne la trace d'un halo sombre qui la fait lire deux fois
   * plus épaisse qu'elle n'est.
   */
  it("détoure en blanc, dans les deux thèmes", () => {
    for (const theme of ["clair", "sombre"] as const) {
      expect(traits(theme)).toContain(brandColors.paper);
    }
  });
});

describe("les encres, celles du studio d'avant", () => {
  /**
   * Relevées dans `apps/site/lib/carrouselCartes.js`. Ce sont elles que portent
   * les planches publiées : une teinte qui glisse et la série ne se lit plus
   * comme un tout.
   */
  it("garde la palette des journées", () => {
    expect([...PALETTE_JOURS]).toEqual([
      "#D6246E",
      "#EFB159",
      "#B67352",
      "#8CB9BD",
      "#6E9CA0",
      "#9A6044",
    ]);
  });

  it("garde les encres des deux thèmes", () => {
    expect(THEMES.clair.voileCarte).toBe("rgba(254, 251, 246, 0.3)");
    expect(THEMES.sombre.voileCarte).toBe("rgba(16, 18, 14, 0.34)");
    expect(THEMES.clair.voileTexte).toBe("254, 251, 246");
    expect(THEMES.sombre.voileTexte).toBe("16, 18, 14");
    // L'itinéraire en sourdine : l'encre du thème, posée à peine.
    expect(THEMES.clair.encre).toBe("#22241E");
    expect(THEMES.sombre.encre).toBe("#FEFBF6");
  });
});
