import { describe, expect, it } from "vitest";

import {
  cadrageCouverture,
  cheminDuProfil,
  dessinerFleche,
  dessinerTexteEspace,
  formatEntier,
  formatKm,
  GABARIT,
  ligneDeStats,
  segmentsDeStats,
  STORY,
  ZONE_SURE,
} from "./habillage";

describe("ligneDeStats", () => {
  it("assemble distance, D+ et D− avec le séparateur du labo", () => {
    expect(ligneDeStats({ distanceKm: 24.26, dPlusM: 2400, dMinusM: 2509 })).toBe(
      "24,3 km  ·  2 400 m D+  ·  2 509 m D−",
    );
  });

  it("AUCUN CARRÉ BLANC : l'espace fine d'Intl est normalisée", () => {
    // Intl fr-FR groupe les milliers avec U+202F, absente de la fonte Ubuntu :
    // le canvas dessinerait un tofu au milieu du dénivelé.
    const ligne = ligneDeStats({ distanceKm: 1, dPlusM: 12000, dMinusM: 0 });
    expect(ligne).not.toMatch(/[    ]/);
    expect(ligne).toContain("12 000 m D+");
  });

  it("une valeur absente ou nulle disparaît, séparateur compris", () => {
    expect(ligneDeStats({ distanceKm: 12, dPlusM: 0, dMinusM: 0 })).toBe("12,0 km");
    expect(ligneDeStats({ distanceKm: NaN, dPlusM: 800, dMinusM: NaN })).toBe("800 m D+");
    expect(ligneDeStats({})).toBe("");
  });

  it("formatage : une décimale pour les km, arrondi entier pour les mètres", () => {
    expect(formatKm(24.26)).toBe("24,3");
    expect(formatKm(undefined)).toBe("0,0");
    expect(formatEntier(2399.6)).toBe("2 400");
  });
});

