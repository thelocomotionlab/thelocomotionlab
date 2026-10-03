import { beforeAll, describe, expect, it } from "vitest";
import { traceDepuisTrackJson } from "@locomotionlab/trace";

import { definirVocabulaireDIcones } from "./canvas.ts";
import { THEMES } from "./charte.ts";
import { casesDuBloc, corpsDuBloc, dessinerChiffres, valeurDeLaCase } from "./chiffres.ts";
import { contexteDeRendu, type ContexteRendu } from "./contexte.ts";
import { ctxFactice, LETTRE, type CtxFactice } from "./factice.ts";
import { chiffresNeufs } from "./fabrique.ts";
import { SCHEMA } from "./types.ts";
import type { BoitePx, ElementChiffres, PlancheImage, Projet } from "./types.ts";

beforeAll(() => {
  definirVocabulaireDIcones({ connue: () => false, dessiner: () => true });
});

const BOITE: BoitePx = { x: 100, y: 200, l: 400, h: 300 };

function bloc(over: Partial<ElementChiffres> = {}): ElementChiffres {
  return chiffresNeufs({ x: 0, y: 0, l: 1, h: 1 }, over);
}

/** Un contexte sur une trace de 120 km, 1 000 m de D+ et 1 200 m de D−, sans horaires. */
function contexte(theme: "sombre" | "clair" = "sombre"): ContexteRendu {
  const coords: [number, number][] = [];
  const profile: { km: number; alt: number }[] = [];
  for (let i = 0; i <= 10; i += 1) {
    coords.push([6 + i * 0.1, 44.9]);
    profile.push({ km: i * 12, alt: 1000 + i * 10 });
  }
  const trace = traceDepuisTrackJson({
    schemaVersion: 1,
    totalKm: 120,
    dPlusM: 1000,
    dMinusM: 1200,
    coords,
    profile,
    nom: "Nice",
  });
  const planche: PlancheImage = {
    id: "p1",
    type: "image",
    nom: "",
    modele: "texte",
    fond: "",
    tranche: { mode: "toutes", jour: 0 },
    elements: [],
  };
  const p: Projet = {
    schema: SCHEMA,
    id: "projet",
    nom: "Nice",
    creeLe: "",
    modifieLe: "",
    format: "carrousel",
    theme,
    bilan: "apres",
    donnees: { trace, coupures: [], etiquettes: [], traceCadrage: null, seance: null },
    medias: [],
    planches: [planche],
  } as Projet;
  return contexteDeRendu(p, planche, { police: "Ubuntu" });
}

/** Chaque texte posé, avec son encre et sa fonte au moment de la pose. */
function poses(ctx: CtxFactice): { texte: string; encre: string; fonte: string; x: number; y: number }[] {
  const vus: { texte: string; encre: string; fonte: string; x: number; y: number }[] = [];
  const cible = ctx as unknown as Record<string, (...a: unknown[]) => void>;
  const original = cible.fillText!.bind(ctx);
  cible.fillText = (...a: unknown[]) => {
    vus.push({
      texte: String(a[0]),
      encre: String(ctx.fillStyle),
      fonte: String(ctx.font),
      x: Number(a[1]),
      y: Number(a[2]),
    });
    original(...a);
  };
  return vus;
}

describe("les cases du bloc", () => {
  it("se rangent deux par ligne par défaut", () => {
    const cases = casesDuBloc(bloc(), BOITE);
    expect(cases).toHaveLength(4);
    expect(cases[0]).toEqual({ x: 100, y: 200, l: 200, h: 150 });
    expect(cases[1]).toEqual({ x: 300, y: 200, l: 200, h: 150 });
    expect(cases[2]).toEqual({ x: 100, y: 350, l: 200, h: 150 });
    expect(cases[3]).toEqual({ x: 300, y: 350, l: 200, h: 150 });
  });

  it("tiennent sur une ligne, ou en colonne", () => {
    const ligne = casesDuBloc(bloc({ colonnes: 4 }), BOITE);
    expect(ligne.map((c) => c.x)).toEqual([100, 200, 300, 400]);
    expect(new Set(ligne.map((c) => c.y))).toEqual(new Set([200]));
    const colonne = casesDuBloc(bloc({ colonnes: 1 }), BOITE);
    expect(colonne.map((c) => c.y)).toEqual([200, 275, 350, 425]);
    // Plus de colonnes que de cases : une seule ligne, sans case vide.
    expect(casesDuBloc(bloc({ colonnes: 9 }), BOITE)[3]).toEqual({ x: 400, y: 200, l: 100, h: 300 });
  });

  it("centrent une dernière ligne incomplète, sauf alignées à gauche", () => {
    const trois = bloc().cases.slice(0, 3);
    expect(casesDuBloc(bloc({ cases: trois }), BOITE)[2]!.x).toBe(200);
    expect(casesDuBloc(bloc({ cases: trois, alignement: "gauche" }), BOITE)[2]!.x).toBe(100);
  });

  it("ne rendent rien sans case", () => {
    expect(casesDuBloc(bloc({ cases: [] }), BOITE)).toEqual([]);
  });
});

