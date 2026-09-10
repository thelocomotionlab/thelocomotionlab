import { describe, expect, it } from "vitest";

import { FORMATS, MARGE } from "./charte.ts";
import {
  POIGNEE,
  TAILLE_MINIMALE,
  aimanter,
  aligner,
  angleVers,
  avecBoite,
  centreDe,
  deplacer,
  parPas,
  ciblesDAimant,
  ciblesDeLaPlanche,
  coinsDe,
  contient,
  elementSous,
  elementsDans,
  enFractions,
  enPixels,
  englobante,
  poigneeSous,
  poignees,
  redimensionner,
  repartir,
  tourner,
} from "./geometrie.ts";
import type { BoitePx, Element } from "./types.ts";

/** Un élément minimal : seules la boîte et la rotation intéressent la géométrie. */
function elem(over: Partial<Element> & { id: string }): Element {
  return {
    type: "forme",
    forme: "rectangle",
    remplissage: null,
    contour: null,
    coins: 0,
    nom: over.id,
    x: 0,
    y: 0,
    l: 0.2,
    h: 0.1,
    rotation: 0,
    opacite: 1,
    verrouille: false,
    masque: false,
    ...over,
  } as Element;
}

describe("fractions et pixels", () => {
  it("fait l'aller-retour sans perte", () => {
    const b = { x: 0.1, y: 0.25, l: 0.5, h: 0.2 };
    expect(enFractions(enPixels(b, "carrousel"), "carrousel")).toEqual(b);
  });

  it("LES FRACTIONS SUIVENT LE FORMAT", () => {
    // Un demi-cadre reste un demi-cadre quand on passe du carrousel à la story.
    // C'est tout l'intérêt de ne pas ranger des pixels : sans ça, basculer de
    // format entasserait toute la composition en haut de la planche.
    const demi = { x: 0, y: 0, l: 1, h: 0.5 };
    expect(enPixels(demi, "carrousel").h).toBe(FORMATS.carrousel.height / 2);
    expect(enPixels(demi, "story").h).toBe(FORMATS.story.height / 2);
  });
});