describe("cadrageCouverture", () => {
  it("une photo horizontale est recadrée en hauteur, sans déformation", () => {
    const c = cadrageCouverture({ width: 4000, height: 3000 }, STORY, 0.5);
    // Le cadre est plus étroit que la photo : c'est la LARGEUR qui est rognée.
    expect(c.sh).toBeCloseTo(3000, 3);
    expect(c.sw).toBeCloseTo(3000 * (STORY.width / STORY.height), 3);
    expect(c.sw / c.sh).toBeCloseTo(STORY.width / STORY.height, 6);
    expect(c.dw).toBe(STORY.width);
    expect(c.dh).toBe(STORY.height);
  });

  it("l'ancrage fait GLISSER la fenêtre — le sujet est rarement au centre", () => {
    const source = { width: 1080, height: 3000 };
    const haut = cadrageCouverture(source, STORY, 0);
    const centre = cadrageCouverture(source, STORY, 0.5);
    const bas = cadrageCouverture(source, STORY, 1);
    expect(haut.sy).toBe(0);
    expect(bas.sy).toBeCloseTo(3000 - haut.sh, 3);
    expect(centre.sy).toBeCloseTo((3000 - haut.sh) / 2, 3);
  });

  it("LE CURSEUR AGIT AUSSI SUR UNE PHOTO HORIZONTALE (le cas courant)", () => {
    // Une 4000×3000 en 9:16 est limitée par sa HAUTEUR : le débordement est
    // entièrement latéral. N'ancrer que la verticale rendait le curseur inerte.
    const source = { width: 4000, height: 3000 };
    const gauche = cadrageCouverture(source, STORY, 0);
    const droite = cadrageCouverture(source, STORY, 1);
    expect(gauche.sy).toBe(0);
    expect(droite.sy).toBe(0);
    expect(gauche.sx).toBe(0);
    expect(droite.sx).toBeCloseTo(4000 - gauche.sw, 3);
    expect(droite.sx).toBeGreaterThan(1000);
  });

  it("la fenêtre ne sort JAMAIS de la photo, quel que soit l'ancrage", () => {
    for (const source of [
      { width: 4000, height: 3000 },
      { width: 1080, height: 1920 },
      { width: 900, height: 4000 },
    ]) {
      for (const a of [-5, 0, 0.37, 1, 42, NaN]) {
        const c = cadrageCouverture(source, STORY, a);
        expect(c.sx).toBeGreaterThanOrEqual(-1e-9);
        expect(c.sy).toBeGreaterThanOrEqual(-1e-9);
        expect(c.sx + c.sw).toBeLessThanOrEqual(source.width + 1e-9);
        expect(c.sy + c.sh).toBeLessThanOrEqual(source.height + 1e-9);
      }
    }
  });

  it("une image dégénérée ne produit pas de cadrage", () => {
    expect(cadrageCouverture({ width: 0, height: 100 }, STORY)).toBeNull();
    expect(cadrageCouverture({ width: 100, height: 100 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe("cheminDuProfil", () => {
  const boite = GABARIT.profil;
  const profil = [
    { km: 0, alt: 1000 },
    { km: 5, alt: 2000 },
    { km: 10, alt: 1200 },
  ];

  it("occupe exactement la boîte : premier à gauche, sommet en haut, base en bas", () => {
    const c = cheminDuProfil(profil, boite);
    expect(c.points[0][0]).toBeCloseTo(boite.x, 6);
    expect(c.points[2][0]).toBeCloseTo(boite.x + boite.width, 6);
    expect(c.points[1][1]).toBeCloseTo(boite.y, 6); // le point haut touche le haut
    expect(c.points[0][1]).toBeCloseTo(boite.y + boite.height, 6); // le plus bas, le bas
    expect(c.base).toBe(boite.y + boite.height);
  });

  it("une altitude constante ne divise pas par zéro", () => {
    const plat = [
      { km: 0, alt: 1500 },
      { km: 3, alt: 1500 },
    ];
    const c = cheminDuProfil(plat, boite);
    expect(c.points.every(([, y]) => Number.isFinite(y))).toBe(true);
  });

  it("profil vide, trop court, ou de longueur nulle : rien à dessiner", () => {
    expect(cheminDuProfil([], boite)).toBeNull();
    expect(cheminDuProfil([{ km: 0, alt: 1 }], boite)).toBeNull();
    expect(cheminDuProfil([{ km: 0, alt: 1 }, { km: 0, alt: 2 }], boite)).toBeNull();
    expect(cheminDuProfil(undefined, boite)).toBeNull();
  });

  it("les valeurs aberrantes sont écartées, pas propagées en NaN", () => {
    const c = cheminDuProfil(
      [{ km: 0, alt: 1000 }, { km: NaN, alt: 1500 }, { km: 4, alt: 1200 }],
      boite,
    );
    expect(c.points).toHaveLength(2);
    expect(c.points.flat().every(Number.isFinite)).toBe(true);
  });
});

describe("zone sûre Instagram", () => {
  it("TOUT l'habillage tient dans la bande visible", () => {
    // C'est le défaut qui a fait abandonner l'habillage de Coros : profil et
    // chiffres passaient sous l'interface d'Instagram.
    const hautDuProfil = GABARIT.profil.y;
    const basDeLaMarque = GABARIT.marque.baseline;
    expect(hautDuProfil).toBeGreaterThanOrEqual(ZONE_SURE.top);
    expect(basDeLaMarque).toBeLessThanOrEqual(ZONE_SURE.bottom);
    expect(ZONE_SURE.bottom).toBeLessThan(STORY.height);
  });

  it("les éléments s'empilent sans se chevaucher", () => {
    const basDuProfil = GABARIT.profil.y + GABARIT.profil.height;
    expect(basDuProfil).toBeLessThan(GABARIT.stats.baseline - GABARIT.stats.taille);
    expect(GABARIT.stats.baseline).toBeLessThan(GABARIT.marque.baseline);
  });

  it("le profil est PLEINE LARGEUR (silhouette Coros, pas un encart)", () => {
    expect(GABARIT.profil.x).toBe(0);
    expect(GABARIT.profil.width).toBe(STORY.width);
  });
});

describe("dessinerTexteEspace", () => {
  /** Contexte 2D minimal : on n'a besoin que de mesurer et de compter. */
  function fauxCtx(largeurLettre = 10) {
    const appels = [];
    return {
      appels,
      font: '500 21px "__Ubuntu_abc123", sans-serif',
      fillText: (t, x, y) => appels.push({ t, x, y }),
      measureText: () => ({ width: largeurLettre }),
    };
  }

  it("L'ÉCART VIENT DE LA TAILLE, jamais de ctx.font", () => {
    // Le navigateur renormalise `ctx.font` en « 500 21px … » : `parseFloat` y
    // lisait 500 (la graisse). L'écart valait 150 px par lettre et le nom du
    // labo sortait du cadre.
    const ctx = fauxCtx(10);
    dessinerTexteEspace(ctx, "ABC", 0, 100, 20, 0.3);
    expect(ctx.appels.map((a) => a.x)).toEqual([0, 16, 32]); // 10 + 0,3 × 20
  });

  it("renvoie la largeur occupée, hors écart final", () => {
    const ctx = fauxCtx(10);
    const largeur = dessinerTexteEspace(ctx, "ABC", 0, 0, 20, 0.3);
    expect(largeur).toBe(42); // 3 lettres + 2 écarts
  });

  it("le nom du labo tient dans la largeur utile de la story", () => {
    // Garde-fou de mise en page : à 21 px et 0,3 em, « THE LOCOMOTION LAB »
    // doit rester dans la colonne, marges comprises.
    const ctx = fauxCtx(12); // majuscules Ubuntu ≈ 0,58 em à 21 px
    const largeur = dessinerTexteEspace(ctx, "THE LOCOMOTION LAB", 0, 0, GABARIT.marque.taille, GABARIT.marque.espacement);
    expect(largeur).toBeLessThan(STORY.width - 2 * GABARIT.pad);
  });
});

describe("segmentsDeStats", () => {
  it("porte le sens de la flèche sur chaque dénivelé, et rien sur la distance", () => {
    expect(segmentsDeStats({ distanceKm: 24.26, dPlusM: 2400, dMinusM: 2509 })).toEqual([
      { texte: "24,3 km", fleche: null },
      { texte: "2 400 m D+", fleche: "haut" },
      { texte: "2 509 m D−", fleche: "bas" },
    ]);
  });

  it("un dénivelé absent emporte sa flèche", () => {
    expect(segmentsDeStats({ distanceKm: 12, dPlusM: 0, dMinusM: NaN })).toEqual([
      { texte: "12,0 km", fleche: null },
    ]);
    expect(segmentsDeStats({})).toEqual([]);
  });

  it("le texte assemblé reste celui de ligneDeStats", () => {
    const v = { distanceKm: 24.26, dPlusM: 2400, dMinusM: 2509 };
    expect(segmentsDeStats(v).map((s) => s.texte).join("  ·  ")).toBe(ligneDeStats(v));
  });
});

describe("dessinerFleche", () => {
  function fauxCtx() {
    const ordres = [];
    return {
      ordres,
      beginPath: () => ordres.push(["beginPath"]),
      moveTo: (x, y) => ordres.push(["moveTo", x, y]),
      lineTo: (x, y) => ordres.push(["lineTo", x, y]),
      stroke: () => ordres.push(["stroke"]),
    };
  }

  it("LA FLÈCHE EST TRACÉE, jamais écrite", () => {
    // Les fontes du site sont des sous-ensembles latins : U+2191/U+2193 n'y
    // sont pas, un caractère de flèche sortirait en carré blanc.
    const ctx = fauxCtx();
    dessinerFleche(ctx, 100, 500, 44, "haut");
    expect(ctx.ordres.some(([o]) => o === "stroke")).toBe(true);
    expect(ctx.ordres.filter(([o]) => o === "lineTo").length).toBe(3);
  });

  it("« haut » pointe vers le haut, « bas » vers le bas", () => {
    // Les deux flèches occupent la MÊME hauteur (même hampe) : ce qui les
    // distingue est l'endroit où se pose le chevron. On regarde donc la pointe,
    // pas l'encombrement — première version du test, qui comparait des minima
    // identiques et ne prouvait rien.
    const pointe = (sens) => {
      const ctx = fauxCtx();
      dessinerFleche(ctx, 0, 500, 44, sens);
      // beginPath, moveTo(talon), lineTo(pointe), moveTo(aile), lineTo(pointe)…
      return ctx.ordres[2][2];
    };
    expect(pointe("haut")).toBeLessThan(pointe("bas"));
    // Et rien ne descend sous la ligne de base du texte.
    for (const sens of ["haut", "bas"]) {
      const ctx = fauxCtx();
      dessinerFleche(ctx, 0, 500, 44, sens);
      const ys = ctx.ordres.filter(([o]) => o !== "beginPath" && o !== "stroke").map(([, , y]) => y);
      expect(Math.max(...ys)).toBeLessThanOrEqual(500);
    }
  });

  it("renvoie la largeur occupée, pour que le curseur avance", () => {
    expect(dessinerFleche(fauxCtx(), 0, 500, 44, "haut")).toBeCloseTo(44 * 0.34, 6);
  });
});
