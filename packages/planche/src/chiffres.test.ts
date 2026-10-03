import { beforeAll, describe, expect, it } from "vitest";
import { traceDepuisTrackJson } from "@locomotionlab/trace";

import { definirVocabulaireDIcones } from "./canvas.ts";
import { THEMES } from "./charte.ts";
import { ENTRE_LIGNES, dessinerChiffres, miseEnPageDuBloc, valeurDeLaCase } from "./chiffres.ts";
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

/** La mise en page, sur un contexte de comptoir. */
const mise = (e: ElementChiffres, b: BoitePx = BOITE) => miseEnPageDuBloc(ctxFactice(), e, b, contexte());

/** Une ligne de cases, valeur et libellé, en corps des valeurs. */
const PILE = 0.7 + 0.3 * 1.5;

describe("la mise en page du bloc", () => {
  it("range deux cases par ligne par défaut", () => {
    const { taille, places } = mise(bloc());
    expect(taille).toBe(64);
    expect(places.map((p) => p.x)).toEqual([100, 300, 100, 300]);
    expect(new Set(places.map((p) => p.l))).toEqual(new Set([200]));
    expect(places[0]!.ligneDeBase).toBe(places[1]!.ligneDeBase);
    expect(places[2]!.ligneDeBase).toBeGreaterThan(places[0]!.ligneDeBase);
  });

  it("tient sur une ligne, ou en colonne", () => {
    const ligne = mise(bloc({ colonnes: 4 })).places;
    expect(ligne.map((p) => p.x)).toEqual([100, 200, 300, 400]);
    expect(new Set(ligne.map((p) => p.ligneDeBase)).size).toBe(1);
    const colonne = mise(bloc({ colonnes: 1 }), { ...BOITE, h: 1000 }).places;
    expect(new Set(colonne.map((p) => p.x))).toEqual(new Set([100]));
    const pas = colonne.slice(1).map((p, i) => p.ligneDeBase - colonne[i]!.ligneDeBase);
    for (const v of pas) expect(v).toBeCloseTo(pas[0]!, 9);
    // Plus de colonnes que de cases : une seule ligne, sans case vide.
    expect(mise(bloc({ colonnes: 9 })).places[3]!.x).toBe(400);
  });

  it("centre une dernière ligne incomplète, sauf alignée à gauche", () => {
    const trois = bloc().cases.slice(0, 3);
    expect(mise(bloc({ cases: trois })).places[2]!.x).toBe(200);
    expect(mise(bloc({ cases: trois, alignement: "gauche" })).places[2]!.x).toBe(100);
  });

  it("pose les lignes à l'interligne réglé, et se centre en hauteur dans son cadre", () => {
    const grand = { ...BOITE, h: 2000 };
    const pas = (entreLignes: number | null) => {
      const { places } = mise(bloc({ colonnes: 1, entreLignes }), grand);
      return places[1]!.ligneDeBase - places[0]!.ligneDeBase;
    };
    expect(pas(null)).toBeCloseTo(64 * (PILE + ENTRE_LIGNES), 9);
    expect(pas(1.5)).toBeCloseTo(64 * (PILE + 1.5), 9);
    // Collées, jamais l'une sur l'autre : un interligne négatif vaut zéro.
    expect(pas(-2)).toBeCloseTo(64 * PILE, 9);

    const { places } = mise(bloc({ colonnes: 1 }), grand);
    const hauteur = 64 * (4 * PILE + 3 * ENTRE_LIGNES);
    expect(places[0]!.ligneDeBase - 64 * 0.7).toBeCloseTo(grand.y + (grand.h - hauteur) / 2, 9);
  });

  it("rétrécit pour que les lignes tiennent dans la hauteur, sans se chevaucher", () => {
    // Quatre lignes dans 270 px : à 64 px de corps, il en faudrait 410.
    const court = { ...BOITE, h: 270 };
    const { taille, places } = mise(bloc({ colonnes: 1 }), court);
    expect(taille).toBeCloseTo(270 / (4 * PILE + 3 * ENTRE_LIGNES), 9);
    expect(places[0]!.ligneDeBase - taille * 0.7).toBeCloseTo(court.y, 9);
    expect(places[3]!.ligneDeBase + taille * 0.3 * 1.5).toBeCloseTo(court.y + court.h, 9);
    for (let i = 1; i < places.length; i += 1) {
      const libelle = places[i - 1]!.ligneDeBase + taille * 0.3 * 1.5;
      const chiffres = places[i]!.ligneDeBase - taille * 0.7;
      expect(chiffres).toBeGreaterThan(libelle);
    }
  });

  it("ne rend rien sans case", () => {
    expect(mise(bloc({ cases: [] })).places).toEqual([]);
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
  it("diminue pour tout le bloc quand une valeur déborde de sa case", () => {
    const e = bloc({
      cases: [
        { variable: null, valeur: "1", libelle: "" },
        { variable: null, valeur: "123456789012345678901234567890", libelle: "" },
      ],
    });
    // 30 caractères de comptoir : 300 px, pour une case de 200 × 0,92.
    const corps = mise(e).taille;
    expect(corps).toBeCloseTo(64 * ((200 * 0.92) / (30 * LETTRE)), 6);
    const ctx = ctxFactice();
    const vus = poses(ctx);
    dessinerChiffres(ctx, e, BOITE, contexte());
    expect(vus.find((v) => v.texte === "1")!.fonte).toContain(`${corps}px`);
  });

  it("diminue aussi pour un libellé trop long", () => {
    const e = bloc({ cases: [{ variable: null, valeur: "1", libelle: "dénivelé positif cumulé sur la course" }] });
    expect(mise(e, { ...BOITE, l: 100 }).taille).toBeLessThan(64);
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