describe("rotation", () => {
  it("un quart de tour envoie l'est au sud", () => {
    const p = tourner({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(10, 9);
  });

  it("une rotation nulle ne touche à rien", () => {
    expect(tourner({ x: 3, y: 7 }, { x: 1, y: 1 }, 0)).toEqual({ x: 3, y: 7 });
  });

  it("les coins d'une boîte tournée gardent leur centre", () => {
    const b: BoitePx = { x: 100, y: 100, l: 200, h: 100 };
    const coins = coinsDe(b, 37);
    const moyen = coins.reduce((s, c) => ({ x: s.x + c.x / 4, y: s.y + c.y / 4 }), { x: 0, y: 0 });
    expect(moyen.x).toBeCloseTo(centreDe(b).x, 6);
    expect(moyen.y).toBeCloseTo(centreDe(b).y, 6);
  });
});

describe("contient", () => {
  const b: BoitePx = { x: 100, y: 100, l: 200, h: 100 };

  it("teste une boîte droite", () => {
    expect(contient(b, 0, { x: 150, y: 150 })).toBe(true);
    expect(contient(b, 0, { x: 350, y: 150 })).toBe(false);
  });

  it("SUIT LA ROTATION", () => {
    // Tournée d'un quart de tour, la boîte devient haute et étroite : un point
    // qui était dedans à plat tombe dehors, et l'inverse.
    expect(contient(b, 90, { x: 290, y: 150 })).toBe(false);
    expect(contient(b, 90, { x: 200, y: 220 })).toBe(true);
  });
});

describe("elementSous", () => {
  const fond = elem({ id: "fond", x: 0, y: 0, l: 1, h: 1 });
  const dessus = elem({ id: "dessus", x: 0.1, y: 0.1, l: 0.2, h: 0.2 });

  it("rend le PLUS EN AVANT — l'ordre du tableau est celui des calques", () => {
    const p = enPixels(dessus, "carrousel");
    expect(elementSous([fond, dessus], centreDe(p), "carrousel")?.id).toBe("dessus");
    expect(elementSous([dessus, fond], centreDe(p), "carrousel")?.id).toBe("fond");
  });

  it("ignore un élément masqué", () => {
    const cache = elem({ id: "dessus", x: 0.1, y: 0.1, l: 0.2, h: 0.2, masque: true });
    const p = enPixels(cache, "carrousel");
    expect(elementSous([fond, cache], centreDe(p), "carrousel")?.id).toBe("fond");
  });

  it("VISE un élément verrouillé", () => {
    // Sinon il n'y aurait plus aucun moyen de le déverrouiller au doigt.
    const fige = elem({ id: "fige", x: 0.1, y: 0.1, l: 0.2, h: 0.2, verrouille: true });
    const p = enPixels(fige, "carrousel");
    expect(elementSous([fond, fige], centreDe(p), "carrousel")?.id).toBe("fige");
  });

  it("rend null sur le vide", () => {
    expect(elementSous([], { x: 10, y: 10 }, "carrousel")).toBeNull();
  });
});

describe("elementsDans", () => {
  it("ne prend que ce qui est ENTIÈREMENT dans le rectangle", () => {
    const dedans = elem({ id: "dedans", x: 0.1, y: 0.1, l: 0.1, h: 0.1 });
    const acheval = elem({ id: "acheval", x: 0.45, y: 0.1, l: 0.2, h: 0.1 });
    const rect = enPixels({ x: 0, y: 0, l: 0.5, h: 0.5 }, "carrousel");
    const pris = elementsDans([dedans, acheval], rect, "carrousel");
    expect(pris.map((e) => e.id)).toEqual(["dedans"]);
  });
});

describe("poignées", () => {
  const b: BoitePx = { x: 100, y: 100, l: 200, h: 100 };

  it("pose huit poignées sur les bords, et la rotation au-dessus", () => {
    const p = poignees(b);
    expect(p.no).toEqual({ x: 100, y: 100 });
    expect(p.se).toEqual({ x: 300, y: 200 });
    expect(p.n).toEqual({ x: 200, y: 100 });
    expect(p.rotation.y).toBeLessThan(b.y);
  });

  it("la rotation se vise avant les autres", () => {
    // Elle est proche de « n » : sans priorité, on saisirait le redimensionnement
    // en croyant faire tourner.
    expect(poigneeSous(b, 0, poignees(b).rotation)).toBe("rotation");
    expect(poigneeSous(b, 0, { x: 100, y: 100 })).toBe("no");
    expect(poigneeSous(b, 0, { x: 200, y: 150 })).toBeNull();
  });

  it("les poignées tournent avec l'élément", () => {
    // Quart de tour horaire autour de (200, 150) : le coin nord-ouest part se
    // poser en haut à droite. Une poignée qui resterait sur la boîte droite
    // serait à côté de l'élément qu'elle prétend saisir.
    const p = poignees(b, 90);
    expect(p.no.x).toBeCloseTo(250, 6);
    expect(p.no.y).toBeCloseTo(50, 6);
    for (const cle of ["no", "ne", "se", "so", "n", "e", "s", "o"] as const) {
      expect(poigneeSous(b, 90, p[cle])).toBe(cle);
    }
  });

  it("une poignée se vise à sa demi-taille près", () => {
    expect(poigneeSous(b, 0, { x: 100 + POIGNEE - 1, y: 100 })).toBe("no");
    expect(poigneeSous(b, 0, { x: 100 + POIGNEE * 3, y: 100 })).toBeNull();
  });
});

describe("redimensionner", () => {
  const b: BoitePx = { x: 100, y: 100, l: 200, h: 100 };

  it("tire un bord sans déplacer l'opposé", () => {
    expect(redimensionner(b, "e", 50, 0)).toEqual({ x: 100, y: 100, l: 250, h: 100 });
    expect(redimensionner(b, "o", -50, 0)).toEqual({ x: 50, y: 100, l: 250, h: 100 });
  });

  it("garde le rapport sur un coin quand on le demande", () => {
    const r = redimensionner(b, "se", 100, 0, { proportionnel: true });
    expect(r.l / r.h).toBeCloseTo(b.l / b.h, 9);
    expect(r.l).toBe(300);
  });

  it("depuis le centre, le centre ne bouge pas", () => {
    const r = redimensionner(b, "e", 40, 0, { depuisLeCentre: true });
    expect(centreDe(r).x).toBeCloseTo(centreDe(b).x, 9);
    expect(r.l).toBe(280);
  });

  it("NE SE RETOURNE JAMAIS : la boîte s'arrête à la taille minimale", () => {
    const r = redimensionner(b, "e", -10_000, 0);
    expect(r.l).toBe(TAILLE_MINIMALE);
    expect(r.h).toBeGreaterThan(0);
  });

  it("la poignée de rotation ne redimensionne rien", () => {
    expect(redimensionner(b, "rotation", 50, 50)).toEqual(b);
  });
});

describe("aimanter", () => {
  const cibles = ciblesDAimant("carrousel", []);

  it("colle un bord sur la marge de la charte", () => {
    const b: BoitePx = { x: MARGE + 3, y: 500, l: 200, h: 100 };
    const r = aimanter(b, cibles);
    expect(r.boite.x).toBe(MARGE);
    expect(r.guides.some((g) => g.axe === "x" && g.origine === "marge")).toBe(true);
  });

  it("centre sur la planche", () => {
    const largeur = FORMATS.carrousel.width;
    const b: BoitePx = { x: largeur / 2 - 100 + 2, y: 500, l: 200, h: 100 };
    expect(aimanter(b, cibles).boite.x).toBe(largeur / 2 - 100);
  });

  it("colle sur le bord d'un voisin", () => {
    const voisin: BoitePx = { x: 400, y: 200, l: 100, h: 100 };
    const avecVoisin = ciblesDAimant("carrousel", [voisin]);
    const b: BoitePx = { x: 396, y: 600, l: 50, h: 50 };
    const r = aimanter(b, avecVoisin);
    expect(r.boite.x).toBe(400);
    expect(r.guides.some((g) => g.origine === "element")).toBe(true);
  });

  it("la ZONE SÛRE de la story est une cible, le carrousel n'en a pas", () => {
    const story = ciblesDAimant("story", []);
    expect(story.y.some((c) => c.origine === "zone-sure")).toBe(true);
    expect(cibles.y.some((c) => c.origine === "zone-sure")).toBe(false);
  });

  it("au-delà du seuil, rien ne bouge et aucun guide n'apparaît", () => {
    const b: BoitePx = { x: 333, y: 555, l: 200, h: 100 };
    const r = aimanter(b, cibles, 2);
    expect(r.boite).toEqual(b);
    expect(r.guides).toEqual([]);
  });

  it("la taille ne change pas : aimanter, c'est déplacer", () => {
    const b: BoitePx = { x: MARGE + 3, y: 500, l: 200, h: 100 };
    const r = aimanter(b, cibles);
    expect(r.boite.l).toBe(b.l);
    expect(r.boite.h).toBe(b.h);
  });
});

describe("aligner et répartir", () => {
  const a: BoitePx = { x: 0, y: 0, l: 100, h: 50 };
  const b: BoitePx = { x: 200, y: 100, l: 50, h: 50 };
  const c: BoitePx = { x: 500, y: 300, l: 100, h: 50 };

  it("aligne sur l'ENGLOBANTE, pas sur la planche", () => {
    // Aligner à gauche trois éléments groupés au milieu doit les ranger entre
    // eux, pas les jeter contre le bord.
    const out = aligner([a, b, c], "gauche");
    expect(out.map((x) => x.x)).toEqual([0, 0, 0]);
    expect(aligner([b, c], "gauche").map((x) => x.x)).toEqual([200, 200]);
  });

  it("centre horizontalement dans l'englobante", () => {
    const out = aligner([a, c], "centre-h");
    expect(out[0]!.x).toBe(out[1]!.x);
  });

  it("répartit en laissant les extrêmes en place", () => {
    const out = repartir([a, b, c], "x");
    expect(out[0]!.x).toBe(0);
    expect(out[2]!.x).toBe(500);
    const blanc1 = out[1]!.x - (out[0]!.x + out[0]!.l);
    const blanc2 = out[2]!.x - (out[1]!.x + out[1]!.l);
    expect(blanc1).toBeCloseTo(blanc2, 9);
  });

  it("moins de trois boîtes : il n'y a rien à répartir", () => {
    expect(repartir([a, b], "x")).toEqual([a, b]);
  });

  it("englobante d'une liste vide : null", () => {
    expect(englobante([])).toBeNull();
  });
});

describe("appliquer aux éléments", () => {
  it("repose une boîte de pixels en fractions", () => {
    const e = elem({ id: "e1" });
    const bouge = avecBoite(e, { x: 540, y: 675, l: 108, h: 135 }, "carrousel");
    expect(bouge.x).toBeCloseTo(0.5, 9);
    expect(bouge.y).toBeCloseTo(0.5, 9);
    expect(bouge.l).toBeCloseTo(0.1, 9);
    expect(bouge.h).toBeCloseTo(0.1, 9);
  });

  it("déplace en pixels de planche, sans toucher à la taille", () => {
    const e = elem({ id: "e1", x: 0.1, y: 0.1, l: 0.2, h: 0.1 });
    const bouge = deplacer(e, 108, 135, "carrousel");
    expect(enPixels(bouge, "carrousel").x).toBeCloseTo(enPixels(e, "carrousel").x + 108, 6);
    expect(bouge.l).toBe(e.l);
    expect(bouge.h).toBe(e.h);
  });

  it("LE NORD VAUT ZÉRO pour la poignée de rotation", () => {
    // Elle est AU-DESSUS de la boîte : prendre `atan2` tel quel ferait sauter
    // l'élément d'un quart de tour dès qu'on l'attrape.
    const c = { x: 0, y: 0 };
    expect(angleVers(c, { x: 0, y: -10 })).toBeCloseTo(0, 9);
    expect(angleVers(c, { x: 10, y: 0 })).toBeCloseTo(90, 9);
    expect(angleVers(c, { x: 0, y: 10 })).toBeCloseTo(180, 9);
  });

  it("Maj cale la rotation sur des paliers", () => {
    expect(parPas(43, 15)).toBe(45);
    expect(parPas(43, 0)).toBe(43);
  });

  it("la tolérance de visée suit le zoom", () => {
    const b: BoitePx = { x: 100, y: 100, l: 200, h: 100 };
    // Dézoomé de moitié, la poignée occupe deux fois plus de pixels de planche.
    expect(poigneeSous(b, 0, { x: 100 + POIGNEE * 1.5, y: 100 })).toBeNull();
    expect(poigneeSous(b, 0, { x: 100 + POIGNEE * 1.5, y: 100 }, POIGNEE * 2)).toBe("no");
  });
});

describe("ciblesDeLaPlanche", () => {
  const a = elem({ id: "a", x: 0.1, y: 0.1, l: 0.2, h: 0.1 });
  const b = elem({ id: "b", x: 0.5, y: 0.5, l: 0.2, h: 0.1 });

  it("EXCLUT la sélection — sinon un élément se colle à lui-même", () => {
    // Sans cette exclusion, le premier pixel de glissé recollerait l'élément sur
    // sa propre position, et il ne bougerait plus.
    const bordA = enPixels(a, "carrousel").x;
    const avec = ciblesDeLaPlanche([a, b], "carrousel", []);
    const sans = ciblesDeLaPlanche([a, b], "carrousel", ["a"]);
    expect(avec.x.some((c) => c.origine === "element" && c.position === bordA)).toBe(true);
    expect(sans.x.some((c) => c.origine === "element" && c.position === bordA)).toBe(false);
  });

  it("ignore un élément masqué : on ne se cale pas sur l'invisible", () => {
    const cache = elem({ id: "c", x: 0.8, y: 0.8, l: 0.1, h: 0.1, masque: true });
    const bord = enPixels(cache, "carrousel").x;
    const cibles = ciblesDeLaPlanche([a, cache], "carrousel", []);
    expect(cibles.x.some((c) => c.position === bord)).toBe(false);
  });

  it("garde toujours les bords et les marges de la planche", () => {
    const cibles = ciblesDeLaPlanche([], "carrousel", []);
    expect(cibles.x.some((c) => c.origine === "marge")).toBe(true);
    expect(cibles.y.some((c) => c.origine === "planche")).toBe(true);
  });
});
