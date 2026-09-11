import { beforeAll, describe, expect, it } from "vitest";
import { decouperTrace, traceDepuisTrackJson } from "@locomotionlab/trace";
import type { Trace } from "@locomotionlab/trace";

import { definirVocabulaireDIcones } from "./canvas.ts";
import { PALETTE_JOURS, THEMES } from "./charte.ts";
import {
  cadrageCouverture,
  cheminDuProfil,
  etendueDeLaPhoto,
  glisserLeCadrage,
  valeurAffichee,
} from "./elements.ts";
import { ctxFactice, type CtxFactice } from "./factice.ts";
import { contexteDeRendu, dessinerAvecCadre, dessinerPlanche } from "./rendu.ts";
import { resoudre, valeurDe } from "./variables.ts";
import { SCHEMA } from "./types.ts";
import type {
  BoitePx,
  Element,
  ElementTexte,
  PlancheImage,
  Projet,
} from "./types.ts";

beforeAll(() => {
  definirVocabulaireDIcones({ connue: (c) => c === "col", dessiner: () => true });
});

/** Une trace en toit : 120 km, le sommet à mi-parcours, trois journées. */
function trace(): Trace {
  const coords: [number, number][] = [];
  const profile: { km: number; alt: number }[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const t = i / 120;
    coords.push([6 + t * 1.2, 44.9]);
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

function commun(id: string): Omit<Element, "type"> & { id: string } {
  return {
    id,
    nom: id,
    x: 0.1,
    y: 0.1,
    l: 0.8,
    h: 0.2,
    rotation: 0,
    opacite: 1,
    verrouille: false,
    masque: false,
    groupe: null,
  } as Omit<Element, "type"> & { id: string };
}

function texte(over: Partial<ElementTexte> = {}): ElementTexte {
  return {
    ...commun("t1"),
    type: "texte",
    contenu: "Croix de Belledonne",
    role: "titre",
    puce: "point",
    corps: 65,
    graisse: 700,
    italique: false,
    casse: "normale",
    couleur: "",
    alignement: "gauche",
    interligne: 1.2,
    lettrage: 0,
    ombre: null,
    plaque: null,
    filetOuvrant: null,
    filetSousTitre: null,
    ...over,
  } as ElementTexte;
}

function projet(elements: Element[], avecTrace = true): { p: Projet; planche: PlancheImage } {
  const t = avecTrace ? trace() : null;
  const planche: PlancheImage = {
    id: "p1",
    type: "image",
    nom: "",
    modele: "texte",
    fond: "",
    tranche: { mode: "toutes", jour: 0 },
    elements,
  };
  const p: Projet = {
    schema: SCHEMA,
    id: "projet",
    nom: "Écrins 2026",
    creeLe: "",
    modifieLe: "",
    format: "carrousel",
    theme: "sombre",
    bilan: "apres",
    donnees: { trace: t, coupures: [40, 80], etiquettes: [], traceCadrage: null, seance: null },
    medias: [],
    planches: [planche],
  };
  return { p, planche };
}

function rendre(elements: Element[]): CtxFactice {
  const ctx = ctxFactice();
  const { p, planche } = projet(elements);
  const c = contexteDeRendu(p, planche, {
    police: "Ubuntu",
    segments: decouperTrace(p.donnees.trace, p.donnees.coupures),
  });
  dessinerPlanche(ctx, planche, c);
  return ctx;
}

const poses = (ctx: CtxFactice) =>
  ctx.ops.filter((o) => o.op === "fillText").map((o) => o.args[0] as string);

/**
 * Note l'état du contexte au moment où `methode` est appelée.
 *
 * La méthode est remplacée SUR L'OBJET : le rendu pose `globalAlpha` et
 * `fillStyle` sur le contexte qu'il reçoit, et une copie par `{...ctx}` les
 * recevrait à la place de l'original qu'on interroge.
 */
function espionner<T>(
  ctx: CtxFactice,
  methode: "fillText" | "fillRect",
  lire: (c: CtxFactice) => T,
): () => T | null {
  let vue: T | null = null;
  const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
  const original = cible[methode]!.bind(ctx);
  cible[methode] = (...a: unknown[]) => {
    if (vue === null) vue = lire(ctx);
    original(...a);
  };
  return () => vue;
}

describe("dessinerPlanche", () => {
  it("pose le fond, puis les éléments", () => {
    const ctx = rendre([texte()]);
    const fond = ctx.ops.findIndex((o) => o.op === "fillRect");
    const mot = ctx.ops.findIndex((o) => o.op === "fillText");
    expect(fond).toBeGreaterThanOrEqual(0);
    expect(fond).toBeLessThan(mot);
  });

  it("L'ORDRE DU TABLEAU EST L'ORDRE DES CALQUES", () => {
    const a = texte({ contenu: "dessous" });
    const b = texte({ ...texte(), contenu: "dessus" } as Partial<ElementTexte>);
    expect(poses(rendre([a, { ...b, id: "t2" }]))).toEqual(["dessous", "dessus"]);
    expect(poses(rendre([{ ...b, id: "t2" }, a]))).toEqual(["dessus", "dessous"]);
  });

  it("ne dessine pas un élément masqué", () => {
    expect(poses(rendre([texte({ masque: true })]))).toEqual([]);
  });

  it("ne dessine pas un élément de taille nulle", () => {
    expect(poses(rendre([texte({ l: 0 })]))).toEqual([]);
  });

  it("applique l'opacité de l'élément", () => {
    const ctx = ctxFactice();
    const { p, planche } = projet([]);
    const c = contexteDeRendu(p, planche, { police: "Ubuntu" });
    const vue = espionner(ctx, "fillText", (x) => x.globalAlpha);
    dessinerAvecCadre(ctx, texte({ opacite: 0.4 }), c);
    expect(vue()).toBeCloseTo(0.4, 6);
  });

  it("TOURNE AUTOUR DU CENTRE, pas du coin", () => {
    // Autour du coin, incliner un titre de deux degrés l'enverrait à l'autre
    // bout de la planche.
    const ctx = ctxFactice();
    const { p, planche } = projet([]);
    const c = contexteDeRendu(p, planche, { police: "Ubuntu" });
    dessinerAvecCadre(ctx, texte({ rotation: 90 }), c);
    const bouges = ctx.ops.filter((o) => o.op === "translate");
    const tourne = ctx.ops.find((o) => o.op === "rotate");
    expect(tourne!.args[0]).toBeCloseTo(Math.PI / 2, 9);
    // Aller au centre, puis en revenir : les deux décalages s'annulent.
    expect(bouges[0]!.args[0]).toBeCloseTo(-(bouges[1]!.args[0] as number), 9);
    expect(bouges[0]!.args[1]).toBeCloseTo(-(bouges[1]!.args[1] as number), 9);
  });
});

describe("élément texte", () => {
  it("résout les variables dans le contenu", () => {
    expect(poses(rendre([texte({ contenu: "{distance} km" })])).join("")).toContain("120,0");
  });

  it("passe par les CAPITALES quand la casse le demande", () => {
    // Un surtitre se compose lettre à lettre — c'est l'interlettrage qui fait
    // son allure, et le modèle de blocs ne sait pas écarter des lettres.
    const bloc = poses(rendre([texte({ contenu: "la sortie" })]));
    const caps = poses(rendre([texte({ contenu: "la sortie", casse: "capitales" })]));
    // Le modèle de blocs pose des MOTS (et les blancs entre eux) ; les
    // capitales posent des LETTRES, seule façon de les écarter.
    expect(bloc).toEqual(["la", " ", "sortie"]);
    expect(caps.join("")).toBe("LA SORTIE");
    expect(caps.length).toBe("LA SORTIE".length);
  });

  it("ouvre un surtitre par son filet ambre", () => {
    const sans = rendre([texte({ casse: "capitales" })]);
    const avec = rendre([
      texte({
        casse: "capitales",
        filetOuvrant: { largeur: 40, epaisseur: 10, couleur: "" },
      }),
    ]);
    const traits = (c: CtxFactice) => c.ops.filter((o) => o.op === "fillRect").length;
    expect(traits(avec)).toBe(traits(sans) + 1);
  });

  it("pose le filet sous titre APRÈS le texte, à la place qu'il a prise", () => {
    const ctx = rendre([
      texte({ contenu: "un titre", filetSousTitre: { largeur: 96, epaisseur: 4, couleur: "" } }),
    ]);
    const mot = ctx.ops.findIndex((o) => o.op === "fillText");
    const filet = ctx.ops.map((o) => o.op).lastIndexOf("fillRect");
    expect(filet).toBeGreaterThan(mot);
  });

  it("porte l'ombre demandée, et rien quand il n'y en a pas", () => {
    const ctx = ctxFactice();
    const { p, planche } = projet([]);
    const c = contexteDeRendu(p, planche, { police: "Ubuntu" });
    const vue = espionner(ctx, "fillText", (x) => x.shadowColor);
    dessinerAvecCadre(
      ctx,
      texte({ ombre: { flou: 18, dx: 0, dy: 6, opacite: 0.5, couleur: "" } }),
      c,
    );
    expect(vue()).toBe("rgba(0, 0, 0, 0.5)");
  });
});

describe("cadrageCouverture", () => {
  const cadre = { l: 400, h: 400 };

  it("COUVRE toujours le cadre — jamais de bande vide", () => {
    const large = cadrageCouverture({ width: 4000, height: 3000 }, cadre, {
      x: 0.5,
      y: 0.5,
      echelle: 1,
    })!;
    // Le cadre est carré, la photo non : c'est la largeur qui déborde.
    expect(large.sh).toBeCloseTo(3000, 6);
    expect(large.sl).toBeLessThan(4000);
    expect(large.sl / large.sh).toBeCloseTo(1, 6);
  });

  it("glisse la partie visible d'un bord à l'autre", () => {
    const src = { width: 4000, height: 3000 };
    const gauche = cadrageCouverture(src, cadre, { x: 0, y: 0.5, echelle: 1 })!;
    const droite = cadrageCouverture(src, cadre, { x: 1, y: 0.5, echelle: 1 })!;
    expect(gauche.sx).toBe(0);
    expect(droite.sx).toBeCloseTo(src.width - droite.sl, 6);
  });

  it("zoome sans jamais dézoomer sous la couverture", () => {
    const src = { width: 4000, height: 3000 };
    const un = cadrageCouverture(src, cadre, { x: 0.5, y: 0.5, echelle: 1 })!;
    const deux = cadrageCouverture(src, cadre, { x: 0.5, y: 0.5, echelle: 2 })!;
    expect(deux.sl).toBeCloseTo(un.sl / 2, 6);
    // Une échelle sous 1 laisserait des bandes vides : elle est ramenée à 1.
    expect(cadrageCouverture(src, cadre, { x: 0.5, y: 0.5, echelle: 0.2 })!.sl).toBeCloseTo(
      un.sl,
      6,
    );
  });

  it("rend null sur une source ou un cadre dégénérés", () => {
    expect(cadrageCouverture({ width: 0, height: 10 }, cadre, { x: 0, y: 0, echelle: 1 })).toBeNull();
    expect(
      cadrageCouverture({ width: 10, height: 10 }, { l: 0, h: 10 }, { x: 0, y: 0, echelle: 1 }),
    ).toBeNull();
  });
});

describe("cheminDuProfil", () => {
  const boite: BoitePx = { x: 0, y: 0, l: 100, h: 50 };

  it("étire l'altitude sur toute la hauteur — c'est une SILHOUETTE", () => {
    // Pas une échelle : une échelle vraie écraserait le relief d'une sortie de
    // vallée et gonflerait celui d'une sortie de plaine.
    const chemin = cheminDuProfil(
      [
        { km: 0, alt: 1000 },
        { km: 5, alt: 1500 },
        { km: 10, alt: 1000 },
      ],
      boite,
    )!;
    expect(chemin.min).toBe(1000);
    expect(chemin.max).toBe(1500);
    expect(chemin.points[0]).toEqual([0, 50]);
    expect(chemin.points[1]).toEqual([50, 0]);
    expect(chemin.points[2]).toEqual([100, 50]);
    expect(chemin.base).toBe(50);
  });

  it("part du PREMIER kilomètre, pas de zéro", () => {
    // Une portion de journée commence à 40 km : sans ce décalage, elle serait
    // écrasée contre le bord droit de sa boîte.
    const chemin = cheminDuProfil(
      [
        { km: 40, alt: 1000 },
        { km: 80, alt: 2000 },
      ],
      boite,
    )!;
    expect(chemin.points[0]![0]).toBe(0);
    expect(chemin.points[1]![0]).toBe(100);
  });

  it("rend null sans de quoi tracer", () => {
    expect(cheminDuProfil([], boite)).toBeNull();
    expect(cheminDuProfil([{ km: 0, alt: 1000 }], boite)).toBeNull();
    expect(
      cheminDuProfil([{ km: 3, alt: 1000 }, { km: 3, alt: 1200 }], boite),
    ).toBeNull();
  });
});

describe("les chiffres liés aux données", () => {
  const stat = (over: Record<string, unknown> = {}) =>
    ({
      ...commun("s1"),
      type: "stat",
      variable: "distance",
      libelle: "km",
      taille: 72,
      valeurManuelle: null,
      ...over,
    }) as Element;

  it("affiche la variable calculée", () => {
    expect(poses(rendre([stat()])).join("")).toContain("120,0");
  });

  it("LE DERNIER MOT À L'AUTEUR : la valeur manuelle écrase le calcul", () => {
    // La montre a raison sur son propre fichier, et un total recollé à la main
    // n'a pas à être discuté par le studio.
    expect(poses(rendre([stat({ valeurManuelle: "24,26" })])).join("")).toContain("24,26");
  });

  it("pose l'unité en capitales sous le chiffre", () => {
    expect(poses(rendre([stat({ libelle: "km" })]))).toContain("K");
  });

  it("dit clairement qu'une donnée manque plutôt que de laisser un blanc", () => {
    const ctx = ctxFactice();
    const { p, planche } = projet([stat({ variable: "allure" })], false);
    dessinerPlanche(ctx, planche, contexteDeRendu(p, planche, { police: "Ubuntu" }));
    expect(poses(ctx).join("")).toContain("—");
  });

  it("valeurAffichee préfère le manuel, y compris sur une variable absente", () => {
    const ctx = ctxFactice();
    const { p, planche } = projet([], false);
    const c = contexteDeRendu(p, planche, { police: "Ubuntu" });
    expect(valeurAffichee(stat({ variable: "allure" }) as never, c)).toBe("—");
    expect(valeurAffichee(stat({ variable: "allure", valeurManuelle: "5'20\"" }) as never, c)).toBe(
      "5'20\"",
    );
  });
});

/** Les couleurs posées à chaque `fill`, dans l'ordre. */
function teintesRemplies(ctx: CtxFactice): string[] {
  return ctx.ops.flatMap((o) => (o.op === "fill" ? [String(o.args[0])] : []));
}

describe("les encres des rôles", () => {
  /** L'encre posée au premier mot. */
  function encre(over: Partial<ElementTexte>, theme: "clair" | "sombre" = "sombre"): string {
    const ctx = ctxFactice();
    const { p, planche } = projet([texte(over)]);
    const c = contexteDeRendu({ ...p, theme }, planche, {
      police: "Ubuntu",
      segments: decouperTrace(p.donnees.trace, p.donnees.coupures),
    });
    let vue = "";
    const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
    const fillText = cible.fillText!.bind(ctx);
    cible.fillText = (...a: unknown[]) => {
      if (!vue) vue = String(ctx.fillStyle);
      fillText(...a);
    };
    dessinerPlanche(ctx, planche, c);
    return vue;
  }

  it("donne l'ambre au surtitre et l'encre atténuée au corps", () => {
    expect(encre({ role: "surtitre", casse: "capitales" })).toBe(THEMES.sombre.accent);
    expect(encre({ role: "corps" })).toBe(THEMES.sombre.encreDouce);
    expect(encre({ role: "titre" })).toBe(THEMES.sombre.encre);
  });

  it("nomme les encres plutôt que de les écrire, pour qu'elles suivent le thème", () => {
    expect(encre({ couleur: "faible" }, "clair")).toBe(THEMES.clair.encreFaible);
    expect(encre({ couleur: "faible" }, "sombre")).toBe(THEMES.sombre.encreFaible);
    expect(encre({ couleur: "douce" }, "clair")).toBe(THEMES.clair.encreDouce);
  });

  it("une couleur écrite l'emporte sur le rôle", () => {
    expect(encre({ role: "surtitre", casse: "normale", couleur: "#123456" })).toBe("#123456");
  });
});

describe("l'ajustement au cadre", () => {
  /** Le corps réellement posé : la taille lue dans `ctx.font` au premier mot. */
  function corpsPose(over: Partial<ElementTexte>): number {
    const ctx = ctxFactice();
    const { p, planche } = projet([texte(over)]);
    let vu = 0;
    const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
    const fillText = cible.fillText!.bind(ctx);
    cible.fillText = (...a: unknown[]) => {
      if (!vu) vu = Number(/(\d+(?:\.\d+)?)px/.exec(String(ctx.font))?.[1] ?? 0);
      fillText(...a);
    };
    dessinerPlanche(
      ctx,
      planche,
      contexteDeRendu(p, planche, {
        police: "Ubuntu",
        segments: decouperTrace(p.donnees.trace, p.donnees.coupures),
      }),
    );
    return vu;
  }

  const LONG =
    "GR®54 - Tour de l'Oisans et des Écrins depuis La Chapelle-en-Valgaudemar, " +
    "par le GR®54B et le GR®54C";

  it("laisse le corps intact quand le texte tient", () => {
    expect(corpsPose({ contenu: "Court", corps: 65, ajuster: true })).toBe(65);
  });

  it("réduit le corps quand le texte déborde", () => {
    const pose = corpsPose({ contenu: LONG, corps: 65, ajuster: true, h: 0.06 });
    expect(pose).toBeLessThan(65);
    expect(pose).toBeGreaterThan(0);
  });

  it("ne descend pas sous le plancher", () => {
    const pose = corpsPose({ contenu: LONG.repeat(6), corps: 65, ajuster: true, h: 0.02 });
    expect(pose).toBeGreaterThanOrEqual(65 * 0.4);
  });

  it("ne touche à rien quand l'ajustement est éteint", () => {
    expect(corpsPose({ contenu: LONG, corps: 65, ajuster: false, h: 0.06 })).toBe(65);
  });

  /** Un document écrit avant le réglage garde celui de son rôle. */
  it("ajuste un titre venu d'un document qui ne connaissait pas le réglage", () => {
    const sans = { contenu: LONG, corps: 65, role: "titre" as const, h: 0.06 };
    const pose = corpsPose({ ...sans, ajuster: undefined as unknown as boolean });
    expect(pose).toBeLessThan(65);
  });
});

describe("le filet sous le titre", () => {
  function filetPose(casse: "normale" | "capitales"): boolean {
    const ctx = rendre([
      texte({ casse, filetSousTitre: { largeur: 96, epaisseur: 4, couleur: "#abcdef" } }),
    ]);
    return ctx.ops.some(
      (o) => o.op === "fillRect" && Number(o.args[2]) === 96 && Number(o.args[3]) === 4,
    );
  }

  it("se pose sous un titre en capitales comme sous un autre", () => {
    expect(filetPose("normale")).toBe(true);
    expect(filetPose("capitales")).toBe(true);
  });
});

describe("le profil", () => {
  /** Le fond factice ne note pas le style courant : on le lui fait dire. */
  function rendreEnNotant(elements: Element[]): CtxFactice {
    const ctx = ctxFactice();
    const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
    const fill = cible.fill!.bind(ctx);
    cible.fill = () => fill(ctx.fillStyle);
    const { p, planche } = projet(elements);
    dessinerPlanche(
      ctx,
      planche,
      contexteDeRendu(p, planche, {
        police: "Ubuntu",
        segments: decouperTrace(p.donnees.trace, p.donnees.coupures),
      }),
    );
    return ctx;
  }

  function profil(over: Record<string, unknown> = {}): Element {
    return {
      ...commun("pr1"),
      type: "profil",
      remplissage: "",
      restantEstompe: true,
      parJournee: true,
      couleurs: [],
      ...over,
    } as Element;
  }

  it("donne à chaque journée SA couleur", () => {
    const teintes = teintesRemplies(rendreEnNotant([profil()]));
    const jours = teintes.filter((t) => PALETTE_JOURS.includes(t as never));
    // Trois journées, trois teintes différentes de la palette.
    expect(new Set(jours).size).toBe(3);
  });

  it("donne sa couleur à la journée montrée seule, celle de la carte", () => {
    const ctx = ctxFactice();
    const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
    const fill = cible.fill!.bind(ctx);
    cible.fill = () => fill(ctx.fillStyle);
    const { p, planche } = projet([profil()]);
    const seule: PlancheImage = { ...planche, tranche: { mode: "seule", jour: 1 } };
    dessinerPlanche(
      ctx,
      seule,
      contexteDeRendu(p, seule, {
        police: "Ubuntu",
        segments: decouperTrace(p.donnees.trace, p.donnees.coupures),
      }),
    );
    const jours = teintesRemplies(ctx).filter((t) => PALETTE_JOURS.includes(t as never));
    expect(jours).toEqual([PALETTE_JOURS[1]]);
  });

  it("une couleur imposée passe devant les journées", () => {
    const teintes = teintesRemplies(rendreEnNotant([profil({ remplissage: "#123456" })]));
    expect(teintes.filter((t) => t === "#123456").length).toBe(3);
    expect(teintes.filter((t) => PALETTE_JOURS.includes(t as never))).toEqual([]);
  });

  /**
   * LA PART MONTRÉE SE POSE SUR LA SILHOUETTE, elle ne se réétire pas dedans.
   * Deux journées de reliefs différents doivent partager le même sol et le même
   * plafond, sinon la portion colorée flotte au-dessus du trait qui la porte.
   */
  it("projette toutes les journées sur la même échelle", () => {
    const ctx = rendreEnNotant([profil()]);
    const y = ctx.ops
      .filter((o) => o.op === "lineTo")
      .map((o) => Number(o.args[1]));
    // Le point le plus haut du tracé est le sommet de la trace, atteint par la
    // journée qui le contient — et il ne peut pas être atteint deux fois à des
    // hauteurs différentes.
    const sommets = y.filter((v) => v <= Math.min(...y) + 0.5);
    expect(sommets.length).toBeGreaterThan(1);
  });
});

describe("la fiche et les cases", () => {
  it("pose un libellé en capitales et sa valeur", () => {
    const fiche = {
      ...commun("f1"),
      type: "fiche",
      tailleLibelle: 16,
      tailleValeur: 46,
      lignes: [
        { libelle: "Distance", valeur: null, variable: "distance", accent: false },
        { libelle: "Massif", valeur: "Écrins", variable: null, accent: true },
      ],
    } as Element;
    const dit = poses(rendre([fiche])).join("");
    expect(dit).toContain("DISTANCE");
    expect(dit).toContain("120,0");
    expect(dit).toContain("Écrins");
  });

  it("écrit dans chaque case le jour et ses chiffres à lui", () => {
    const cases = {
      ...commun("c1"),
      type: "cases",
      colonnes: 2,
      miniCarte: false,
      miniProfil: true,
      filet: true,
      cases: [],
      taille: 30,
      couleurs: [],
    } as Element;
    const dit = poses(rendre([cases])).join("");
    expect(dit).toContain("Jour 1");
    expect(dit).toContain("Jour 3");
    // Les chiffres sont ceux de LA journée, pas ceux de la trace entière.
    expect(dit).toContain("40,0");
    expect(dit).not.toContain("120,0");
  });

  it("laisse le texte écrit remplacer celui de la journée", () => {
    const cases = {
      ...commun("c1"),
      type: "cases",
      colonnes: 1,
      miniCarte: false,
      miniProfil: false,
      filet: false,
      cases: [{ jour: 1, texte: "Jour 2 × Rapace" }],
      taille: 30,
      couleurs: [],
    } as Element;
    const dit = poses(rendre([cases])).join("");
    expect(dit).toContain("Rapace");
    expect(dit).toContain("Jour 1");
  });
});

describe("le thème", () => {
  it("le fond de la planche l'emporte sur celui du thème", () => {
    const { p, planche } = projet([]);
    const c = contexteDeRendu(p, planche, { police: "Ubuntu" });

    const surTheme = ctxFactice();
    const duTheme = espionner(surTheme, "fillRect", (x) => x.fillStyle as string);
    dessinerPlanche(surTheme, planche, c);
    expect(duTheme()).toBe(THEMES.sombre.fond);

    const surPlanche = ctxFactice();
    const deLaPlanche = espionner(surPlanche, "fillRect", (x) => x.fillStyle as string);
    dessinerPlanche(surPlanche, { ...planche, fond: "#123456" }, c);
    expect(deLaPlanche()).toBe("#123456");
  });
});

describe("la pagination", () => {
  it("COMPTE DES PLANCHES, pas des journées", () => {
    // « 03 / 12 » est une donnée du DOCUMENT. Le brancher sur `{jour}` donnait
    // un pied qui affichait le numéro du jour, ou rien du tout sur un carrousel
    // sans trace.
    const ctx = ctxFactice();
    const { p, planche } = projet([], false);
    const trois: PlancheImage[] = [planche, { ...planche, id: "p2" }, { ...planche, id: "p3" }];
    const lot: Projet = { ...p, planches: trois };
    const c = contexteDeRendu(lot, trois[1]!, { police: "Ubuntu" });
    expect(valeurDe("planche", c.variables)).toBe("02");
    expect(valeurDe("planches", c.variables)).toBe("03");
    dessinerPlanche(ctx, trois[1]!, c);
  });

  it("se lit sur une planche sans trace — c'est bien le sujet", () => {
    const { p, planche } = projet([], false);
    const c = contexteDeRendu(p, planche, { police: "Ubuntu" });
    expect(resoudre("{planche} / {planches}", c.variables)).toBe("01 / 01");
  });
});

describe("lignes dures", () => {
  const deux = "premier\nsecond";

  it("garde deux lignes quand l'élément le demande", () => {
    const ctx = rendre([texte({ contenu: deux, lignesDures: true })]);
    const y = ctx.ops
      .filter((o) => o.op === "fillText")
      .map((o) => o.args[2] as number);
    expect(new Set(y).size).toBe(2);
  });

  it("recolle le paragraphe quand un document v1 le demandait", () => {
    const ctx = rendre([texte({ contenu: deux, lignesDures: false })]);
    const y = ctx.ops
      .filter((o) => o.op === "fillText")
      .map((o) => o.args[2] as number);
    expect(new Set(y).size).toBe(1);
  });
});

describe("recadrage d'une photo", () => {
  const cadre = { x: 100, y: 200, l: 400, h: 400 };
  const centre = { x: 0.5, y: 0.5, echelle: 1 };

  it("étend la photo au-delà du cadre, dans le sens où elle déborde", () => {
    // Photo panoramique dans un cadre carré : elle dépasse à gauche et à
    // droite, et pas en haut ni en bas.
    const e = etendueDeLaPhoto({ width: 2000, height: 1000 }, cadre, centre)!;
    expect(e.h).toBeCloseTo(400, 6);
    expect(e.l).toBeCloseTo(800, 6);
    expect(e.y).toBeCloseTo(200, 6);
    expect(e.x).toBeCloseTo(-100, 6);
  });

  it("suit le zoom", () => {
    const e = etendueDeLaPhoto({ width: 1000, height: 1000 }, cadre, {
      ...centre,
      echelle: 2,
    })!;
    expect(e.l).toBeCloseTo(800, 6);
    expect(e.h).toBeCloseTo(800, 6);
  });

  it("rend null sur une source vide", () => {
    expect(etendueDeLaPhoto({ width: 0, height: 0 }, cadre, centre)).toBeNull();
  });

  it("tirer vers la droite montre ce qui était à gauche", () => {
    const source = { width: 2000, height: 1000 };
    const apres = glisserLeCadrage(source, cadre, centre, 100, 0);
    expect(apres.x).toBeLessThan(0.5);
    expect(glisserLeCadrage(source, cadre, centre, -100, 0).x).toBeGreaterThan(0.5);
  });

  it("ne bouge pas dans le sens où la photo ne déborde pas", () => {
    // Carrée dans un cadre carré : rien à révéler verticalement.
    const apres = glisserLeCadrage({ width: 1000, height: 1000 }, cadre, centre, 0, 200);
    expect(apres.y).toBe(0.5);
  });

  it("s'arrête au bord", () => {
    const source = { width: 2000, height: 1000 };
    expect(glisserLeCadrage(source, cadre, centre, 100_000, 0).x).toBe(0);
    expect(glisserLeCadrage(source, cadre, centre, -100_000, 0).x).toBe(1);
  });
});