describe("les valeurs du bloc", () => {
  it("viennent de la trace, et un tiret dit ce qui manque", () => {
    const c = contexte();
    const [distance, dplus, dmoins, duree] = bloc().cases.map((cs) => valeurDeLaCase(cs, c));
    expect(distance).toBe("120,0");
    expect(dplus).toBe("1 000");
    expect(dmoins).toBe("1 200");
    // Une trace sans horaires n'a pas de durée.
    expect(duree).toBe("—");
  });

  it("cèdent à une valeur écrite", () => {
    const c = contexte();
    expect(valeurDeLaCase({ variable: "duree", valeur: "35 h 05", libelle: "chrono" }, c)).toBe("35 h 05");
    expect(valeurDeLaCase({ variable: null, valeur: "", libelle: "" }, c)).toBe("—");
  });
});

describe("le corps du bloc", () => {
  it("reste celui du réglage quand tout tient", () => {
    expect(corpsDuBloc(ctxFactice(), bloc({ taille: 64 }), BOITE, contexte())).toBe(64);
  });

  it("diminue pour tout le bloc quand une valeur déborde de sa case", () => {
    const e = bloc({
      cases: [
        { variable: null, valeur: "1", libelle: "" },
        { variable: null, valeur: "123456789012345678901234567890", libelle: "" },
      ],
    });
    // 30 caractères de comptoir : 300 px, pour une case de 200 × 0,92.
    const corps = corpsDuBloc(ctxFactice(), e, BOITE, contexte());
    expect(corps).toBeCloseTo(64 * ((200 * 0.92) / (30 * LETTRE)), 6);
    const ctx = ctxFactice();
    const vus = poses(ctx);
    dessinerChiffres(ctx, e, BOITE, contexte());
    expect(vus.find((v) => v.texte === "1")!.fonte).toContain(`${corps}px`);
  });

  it("diminue aussi pour un libellé trop long", () => {
    const e = bloc({ cases: [{ variable: null, valeur: "1", libelle: "dénivelé positif cumulé sur la course" }] });
    expect(corpsDuBloc(ctxFactice(), e, { ...BOITE, l: 100 }, contexte())).toBeLessThan(64);
  });
});

describe("le dessin du bloc", () => {
  it("écrit chaque valeur, et son libellé en capitales dessous", () => {
    const ctx = ctxFactice();
    const vus = poses(ctx);
    dessinerChiffres(ctx, bloc(), BOITE, contexte());
    const valeur = vus.find((v) => v.texte === "120,0")!;
    expect(valeur.fonte).toMatch(/^700 /);
    // Les capitales se posent lettre à lettre, sous la valeur.
    const k = vus.find((v) => v.texte === "K")!;
    expect(k.y).toBeGreaterThan(valeur.y);
    expect(vus.map((v) => v.texte).join("")).toContain("CHRONO");
  });

  it("centre la valeur dans sa case, ou la cale à gauche", () => {
    const valeurX = (e: ElementChiffres) => {
      const ctx = ctxFactice();
      const vus = poses(ctx);
      dessinerChiffres(ctx, e, BOITE, contexte());
      return vus.find((v) => v.texte === "120,0")!.x;
    };
    expect(valeurX(bloc())).toBeCloseTo(100 + (200 - 5 * LETTRE) / 2, 6);
    expect(valeurX(bloc({ alignement: "gauche" }))).toBe(100);
  });

  it("prend l'encre du thème et son accent, ou les siennes", () => {
    const ctx = ctxFactice();
    const vus = poses(ctx);
    dessinerChiffres(ctx, bloc(), BOITE, contexte("clair"));
    expect(vus.find((v) => v.texte === "120,0")!.encre).toBe(THEMES.clair.encre);
    expect(vus.find((v) => v.texte === "K")!.encre).toBe(THEMES.clair.accent);

    const propre = ctxFactice();
    const vusPropre = poses(propre);
    dessinerChiffres(
      propre,
      bloc({ couleurValeurs: "#FEFBF6", couleurLibelles: "#EFB159" }),
      BOITE,
      contexte("clair"),
    );
    expect(vusPropre.find((v) => v.texte === "120,0")!.encre).toBe("#FEFBF6");
    expect(vusPropre.find((v) => v.texte === "K")!.encre).toBe("#EFB159");
  });

  it("ne dessine rien sans case, plutôt que de jeter", () => {
    const ctx = ctxFactice();
    dessinerChiffres(ctx, bloc({ cases: [] }), BOITE, contexte());
    expect(ctx.ops.filter((o) => o.op === "fillText")).toHaveLength(0);
  });
});
